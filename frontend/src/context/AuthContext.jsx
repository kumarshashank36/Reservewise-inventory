import { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../services/api.js';

export const AuthContext = createContext(null);
const SESSION_KEY = 'reservewise.session';

export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; }
  });
  const [loading, setLoading] = useState(Boolean(session?.token));

  useEffect(() => {
    if (!session?.token) return;
    api.me(session.token).then(({ payload }) => {
      const next = { token: session.token, user: payload.user };
      localStorage.setItem(SESSION_KEY, JSON.stringify(next));
      setSession(next);
    }).catch(() => {
      localStorage.removeItem(SESSION_KEY);
      setSession(null);
    }).finally(() => setLoading(false));
  }, []);

  const saveSession = ({ token, user }) => {
    const next = { token, user };
    localStorage.setItem(SESSION_KEY, JSON.stringify(next));
    setSession(next);
  };
  const logout = () => { localStorage.removeItem(SESSION_KEY); setSession(null); };

  return <AuthContext.Provider value={{ session, loading, saveSession, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthProvider');
  return value;
}
