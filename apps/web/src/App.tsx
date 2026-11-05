import { useState } from 'react';
import { Route, Routes } from 'react-router-dom';
import { CartDrawer } from './components/CartDrawer';
import { Header } from './components/Header';
import { CartProvider } from './lib/cart-context';
import { CatalogPage } from './pages/CatalogPage';
import { CheckoutPage } from './pages/CheckoutPage';
import { OrderPage } from './pages/OrderPage';
import { ProductPage } from './pages/ProductPage';

export function App() {
  const [cartOpen, setCartOpen] = useState(false);
  return (
    <CartProvider>
      <Header onOpenCart={() => setCartOpen(true)} />
      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />
      <Routes>
        <Route path="/" element={<CatalogPage />} />
        <Route path="/products/:slug" element={<ProductPage />} />
        <Route path="/checkout" element={<CheckoutPage />} />
        <Route path="/orders/:orderId" element={<OrderPage />} />
      </Routes>
    </CartProvider>
  );
}
