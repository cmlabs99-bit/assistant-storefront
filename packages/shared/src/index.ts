import { z } from 'zod';

/**
 * Shared contract between the API, the web client, and the MCP server.
 * Every request body is validated with these schemas on the server; the
 * client and MCP server import the inferred types so the three stay in sync.
 *
 * Money is always an integer number of cents. Never floats.
 */

// ---------- Products ----------

export const ProductSchema = z.object({
  id: z.string().uuid(),
  slug: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  priceCents: z.number().int().nonnegative(),
  currency: z.literal('USD'),
  imageUrl: z.string().url().nullable(),
  category: z.string().min(1),
  tags: z.array(z.string()),
  inStock: z.boolean(),
});
export type Product = z.infer<typeof ProductSchema>;

export const ProductQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.string().trim().max(50).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(24),
  offset: z.coerce.number().int().min(0).default(0),
});
export type ProductQuery = z.infer<typeof ProductQuerySchema>;

export const ProductListResponseSchema = z.object({
  items: z.array(ProductSchema),
  total: z.number().int().nonnegative(),
  limit: z.number().int(),
  offset: z.number().int(),
});
export type ProductListResponse = z.infer<typeof ProductListResponseSchema>;

// ---------- Carts ----------

export const CartLineSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().min(1).max(99),
});
export type CartLine = z.infer<typeof CartLineSchema>;

export const CartSchema = z.object({
  id: z.string().uuid(),
  lines: z.array(
    CartLineSchema.extend({
      product: ProductSchema,
      lineTotalCents: z.number().int().nonnegative(),
    }),
  ),
  subtotalCents: z.number().int().nonnegative(),
  updatedAt: z.string(),
});
export type Cart = z.infer<typeof CartSchema>;

export const AddToCartSchema = CartLineSchema;
export type AddToCartInput = z.infer<typeof AddToCartSchema>;

export const UpdateCartLineSchema = z.object({
  quantity: z.number().int().min(0).max(99), // 0 removes the line
});
export type UpdateCartLineInput = z.infer<typeof UpdateCartLineSchema>;

// ---------- Orders ----------

export const CheckoutSchema = z.object({
  cartId: z.string().uuid(),
  customer: z.object({
    name: z.string().trim().min(1).max(120),
    email: z.string().trim().email().max(254),
  }),
  shippingAddress: z.object({
    line1: z.string().trim().min(1).max(200),
    line2: z.string().trim().max(200).optional().default(''),
    city: z.string().trim().min(1).max(100),
    region: z.string().trim().min(1).max(100),
    postalCode: z.string().trim().min(1).max(20),
    country: z.string().trim().length(2).toUpperCase(),
  }),
  /** Client-generated key so a retried checkout cannot create two orders. */
  idempotencyKey: z.string().uuid(),
});
export type CheckoutInput = z.infer<typeof CheckoutSchema>;

export const OrderStatusSchema = z.enum(['pending', 'confirmed', 'cancelled']);
export type OrderStatus = z.infer<typeof OrderStatusSchema>;

export const OrderSchema = z.object({
  id: z.string().uuid(),
  number: z.string(), // human-friendly, e.g. "SF-2026-000123"
  status: OrderStatusSchema,
  customer: CheckoutSchema.shape.customer,
  shippingAddress: CheckoutSchema.shape.shippingAddress,
  lines: z.array(
    z.object({
      productId: z.string().uuid(),
      name: z.string(),
      unitPriceCents: z.number().int().nonnegative(),
      quantity: z.number().int().min(1),
      lineTotalCents: z.number().int().nonnegative(),
    }),
  ),
  subtotalCents: z.number().int().nonnegative(),
  createdAt: z.string(),
});
export type Order = z.infer<typeof OrderSchema>;

// ---------- Errors ----------

export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

// ---------- Helpers ----------

export function formatCents(cents: number, currency: 'USD' = 'USD'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
}
