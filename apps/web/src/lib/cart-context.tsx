import type { Cart } from '@storefront/shared';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { ApiRequestError, api } from './api';

const STORAGE_KEY = 'storefront.cartId';

type CartState = {
  cart: Cart | null;
  loading: boolean;
  error: string | null;
  itemCount: number;
  add: (productId: string, quantity?: number) => Promise<void>;
  setQuantity: (productId: string, quantity: number) => Promise<void>;
  refresh: () => Promise<void>;
  /** Called after a successful checkout so the next cart starts fresh. */
  reset: () => void;
};

const CartContext = createContext<CartState | null>(null);

function readStoredId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredId(id: string | null) {
  try {
    if (id) localStorage.setItem(STORAGE_KEY, id);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable (private mode, etc.) — cart still works for the session */
  }
}

/**
 * Cart lives on the server; the browser only remembers the cart id. That keeps
 * prices authoritative and lets the same cart be driven by the MCP server.
 */
export function CartProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<Cart | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const creating = useRef<Promise<Cart> | null>(null);

  const ensureCart = useCallback(async (): Promise<Cart> => {
    if (cart) return cart;
    if (creating.current) return creating.current;
    creating.current = api.createCart().then((c) => {
      writeStoredId(c.id);
      setCart(c);
      creating.current = null;
      return c;
    });
    return creating.current;
  }, [cart]);

  const refresh = useCallback(async () => {
    const id = readStoredId();
    if (!id) {
      setLoading(false);
      return;
    }
    try {
      setCart(await api.getCart(id));
      setError(null);
    } catch (e) {
      // A stale id (e.g. after a DB reset) should not break the UI: start over.
      if (e instanceof ApiRequestError && e.status === 404) {
        writeStoredId(null);
        setCart(null);
      } else {
        setError((e as Error).message);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const add = useCallback(
    async (productId: string, quantity = 1) => {
      const current = await ensureCart();
      try {
        setCart(await api.addToCart(current.id, { productId, quantity }));
        setError(null);
      } catch (e) {
        setError((e as Error).message);
        throw e;
      }
    },
    [ensureCart],
  );

  const setQuantity = useCallback(
    async (productId: string, quantity: number) => {
      if (!cart) return;
      try {
        setCart(await api.setCartLine(cart.id, productId, quantity));
        setError(null);
      } catch (e) {
        setError((e as Error).message);
        throw e;
      }
    },
    [cart],
  );

  const reset = useCallback(() => {
    writeStoredId(null);
    setCart(null);
  }, []);

  const value = useMemo<CartState>(
    () => ({
      cart,
      loading,
      error,
      itemCount: cart?.lines.reduce((n, l) => n + l.quantity, 0) ?? 0,
      add,
      setQuantity,
      refresh,
      reset,
    }),
    [cart, loading, error, add, setQuantity, refresh, reset],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartState {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>');
  return ctx;
}
