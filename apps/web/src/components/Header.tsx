import { Link } from 'react-router-dom';
import { useCart } from '../lib/cart-context';

export function Header({ onOpenCart }: { onOpenCart: () => void }) {
  const { itemCount } = useCart();
  return (
    <header className="header">
      <div className="container">
        <Link to="/" className="brand">
          Assistant <span>Storefront</span>
        </Link>
        <button className="cart-button" onClick={onOpenCart} aria-label={`Open cart, ${itemCount} items`}>
          Cart
          {itemCount > 0 && <span className="badge">{itemCount}</span>}
        </button>
      </div>
    </header>
  );
}
