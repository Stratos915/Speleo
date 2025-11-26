import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import RoleBadge from './RoleBadge.jsx';
import logo from '../assets/logo-gsu.png';

export default function Header() {
  const navigate = useNavigate();
  const { isAuthenticated, logout, user } = useAuth();

  async function handleLogout() {
    await logout();
    navigate('/');
  }

  return (
    <header className="top-bar">
      <div className="top-bar__brand">
        <img src={logo} alt="Speleo Club" />
        <div>
          <strong>Speleo App</strong>
          <small>Gestione club</small>
        </div>
      </div>
      {isAuthenticated && (
        <div className="top-bar__user">
          <RoleBadge />
          <span>{user?.email}</span>
          <button className="logout-button" onClick={handleLogout}>
            Esci
          </button>
        </div>
      )}
    </header>
  );
}
