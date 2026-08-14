import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ThemeToggle } from '../components/ThemeToggle.jsx';
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
  const selectRole = (next) => { setRole(next); setError(null); };
  const submit = async (event) => {
    event.preventDefault(); setError(null); setSubmitting(true);
    try {
      const { payload } = register ? await api.register(values) : await api.login({ email: values.email, password: values.password, role });
      saveSession(payload);
      navigate(location.state?.from ?? (payload.user.role === 'admin' ? '/admin' : '/app'), { replace: true });
    } catch (requestError) { setError(requestError.message); } finally { setSubmitting(false); }
  };
  return <main className="auth-page"><div className="auth-theme"><ThemeToggle /></div><Link className="brand" to="/">reserve<span>wise</span></Link><section className="auth-panel">
    <p className="eyebrow">{register ? 'Set up your workspace' : 'Secure workspace access'}</p>
    <h1>{register ? 'Reserve with certainty.' : 'Welcome back.'}</h1>
    <p>{register ? 'Create a customer account to start reserving available inventory.' : 'Sign in to continue where you left off.'}</p>
    {!register && <div className="role-toggle" role="radiogroup" aria-label="Sign in as">
      <button type="button" role="radio" aria-checked={role === 'customer'} className={`role-option${role === 'customer' ? ' selected' : ''}`} onClick={() => selectRole('customer')}>Customer</button>
      <button type="button" role="radio" aria-checked={role === 'admin'} className={`role-option${role === 'admin' ? ' selected' : ''}`} onClick={() => selectRole('admin')}>Admin</button>
    </div>}
    <form onSubmit={submit} className="form-stack">
      {register && <label>Full name<input required minLength="2" value={values.name} onChange={(e) => setValues({ ...values, name: e.target.value })} autoComplete="name" /></label>}
      <label>Email address<input required type="email" value={values.email} onChange={(e) => setValues({ ...values, email: e.target.value })} autoComplete="email" /></label>
      <label>Password<input required type="password" minLength="10" value={values.password} onChange={(e) => setValues({ ...values, password: e.target.value })} autoComplete={register ? 'new-password' : 'current-password'} /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="button button-primary form-submit" disabled={submitting}>{submitting ? 'Working…' : register ? 'Create account' : 'Sign in'}</button>
    </form>
    <p className="switch-auth">{register ? 'Already have an account?' : 'Need an account?'} <Link to={register ? '/login' : '/register'}>{register ? 'Sign in' : 'Create one'}</Link></p>
  </section></main>;
}
