import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext.jsx';
import RoleBadge from './RoleBadge.jsx';

export default function Header() {
  const navigate = useNavigate();
  const { isAuthenticated, profile } = useAuth();

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate('/');
  }

  return (
    <header
      style={{
        padding: '1rem',
        background: '#0d1b2a',
        color: '#fff',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}
    >
      <nav style={{ display: 'flex', gap: '1rem' }}>
        <Link to="/dashboard">Dashboard</Link>
        <Link to="/uscite">Uscite</Link>
        {profile?.role === 'admin' && <Link to="/magazzino">Magazzino</Link>}
        <Link to="/corsi">Corsi</Link>
        <Link to="/biblioteca">Biblioteca</Link>
        {profile?.role === 'admin' && <Link to="/report">Report</Link>}
      </nav>
      {isAuthenticated && (
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <RoleBadge />
          <span>{profile?.full_name ?? 'Socio'}</span>
          <button onClick={handleLogout}>Logout</button>
        </div>
      )}
    </header>
  );
}
