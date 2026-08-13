import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export function AppShell({ children }) {
  const { session, logout } = useAuth();
  const navigate = useNavigate();
  const admin = session.user.role === 'admin';
  const signOut = () => { logout(); navigate('/'); };
  return <div className="app-layout">
    <aside className="sidebar">
      <Link className="brand" to={admin ? '/admin' : '/app'}>reserve<span>wise</span></Link>
      <p className="workspace-label">{admin ? 'Operations' : 'My workspace'}</p>
      <nav className="side-nav">
        {admin ? <>
          <NavLink to="/admin" end>Inventory</NavLink>
          <NavLink to="/admin/reservations">Reservations</NavLink>
          <NavLink to="/admin/users">Team</NavLink>
        </> : <>
          <NavLink to="/app" end>Catalog</NavLink>
          <NavLink to="/app/reservations">My reservations</NavLink>
        </>}
      </nav>
      <div className="account-block"><div className="avatar">{session.user.name.slice(0, 1).toUpperCase()}</div><div><strong>{session.user.name}</strong><small>{session.user.role}</small></div><button className="icon-button" aria-label="Sign out" onClick={signOut}>↗</button></div>
    </aside>
    <main className="app-main">{children}</main>
  </div>;
}

export function PageHeader({ eyebrow, title, detail, action }) {
  return <header className="page-header"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1>{detail && <p>{detail}</p>}</div>{action}</header>;
}
