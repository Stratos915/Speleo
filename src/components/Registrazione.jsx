import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import useAuth from '../context/useAuth.js';

const VUOTO = { first_name: '', last_name: '', email: '', phone: '', password: '', conferma: '' };

function messaggioErrore(error) {
  const testo = String(error?.message ?? '');
  if (/already registered|already exists/i.test(testo)) {
    return 'Questa email è già registrata: accedi oppure usa «Password dimenticata?».';
  }
  if (/password/i.test(testo) && /least|short|weak/i.test(testo)) {
    return 'La password è troppo debole: usa almeno 8 caratteri.';
  }
  if (/rate limit|too many/i.test(testo)) {
    return 'Troppi tentativi in poco tempo. Riprova tra qualche minuto.';
  }
  return testo || 'Registrazione non riuscita. Riprova.';
}

/**
 * Modulo «Registrati»: crea l'account con email e password. Il profilo resta
 * «in attesa» finché un amministratore non lo approva (Report → Approvazioni).
 */
export default function Registrazione({ onAnnulla }) {
  const navigate = useNavigate();
  const { refreshProfileFlags } = useAuth();
  const [form, setForm] = useState(VUOTO);
  const [mostra, setMostra] = useState(false);
  const [invio, setInvio] = useState(false);
  const [errore, setErrore] = useState('');
  const [fatto, setFatto] = useState('');

  function cambia(campo, valore) {
    setForm((prev) => ({ ...prev, [campo]: valore }));
  }

  async function registra(event) {
    event.preventDefault();
    setErrore('');
    const dati = {
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      phone: form.phone.trim(),
    };
    const email = form.email.trim().toLowerCase();
    if (!dati.first_name || !dati.last_name) {
      setErrore('Scrivi nome e cognome.');
      return;
    }
    if (dati.phone.replace(/\D/g, '').length < 6) {
      setErrore('Scrivi un numero di telefono valido.');
      return;
    }
    if (form.password.length < 8) {
      setErrore('La password deve avere almeno 8 caratteri.');
      return;
    }
    if (form.password !== form.conferma) {
      setErrore('Le due password non coincidono.');
      return;
    }

    setInvio(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password: form.password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          data: { ...dati, self_signup: true },
        },
      });
      if (error) throw error;
      // Email già usata: Supabase non dà errore ma restituisce un utente senza identità.
      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        setErrore(messaggioErrore({ message: 'already registered' }));
        return;
      }
      if (data.session) {
        // Accesso immediato: si completano i dati e si va alla schermata di attesa.
        await refreshProfileFlags(data.user);
        navigate('/approval-pending', { replace: true });
        return;
      }
      // Conferma dell'email attiva: prima va aperto il link ricevuto.
      setFatto(email);
      setForm(VUOTO);
    } catch (signupError) {
      setErrore(messaggioErrore(signupError));
    } finally {
      setInvio(false);
    }
  }

  if (fatto) {
    return (
      <div style={{ display: 'grid', gap: '0.75rem', marginTop: '1.25rem', textAlign: 'left' }}>
        <h2 style={{ margin: 0 }}>Controlla la posta</h2>
        <p style={{ margin: 0 }}>
          Ti abbiamo mandato un&apos;email a <strong>{fatto}</strong>. Tocca il link per confermare l&apos;indirizzo
          (guarda anche nello spam).
        </p>
        <p style={{ margin: 0, color: 'var(--color-muted)' }}>
          Poi l&apos;amministratore approverà il tuo accesso e riceverai un&apos;altra email.
        </p>
        <button type="button" onClick={onAnnulla}>
          Torna all&apos;accesso
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={registra} style={{ display: 'grid', gap: '0.75rem', marginTop: '1.25rem', textAlign: 'left' }}>
      <h2 style={{ margin: 0 }}>Crea il tuo account</h2>
      <p style={{ margin: 0, color: 'var(--color-muted)', fontSize: '0.95rem' }}>
        Dopo la registrazione l&apos;amministratore controlla e approva l&apos;accesso.
      </p>
      <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
        <input
          placeholder="Nome"
          autoComplete="given-name"
          value={form.first_name}
          onChange={(event) => cambia('first_name', event.target.value)}
          required
        />
        <input
          placeholder="Cognome"
          autoComplete="family-name"
          value={form.last_name}
          onChange={(event) => cambia('last_name', event.target.value)}
          required
        />
      </div>
      <input
        type="email"
        placeholder="Email (serve per entrare)"
        autoComplete="email"
        value={form.email}
        onChange={(event) => cambia('email', event.target.value)}
        required
      />
      <input
        type="tel"
        placeholder="Numero di telefono"
        autoComplete="tel"
        inputMode="tel"
        value={form.phone}
        onChange={(event) => cambia('phone', event.target.value)}
        required
      />
      <input
        type={mostra ? 'text' : 'password'}
        placeholder="Password (almeno 8 caratteri)"
        autoComplete="new-password"
        value={form.password}
        onChange={(event) => cambia('password', event.target.value)}
        required
      />
      <input
        type={mostra ? 'text' : 'password'}
        placeholder="Ripeti la password"
        autoComplete="new-password"
        value={form.conferma}
        onChange={(event) => cambia('conferma', event.target.value)}
        required
      />
      <label style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', fontSize: '0.9rem' }}>
        <input type="checkbox" style={{ width: 'auto' }} checked={mostra} onChange={(event) => setMostra(event.target.checked)} />
        Mostra password
      </label>
      {errore && <p style={{ color: 'var(--color-accent)', margin: 0 }}>{errore}</p>}
      <button type="submit" disabled={invio}>
        {invio ? 'Registrazione...' : 'Crea account'}
      </button>
      <button
        type="button"
        onClick={onAnnulla}
        disabled={invio}
        style={{ background: 'transparent', color: 'var(--color-primary)', border: 'none', textDecoration: 'underline' }}
      >
        Ho già un account: entra
      </button>
    </form>
  );
}
