import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../services/api.js';
import { useAuth } from './AuthContext.jsx';

// Safe default so pages can call refresh() even when the provider is absent
// (the count only feeds the sidebar badge, which is decorative).
const ReservationCountContext = createContext({ pending: 0, refresh: () => {} });

// Tracks the customer's pending-reservation count for the sidebar badge. The list
// endpoint returns pagination totals, so a 1-item page is enough to read the count.
// Pages bump it after reserve/cancel/complete; expiry, other tabs, and other
// sessions are covered by light polling and a focus resync.
export function ReservationCountProvider({ children }) {
  const { session } = useAuth();
  const [pending, setPending] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const { payload } = await api.reservations(session.token, { page: 1, limit: 1, status: 'pending' });
      setPending(payload.pagination?.total ?? 0);
    } catch { /* best-effort badge; real errors surface on the reservations page */ }
  }, [session.token]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    const timer = setInterval(refresh, 30000);
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  const value = useMemo(() => ({ pending, refresh }), [pending, refresh]);
  return <ReservationCountContext.Provider value={value}>{children}</ReservationCountContext.Provider>;
}

export function useReservationCount() {
  return useContext(ReservationCountContext);
}
