import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuth from '../context/useAuth.js';
import { supabase } from '../lib/supabaseClient';

export default function AuthCallback() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [error, setError] = useState('');

  useEffect(() => {
    let ignore = false;
    async function exchange() {
      const searchParams = new URLSearchParams(window.location.search);
      const hashParams = new URLSearchParams(window.location.hash.replace('#', ''));
      const code = searchParams.get('code') ?? hashParams.get('code');
      const accessToken = hashParams.get('access_token') ?? searchParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token') ?? searchParams.get('refresh_token');
      if (accessToken && refreshToken) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (!ignore && sessionError) {
          setError(sessionError.message ?? 'Errore durante il recupero della sessione.');
        }
        return;
      }
      if (!code) {
        if (!ignore) {
          setError('Codice OAuth mancante. Riprova il login.');
        }
        return;
      }
      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
      if (!ignore && exchangeError) {
        setError(exchangeError.message ?? 'Errore durante lo scambio del codice OAuth.');
      }
    }
    exchange();
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  return (
    <div className="auth-page">
      <div className="login-card">
        <h1>Accesso in corso...</h1>
        <p style={{ color: 'var(--color-muted)' }}>Completo l&apos;autenticazione con Google.</p>
        {error && (
          <p style={{ color: 'var(--color-accent)', marginTop: '1rem' }}>
            {error}
          </p>
        )}
        {error && (
          <button
            type="button"
            onClick={() => navigate('/', { replace: true })}
            style={{ marginTop: '1rem' }}
          >
            Torna al login
          </button>
        )}
      </div>
    </div>
  );
}
