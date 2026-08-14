import { lazy, Suspense } from 'react';
import { Link, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { SnackbarProvider } from './context/SnackbarContext.jsx';
import { WishlistProvider } from './context/WishlistContext.jsx';
import { ReservationCountProvider } from './context/ReservationCountContext.jsx';
import { AppShell } from './components/AppShell.jsx';
import { LoadingState } from './components/AsyncState.jsx';
import { ThemeToggle } from './components/ThemeToggle.jsx';
import { buttonVariants } from './components/ui/button.jsx';

// Route-level code splitting: each page is its own chunk, fetched only when
// visited. Customers never download admin code, admins never download customer
// code, and the auth flow stays out of the initial bundle.
const AuthPage = lazy(() => import('./pages/AuthPages.jsx').then((module) => ({ default: module.AuthPage })));
const CustomerCatalog = lazy(() =>
  import('./pages/CustomerCatalogPage.jsx').then((module) => ({ default: module.CustomerCatalog })),
);
const CustomerWishlist = lazy(() =>
  import('./pages/WishlistPage.jsx').then((module) => ({ default: module.CustomerWishlist })),
);
const CustomerReservations = lazy(() =>
  import('./pages/CustomerReservationsPage.jsx').then((module) => ({ default: module.CustomerReservations })),
);
const AdminInventory = lazy(() =>
  import('./pages/AdminInventoryPage.jsx').then((module) => ({ default: module.AdminInventory })),
);
const AdminReservations = lazy(() =>
  import('./pages/AdminReservationsPage.jsx').then((module) => ({ default: module.AdminReservations })),
);
const AdminUsers = lazy(() => import('./pages/AdminUsersPage.jsx').then((module) => ({ default: module.AdminUsers })));

function AuthFallback() {
  return (
    <main className="grid min-h-screen place-content-center gap-4 bg-[#e7e9f9] p-8 text-center text-[#53536a]">
      <span className="size-6 animate-spin rounded-full border-2 border-[#1e40ff]/20 border-t-[#1e40ff]" />
      Loading sign-in…
    </main>
  );
}

function LandingPage() {
  return (
    <main className="landing-surface min-h-screen overflow-hidden bg-[#e7e9f9] px-5 py-5 text-[#14152b] sm:px-10 lg:px-[8vw]">
      <nav className="mx-auto flex max-w-7xl items-center justify-between" aria-label="Main navigation">
        <Link className="brand-mark text-2xl font-bold tracking-[-.08em] sm:text-3xl" to="/">
          reserve<span className="text-[#1e40ff]">wise</span>
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link className="hidden px-3 text-sm text-[#53536a] sm:block" to="/login">
            Sign in
          </Link>
          <Link className={buttonVariants({ size: 'sm' })} to="/register">
            Create account
          </Link>
        </div>
      </nav>
      <section className="relative mx-auto grid max-w-7xl gap-12 pt-24 pb-24 lg:grid-cols-[1.15fr_.85fr] lg:items-center lg:py-36">
        <div className="relative z-10">
          <p className="mb-5 text-xs font-bold tracking-[.2em] text-[#1e40ff] uppercase">
            Inventory, held with confidence
          </p>
          <h1 className="max-w-3xl text-5xl font-normal tracking-[-.075em] sm:text-7xl">Every unit accounted for.</h1>
          <p className="mt-7 max-w-xl text-lg leading-8 text-[#53536a]">
            Reserve scarce inventory without the guesswork. A calm, precise workflow for customers and operations teams.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link className={buttonVariants({ size: 'lg' })} to="/register">
              Start reserving
            </Link>
            <Link className={buttonVariants({ variant: 'secondary', size: 'lg' })} to="/login">
              Sign in to your account
            </Link>
          </div>
        </div>
        <div className="grid aspect-square max-w-md place-items-center rounded-[3rem] border border-[#1e40ff]/15 bg-[#1e40ff] shadow-[20px_25px_70px_rgba(30,64,255,.2)]">
          <span className="text-center text-5xl font-normal tracking-[-.08em] text-[#e7e9f9] sm:text-7xl">
            reserve
            <br />
            wise
          </span>
        </div>
      </section>
      <section className="mx-auto grid max-w-7xl gap-3 md:grid-cols-3" aria-label="Product benefits">
        {[
          ['01', 'Accurate stock', 'Availability is calculated and protected at the moment you reserve.'],
          ['02', 'Time-bound holds', 'Pending reservations release automatically when they are no longer needed.'],
          ['03', 'Clear control', 'Customers and operations each see exactly what matters.'],
        ].map(([number, title, detail]) => (
          <article className="rounded-3xl border border-black/10 bg-white/55 p-6" key={number}>
            <span className="text-xs font-bold tracking-[.15em] text-[#1e40ff]">{number}</span>
            <h2 className="mt-7 text-lg font-medium tracking-[-.035em]">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-[#53536a]">{detail}</p>
          </article>
        ))}
      </section>
    </main>
  );
}

function Protected({ role, children }) {
  const { session, loading } = useAuth();
  const location = useLocation();
  if (loading)
    return (
      <main className="grid min-h-screen place-content-center bg-[#e7e9f9] p-8 text-[#53536a]">
        Restoring your workspace…
      </main>
    );
  if (!session) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (role && session.user.role !== role)
    return <Navigate to={session.user.role === 'admin' ? '/admin' : '/app'} replace />;
  return children;
}

// One shared layout for the whole customer area: the wishlist and reservation-count
// providers (and the shell) stay mounted across Catalog / Wishlist / My reservations
// navigation, so membership toggled on one page — and the sidebar badges — are
// immediately reflected everywhere. The lazy pages suspend inside the shell so the
// sidebar stays visible while chunks load.
function CustomerLayout() {
  return (
    <Protected role="customer">
      <WishlistProvider>
        <ReservationCountProvider>
          <AppShell>
            <Suspense fallback={<LoadingState label="Loading workspace" />}>
              <Outlet />
            </Suspense>
          </AppShell>
        </ReservationCountProvider>
      </WishlistProvider>
    </Protected>
  );
}

function AdminLayout() {
  return (
    <Protected role="admin">
      <AppShell>
        <Suspense fallback={<LoadingState label="Loading workspace" />}>
          <Outlet />
        </Suspense>
      </AppShell>
    </Protected>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <SnackbarProvider>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route
            path="/login"
            element={
              <Suspense fallback={<AuthFallback />}>
                <AuthPage mode="login" />
              </Suspense>
            }
          />
          <Route
            path="/register"
            element={
              <Suspense fallback={<AuthFallback />}>
                <AuthPage mode="register" />
              </Suspense>
            }
          />
          <Route path="/app" element={<CustomerLayout />}>
            <Route index element={<CustomerCatalog />} />
            <Route path="wishlist" element={<CustomerWishlist />} />
            <Route path="reservations" element={<CustomerReservations />} />
          </Route>
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<AdminInventory />} />
            <Route path="reservations" element={<AdminReservations />} />
            <Route path="users" element={<AdminUsers />} />
          </Route>
          <Route path="*" element={<LandingPage />} />
        </Routes>
      </SnackbarProvider>
    </AuthProvider>
  );
}
