import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuth from '../context/useAuth.js';

export default function ApprovalPending() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    setLoading(true);
    try {
      await logout();
      navigate('/', { replace: true });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="login-card">
        <h1>Accesso in attesa</h1>
        <p style={{ color: 'var(--color-muted)' }}>
          Il tuo account è in attesa di approvazione da parte dell&apos;amministratore.
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem' }}>
          <button type="button" onClick={() => window.location.reload()}>
            Ricarica stato
          </button>
          <button type="button" style={{ background: '#adb5bd' }} onClick={handleLogout} disabled={loading}>
            {loading ? 'Uscita...' : 'Esci'}
          </button>
        </div>
      </div>
    </div>
  );
}
