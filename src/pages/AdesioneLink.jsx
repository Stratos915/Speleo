import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { RISPOSTE, rispondiConLink } from '../services/adesioni.js';

// Pagina aperta dai link «Partecipo · Forse · No» delle email: registra la risposta
// anche senza aver fatto l'accesso (il link è personale e firmato) e permette di cambiarla.

function quando(info) {
  if (!info?.data) return '';
  const giorno = new Date(`${String(info.data).slice(0, 10)}T12:00:00`).toLocaleDateString('it-IT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const ora = /^(\d{2}:\d{2})/.exec(String(info.ora ?? ''))?.[1];
  return `${giorno}${ora ? ` alle ${ora}` : ''}`;
}

const MESSAGGI = {
  si: 'Perfetto, risulti tra chi partecipa.',
  forse: 'Segnato come «forse»: quando sai, cambia la risposta.',
  no: 'Segnato: questa volta non vieni.',
};

export default function AdesioneLink() {
  const [params] = useSearchParams();
  const token = params.get('t') ?? '';
  const iniziale = params.get('r');
  const [info, setInfo] = useState(null);
  const [errore, setErrore] = useState('');
  const [inviando, setInviando] = useState(true);

  async function invia(risposta) {
    setInviando(true);
    setErrore('');
    try {
      setInfo(await rispondiConLink(token, risposta));
    } catch (sendError) {
      setErrore(sendError.message ?? 'Risposta non registrata.');
    } finally {
      setInviando(false);
    }
  }

  useEffect(() => {
    if (!token) {
      setErrore('Link incompleto.');
      setInviando(false);
      return;
    }
    invia(RISPOSTE.some((item) => item.value === iniziale) ? iniziale : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, iniziale]);

  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '1rem', background: 'var(--color-background, #f2f6f5)' }}>
      <section className="card" style={{ maxWidth: '28rem', width: '100%' }}>
        <img src="/icons/icon-192.png" alt="" width="48" height="48" style={{ borderRadius: '12px' }} />
        {info ? (
          <>
            <h1 style={{ margin: '0.5rem 0 0.25rem', fontSize: '1.4rem' }}>{info.titolo ?? 'Uscita'}</h1>
            <p style={{ margin: 0, color: 'var(--color-muted)' }}>
              {[quando(info), info.luogo].filter(Boolean).join(' · ')}
            </p>
            {info.risposta && (
              <p style={{ fontWeight: 700, margin: '1rem 0 0.25rem' }}>{MESSAGGI[info.risposta]}</p>
            )}
            {info.chiusa ? (
              <p style={{ color: 'var(--color-muted)' }}>L&apos;uscita è chiusa: non si può più rispondere.</p>
            ) : (
              <>
                <p style={{ margin: '0.75rem 0 0', color: 'var(--color-muted)' }}>
                  {info.risposta ? 'Vuoi cambiare risposta?' : 'Parteciperai?'}
                </p>
                <div className="adesioni-scelta" role="group" aria-label="La tua risposta">
                  {RISPOSTE.map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      className={value}
                      aria-pressed={info.risposta === value}
                      disabled={inviando}
                      onClick={() => invia(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </>
            )}
            <Link to={`/uscite/${info.uscita_id}`}>Apri la scheda dell&apos;uscita nell&apos;app →</Link>
          </>
        ) : inviando ? (
          <p>Registrazione della risposta…</p>
        ) : null}
        {errore && (
          <>
            <p style={{ color: 'var(--color-accent)', fontWeight: 600 }}>{errore}</p>
            <Link to="/">Apri l&apos;app</Link>
          </>
        )}
      </section>
    </main>
  );
}
