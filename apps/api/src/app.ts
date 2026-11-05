import cors from 'cors';
import express, { type ErrorRequestHandler, type Express } from 'express';
import helmet from 'helmet';
import pino from 'pino';
import pinoHttp from 'pino-http';
import type { Config } from './lib/config.js';
import { AppError } from './lib/errors.js';
import { cartsRouter } from './routes/carts.js';
import { ordersRouter } from './routes/orders.js';
import { productsRouter } from './routes/products.js';
import type { Store } from './store/index.js';

/**
 * Builds the Express app from a Store and Config. Kept separate from the
 * listener so tests can mount it with supertest and a MemoryStore.
 */
export function createApp(store: Store, config: Config): Express {
  const app = express();
  const logger = pino({ level: config.LOG_LEVEL });

  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(
    cors({
      origin: config.corsOrigins,
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
      allowedHeaders: ['Content-Type'],
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(
    pinoHttp({
      logger,
      autoLogging: config.NODE_ENV !== 'test',
      // Request ids make a slow or failing request traceable across logs.
      genReqId: (req) => (req.headers['x-request-id'] as string | undefined) ?? crypto.randomUUID(),
    }),
  );

  app.get('/health', async (_req, res) => {
    try {
      await store.ping();
      res.json({ status: 'ok', backend: config.STORE_BACKEND });
    } catch (e) {
      res.status(503).json({ status: 'degraded', error: (e as Error).message });
    }
  });

  app.use('/products', productsRouter(store));
  app.use('/carts', cartsRouter(store));
  app.use('/orders', ordersRouter(store));

  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });

  const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
    if (err instanceof AppError) {
      res.status(err.status).json({
        error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) },
      });
      return;
    }
    // Malformed JSON from body-parser
    if (err && typeof err === 'object' && 'type' in err && (err as { type?: string }).type === 'entity.parse.failed') {
      res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Request body is not valid JSON' } });
      return;
    }
    req.log?.error({ err }, 'unhandled error');
    res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong' } });
  };
  app.use(errorHandler);

  return app;
}
