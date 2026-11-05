import { formatCents, type Product } from '@storefront/shared';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useCart } from '../lib/cart-context';

export function ProductCard({ product }: { product: Product }) {
  const { add } = useCart();
  const [busy, setBusy] = useState(false);

  async function handleAdd() {
    setBusy(true);
    try {
      await add(product.id, 1);
    } catch {
      /* error surfaced by the cart context */
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="card">
      <Link to={`/products/${product.slug}`}>
        {product.imageUrl ? (
          <img src={product.imageUrl} alt="" loading="lazy" />
        ) : (
          <div style={{ aspectRatio: '1', background: 'var(--line)' }} />
        )}
      </Link>
      <div className="card-body">
        <Link to={`/products/${product.slug}`} className="card-title">
          {product.name}
        </Link>
        <div className="card-meta">{product.category}</div>
        <div className="card-footer">
          <span className="price">{formatCents(product.priceCents)}</span>
          <button className="btn" onClick={handleAdd} disabled={busy || !product.inStock}>
            {product.inStock ? (busy ? 'Adding…' : 'Add') : 'Sold out'}
          </button>
        </div>
      </div>
    </article>
  );
}
