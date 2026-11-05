import { formatCents } from '@storefront/shared';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../lib/cart-context';

export function CartDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { cart, setQuantity, error } = useCart();
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  const lines = cart?.lines ?? [];

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label="Shopping cart">
        <div className="drawer-head">
          <strong>Your cart</strong>
          <button className="btn secondary" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="drawer-body">
          {error && <p className="error">{error}</p>}
          {lines.length === 0 && <p className="empty">Your cart is empty.</p>}
          {lines.map((l) => (
            <div className="line" key={l.productId}>
              {l.product.imageUrl ? <img src={l.product.imageUrl} alt="" /> : <div />}
              <div>
                <div>{l.product.name}</div>
                <div className="muted" style={{ fontSize: 13 }}>
                  {formatCents(l.product.priceCents)} each
                </div>
                <div className="qty" style={{ marginTop: 6 }}>
                  <button
                    aria-label={`Decrease ${l.product.name}`}
                    onClick={() => setQuantity(l.productId, l.quantity - 1)}
                  >
                    −
                  </button>
                  <span aria-live="polite">{l.quantity}</span>
                  <button
                    aria-label={`Increase ${l.product.name}`}
                    onClick={() => setQuantity(l.productId, l.quantity + 1)}
                    disabled={l.quantity >= 99}
                  >
                    +
                  </button>
                </div>
              </div>
              <div className="price">{formatCents(l.lineTotalCents)}</div>
            </div>
          ))}
        </div>
        <div className="drawer-foot">
          <div className="row">
            <span>Subtotal</span>
            <strong className="price">{formatCents(cart?.subtotalCents ?? 0)}</strong>
          </div>
          <button
            className="btn block"
            disabled={lines.length === 0}
            onClick={() => {
              onClose();
              navigate('/checkout');
            }}
          >
            Checkout
          </button>
        </div>
      </aside>
    </>
  );
}
