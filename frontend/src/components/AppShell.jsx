import { useEffect, useState } from 'react';
import { LogOut } from 'lucide-react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useReservationCount } from '../context/ReservationCountContext.jsx';
import { useWishlist } from '../context/WishlistContext.jsx';
import { ConfirmDialog } from './ConfirmDialog.jsx';
import { ThemeToggle } from './ThemeToggle.jsx';
import { Button } from './ui/button.jsx';
import { cn } from '../lib/utils.js';

// Live sidebar badges: wishlist membership from the shared context, pending holds
// from the reservation-count context. key={count} restarts the pop animation on
// every change, and the badge only renders when the count is non-zero.
function CustomerNav() {
  const { ids } = useWishlist();
  const { pending } = useReservationCount();
  const [wishlistPulse, setWishlistPulse] = useState(0);
  const [reservationPulse, setReservationPulse] = useState(0);
  useEffect(() => setWishlistPulse((current) => current + 1), [ids.size]);
  useEffect(() => setReservationPulse((current) => current + 1), [pending]);
  return (
    <>
      <NavItem to="/app" end>
        Catalog
      </NavItem>
      <NavItem pulseClass={`nav-item-pulse-${wishlistPulse % 2}`} to="/app/wishlist">
        Wishlist
        {ids.size > 0 && (
          <span
            key={ids.size}
            className="nav-badge ml-auto grid min-w-5 place-items-center rounded-full bg-[#1e40ff]/10 px-1.5 py-0.5 text-[10px] text-[#1e40ff]"
          >
            {ids.size}
          </span>
        )}
      </NavItem>
      <NavItem pulseClass={`nav-item-pulse-${reservationPulse % 2}`} to="/app/reservations">
        My reservations
        {pending > 0 && (
          <span
            key={pending}
            className="nav-badge ml-auto grid min-w-5 place-items-center rounded-full bg-[#1e40ff]/10 px-1.5 py-0.5 text-[10px] text-[#1e40ff]"
          >
            {pending}
          </span>
        )}
      </NavItem>
    </>
  );
}

function NavItem({ children, pulseClass, ...props }) {
  return (
    <NavLink
      className={({ isActive }) =>
        cn(
          'flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-[#66677a] transition-colors hover:bg-white/65 hover:text-[#14152b]',
          pulseClass,
          isActive && 'bg-white text-[#14152b] shadow-sm',
        )
      }
      {...props}
    >
      {children}
    </NavLink>
  );
}

export function AppShell({ children }) {
  const { session, logout } = useAuth();
  const navigate = useNavigate();
  const admin = session.user.role === 'admin';
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);
  const signOut = () => {
    setShowLogoutDialog(false);
    logout();
    navigate('/');
  };
  return (
    <div className="app-grid app-surface grid min-h-screen bg-[#e7e9f9] text-[#14152b]">
      <aside className="flex flex-col border-b border-black/10 bg-[#e7e9f9]/90 px-5 py-5 backdrop-blur md:sticky md:top-0 md:h-screen md:border-r md:border-b-0 md:px-5 md:py-7">
        <div className="flex items-center justify-between gap-4 md:block">
          <Link className="brand-mark text-2xl font-bold tracking-[-.08em] sm:text-3xl" to={admin ? '/admin' : '/app'}>
            reserve<span className="text-[#1e40ff]">wise</span>
          </Link>
        </div>
        <p className="mt-9 hidden text-[10px] font-bold tracking-[.18em] text-[#77788b] uppercase md:block">
          {admin ? 'Operations' : 'My workspace'}
        </p>
        <nav
          className="mobile-scroll mt-4 flex gap-1 overflow-x-auto md:grid md:overflow-visible"
          aria-label="Workspace navigation"
        >
          {admin ? (
            <>
              <NavItem to="/admin" end>
                Inventory
              </NavItem>
              <NavItem to="/admin/reservations">Reservations</NavItem>
              <NavItem to="/admin/users">Team</NavItem>
            </>
          ) : (
            <CustomerNav />
          )}
        </nav>
        <div className="mt-5 flex items-center gap-3 border-t border-black/10 pt-4 md:mt-auto">
          <div className="grid size-9 place-items-center rounded-full bg-[#1e40ff] text-sm font-bold text-white">
            {session.user.name.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <strong className="block truncate text-xs">{session.user.name}</strong>
            <small className="block truncate text-[11px] text-[#77788b] capitalize">{session.user.role}</small>
          </div>
          <Button
            aria-label="Sign out"
            data-tooltip="Sign out"
            className="text-[#77788b] hover:text-[#bd3954]"
            size="icon"
            variant="ghost"
            onClick={() => setShowLogoutDialog(true)}
          >
            <LogOut size={17} strokeWidth={2} aria-hidden="true" />
          </Button>
        </div>
      </aside>
      <ConfirmDialog
        open={showLogoutDialog}
        title="Sign out?"
        message="You will need to sign in again to access your workspace."
        confirmLabel="Sign out"
        onConfirm={signOut}
        onCancel={() => setShowLogoutDialog(false)}
      />
      <main className="mx-auto w-full max-w-[1450px] px-5 py-8 sm:px-8 lg:px-12 lg:py-12">
        {/* Top-right, but in the document flow: it scrolls away with the page
            instead of floating over content. */}
        <div className="mb-6 flex justify-end">
          <ThemeToggle />
        </div>
        {children}
      </main>
    </div>
  );
}

export function PageHeader({ eyebrow, title, detail, action }) {
  return (
    <header className="mb-9 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
      <div>
        <p className="mb-3 text-[11px] font-bold tracking-[.18em] text-[#1e40ff] uppercase">{eyebrow}</p>
        <h1 className="text-4xl font-normal tracking-[-.065em] sm:text-5xl">{title}</h1>
        {detail && <p className="mt-3 max-w-xl text-sm leading-6 text-[#53536a]">{detail}</p>}
      </div>
      {action}
    </header>
  );
}
