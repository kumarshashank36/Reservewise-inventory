import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
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
    if (session.user.role !== 'customer') {
      setLoading(false);
      return;
    }
    let cancelled = false;
    const load = () =>
      api
        .wishlist(session.token)
        .then(({ payload }) => {
          if (cancelled) return;
          setIds(new Set(payload.items.map((item) => item.product._id)));
        })
        .catch(() => {
          if (!cancelled) setIds(new Set());
        });
    load().finally(() => {
      if (!cancelled) setLoading(false);
    });
    // Refetch the membership set when the tab regains focus so hearts changed in
    // another tab (or another device) are reflected without a reload.
    const onVisible = () => {
      if (document.visibilityState === 'visible') load();
    };
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [session.token, session.user.role]);

  const toggle = useCallback(
    async (productId) => {
      const current = ids;
      const next = new Set(current);
      const wasSaved = current.has(productId);
      if (wasSaved) next.delete(productId);
      else next.add(productId);
      setIds(next);
      try {
        if (wasSaved) await api.removeWishlistItem(session.token, productId);
        else await api.addWishlistItem(session.token, productId);
      } catch (error) {
        setIds(current);
        throw error;
      }
    },
    [ids, session.token],
  );

  const value = useMemo(() => ({ ids, loading, toggle }), [ids, loading, toggle]);
  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}

export function useWishlist() {
  const value = useContext(WishlistContext);
  if (!value) throw new Error('useWishlist must be used within WishlistProvider');
  return value;
}
