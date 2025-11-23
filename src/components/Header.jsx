import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import RoleBadge from './RoleBadge.jsx';
import logo from '../assets/logo-gsu.png';

export default function Header() {
  const navigate = useNavigate();
  const { isAuthenticated, logout, role: userRole, user } = useAuth();

  async function handleLogout() {
    await logout();
    navigate('/');
  }

  return (
    <header className="app-header">
      <div className="brand">
        <img src={logo} alt="Speleo Club Logo" />
        <div>
          <h1>Speleo App</h1>
          <small>Gestione club</small>
        </div>
      </div>
      <nav className="primary-nav">
        <Link className="nav-link" to="/dashboard">
          Dashboard
        </Link>
        <Link className="nav-link" to="/uscite">
          Uscite
        </Link>
        {userRole === 'admin' && (
          <Link className="nav-link" to="/magazzino">
            Magazzino
          </Link>
        )}
        <Link className="nav-link" to="/corsi">
          Corsi
        </Link>
        <Link className="nav-link" to="/biblioteca">
          Biblioteca
        </Link>
        {userRole === 'admin' && (
          <Link className="nav-link" to="/report">
            Report
          </Link>
        )}
      </nav>
      {isAuthenticated && (
        <div className="header-actions">
          <RoleBadge />
          <span>{user?.email ?? 'Socio'}</span>
          <button className="logout-button" onClick={handleLogout}>
            Logout
          </button>
        </div>
      )}
    </header>
  );
}
