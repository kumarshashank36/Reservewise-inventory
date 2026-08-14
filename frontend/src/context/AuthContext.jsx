import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api } from '../services/api.js';

export const AuthContext = createContext(null);
const SESSION_KEY = 'reservewise.session';
const draftKeyFor = (userId) => `reservewise.draft.${userId}`;

export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(SESSION_KEY));
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(Boolean(session?.token));
  const tokenRef = useRef(session?.token);
  useEffect(() => {
    tokenRef.current = session?.token;
  }, [session?.token]);

  const refreshSession = useCallback(async (token) => {
    try {
      const { payload } = await api.me(token);
      const next = { token, user: payload.user };
      localStorage.setItem(SESSION_KEY, JSON.stringify(next));
      setSession(next);
    } catch {
      localStorage.removeItem(SESSION_KEY);
      setSession(null);
    }
  }, []);

  useEffect(() => {
    if (!session?.token) return;
    refreshSession(session.token).finally(() => setLoading(false));
  }, []);

  // Revalidate whenever the tab regains focus so role changes, deactivations,
  // and other sessions' edits are reflected without a manual reload.
  useEffect(() => {
    const onVisible = () => {
      const token = tokenRef.current;
      if (document.visibilityState === 'visible' && token) refreshSession(token);
    };
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refreshSession]);

  const saveSession = ({ token, user }) => {
    const next = { token, user };
    localStorage.setItem(SESSION_KEY, JSON.stringify(next));
    setSession(next);
  };
  const logout = () => {
    localStorage.removeItem(SESSION_KEY);
    // The reservation draft is user intent tied to this account; drop it on sign-out.
    if (session?.user?.id) {
      try {
        localStorage.removeItem(draftKeyFor(session.user.id));
      } catch {
        /* storage unavailable */
      }
    }
    setSession(null);
  };

  return <AuthContext.Provider value={{ session, loading, saveSession, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthProvider');
  return value;
}
