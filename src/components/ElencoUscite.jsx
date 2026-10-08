import { Link } from 'react-router-dom';
import { dayKey } from '../utils/calendario.js';

// Righe di uscita riusate dalla Dashboard e dalla pagina Calendario.
// Ogni riga porta alla scheda dell'uscita nella sezione Uscite.

function formatOra(value) {
  if (!value) return '';
  return String(value).split('+')[0].slice(0, 5);
}

function formatGiornoBreve(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
}

export function UscitaRiga({ uscita, showDate = false }) {
  const key = dayKey(uscita.data);
  const closed = uscita.status === 'chiusa';
  return (
    <li>
      <Link to={`/uscite/${uscita.id}`} className="cal-item">
        <span className="cal-item-time">
          {showDate && key ? formatGiornoBreve(key) : formatOra(uscita.ora) || '—'}
        </span>
        <span className="cal-item-body">
          <strong>{uscita.titolo || 'Uscita'}</strong>
          <span className="cal-item-meta">
            {[showDate ? formatOra(uscita.ora) : null, uscita.luogo, uscita.tipo].filter(Boolean).join(' · ')}
          </span>
        </span>
        <span className={`cal-badge${closed ? ' cal-badge--closed' : ''}`}>{closed ? 'Chiusa' : 'Apri'}</span>
      </Link>
    </li>
  );
}

/** Elenco di uscite con titolo; mostra un messaggio se vuoto. */
export function ElencoUscite({ titolo, uscite, vuoto, children }) {
  return (
    <section className="cal-agenda">
      <h3>{titolo}</h3>
      {uscite.length ? (
        <ul className="cal-list">
          {uscite.map((uscita) => (
            <UscitaRiga key={uscita.id} uscita={uscita} showDate />
          ))}
        </ul>
      ) : (
        <p className="cal-empty">{vuoto}</p>
      )}
      {children}
    </section>
  );
}
