import { Router } from 'express';
import { z } from 'zod';
import { CheckoutSchema } from '@storefront/shared';
import { NotFoundError } from '../lib/errors.js';
import { parse } from '../lib/validate.js';
import type { Store } from '../store/index.js';

const UUID = z.string().uuid();

export function ordersRouter(store: Store): Router {
  const r = Router();

  // POST /orders — checkout a cart. Idempotent on body.idempotencyKey.
  r.post('/', async (req, res, next) => {
    try {
      const input = parse(CheckoutSchema, req.body);
      const order = await store.checkout(input);
      res.status(201).json(order);
    } catch (e) {
      next(e);
    }
  });

  // GET /orders/:orderId
  r.get('/:orderId', async (req, res, next) => {
    try {
      const orderId = parse(UUID, req.params.orderId);
      const order = await store.getOrder(orderId);
      if (!order) throw new NotFoundError('Order', orderId);
      res.json(order);
    } catch (e) {
      next(e);
    }
  });

  return r;
}
