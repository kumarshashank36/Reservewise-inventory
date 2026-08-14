import { lazy, Suspense } from 'react';
import { Link, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { WishlistProvider } from './context/WishlistContext.jsx';
import { AppShell } from './components/AppShell.jsx';
import { LoadingState } from './components/AsyncState.jsx';

// Route-level code splitting: each page is its own chunk, fetched only when
// visited. Customers never download admin code, admins never download customer
// code, and the auth flow stays out of the initial bundle.
const AuthPage = lazy(() => import('./pages/AuthPages.jsx').then((module) => ({ default: module.AuthPage })));
const CustomerCatalog = lazy(() => import('./pages/CustomerCatalogPage.jsx').then((module) => ({ default: module.CustomerCatalog })));
const CustomerWishlist = lazy(() => import('./pages/WishlistPage.jsx').then((module) => ({ default: module.CustomerWishlist })));
const CustomerReservations = lazy(() => import('./pages/CustomerReservationsPage.jsx').then((module) => ({ default: module.CustomerReservations })));
const AdminInventory = lazy(() => import('./pages/AdminInventoryPage.jsx').then((module) => ({ default: module.AdminInventory })));
const AdminReservations = lazy(() => import('./pages/AdminReservationsPage.jsx').then((module) => ({ default: module.AdminReservations })));
const AdminUsers = lazy(() => import('./pages/AdminUsersPage.jsx').then((module) => ({ default: module.AdminUsers })));

function AuthFallback() {
  return <main className="placeholder-page"><span className="spinner" />Loading sign-in…</main>;
}

function LandingPage() {
  return (
    <main className="landing-shell">
      <nav className="site-nav" aria-label="Main navigation">
        <Link className="brand" to="/">reserve<span>wise</span></Link>
        <div className="nav-actions">
          <Link className="text-link" to="/login">Sign in</Link>
          <Link className="button button-primary" to="/register">Create account</Link>
        </div>
      </nav>
      <section className="hero">
        <p className="eyebrow">Inventory, held with confidence</p>
        <h1>Every unit accounted for.</h1>
        <p className="hero-copy">Reserve scarce inventory without the guesswork. A calmer, precise workflow for customers and operations teams.</p>
        <div className="hero-actions">
          <Link className="button button-primary" to="/register">Start reserving</Link>
          <Link className="button button-secondary" to="/login">Sign in to your account</Link>
        </div>
      </section>
      <section className="assurance-grid" aria-label="Product benefits">
        <article><span>01</span><h2>Accurate stock</h2><p>Availability is calculated and protected at the moment you reserve.</p></article>
        <article><span>02</span><h2>Time-bound holds</h2><p>Pending reservations release automatically when they are no longer needed.</p></article>
        <article><span>03</span><h2>Clear control</h2><p>Customers and inventory administrators each see exactly what matters.</p></article>
      </section>
    </main>
  );
}

function Protected({ role, children }) {
  const { session, loading } = useAuth(); const location = useLocation();
  if (loading) return <main className="placeholder-page">Restoring your workspace…</main>;
  if (!session) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (role && session.user.role !== role) return <Navigate to={session.user.role === 'admin' ? '/admin' : '/app'} replace />;
  return <AppShell>{children}</AppShell>;
}

// One shared layout for the whole customer area: the WishlistProvider (and the shell)
// stay mounted across Catalog / Wishlist / My reservations navigation, so wishlist
// membership toggled on one page is immediately reflected on the others. The lazy
// pages suspend inside the shell so the sidebar stays visible while chunks load.
function CustomerLayout() {
  return <Protected role="customer"><WishlistProvider><Suspense fallback={<LoadingState label="Loading workspace" />}><Outlet /></Suspense></WishlistProvider></Protected>;
}

export default function App() {
  return (
    <AuthProvider><Routes>
      <Route path="/" element={<LandingPage />} /><Route path="/login" element={<Suspense fallback={<AuthFallback />}><AuthPage mode="login" /></Suspense>} /><Route path="/register" element={<Suspense fallback={<AuthFallback />}><AuthPage mode="register" /></Suspense>} />
      <Route path="/app" element={<CustomerLayout />}><Route index element={<CustomerCatalog />} /><Route path="wishlist" element={<CustomerWishlist />} /><Route path="reservations" element={<CustomerReservations />} /></Route>
      <Route path="/admin" element={<Protected role="admin"><Suspense fallback={<LoadingState label="Loading inventory" />}><AdminInventory /></Suspense></Protected>} /><Route path="/admin/reservations" element={<Protected role="admin"><Suspense fallback={<LoadingState label="Loading reservations" />}><AdminReservations /></Suspense></Protected>} /><Route path="/admin/users" element={<Protected role="admin"><Suspense fallback={<LoadingState label="Loading team" />}><AdminUsers /></Suspense></Protected>} />
      <Route path="*" element={<LandingPage />} />
    </Routes></AuthProvider>
  );
}
