import type { Cart, Product } from '@storefront/shared';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CartProvider } from '../lib/cart-context';
import { Header } from './Header';
import { ProductCard } from './ProductCard';

const product: Product = {
  id: '11111111-1111-4111-8111-111111111111',
  slug: 'kettle',
  name: 'Gooseneck Kettle',
  description: 'A kettle.',
  priceCents: 6500,
  currency: 'USD',
  imageUrl: null,
  category: 'kitchen',
  tags: ['coffee'],
  inStock: true,
};

const emptyCart: Cart = {
  id: '22222222-2222-4222-8222-222222222222',
  lines: [],
  subtotalCents: 0,
  updatedAt: new Date().toISOString(),
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('ProductCard add-to-cart flow', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates a cart on first add, persists the id, and updates the header badge', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/carts') && init?.method === 'POST') return jsonResponse(emptyCart, 201);
      if (url.endsWith(`/carts/${emptyCart.id}/lines`) && init?.method === 'POST') {
        const body = JSON.parse(String(init.body));
        expect(body).toEqual({ productId: product.id, quantity: 1 });
        return jsonResponse({
          ...emptyCart,
          lines: [{ productId: product.id, quantity: 1, product, lineTotalCents: 6500 }],
          subtotalCents: 6500,
        });
      }
      throw new Error(`unexpected fetch ${init?.method ?? 'GET'} ${url}`);
    });

    render(
      <MemoryRouter>
        <CartProvider>
          <Header onOpenCart={() => {}} />
          <ProductCard product={product} />
        </CartProvider>
      </MemoryRouter>,
    );

    expect(screen.getByText('$65.00')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => expect(screen.getByRole('button', { name: /open cart, 1 items/i })).toBeInTheDocument());
    expect(localStorage.getItem('storefront.cartId')).toBe(emptyCart.id);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('disables the button for out-of-stock products', () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(emptyCart));
    render(
      <MemoryRouter>
        <CartProvider>
          <ProductCard product={{ ...product, inStock: false }} />
        </CartProvider>
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: 'Sold out' })).toBeDisabled();
  });
});
