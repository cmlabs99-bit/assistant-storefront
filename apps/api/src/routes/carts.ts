import { Router } from 'express';
import { z } from 'zod';
import { AddToCartSchema, UpdateCartLineSchema } from '@storefront/shared';
import { NotFoundError } from '../lib/errors.js';
import { parse } from '../lib/validate.js';
import type { Store } from '../store/index.js';

const UUID = z.string().uuid();

export function cartsRouter(store: Store): Router {
  const r = Router();

  // POST /carts — create an empty cart; the client keeps the id (localStorage)
  r.post('/', async (_req, res, next) => {
    try {
      res.status(201).json(await store.createCart());
    } catch (e) {
      next(e);
    }
  });

  // GET /carts/:cartId
  r.get('/:cartId', async (req, res, next) => {
    try {
      const cartId = parse(UUID, req.params.cartId);
      const cart = await store.getCart(cartId);
      if (!cart) throw new NotFoundError('Cart', cartId);
      res.json(cart);
    } catch (e) {
      next(e);
    }
  });

  // POST /carts/:cartId/lines — add quantity of a product
  r.post('/:cartId/lines', async (req, res, next) => {
    try {
      const cartId = parse(UUID, req.params.cartId);
      const body = parse(AddToCartSchema, req.body);
      res.json(await store.addToCart(cartId, body.productId, body.quantity));
    } catch (e) {
      next(e);
    }
  });

  // PUT /carts/:cartId/lines/:productId — set quantity (0 removes)
  r.put('/:cartId/lines/:productId', async (req, res, next) => {
    try {
      const cartId = parse(UUID, req.params.cartId);
      const productId = parse(UUID, req.params.productId);
      const body = parse(UpdateCartLineSchema, req.body);
      res.json(await store.setCartLine(cartId, productId, body.quantity));
    } catch (e) {
      next(e);
    }
  });

  return r;
}
