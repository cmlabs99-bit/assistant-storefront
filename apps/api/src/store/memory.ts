import { randomUUID } from 'node:crypto';
import type { Cart, CheckoutInput, Order, Product, ProductQuery } from '@storefront/shared';
import { ConflictError, NotFoundError } from '../lib/errors.js';
import type { Store } from './types.js';

/**
 * In-memory store. Used by the test suite and by `STORE_BACKEND=memory` for
 * running the stack without Supabase. Mirrors the Supabase implementation's
 * behaviour (including idempotent checkout) so tests exercise real rules.
 */
export class MemoryStore implements Store {
  private products = new Map<string, Product>();
  private carts = new Map<string, { lines: Map<string, number>; updatedAt: string }>();
  private orders = new Map<string, Order>();
  private ordersByKey = new Map<string, string>();
  private orderSeq = 0;

  constructor(seed: Product[] = defaultSeed()) {
    for (const p of seed) this.products.set(p.id, p);
  }

  async ping(): Promise<void> {}

  async listProducts(query: ProductQuery) {
    const q = query.q?.toLowerCase();
    let items = [...this.products.values()];
    if (query.category) items = items.filter((p) => p.category === query.category);
    if (q) {
      items = items.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          p.tags.some((t) => t.toLowerCase().includes(q)),
      );
    }
    items.sort((a, b) => a.name.localeCompare(b.name));
    return { items: items.slice(query.offset, query.offset + query.limit), total: items.length };
  }

  async getProductById(id: string) {
    return this.products.get(id) ?? null;
  }

  async getProductBySlug(slug: string) {
    return [...this.products.values()].find((p) => p.slug === slug) ?? null;
  }

  async listCategories() {
    return [...new Set([...this.products.values()].map((p) => p.category))].sort();
  }

  async createCart(): Promise<Cart> {
    const id = randomUUID();
    this.carts.set(id, { lines: new Map(), updatedAt: new Date().toISOString() });
    return this.materializeCart(id);
  }

  async getCart(cartId: string) {
    return this.carts.has(cartId) ? this.materializeCart(cartId) : null;
  }

  async addToCart(cartId: string, productId: string, quantity: number) {
    const cart = this.requireCart(cartId);
    if (!this.products.has(productId)) throw new NotFoundError('Product', productId);
    const next = Math.min(99, (cart.lines.get(productId) ?? 0) + quantity);
    cart.lines.set(productId, next);
    cart.updatedAt = new Date().toISOString();
    return this.materializeCart(cartId);
  }

  async setCartLine(cartId: string, productId: string, quantity: number) {
    const cart = this.requireCart(cartId);
    if (!this.products.has(productId)) throw new NotFoundError('Product', productId);
    if (quantity === 0) cart.lines.delete(productId);
    else cart.lines.set(productId, quantity);
    cart.updatedAt = new Date().toISOString();
    return this.materializeCart(cartId);
  }

  async checkout(input: CheckoutInput): Promise<Order> {
    const existing = this.ordersByKey.get(input.idempotencyKey);
    if (existing) return this.orders.get(existing)!;

    const cart = this.requireCart(input.cartId);
    if (cart.lines.size === 0) throw new ConflictError('CART_EMPTY', 'Cart has no items');

    const lines = [...cart.lines.entries()].map(([productId, quantity]) => {
      const p = this.products.get(productId)!;
      if (!p.inStock) throw new ConflictError('OUT_OF_STOCK', `${p.name} is out of stock`);
      return {
        productId,
        name: p.name,
        unitPriceCents: p.priceCents,
        quantity,
        lineTotalCents: p.priceCents * quantity,
      };
    });

    const order: Order = {
      id: randomUUID(),
      number: `SF-${new Date().getFullYear()}-${String(++this.orderSeq).padStart(6, '0')}`,
      status: 'confirmed',
      customer: input.customer,
      shippingAddress: input.shippingAddress,
      lines,
      subtotalCents: lines.reduce((sum, l) => sum + l.lineTotalCents, 0),
      createdAt: new Date().toISOString(),
    };
    this.orders.set(order.id, order);
    this.ordersByKey.set(input.idempotencyKey, order.id);
    cart.lines.clear();
    return order;
  }

  async getOrder(orderId: string) {
    return this.orders.get(orderId) ?? null;
  }

  private requireCart(cartId: string) {
    const cart = this.carts.get(cartId);
    if (!cart) throw new NotFoundError('Cart', cartId);
    return cart;
  }

  private materializeCart(cartId: string): Cart {
    const cart = this.requireCart(cartId);
    const lines = [...cart.lines.entries()].map(([productId, quantity]) => {
      const product = this.products.get(productId)!;
      return { productId, quantity, product, lineTotalCents: product.priceCents * quantity };
    });
    return {
      id: cartId,
      lines,
      subtotalCents: lines.reduce((s, l) => s + l.lineTotalCents, 0),
      updatedAt: cart.updatedAt,
    };
  }
}

/** Small catalog so the memory backend is useful out of the box. */
export function defaultSeed(): Product[] {
  const mk = (
    slug: string,
    name: string,
    priceCents: number,
    category: string,
    tags: string[],
    inStock = true,
  ): Product => ({
    id: uuidFromSlug(slug),
    slug,
    name,
    description: `${name} — a well-made everyday object.`,
    priceCents,
    currency: 'USD',
    imageUrl: `https://picsum.photos/seed/${slug}/600/600`,
    category,
    tags,
    inStock,
  });
  return [
    mk('pour-over-kettle', 'Gooseneck Pour-Over Kettle', 6500, 'kitchen', ['coffee', 'kettle']),
    mk('ceramic-dripper', 'Ceramic Coffee Dripper', 2400, 'kitchen', ['coffee', 'dripper']),
    mk('burr-grinder', 'Conical Burr Grinder', 14900, 'kitchen', ['coffee', 'grinder']),
    mk('linen-apron', 'Washed Linen Apron', 5800, 'home', ['apron', 'linen']),
    mk('walnut-board', 'End-Grain Walnut Cutting Board', 11000, 'home', ['cutting-board', 'wood']),
    mk('desk-lamp', 'Articulating Desk Lamp', 8900, 'office', ['lamp', 'desk']),
    mk('notebook-set', 'Dot-Grid Notebook Set (3)', 1800, 'office', ['notebook', 'paper']),
    mk('canvas-tote', 'Heavyweight Canvas Tote', 3600, 'bags', ['tote', 'canvas']),
    mk('leather-wallet', 'Slim Leather Card Wallet', 4800, 'bags', ['wallet', 'leather'], false),
  ];
}

/** Deterministic UUID-shaped id from a slug so seed ids are stable across restarts. */
function uuidFromSlug(slug: string): string {
  let h = 0x811c9dc5;
  for (const ch of slug) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  const hex = h.toString(16).padStart(8, '0');
  return `${hex}-0000-4000-8000-${hex}${hex.slice(0, 4)}`;
}
