import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuth from '../context/useAuth.js';
import logo from '../assets/logo-gsu.png';
import { supabase } from '../lib/supabaseClient';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
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

  async function handleGoogleLogin() {
    setError('');
    setGoogleLoading(true);
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    });
    if (oauthError) {
      setError(oauthError.message ?? 'Accesso con Google non riuscito.');
      setGoogleLoading(false);
    }
    // In caso di successo l'utente viene reindirizzato e lo stato verrà ripristinato automaticamente.
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
            type={showPassword ? 'text' : 'password'}
            placeholder="Password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          <label style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', fontSize: '0.9rem' }}>
            <input
              type="checkbox"
              checked={showPassword}
              onChange={(event) => setShowPassword(event.target.checked)}
            />
            Mostra password
          </label>
          <button type="submit" disabled={submitting}>
            {submitting ? 'Accesso...' : 'Entra'}
          </button>
        </form>
        <div style={{ margin: '1.5rem 0', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ flex: 1, height: 1, background: 'rgba(0,0,0,0.1)' }} />
          <span style={{ color: 'var(--color-muted)', fontSize: '0.85rem' }}>oppure</span>
          <span style={{ flex: 1, height: 1, background: 'rgba(0,0,0,0.1)' }} />
        </div>
        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={submitting || googleLoading}
          style={{
            background: '#fff',
            color: '#000',
            border: '1px solid #ced4da',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
          }}
        >
          <span role="img" aria-label="Google" style={{ fontSize: '1.25rem' }}>
            🌐
          </span>
          {googleLoading ? 'Apertura Google...' : 'Accedi con Google'}
        </button>
        {error && <p style={{ color: 'var(--color-accent)', marginTop: '0.5rem' }}>{error}</p>}
      </div>
    </div>
  );
}
