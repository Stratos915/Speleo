import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import logo from '../assets/logo-gsu.png';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const { isAuthenticated, role, loading, login } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (isAuthenticated) {
      navigate(role === 'admin' ? '/dashboard' : '/magazzino', { replace: true });
    }
  }, [isAuthenticated, role, loading, navigate]);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const { role: authenticatedRole } = await login(email, password);
      navigate(authenticatedRole === 'admin' ? '/dashboard' : '/magazzino', { replace: true });
    } catch (authError) {
      setError(authError.message ?? 'Credenziali non valide');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="login-card">
        <img src={logo} alt="Logo Speleo" className="brand-logo" />
        <h1>Accesso Speleo</h1>
        <p style={{ marginTop: '-0.5rem', color: 'var(--color-muted)' }}>Portale operativo Gruppo Speleologico</p>
        <form
          onSubmit={handleSubmit}
          style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1.5rem' }}
        >
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          <button type="submit" disabled={submitting}>
            {submitting ? 'Accesso...' : 'Entra'}
          </button>
        </form>
        {error && <p style={{ color: 'var(--color-accent)', marginTop: '0.5rem' }}>{error}</p>}
      </div>
    </div>
  );
}
