import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import logo from '../assets/logo-gsu.png';

// Pagina raggiunta dai link email di Supabase (recovery/reset) per impostare una nuova password.
export default function ResetPassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function bootstrapRecoverySession() {
      const hash = window.location.hash.replace('#', '');
      const params = new URLSearchParams(hash);
      const type = params.get('type');
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');

      if (type !== 'recovery' || !accessToken || !refreshToken) {
        setError('Link di reset non valido o scaduto. Richiedi una nuova email di recupero.');
        setInitializing(false);
        return;
      }

      const { error: sessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (sessionError) {
        setError('Impossibile aprire la sessione di recupero. Richiedi un nuovo link.');
      } else {
        setReady(true);
      }
      setInitializing(false);
    }

    bootstrapRecoverySession();
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (password.length < 8) {
      setError('La password deve avere almeno 8 caratteri.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Le password non coincidono.');
      return;
    }

    setSubmitting(true);
    // Supabase aggiorna la password dell'utente autenticato tramite il token di recovery nella URL.
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSubmitting(false);

    if (updateError) {
      setError(updateError.message ?? 'Errore durante il salvataggio della nuova password.');
    } else {
      setSuccess('Password aggiornata correttamente. Puoi accedere con le nuove credenziali.');
      setTimeout(() => navigate('/', { replace: true }), 2000);
    }
  }

  return (
    <div className="auth-page">
      <div className="login-card" style={{ maxWidth: '460px' }}>
        <img src={logo} alt="Logo Speleo" className="brand-logo" />
        <h1>Reimposta password</h1>
        <p style={{ marginTop: '-0.5rem', color: 'var(--color-muted)' }}>
          Inserisci una nuova password per completare il recupero dell&apos;account.
        </p>

        {initializing && <p>Preparazione del link in corso...</p>}

        {!initializing && !ready && error && <p style={{ color: 'var(--color-accent)' }}>{error}</p>}

        {!initializing && ready && (
          <form
            onSubmit={handleSubmit}
            style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1.5rem' }}
          >
            <div>
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Nuova password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>
            <div>
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Conferma password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
              />
            </div>
            <label style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', fontSize: '0.9rem' }}>
              <input type="checkbox" checked={showPassword} onChange={(event) => setShowPassword(event.target.checked)} />
              Mostra password
            </label>
            <button type="submit" disabled={submitting}>
              {submitting ? 'Salvataggio...' : 'Aggiorna password'}
            </button>
            {error && <p style={{ color: 'var(--color-accent)' }}>{error}</p>}
            {success && <p style={{ color: 'var(--color-primary-dark)' }}>{success}</p>}
          </form>
        )}

        <div style={{ marginTop: '1rem' }}>
          <Link to="/" style={{ color: 'var(--color-primary)' }}>
            Torna al login
          </Link>
        </div>
      </div>
    </div>
  );
}
