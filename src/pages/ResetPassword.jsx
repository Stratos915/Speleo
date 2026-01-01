import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import useAuth from '../context/useAuth.js';
import logo from '../assets/logo-gsu.png';

const RECOVERY_TYPES = new Set(['recovery', 'invite', 'signup']);

function extractRecoveryTokens() {
  const hashParams = new URLSearchParams(window.location.hash.replace('#', ''));
  const hashType = hashParams.get('type');
  if (RECOVERY_TYPES.has(hashType) && hashParams.get('access_token') && hashParams.get('refresh_token')) {
    return {
      access_token: hashParams.get('access_token'),
      refresh_token: hashParams.get('refresh_token'),
    };
  }
  const searchParams = new URLSearchParams(window.location.search);
  const searchType = searchParams.get('type');
  if (
    RECOVERY_TYPES.has(searchType) &&
    searchParams.get('access_token') &&
    searchParams.get('refresh_token')
  ) {
    return {
      access_token: searchParams.get('access_token'),
      refresh_token: searchParams.get('refresh_token'),
    };
  }
  return null;
}

// Pagina raggiunta dai link email di Supabase (recovery/reset) per impostare una nuova password.
export default function ResetPassword() {
  const navigate = useNavigate();
  const { isAuthenticated, needsPasswordReset, user } = useAuth();
  const [ready, setReady] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [forcedFlow, setForcedFlow] = useState(false);

  useEffect(() => {
    let active = true;
    async function bootstrapRecoverySession() {
      try {
        const tokens = extractRecoveryTokens();
        if (tokens) {
          const { error: sessionError } = await supabase.auth.setSession(tokens);
          if (sessionError) {
            setError('Impossibile aprire la sessione di recupero. Richiedi un nuovo link.');
          } else {
            setReady(true);
            setForcedFlow(false);
          }
        } else if (isAuthenticated && needsPasswordReset) {
          setReady(true);
          setForcedFlow(true);
        } else if (!isAuthenticated) {
          setError('Link di reset non valido o scaduto. Richiedi una nuova email di recupero.');
        } else {
          setError('La password è già stata impostata. Torna alla dashboard.');
          setTimeout(() => navigate('/'), 2000);
        }
      } catch (bootstrapError) {
        console.error('[ResetPassword] bootstrap error:', bootstrapError);
        setError('Errore inatteso. Richiedi un nuovo link di recupero.');
      } finally {
        if (active) {
          setInitializing(false);
        }
      }
    }
    bootstrapRecoverySession();
    return () => {
      active = false;
    };
  }, [isAuthenticated, needsPasswordReset]);

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
      if (user) {
        await supabase.from('profiles').update({ password_initialized: true }).eq('id', user.id);
      }
      setSuccess(
        forcedFlow
          ? 'Password impostata correttamente. Torna alla schermata di accesso per continuare.'
          : 'Password aggiornata correttamente. Puoi accedere con le nuove credenziali.',
      );
      await supabase.auth.setSession({ access_token: null, refresh_token: null });
      await supabase.auth.signOut();
      setTimeout(() => {
        navigate('/', { replace: true });
      }, 1500);
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
            {forcedFlow && (
              <p style={{ color: 'var(--color-muted)' }}>
                Per completare la registrazione imposta una password personale che userai per i prossimi accessi.
              </p>
            )}
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
