import { Router } from 'express';
import { z } from 'zod';
import { ProductQuerySchema } from '@storefront/shared';
import { NotFoundError } from '../lib/errors.js';
import { parse } from '../lib/validate.js';
import type { Store } from '../store/index.js';

const IdOrSlug = z.string().min(1).max(120);
const UUID = z.string().uuid();

export function productsRouter(store: Store): Router {
  const r = Router();

  // GET /products?q=&category=&limit=&offset=
  r.get('/', async (req, res, next) => {
    try {
      const query = parse(ProductQuerySchema, req.query);
      const { items, total } = await store.listProducts(query);
      res.json({ items, total, limit: query.limit, offset: query.offset });
    } catch (e) {
      next(e);
    }
  });

  // GET /products/categories
  r.get('/categories', async (_req, res, next) => {
    try {
      res.json({ items: await store.listCategories() });
    } catch (e) {
      next(e);
    }
  });

  // GET /products/:idOrSlug  — accepts a UUID or a slug
  r.get('/:idOrSlug', async (req, res, next) => {
    try {
      const key = parse(IdOrSlug, req.params.idOrSlug);
      const product = UUID.safeParse(key).success
        ? await store.getProductById(key)
        : await store.getProductBySlug(key);
      if (!product) throw new NotFoundError('Product', key);
      res.json(product);
    } catch (e) {
      next(e);
    }
  });

  return r;
}
