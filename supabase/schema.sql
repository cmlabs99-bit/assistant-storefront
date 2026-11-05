-- Assistant Storefront schema
-- Run this in the Supabase SQL editor (or psql against any Postgres 14+).
-- Money is stored as integer cents. Never use floating point for currency.

create extension if not exists "pgcrypto";

-- ---------- Products ----------
create table if not exists products (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,
  name          text not null,
  description   text not null default '',
  price_cents   integer not null check (price_cents >= 0),
  currency      text not null default 'USD' check (currency = 'USD'),
  image_url     text,
  category      text not null,
  tags          text[] not null default '{}',
  in_stock      boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Full-text search over name, description, and tags.
alter table products
  add column if not exists search tsvector
  generated always as (
    setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
    setweight(to_tsvector('english', array_to_string(tags, ' ')), 'C')
  ) stored;

create index if not exists products_search_idx on products using gin (search);
create index if not exists products_category_idx on products (category);

-- ---------- Carts ----------
create table if not exists carts (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists cart_lines (
  cart_id     uuid not null references carts(id) on delete cascade,
  product_id  uuid not null references products(id),
  quantity    integer not null check (quantity between 1 and 99),
  primary key (cart_id, product_id)
);

-- ---------- Orders ----------
create sequence if not exists order_number_seq;

create table if not exists orders (
  id                uuid primary key default gen_random_uuid(),
  number            text not null unique
                    default ('SF-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('order_number_seq')::text, 6, '0')),
  status            text not null default 'confirmed' check (status in ('pending', 'confirmed', 'cancelled')),
  cart_id           uuid references carts(id),
  idempotency_key   uuid not null unique,
  customer_name     text not null,
  customer_email    text not null,
  ship_line1        text not null,
  ship_line2        text not null default '',
  ship_city         text not null,
  ship_region       text not null,
  ship_postal_code  text not null,
  ship_country      char(2) not null,
  subtotal_cents    integer not null check (subtotal_cents >= 0),
  created_at        timestamptz not null default now()
);

-- Order lines snapshot name and price at purchase time so later catalog edits
-- never rewrite history.
create table if not exists order_lines (
  id                uuid primary key default gen_random_uuid(),
  order_id          uuid not null references orders(id) on delete cascade,
  product_id        uuid not null references products(id),
  name              text not null,
  unit_price_cents  integer not null check (unit_price_cents >= 0),
  quantity          integer not null check (quantity >= 1),
  line_total_cents  integer not null check (line_total_cents >= 0)
);

create index if not exists order_lines_order_idx on order_lines (order_id);

-- ---------- updated_at trigger ----------
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists products_set_updated_at on products;
create trigger products_set_updated_at before update on products
  for each row execute function set_updated_at();

drop trigger if exists carts_set_updated_at on carts;
create trigger carts_set_updated_at before update on carts
  for each row execute function set_updated_at();

-- ---------- Row Level Security ----------
-- The API talks to Postgres with the service role key, which bypasses RLS.
-- RLS is still enabled so the anon key (if ever exposed) can do nothing.
alter table products enable row level security;
alter table carts enable row level security;
alter table cart_lines enable row level security;
alter table orders enable row level security;
alter table order_lines enable row level security;

drop policy if exists "public can read products" on products;
create policy "public can read products" on products for select using (true);

-- ---------- Checkout as a single transaction ----------
-- Creates the order and its lines atomically, re-pricing from the current
-- catalog and enforcing idempotency. Returns the order id.
create or replace function checkout_cart(
  p_cart_id uuid,
  p_idempotency_key uuid,
  p_customer_name text,
  p_customer_email text,
  p_ship_line1 text,
  p_ship_line2 text,
  p_ship_city text,
  p_ship_region text,
  p_ship_postal_code text,
  p_ship_country text
) returns uuid
language plpgsql
as $$
declare
  v_existing uuid;
  v_order_id uuid;
  v_subtotal integer;
begin
  -- Idempotent retry: return the order already created for this key.
  select id into v_existing from orders where idempotency_key = p_idempotency_key;
  if v_existing is not null then
    return v_existing;
  end if;

  if not exists (select 1 from cart_lines where cart_id = p_cart_id) then
    raise exception 'CART_EMPTY' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from cart_lines cl join products p on p.id = cl.product_id
    where cl.cart_id = p_cart_id and p.in_stock = false
  ) then
    raise exception 'OUT_OF_STOCK' using errcode = 'P0002';
  end if;

  select coalesce(sum(p.price_cents * cl.quantity), 0) into v_subtotal
  from cart_lines cl join products p on p.id = cl.product_id
  where cl.cart_id = p_cart_id;

  insert into orders (
    cart_id, idempotency_key, customer_name, customer_email,
    ship_line1, ship_line2, ship_city, ship_region, ship_postal_code, ship_country,
    subtotal_cents
  ) values (
    p_cart_id, p_idempotency_key, p_customer_name, p_customer_email,
    p_ship_line1, coalesce(p_ship_line2, ''), p_ship_city, p_ship_region, p_ship_postal_code, upper(p_ship_country),
    v_subtotal
  ) returning id into v_order_id;

  insert into order_lines (order_id, product_id, name, unit_price_cents, quantity, line_total_cents)
  select v_order_id, p.id, p.name, p.price_cents, cl.quantity, p.price_cents * cl.quantity
  from cart_lines cl join products p on p.id = cl.product_id
  where cl.cart_id = p_cart_id;

  -- Empty the cart now that it has been converted.
  delete from cart_lines where cart_id = p_cart_id;

  return v_order_id;
end;
$$;
