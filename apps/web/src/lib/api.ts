import type {
  AddToCartInput,
  Cart,
  CheckoutInput,
  Order,
  Product,
  ProductListResponse,
  ProductQuery,
} from '@storefront/shared';

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:4000';

/** Thrown for any non-2xx response. `code` is the API's stable error code. */
export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    let body: { error?: { code?: string; message?: string; details?: unknown } } = {};
    try {
      body = await res.json();
    } catch {
      /* non-JSON error body */
    }
    throw new ApiRequestError(
      res.status,
      body.error?.code ?? 'UNKNOWN',
      body.error?.message ?? `Request failed with ${res.status}`,
      body.error?.details,
    );
  }
  return (await res.json()) as T;
}

export const api = {
  listProducts(query: Partial<ProductQuery> = {}) {
    const params = new URLSearchParams();
    if (query.q) params.set('q', query.q);
    if (query.category) params.set('category', query.category);
    if (query.limit) params.set('limit', String(query.limit));
    if (query.offset) params.set('offset', String(query.offset));
    const qs = params.toString();
    return request<ProductListResponse>(`/products${qs ? `?${qs}` : ''}`);
  },
  listCategories() {
    return request<{ items: string[] }>('/products/categories');
  },
  getProduct(idOrSlug: string) {
    return request<Product>(`/products/${encodeURIComponent(idOrSlug)}`);
  },
  createCart() {
    return request<Cart>('/carts', { method: 'POST' });
  },
  getCart(cartId: string) {
    return request<Cart>(`/carts/${cartId}`);
  },
  addToCart(cartId: string, input: AddToCartInput) {
    return request<Cart>(`/carts/${cartId}/lines`, { method: 'POST', body: JSON.stringify(input) });
  },
  setCartLine(cartId: string, productId: string, quantity: number) {
    return request<Cart>(`/carts/${cartId}/lines/${productId}`, {
      method: 'PUT',
      body: JSON.stringify({ quantity }),
    });
  },
  checkout(input: CheckoutInput) {
    return request<Order>('/orders', { method: 'POST', body: JSON.stringify(input) });
  },
  getOrder(orderId: string) {
    return request<Order>(`/orders/${orderId}`);
  },
};
