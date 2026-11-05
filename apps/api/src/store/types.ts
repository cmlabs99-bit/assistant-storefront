import type { Cart, CheckoutInput, Order, Product, ProductQuery } from '@storefront/shared';

/**
 * The persistence boundary. Routes depend only on this interface, which
 * keeps business rules testable without a database and lets us swap the
 * backing store (Supabase in production, memory in tests/demos).
 */
export interface Store {
  listProducts(query: ProductQuery): Promise<{ items: Product[]; total: number }>;
  getProductById(id: string): Promise<Product | null>;
  getProductBySlug(slug: string): Promise<Product | null>;
  listCategories(): Promise<string[]>;

  createCart(): Promise<Cart>;
  getCart(cartId: string): Promise<Cart | null>;
  /** Adds quantity to an existing line or creates the line. */
  addToCart(cartId: string, productId: string, quantity: number): Promise<Cart>;
  /** Sets quantity; 0 removes the line. */
  setCartLine(cartId: string, productId: string, quantity: number): Promise<Cart>;

  /**
   * Converts a cart into an order atomically. Must be idempotent on
   * `input.idempotencyKey`: a retry returns the same order rather than a
   * second one. Throws ConflictError('CART_EMPTY' | 'OUT_OF_STOCK').
   */
  checkout(input: CheckoutInput): Promise<Order>;
  getOrder(orderId: string): Promise<Order | null>;

  /** Liveness check for /health. */
  ping(): Promise<void>;
}
