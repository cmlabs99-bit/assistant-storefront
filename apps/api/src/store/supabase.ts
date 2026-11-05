import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Cart, CheckoutInput, Order, Product, ProductQuery } from '@storefront/shared';
import { AppError, ConflictError, NotFoundError } from '../lib/errors.js';
import type { Store } from './types.js';

type ProductRow = {
  id: string;
  slug: string;
  name: string;
  description: string;
  price_cents: number;
  currency: 'USD';
  image_url: string | null;
  category: string;
  tags: string[];
  in_stock: boolean;
};

const PRODUCT_COLUMNS =
  'id, slug, name, description, price_cents, currency, image_url, category, tags, in_stock';

function toProduct(r: ProductRow): Product {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    description: r.description,
    priceCents: r.price_cents,
    currency: r.currency,
    imageUrl: r.image_url,
    category: r.category,
    tags: r.tags ?? [],
    inStock: r.in_stock,
  };
}

/**
 * Supabase/Postgres-backed store. Uses the service role key server-side only.
 * Checkout is delegated to the `checkout_cart` SQL function so order + lines
 * are written in one transaction with idempotency enforced by the database.
 */
export class SupabaseStore implements Store {
  private db: SupabaseClient;

  constructor(url: string, serviceRoleKey: string) {
    this.db = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  }

  async ping() {
    const { error } = await this.db.from('products').select('id', { head: true, count: 'exact' });
    if (error) throw new AppError(503, 'DB_UNAVAILABLE', error.message);
  }

  async listProducts(query: ProductQuery) {
    let req = this.db.from('products').select(PRODUCT_COLUMNS, { count: 'exact' });
    if (query.category) req = req.eq('category', query.category);
    if (query.q) {
      // websearch_to_tsquery handles quotes, "or", and "-exclusions" safely.
      req = req.textSearch('search', query.q, { type: 'websearch', config: 'english' });
    }
    const { data, error, count } = await req
      .order('name', { ascending: true })
      .range(query.offset, query.offset + query.limit - 1);
    if (error) throw dbError(error);
    return { items: (data as ProductRow[]).map(toProduct), total: count ?? 0 };
  }

  async getProductById(id: string) {
    const { data, error } = await this.db.from('products').select(PRODUCT_COLUMNS).eq('id', id).maybeSingle();
    if (error) throw dbError(error);
    return data ? toProduct(data as ProductRow) : null;
  }

  async getProductBySlug(slug: string) {
    const { data, error } = await this.db.from('products').select(PRODUCT_COLUMNS).eq('slug', slug).maybeSingle();
    if (error) throw dbError(error);
    return data ? toProduct(data as ProductRow) : null;
  }

  async listCategories() {
    const { data, error } = await this.db.from('products').select('category');
    if (error) throw dbError(error);
    return [...new Set((data as { category: string }[]).map((r) => r.category))].sort();
  }

  async createCart(): Promise<Cart> {
    const { data, error } = await this.db.from('carts').insert({}).select('id').single();
    if (error) throw dbError(error);
    return (await this.getCart(data.id))!;
  }

  async getCart(cartId: string): Promise<Cart | null> {
    const { data: cart, error } = await this.db
      .from('carts')
      .select('id, updated_at')
      .eq('id', cartId)
      .maybeSingle();
    if (error) throw dbError(error);
    if (!cart) return null;

    const { data: lines, error: linesError } = await this.db
      .from('cart_lines')
      .select(`quantity, product:products(${PRODUCT_COLUMNS})`)
      .eq('cart_id', cartId);
    if (linesError) throw dbError(linesError);

    const materialized = (lines as unknown as { quantity: number; product: ProductRow }[]).map((l) => {
      const product = toProduct(l.product);
      return {
        productId: product.id,
        quantity: l.quantity,
        product,
        lineTotalCents: product.priceCents * l.quantity,
      };
    });
    return {
      id: cart.id,
      lines: materialized,
      subtotalCents: materialized.reduce((s, l) => s + l.lineTotalCents, 0),
      updatedAt: cart.updated_at,
    };
  }

  async addToCart(cartId: string, productId: string, quantity: number) {
    await this.requireCart(cartId);
    if (!(await this.getProductById(productId))) throw new NotFoundError('Product', productId);

    const { data: existing, error } = await this.db
      .from('cart_lines')
      .select('quantity')
      .eq('cart_id', cartId)
      .eq('product_id', productId)
      .maybeSingle();
    if (error) throw dbError(error);

    const next = Math.min(99, (existing?.quantity ?? 0) + quantity);
    const { error: upsertError } = await this.db
      .from('cart_lines')
      .upsert({ cart_id: cartId, product_id: productId, quantity: next }, { onConflict: 'cart_id,product_id' });
    if (upsertError) throw dbError(upsertError);
    await this.touchCart(cartId);
    return (await this.getCart(cartId))!;
  }

  async setCartLine(cartId: string, productId: string, quantity: number) {
    await this.requireCart(cartId);
    if (!(await this.getProductById(productId))) throw new NotFoundError('Product', productId);

    if (quantity === 0) {
      const { error } = await this.db.from('cart_lines').delete().eq('cart_id', cartId).eq('product_id', productId);
      if (error) throw dbError(error);
    } else {
      const { error } = await this.db
        .from('cart_lines')
        .upsert({ cart_id: cartId, product_id: productId, quantity }, { onConflict: 'cart_id,product_id' });
      if (error) throw dbError(error);
    }
    await this.touchCart(cartId);
    return (await this.getCart(cartId))!;
  }

  async checkout(input: CheckoutInput): Promise<Order> {
    const { data, error } = await this.db.rpc('checkout_cart', {
      p_cart_id: input.cartId,
      p_idempotency_key: input.idempotencyKey,
      p_customer_name: input.customer.name,
      p_customer_email: input.customer.email,
      p_ship_line1: input.shippingAddress.line1,
      p_ship_line2: input.shippingAddress.line2 ?? '',
      p_ship_city: input.shippingAddress.city,
      p_ship_region: input.shippingAddress.region,
      p_ship_postal_code: input.shippingAddress.postalCode,
      p_ship_country: input.shippingAddress.country,
    });
    if (error) {
      if (error.message.includes('CART_EMPTY')) throw new ConflictError('CART_EMPTY', 'Cart has no items');
      if (error.message.includes('OUT_OF_STOCK'))
        throw new ConflictError('OUT_OF_STOCK', 'One or more items are out of stock');
      if (error.message.includes('foreign key') || error.code === '23503') throw new NotFoundError('Cart', input.cartId);
      throw dbError(error);
    }
    const order = await this.getOrder(data as string);
    if (!order) throw new AppError(500, 'ORDER_READBACK_FAILED', 'Order was created but could not be read back');
    return order;
  }

  async getOrder(orderId: string): Promise<Order | null> {
    const { data: o, error } = await this.db
      .from('orders')
      .select(
        'id, number, status, customer_name, customer_email, ship_line1, ship_line2, ship_city, ship_region, ship_postal_code, ship_country, subtotal_cents, created_at',
      )
      .eq('id', orderId)
      .maybeSingle();
    if (error) throw dbError(error);
    if (!o) return null;

    const { data: lines, error: linesError } = await this.db
      .from('order_lines')
      .select('product_id, name, unit_price_cents, quantity, line_total_cents')
      .eq('order_id', orderId);
    if (linesError) throw dbError(linesError);

    return {
      id: o.id,
      number: o.number,
      status: o.status,
      customer: { name: o.customer_name, email: o.customer_email },
      shippingAddress: {
        line1: o.ship_line1,
        line2: o.ship_line2,
        city: o.ship_city,
        region: o.ship_region,
        postalCode: o.ship_postal_code,
        country: o.ship_country,
      },
      lines: (lines as { product_id: string; name: string; unit_price_cents: number; quantity: number; line_total_cents: number }[]).map(
        (l) => ({
          productId: l.product_id,
          name: l.name,
          unitPriceCents: l.unit_price_cents,
          quantity: l.quantity,
          lineTotalCents: l.line_total_cents,
        }),
      ),
      subtotalCents: o.subtotal_cents,
      createdAt: o.created_at,
    };
  }

  private async requireCart(cartId: string) {
    const { data, error } = await this.db.from('carts').select('id').eq('id', cartId).maybeSingle();
    if (error) throw dbError(error);
    if (!data) throw new NotFoundError('Cart', cartId);
  }

  private async touchCart(cartId: string) {
    const { error } = await this.db.from('carts').update({ updated_at: new Date().toISOString() }).eq('id', cartId);
    if (error) throw dbError(error);
  }
}

function dbError(e: { message: string; code?: string }): AppError {
  return new AppError(500, 'DB_ERROR', e.message, e.code ? { code: e.code } : undefined);
}
