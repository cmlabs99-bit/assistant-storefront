import { formatCents, type Order } from '@storefront/shared';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';

export function OrderPage() {
  const { orderId = '' } = useParams();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getOrder(orderId).then(setOrder).catch((e: Error) => setError(e.message));
  }, [orderId]);

  if (error) return <main className="container error">{error}</main>;
  if (!order) return <main className="container muted">Loading…</main>;

  return (
    <main className="container">
      <div className="form">
        <h1>Thanks, {order.customer.name.split(' ')[0]}.</h1>
        <p>
          Order <strong>{order.number}</strong> is {order.status}. A confirmation would go to{' '}
          <strong>{order.customer.email}</strong>.
        </p>
        {order.lines.map((l) => (
          <div className="row" key={l.productId}>
            <span>
              {l.quantity} × {l.name}
            </span>
            <span className="price">{formatCents(l.lineTotalCents)}</span>
          </div>
        ))}
        <div className="row" style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
          <strong>Subtotal</strong>
          <strong className="price">{formatCents(order.subtotalCents)}</strong>
        </div>
        <p className="muted" style={{ fontSize: 13 }}>
          Shipping to {order.shippingAddress.line1}, {order.shippingAddress.city}, {order.shippingAddress.region}{' '}
          {order.shippingAddress.postalCode}, {order.shippingAddress.country}
        </p>
        <Link to="/" className="btn secondary block" style={{ display: 'block', textAlign: 'center' }}>
          Continue shopping
        </Link>
      </div>
    </main>
  );
}
