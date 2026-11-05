import { CheckoutSchema, formatCents } from '@storefront/shared';
import { useMemo, useState, type FormEvent } from 'react';
import type React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiRequestError, api } from '../lib/api';
import { useCart } from '../lib/cart-context';

type FieldErrors = Record<string, string>;

export function CheckoutPage() {
  const { cart, reset } = useCart();
  const navigate = useNavigate();
  // One key per checkout attempt series: a retry after a network blip reuses it,
  // so the server cannot create two orders for one click.
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);
  const [form, setForm] = useState({
    name: '',
    email: '',
    line1: '',
    line2: '',
    city: '',
    region: '',
    postalCode: '',
    country: 'US',
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!cart || cart.lines.length === 0) {
    return (
      <main className="container">
        <p className="empty">
          Your cart is empty. <Link to="/">Browse the catalog</Link>
        </p>
      </main>
    );
  }

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    const input = {
      cartId: cart!.id,
      idempotencyKey,
      customer: { name: form.name, email: form.email },
      shippingAddress: {
        line1: form.line1,
        line2: form.line2,
        city: form.city,
        region: form.region,
        postalCode: form.postalCode,
        country: form.country,
      },
    };
    // Validate client-side with the same schema the server uses.
    const parsed = CheckoutSchema.safeParse(input);
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) next[issue.path[issue.path.length - 1] as string] = issue.message;
      setErrors(next);
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const order = await api.checkout(parsed.data);
      reset();
      navigate(`/orders/${order.id}`, { replace: true });
    } catch (err) {
      if (err instanceof ApiRequestError) {
        if (err.code === 'OUT_OF_STOCK') setSubmitError('An item in your cart just sold out. Please review your cart.');
        else if (err.code === 'CART_EMPTY') setSubmitError('Your cart is empty.');
        else setSubmitError(err.message);
      } else {
        setSubmitError('Network error. Your order was not duplicated; you can safely try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  const field = (
    key: keyof typeof form,
    label: string,
    props: React.InputHTMLAttributes<HTMLInputElement> = {},
  ) => (
    <div className="field">
      <label htmlFor={key}>{label}</label>
      <input
        id={key}
        name={key}
        value={form[key]}
        onChange={(e) => set(key, e.target.value)}
        aria-invalid={Boolean(errors[key])}
        aria-describedby={errors[key] ? `${key}-error` : undefined}
        {...props}
      />
      {errors[key] && (
        <span id={`${key}-error`} className="error">
          {errors[key]}
        </span>
      )}
    </div>
  );

  return (
    <main className="container">
      <form className="form" onSubmit={onSubmit} noValidate>
        <h1>Checkout</h1>
        <p className="muted">
          {cart.lines.length} item{cart.lines.length === 1 ? '' : 's'} · Subtotal{' '}
          <strong className="price">{formatCents(cart.subtotalCents)}</strong>
        </p>

        <h3>Contact</h3>
        {field('name', 'Full name', { autoComplete: 'name' })}
        {field('email', 'Email', { type: 'email', autoComplete: 'email' })}

        <h3>Shipping address</h3>
        {field('line1', 'Address line 1', { autoComplete: 'address-line1' })}
        {field('line2', 'Address line 2 (optional)', { autoComplete: 'address-line2' })}
        <div className="two">
          {field('city', 'City', { autoComplete: 'address-level2' })}
          {field('region', 'State / Region', { autoComplete: 'address-level1' })}
        </div>
        <div className="two">
          {field('postalCode', 'Postal code', { autoComplete: 'postal-code' })}
          {field('country', 'Country (2-letter)', { autoComplete: 'country', maxLength: 2 })}
        </div>

        {submitError && <p className="error">{submitError}</p>}
        <button className="btn block" type="submit" disabled={submitting}>
          {submitting ? 'Placing order…' : `Place order · ${formatCents(cart.subtotalCents)}`}
        </button>
        <p className="muted" style={{ fontSize: 13, marginTop: 12 }}>
          Demo store: no payment is taken.
        </p>
      </form>
    </main>
  );
}
