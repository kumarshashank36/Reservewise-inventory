import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../services/api.js';
import { useAuth } from './AuthContext.jsx';

const WishlistContext = createContext(null);

// Tracks the ids of the current customer's wishlisted products so product cards
// can toggle membership. Optimistic updates roll back if the API rejects.
export function WishlistProvider({ children }) {
  const { session } = useAuth();
  const [ids, setIds] = useState(() => new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (session.user.role !== 'customer') { setLoading(false); return; }
    let cancelled = false;
    api.wishlist(session.token).then(({ payload }) => {
      if (cancelled) return;
      setIds(new Set(payload.items.map((item) => item.product._id)));
    }).catch(() => {
      if (!cancelled) setIds(new Set());
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [session.token]);

  const toggle = useCallback(async (productId) => {
    const current = ids;
    const next = new Set(current);
    const wasSaved = current.has(productId);
    if (wasSaved) next.delete(productId); else next.add(productId);
    setIds(next);
    try {
      if (wasSaved) await api.removeWishlistItem(session.token, productId);
      else await api.addWishlistItem(session.token, productId);
    } catch (error) {
      setIds(current);
      throw error;
    }
  }, [ids, session.token]);

  return <WishlistContext.Provider value={{ ids, loading, toggle }}>{children}</WishlistContext.Provider>;
}

export function useWishlist() {
  const value = useContext(WishlistContext);
  if (!value) throw new Error('useWishlist must be used within WishlistProvider');
  return value;
}
