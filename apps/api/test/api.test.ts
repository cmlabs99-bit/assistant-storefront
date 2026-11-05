import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/lib/config.js';
import { MemoryStore } from '../src/store/index.js';

const config = loadConfig({ STORE_BACKEND: 'memory', NODE_ENV: 'test', LOG_LEVEL: 'silent' });

function makeApp() {
  return createApp(new MemoryStore(), config);
}

const validCheckout = (cartId: string, idempotencyKey = randomUUID()) => ({
  cartId,
  idempotencyKey,
  customer: { name: 'Ada Lovelace', email: 'ada@example.com' },
  shippingAddress: {
    line1: '1 Analytical Way',
    city: 'London',
    region: 'Greater London',
    postalCode: 'N1 9GU',
    country: 'gb',
  },
});

describe('GET /health', () => {
  it('reports ok with the active backend', async () => {
    const res = await request(makeApp()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', backend: 'memory' });
  });
});

describe('products', () => {
  it('lists products with pagination metadata', async () => {
    const res = await request(makeApp()).get('/products?limit=3');
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(3);
    expect(res.body.total).toBeGreaterThan(3);
    expect(res.body.limit).toBe(3);
    expect(res.body.offset).toBe(0);
  });

  it('searches by text across name, description, and tags', async () => {
    const res = await request(makeApp()).get('/products?q=coffee');
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
    for (const p of res.body.items) {
      const hay = `${p.name} ${p.description} ${p.tags.join(' ')}`.toLowerCase();
      expect(hay).toContain('coffee');
    }
  });

  it('filters by category', async () => {
    const res = await request(makeApp()).get('/products?category=office');
    expect(res.status).toBe(200);
    expect(res.body.items.every((p: { category: string }) => p.category === 'office')).toBe(true);
  });

  it('rejects an out-of-range limit', async () => {
    const res = await request(makeApp()).get('/products?limit=500');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('fetches a product by slug and by id', async () => {
    const app = makeApp();
    const bySlug = await request(app).get('/products/pour-over-kettle');
    expect(bySlug.status).toBe(200);
    const byId = await request(app).get(`/products/${bySlug.body.id}`);
    expect(byId.status).toBe(200);
    expect(byId.body).toEqual(bySlug.body);
  });

  it('returns 404 for an unknown product', async () => {
    const res = await request(makeApp()).get('/products/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('lists categories', async () => {
    const res = await request(makeApp()).get('/products/categories');
    expect(res.status).toBe(200);
    expect(res.body.items).toContain('kitchen');
  });
});

describe('carts', () => {
  it('creates a cart and adds lines, computing totals in cents', async () => {
    const app = makeApp();
    const cart = await request(app).post('/carts');
    expect(cart.status).toBe(201);
    expect(cart.body.lines).toEqual([]);

    const kettle = (await request(app).get('/products/pour-over-kettle')).body;
    const dripper = (await request(app).get('/products/ceramic-dripper')).body;

    let res = await request(app)
      .post(`/carts/${cart.body.id}/lines`)
      .send({ productId: kettle.id, quantity: 2 });
    expect(res.status).toBe(200);
    expect(res.body.subtotalCents).toBe(kettle.priceCents * 2);

    res = await request(app)
      .post(`/carts/${cart.body.id}/lines`)
      .send({ productId: dripper.id, quantity: 1 });
    expect(res.body.lines).toHaveLength(2);
    expect(res.body.subtotalCents).toBe(kettle.priceCents * 2 + dripper.priceCents);

    // Adding the same product again increments rather than duplicating the line.
    res = await request(app)
      .post(`/carts/${cart.body.id}/lines`)
      .send({ productId: kettle.id, quantity: 1 });
    expect(res.body.lines).toHaveLength(2);
    const kettleLine = res.body.lines.find((l: { productId: string }) => l.productId === kettle.id);
    expect(kettleLine.quantity).toBe(3);
  });

  it('sets a line quantity and removes it at zero', async () => {
    const app = makeApp();
    const cart = (await request(app).post('/carts')).body;
    const kettle = (await request(app).get('/products/pour-over-kettle')).body;
    await request(app).post(`/carts/${cart.id}/lines`).send({ productId: kettle.id, quantity: 2 });

    let res = await request(app).put(`/carts/${cart.id}/lines/${kettle.id}`).send({ quantity: 5 });
    expect(res.body.lines[0].quantity).toBe(5);

    res = await request(app).put(`/carts/${cart.id}/lines/${kettle.id}`).send({ quantity: 0 });
    expect(res.body.lines).toEqual([]);
    expect(res.body.subtotalCents).toBe(0);
  });

  it('validates the add-to-cart body', async () => {
    const app = makeApp();
    const cart = (await request(app).post('/carts')).body;
    const res = await request(app).post(`/carts/${cart.id}/lines`).send({ productId: 'nope', quantity: 0 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'productId' }), expect.objectContaining({ path: 'quantity' })]),
    );
  });

  it('returns 404 for an unknown cart', async () => {
    const res = await request(makeApp()).get(`/carts/${randomUUID()}`);
    expect(res.status).toBe(404);
  });
});

describe('checkout', () => {
  it('creates an order that snapshots prices and empties the cart', async () => {
    const app = makeApp();
    const cart = (await request(app).post('/carts')).body;
    const kettle = (await request(app).get('/products/pour-over-kettle')).body;
    await request(app).post(`/carts/${cart.id}/lines`).send({ productId: kettle.id, quantity: 2 });

    const res = await request(app).post('/orders').send(validCheckout(cart.id));
    expect(res.status).toBe(201);
    expect(res.body.number).toMatch(/^SF-\d{4}-\d{6}$/);
    expect(res.body.status).toBe('confirmed');
    expect(res.body.lines).toEqual([
      expect.objectContaining({
        productId: kettle.id,
        name: kettle.name,
        unitPriceCents: kettle.priceCents,
        quantity: 2,
        lineTotalCents: kettle.priceCents * 2,
      }),
    ]);
    expect(res.body.subtotalCents).toBe(kettle.priceCents * 2);
    expect(res.body.shippingAddress.country).toBe('GB'); // normalised to upper case

    const after = await request(app).get(`/carts/${cart.id}`);
    expect(after.body.lines).toEqual([]);

    const fetched = await request(app).get(`/orders/${res.body.id}`);
    expect(fetched.status).toBe(200);
    expect(fetched.body.id).toBe(res.body.id);
  });

  it('is idempotent: retrying with the same key returns the same order', async () => {
    const app = makeApp();
    const cart = (await request(app).post('/carts')).body;
    const kettle = (await request(app).get('/products/pour-over-kettle')).body;
    await request(app).post(`/carts/${cart.id}/lines`).send({ productId: kettle.id, quantity: 1 });

    const key = randomUUID();
    const first = await request(app).post('/orders').send(validCheckout(cart.id, key));
    const second = await request(app).post('/orders').send(validCheckout(cart.id, key));
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.id).toBe(first.body.id);
  });

  it('refuses to check out an empty cart', async () => {
    const app = makeApp();
    const cart = (await request(app).post('/carts')).body;
    const res = await request(app).post('/orders').send(validCheckout(cart.id));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CART_EMPTY');
  });

  it('refuses to check out an out-of-stock item', async () => {
    const app = makeApp();
    const cart = (await request(app).post('/carts')).body;
    const wallet = (await request(app).get('/products/leather-wallet')).body;
    expect(wallet.inStock).toBe(false);
    await request(app).post(`/carts/${cart.id}/lines`).send({ productId: wallet.id, quantity: 1 });
    const res = await request(app).post('/orders').send(validCheckout(cart.id));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('OUT_OF_STOCK');
  });

  it('validates customer and address fields', async () => {
    const app = makeApp();
    const cart = (await request(app).post('/carts')).body;
    const bad = { ...validCheckout(cart.id), customer: { name: '', email: 'not-an-email' } };
    const res = await request(app).post('/orders').send(bad);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects malformed JSON with a stable error shape', async () => {
    const res = await request(makeApp())
      .post('/orders')
      .set('Content-Type', 'application/json')
      .send('{"cartId": ');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });
});
