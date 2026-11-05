import { formatCents, type Product } from '@storefront/shared';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiRequestError, api } from '../lib/api';
import { useCart } from '../lib/cart-context';

export function ProductPage() {
  const { slug = '' } = useParams();
  const { add } = useCart();
  const [product, setProduct] = useState<Product | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    setStatus('loading');
    api
      .getProduct(slug)
      .then((p) => {
        setProduct(p);
        setStatus('ready');
      })
      .catch((e) => setStatus(e instanceof ApiRequestError && e.status === 404 ? 'missing' : 'error'));
  }, [slug]);

  if (status === 'loading') return <main className="container muted">Loading…</main>;
  if (status === 'missing')
    return (
      <main className="container">
        <p className="empty">
          That product doesn’t exist. <Link to="/">Back to the catalog</Link>
        </p>
      </main>
    );
  if (status === 'error' || !product) return <main className="container error">Could not load product.</main>;

  async function handleAdd() {
    await add(product!.id, qty);
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  }

  return (
    <main className="container">
      <p style={{ marginTop: 16 }}>
        <Link to="/" className="muted">
          ← All products
        </Link>
      </p>
      <div className="detail">
        {product.imageUrl ? <img src={product.imageUrl} alt={product.name} /> : <div />}
        <div>
          <h1>{product.name}</h1>
          <p className="price" style={{ fontSize: 20 }}>
            {formatCents(product.priceCents)}
          </p>
          <p>{product.description}</p>
          <p>
            {product.tags.map((t) => (
              <span className="tag" key={t}>
                {t}
              </span>
            ))}
          </p>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 16 }}>
            <div className="qty">
              <button aria-label="Decrease quantity" onClick={() => setQty((n) => Math.max(1, n - 1))}>
                −
              </button>
              <span>{qty}</span>
              <button aria-label="Increase quantity" onClick={() => setQty((n) => Math.min(99, n + 1))}>
                +
              </button>
            </div>
            <button className="btn" onClick={handleAdd} disabled={!product.inStock}>
              {product.inStock ? (added ? 'Added ✓' : 'Add to cart') : 'Sold out'}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
