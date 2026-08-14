import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ThemeToggle } from '../components/ThemeToggle.jsx';
import { Button } from '../components/ui/button.jsx';
import { Card, CardContent } from '../components/ui/card.jsx';
import { Input } from '../components/ui/input.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../services/api.js';

export function AuthPage({ mode }) {
  const { session, saveSession } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [values, setValues] = useState({ name: '', email: '', password: '' });
  const [role, setRole] = useState('customer');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  if (session) return <Navigate to={session.user.role === 'admin' ? '/admin' : '/app'} replace />;
  const register = mode === 'register';
  const selectRole = (next) => {
    setRole(next);
    setError(null);
  };
  const submit = async (event) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { payload } = register
        ? await api.register(values)
        : await api.login({ email: values.email, password: values.password, role });
      saveSession(payload);
      navigate(location.state?.from ?? (payload.user.role === 'admin' ? '/admin' : '/app'), { replace: true });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <main className="auth-surface min-h-screen bg-[#e7e9f9] px-5 py-5 text-[#14152b] sm:px-10">
      <div className="mx-auto flex max-w-7xl items-center justify-between">
        <Link className="brand-mark text-2xl font-bold tracking-[-.08em] sm:text-3xl" to="/">
          reserve<span className="text-[#1e40ff]">wise</span>
        </Link>
        <ThemeToggle />
      </div>
      <Card className="mx-auto mt-16 w-full max-w-md bg-white/70 sm:mt-24">
        <CardContent className="p-7 sm:p-9">
          <p className="mb-4 text-[11px] font-bold tracking-[.18em] text-[#1e40ff] uppercase">
            {register ? 'Set up your workspace' : 'Secure workspace access'}
          </p>
          <h1 className="text-4xl font-normal tracking-[-.065em]">
            {register ? 'Reserve with certainty.' : 'Welcome back.'}
          </h1>
          <p className="mt-4 text-sm leading-6 text-[#53536a]">
            {register
              ? 'Create a customer account to start reserving available inventory.'
              : 'Sign in to continue where you left off.'}
          </p>
          {!register && (
            <div
              className="mt-7 grid grid-cols-2 rounded-full bg-black/5 p-1"
              role="radiogroup"
              aria-label="Sign in as"
            >
              <Button
                type="button"
                role="radio"
                aria-checked={role === 'customer'}
                variant={role === 'customer' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => selectRole('customer')}
              >
                Customer
              </Button>
              <Button
                type="button"
                role="radio"
                aria-checked={role === 'admin'}
                variant={role === 'admin' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => selectRole('admin')}
              >
                Admin
              </Button>
            </div>
          )}
          <form onSubmit={submit} className="mt-6 grid gap-4">
            {register && (
              <label className="grid gap-2 text-xs font-medium">
                Full name
                <Input
                  required
                  minLength="2"
                  value={values.name}
                  onChange={(e) => setValues({ ...values, name: e.target.value })}
                  autoComplete="name"
                />
              </label>
            )}
            <label className="grid gap-2 text-xs font-medium">
              Email address
              <Input
                required
                type="email"
                value={values.email}
                onChange={(e) => setValues({ ...values, email: e.target.value })}
                autoComplete="email"
              />
            </label>
            <label className="grid gap-2 text-xs font-medium">
              Password
              <Input
                required
                type="password"
                minLength="10"
                value={values.password}
                onChange={(e) => setValues({ ...values, password: e.target.value })}
                autoComplete={register ? 'new-password' : 'current-password'}
              />
            </label>
            {error && (
              <p className="text-sm text-[#a72f49]" role="alert">
                {error}
              </p>
            )}
            <Button className="mt-1 w-full" type="submit" disabled={submitting}>
              {submitting ? 'Working…' : register ? 'Create account' : 'Sign in'}
            </Button>
          </form>
          <p className="mt-6 text-center text-sm text-[#53536a]">
            {register ? 'Already have an account?' : 'Need an account?'}{' '}
            <Link className="font-medium text-[#1e40ff]" to={register ? '/login' : '/register'}>
              {register ? 'Sign in' : 'Create one'}
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
