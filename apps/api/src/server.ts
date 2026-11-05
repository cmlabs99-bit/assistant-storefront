import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { loadConfig } from './lib/config.js';
import { createStore } from './store/index.js';

// Load apps/api/.env for local development (Node 20.12+/22). The path is resolved
// relative to this file, not the working directory, so it works from any cwd.
// Hosted environments inject real env vars and ship no .env file, so a missing
// file is not an error. Values already in process.env win over the file.
const envFile = fileURLToPath(new URL('../.env', import.meta.url));
try {
  process.loadEnvFile(envFile);
} catch {
  console.error(`[api] no .env at ${envFile}; using process environment only`);
}
const config = loadConfig();
const store = createStore(config);
const app = createApp(store, config);

const server = app.listen(config.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[api] listening on http://localhost:${config.PORT} (backend=${config.STORE_BACKEND})`);
});

// Graceful shutdown so in-flight requests finish during deploys.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}
