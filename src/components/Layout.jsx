import React from 'react';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LogOut, Home, DollarSign, User, ShoppingBag } from 'lucide-react';

export default function Layout() {
  const { currentUser, userProfile, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  async function handleLogout() {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error("Failed to log out", error);
    }
  }

  return (
    <div className="app-layout">
      <nav className="navbar glass-panel">
        <div className="nav-brand">
          <h2>Mess Manager</h2>
        </div>
        <div className="nav-links">
          <Link to="/" className={location.pathname === '/' ? 'active' : ''}>
            <Home size={18} /> Dashboard
          </Link>
          <Link to="/expenses" className={location.pathname === '/expenses' ? 'active' : ''}>
            <DollarSign size={18} /> Expenses
          </Link>
          <Link to="/roster" className={location.pathname === '/roster' ? 'active' : ''}>
            <ShoppingBag size={18} /> Roster
          </Link>
          <Link to="/profile" className={location.pathname === '/profile' ? 'active' : ''}>
            <User size={18} /> Profile
          </Link>
        </div>
        <div className="nav-user">
          <div className="user-info">
            <User size={18} />
            <span>{userProfile?.name || currentUser?.email}</span>
            <span className="badge">{userProfile?.role}</span>
          </div>
          <button onClick={handleLogout} className="btn-icon" title="Logout">
            <LogOut size={18} />
          </button>
        </div>
      </nav>

      <main className="main-content app-container fade-in">
        <Outlet />
      </main>
    </div>
  );
}
