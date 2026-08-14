import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useReservationCount } from '../context/ReservationCountContext.jsx';
import { useWishlist } from '../context/WishlistContext.jsx';
import { ConfirmDialog } from './ConfirmDialog.jsx';
import { ThemeToggle } from './ThemeToggle.jsx';

// Live sidebar badges: wishlist membership from the shared context, pending holds
// from the reservation-count context. key={count} restarts the pop animation on
// every change, and the badge only renders when the count is non-zero.
function CustomerNav() {
  const { ids } = useWishlist();
  const { pending } = useReservationCount();
  return <>
    <NavLink to="/app" end>Catalog</NavLink>
    <NavLink to="/app/wishlist">Wishlist{ids.size > 0 && <span key={ids.size} className="nav-badge">{ids.size}</span>}</NavLink>
    <NavLink to="/app/reservations">My reservations{pending > 0 && <span key={pending} className="nav-badge">{pending}</span>}</NavLink>
  </>;
}

export function AppShell({ children }) {
  const { session, logout } = useAuth();
  const navigate = useNavigate();
  const admin = session.user.role === 'admin';
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);
  const signOut = () => { setShowLogoutDialog(false); logout(); navigate('/'); };
  return <div className="app-layout">
    <aside className="sidebar">
      <Link className="brand" to={admin ? '/admin' : '/app'}>reserve<span>wise</span></Link>
      <p className="workspace-label">{admin ? 'Operations' : 'My workspace'}</p>
      <nav className="side-nav">
        {admin ? <>
          <NavLink to="/admin" end>Inventory</NavLink>
          <NavLink to="/admin/reservations">Reservations</NavLink>
          <NavLink to="/admin/users">Team</NavLink>
        </> : <CustomerNav />}
      </nav>
      <div className="account-block"><div className="avatar">{session.user.name.slice(0, 1).toUpperCase()}</div><div><strong>{session.user.name}</strong><small>{session.user.role}</small></div><button className="icon-button tooltip-above" data-tooltip="Sign out" aria-label="Sign out" onClick={() => setShowLogoutDialog(true)}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg></button></div>
    </aside>
    <ConfirmDialog open={showLogoutDialog} title="Sign out?" message="You will need to sign in again to access your workspace." confirmLabel="Sign out" onConfirm={signOut} onCancel={() => setShowLogoutDialog(false)} />
    <main className="app-main"><div className="app-topbar"><ThemeToggle /></div>{children}</main>
  </div>;
}

export function PageHeader({ eyebrow, title, detail, action }) {
  return <header className="page-header"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1>{detail && <p>{detail}</p>}</div>{action}</header>;
}
