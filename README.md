# Assistant Storefront

A small, production-shaped e-commerce app that an AI assistant can drive.

- **Web**: React + Vite + TypeScript — catalog with search, product pages, a cart that survives refresh, checkout.
- **API**: Express + TypeScript — validated REST endpoints over PostgreSQL (Supabase), idempotent checkout.
- **MCP server**: exposes the same storefront to Claude, Cursor, or any MCP client as a bounded set of tools (`search_products`, `add_to_cart`, `checkout`, …).
- **Shared**: one `zod` contract imported by all three, so the types cannot drift.

> Demo store. No real payments are taken.

## Why this exists

Most shopping flows assume a human in a browser tab. This project asks what changes when the "shopper" might be an AI assistant acting on someone's behalf: the API has to be **safe to call by a program** (validated inputs, structured errors, idempotent writes, no raw database access), and the UI still has to be good for people. The same cart can be built up by an assistant via MCP and then finished by a person in the browser, or the other way round.

## Architecture

```
apps/web  ──HTTP──▶  apps/api  ──service role──▶  Supabase / Postgres
apps/mcp  ──HTTP──▶  apps/api
                      ▲
packages/shared  (zod schemas + types, imported by all three)
```

- The browser never holds a database credential; it only remembers a `cartId` in `localStorage`.
- The API validates every request body and query string with the shared `zod` schemas and returns a stable error shape `{ error: { code, message, details? } }`. Clients branch on `code`, never on message text.
- `checkout` is a single Postgres function (`checkout_cart`) that re-prices from the live catalog, snapshots line items, enforces stock, and is **idempotent** on a client-supplied key — a retried request returns the original order instead of creating a second one.
- A `Store` interface separates routes from persistence. `SupabaseStore` runs in production; `MemoryStore` runs the test suite and `STORE_BACKEND=memory` demos with no database at all.
- Money is integer cents everywhere. Floats never touch a price.

## Quick start (no database needed)

```bash
npm install
npm run build -w @storefront/shared

# Terminal 1 — API with the in-memory backend (the example env defaults to it)
cp apps/api/.env.example apps/api/.env
npm run dev -w @storefront/api          # http://localhost:4000

# Terminal 2 — web
cp apps/web/.env.example apps/web/.env
npm run dev -w @storefront/web          # http://localhost:5173
```

Or run both at once from the root: `npm run dev`.

## Running against Supabase

1. Create a project at supabase.com.
2. In the SQL editor, run `supabase/schema.sql`, then `supabase/seed.sql`.
3. Project Settings → API: copy the **URL** and the **service_role** key.
4. In `apps/api/.env`:
   ```
   STORE_BACKEND=supabase
   SUPABASE_URL=https://<ref>.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=<service role key>
   CORS_ORIGINS=http://localhost:5173
   ```
5. `npm run dev -w @storefront/api`.

The service-role key bypasses RLS and must only ever live on the server. RLS is still enabled on every table so the anon key can do nothing if it leaks.

## Using the MCP server

Build it once (`npm run build -w @storefront/mcp`), start the API, then register it with your client.

**Claude Desktop** (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "storefront": {
      "command": "node",
      "args": ["/absolute/path/to/assistant-storefront/apps/mcp/dist/server.js"],
      "env": { "STOREFRONT_API_URL": "http://localhost:4000" }
    }
  }
}
```

**Claude Code**: `claude mcp add storefront -e STOREFRONT_API_URL=http://localhost:4000 -- node /absolute/path/to/apps/mcp/dist/server.js`

Then ask: *"Find me a coffee grinder under $200, add it to a new cart, and show me the cart."* The assistant will call `search_products`, `create_cart`, `add_to_cart`, and `view_cart`. The `checkout` tool description instructs the model to confirm details with the user first and to generate its own idempotency key.

## API

| Method | Path                              | Purpose                                   |
| ------ | --------------------------------- | ----------------------------------------- |
| GET    | `/health`                         | Liveness + which backend is active        |
| GET    | `/products?q=&category=&limit=&offset=` | Search / list (full-text in Postgres) |
| GET    | `/products/categories`            | Distinct categories                       |
| GET    | `/products/:idOrSlug`             | One product                               |
| POST   | `/carts`                          | New cart                                  |
| GET    | `/carts/:cartId`                  | Cart with materialised lines + subtotal   |
| POST   | `/carts/:cartId/lines`            | Add quantity `{ productId, quantity }`    |
| PUT    | `/carts/:cartId/lines/:productId` | Set quantity `{ quantity }` (0 removes)   |
| POST   | `/orders`                         | Checkout (idempotent on `idempotencyKey`) |
| GET    | `/orders/:orderId`                | One order                                 |

Error codes: `VALIDATION_ERROR` (400), `INVALID_JSON` (400), `NOT_FOUND` (404), `CART_EMPTY` (409), `OUT_OF_STOCK` (409), `DB_ERROR` (500), `DB_UNAVAILABLE` (503).

## Tests

```bash
npm test
```

- `apps/api/test` — supertest against the real Express app with `MemoryStore`: search, pagination, cart maths, idempotent checkout, stock enforcement, validation errors, malformed JSON.
- `apps/web/src/**/*.test.tsx` — React Testing Library: the add-to-cart flow (cart creation, persistence, header badge) and sold-out handling.

CI runs typecheck, tests, and build on every push (`.github/workflows/ci.yml`).

## Deploying

- **Database**: Supabase (free tier is fine).
- **API**: any Node host — Railway, Render, Fly.io. Build command `npm run build -w @storefront/shared && npm run build -w @storefront/api`, start command `node apps/api/dist/server.js`, set the env vars from `.env.example`, and add your web origin to `CORS_ORIGINS`.
- **Web**: Vercel or Netlify. Root `apps/web`, build `npm run build`, output `dist`, env `VITE_API_URL=https://<your-api>`.

## Design decisions worth asking me about

1. **Server-side cart, client-side id.** A cart in `localStorage` is simpler, but then prices live in the browser and an assistant can't share it. Keeping the cart on the server costs one round trip and buys authoritative pricing and a cart that two clients (web and MCP) can both see.
2. **Checkout as a database function.** Order + lines + cart clear + idempotency check happen in one transaction. Doing that from application code with several round trips leaves windows where a crash produces a half-written order.
3. **Idempotency key from the client.** The client (or the model) generates it, so a retry after a timeout is safe by construction rather than by luck.
4. **`Store` interface with a memory implementation.** It isn't ceremony: it's what lets the test suite run in under a second with no database and lets someone try the project without a Supabase account.
5. **MCP as a thin layer over HTTP.** The assistant gets exactly the same contract and the same guardrails as the browser. There is no privileged "agent path".

## Project layout

```
apps/
  api/      Express API (src/routes, src/store, src/lib) + tests
  web/      React app (src/pages, src/components, src/lib)
  mcp/      MCP stdio server
packages/
  shared/   zod schemas and TypeScript types
supabase/   schema.sql, seed.sql
```

## License

MIT
