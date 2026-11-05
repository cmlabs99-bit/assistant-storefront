#!/usr/bin/env node
/**
 * MCP server that exposes the storefront to AI assistants (Claude Desktop,
 * Claude Code, Cursor, etc.) over stdio.
 *
 * Design notes:
 * - Tools are a *bounded* surface over the public HTTP API. The assistant never
 *   touches the database or the service-role key; it gets the same contracts
 *   a browser does.
 * - Every tool validates its input with zod and returns structured JSON plus a
 *   short human-readable summary, so both the model and the user can read it.
 * - Errors are returned as tool results with the API's stable error code
 *   (`isError: true`) rather than thrown, so the assistant can recover (e.g.
 *   OUT_OF_STOCK -> remove the item and retry).
 * - Checkout requires an explicit idempotency key from the caller (the model),
 *   so a retried tool call cannot create a duplicate order.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { formatCents, type Cart, type Order, type Product, type ProductListResponse } from '@storefront/shared';
import { z } from 'zod';

const API = process.env.STOREFRONT_API_URL ?? 'http://localhost:4000';

type ToolResult = { content: { type: 'text'; text: string }[]; isError?: boolean };

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const body = (await res.json().catch(() => ({}))) as unknown;
  if (!res.ok) {
    const err = (body as { error?: { code?: string; message?: string } }).error;
    throw Object.assign(new Error(err?.message ?? `HTTP ${res.status}`), {
      code: err?.code ?? 'HTTP_ERROR',
      status: res.status,
    });
  }
  return body as T;
}

function ok(summary: string, data: unknown): ToolResult {
  return { content: [{ type: 'text', text: `${summary}\n\n${JSON.stringify(data, null, 2)}` }] };
}

function fail(e: unknown): ToolResult {
  const err = e as { code?: string; message?: string };
  return {
    isError: true,
    content: [{ type: 'text', text: JSON.stringify({ error: { code: err.code ?? 'UNKNOWN', message: err.message } }) }],
  };
}

const describeProduct = (p: Product) =>
  `${p.name} — ${formatCents(p.priceCents)}${p.inStock ? '' : ' (sold out)'} [${p.category}] id=${p.id}`;

const describeCart = (c: Cart) =>
  c.lines.length === 0
    ? `Cart ${c.id} is empty.`
    : `Cart ${c.id}: ${c.lines.map((l) => `${l.quantity}× ${l.product.name}`).join(', ')}. Subtotal ${formatCents(c.subtotalCents)}.`;

const server = new McpServer({ name: 'assistant-storefront', version: '0.1.0' });

server.tool(
  'search_products',
  'Search the catalog by free text and/or category. Returns matching products with ids, prices (in cents and formatted), and stock status.',
  {
    query: z.string().max(100).optional().describe('Free-text search, e.g. "coffee grinder"'),
    category: z.string().max(50).optional().describe('Exact category name, e.g. "kitchen"'),
    limit: z.number().int().min(1).max(50).default(10),
  },
  async ({ query, category, limit }) => {
    try {
      const params = new URLSearchParams();
      if (query) params.set('q', query);
      if (category) params.set('category', category);
      params.set('limit', String(limit));
      const r = await call<ProductListResponse>(`/products?${params}`);
      const summary =
        r.items.length === 0
          ? 'No products matched.'
          : `${r.total} match(es). Showing ${r.items.length}:\n` + r.items.map((p) => `• ${describeProduct(p)}`).join('\n');
      return ok(summary, r);
    } catch (e) {
      return fail(e);
    }
  },
);

server.tool(
  'list_categories',
  'List all product categories available in the catalog.',
  {},
  async () => {
    try {
      const r = await call<{ items: string[] }>('/products/categories');
      return ok(`Categories: ${r.items.join(', ')}`, r);
    } catch (e) {
      return fail(e);
    }
  },
);

server.tool(
  'get_product',
  'Get full details for one product by id or slug.',
  { idOrSlug: z.string().min(1).max(120) },
  async ({ idOrSlug }) => {
    try {
      const p = await call<Product>(`/products/${encodeURIComponent(idOrSlug)}`);
      return ok(describeProduct(p), p);
    } catch (e) {
      return fail(e);
    }
  },
);

server.tool(
  'create_cart',
  'Create a new empty cart. Keep the returned cartId for subsequent calls in this shopping session.',
  {},
  async () => {
    try {
      const c = await call<Cart>('/carts', { method: 'POST' });
      return ok(`Created cart ${c.id}.`, c);
    } catch (e) {
      return fail(e);
    }
  },
);

server.tool(
  'view_cart',
  'Show the current contents and subtotal of a cart.',
  { cartId: z.string().uuid() },
  async ({ cartId }) => {
    try {
      const c = await call<Cart>(`/carts/${cartId}`);
      return ok(describeCart(c), c);
    } catch (e) {
      return fail(e);
    }
  },
);

server.tool(
  'add_to_cart',
  'Add a quantity of a product to a cart. Adding the same product again increases the quantity.',
  {
    cartId: z.string().uuid(),
    productId: z.string().uuid(),
    quantity: z.number().int().min(1).max(99).default(1),
  },
  async ({ cartId, productId, quantity }) => {
    try {
      const c = await call<Cart>(`/carts/${cartId}/lines`, {
        method: 'POST',
        body: JSON.stringify({ productId, quantity }),
      });
      return ok(describeCart(c), c);
    } catch (e) {
      return fail(e);
    }
  },
);

server.tool(
  'set_cart_quantity',
  'Set the quantity of a product in a cart. Use 0 to remove it.',
  {
    cartId: z.string().uuid(),
    productId: z.string().uuid(),
    quantity: z.number().int().min(0).max(99),
  },
  async ({ cartId, productId, quantity }) => {
    try {
      const c = await call<Cart>(`/carts/${cartId}/lines/${productId}`, {
        method: 'PUT',
        body: JSON.stringify({ quantity }),
      });
      return ok(describeCart(c), c);
    } catch (e) {
      return fail(e);
    }
  },
);

server.tool(
  'checkout',
  'Place an order for a cart. Confirm the customer details and shipping address with the user BEFORE calling this. Pass a fresh UUID as idempotencyKey; reuse the same key if you need to retry the same order.',
  {
    cartId: z.string().uuid(),
    idempotencyKey: z.string().uuid().describe('A UUID you generate; reuse it on retry to avoid duplicate orders'),
    customer: z.object({ name: z.string().min(1).max(120), email: z.string().email() }),
    shippingAddress: z.object({
      line1: z.string().min(1).max(200),
      line2: z.string().max(200).optional(),
      city: z.string().min(1).max(100),
      region: z.string().min(1).max(100),
      postalCode: z.string().min(1).max(20),
      country: z.string().length(2).describe('ISO 3166-1 alpha-2, e.g. US'),
    }),
  },
  async (input) => {
    try {
      const o = await call<Order>('/orders', { method: 'POST', body: JSON.stringify(input) });
      return ok(
        `Order ${o.number} ${o.status} for ${o.customer.name}. ${o.lines.length} line(s), subtotal ${formatCents(o.subtotalCents)}.`,
        o,
      );
    } catch (e) {
      return fail(e);
    }
  },
);

server.tool(
  'get_order',
  'Look up an order by id.',
  { orderId: z.string().uuid() },
  async ({ orderId }) => {
    try {
      const o = await call<Order>(`/orders/${orderId}`);
      return ok(`Order ${o.number}: ${o.status}, subtotal ${formatCents(o.subtotalCents)}.`, o);
    } catch (e) {
      return fail(e);
    }
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
// Log to stderr only: stdout is the MCP protocol channel.
console.error(`[storefront-mcp] connected; API=${API}`);
