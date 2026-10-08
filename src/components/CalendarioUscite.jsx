import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import useAuth from '../context/useAuth.js';
import usePermissions from '../hooks/usePermissions.js';
import { getPartecipazioni } from '../services/partecipazioni.js';
import {
  WEEKDAYS_IT,
  buildMonthGrid,
  groupUsciteByDay,
  riepilogoPerUscita,
  toIsoDate,
} from '../utils/calendario.js';

const RISPOSTA_LABEL = { si: 'Partecipi', forse: 'Forse', no: 'Non partecipi' };

function formatOra(value) {
  if (!value) return '';
  return String(value).split('+')[0].slice(0, 5);
}

function formatGiorno(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
}

export default function CalendarioUscite({ uscite = [], loading = false }) {
  const { user } = useAuth();
  const { canEditSection } = usePermissions();
  const canCreate = canEditSection('uscita');
  const navigate = useNavigate();

  const todayKey = toIsoDate(new Date());
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [selectedKey, setSelectedKey] = useState(todayKey);
  const [partecipazioni, setPartecipazioni] = useState([]);

  useEffect(() => {
    if (!user) return undefined;
    let ignore = false;
    getPartecipazioni()
      .then((rows) => {
        if (!ignore) setPartecipazioni(rows);
      })
      .catch((error) => {
        // Prima della migrazione 09 la tabella non esiste: il calendario funziona comunque.
        console.warn('[Calendario] Adesioni non disponibili:', error?.message ?? error);
      });
    return () => {
      ignore = true;
    };
  }, [user]);

  const grid = useMemo(() => buildMonthGrid(cursor.year, cursor.month), [cursor]);
  const byDay = useMemo(() => groupUsciteByDay(uscite), [uscite]);
  const riepilogo = useMemo(() => riepilogoPerUscita(partecipazioni, user?.id), [partecipazioni, user?.id]);
  const selectedUscite = byDay.get(selectedKey) ?? [];

  const monthLabel = new Date(cursor.year, cursor.month, 1).toLocaleDateString('it-IT', {
    month: 'long',
    year: 'numeric',
  });

  function shiftMonth(delta) {
    setCursor(({ year, month }) => {
      const next = new Date(year, month + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  }

  function goToday() {
    const now = new Date();
    setCursor({ year: now.getFullYear(), month: now.getMonth() });
    setSelectedKey(todayKey);
  }

  function selectDay(cell) {
    setSelectedKey(cell.key);
    if (!cell.inMonth) {
      setCursor({ year: cell.date.getFullYear(), month: cell.date.getMonth() });
    }
  }

  function nuovaUscita(dateKey) {
    navigate(dateKey ? `/uscite/new?data=${dateKey}` : '/uscite/new');
  }

  return (
    <article className="card cal">
      <header className="cal-header">
        <h2>Calendario uscite</h2>
        <div className="cal-nav">
          <button type="button" className="cal-nav-btn" onClick={() => shiftMonth(-1)} aria-label="Mese precedente">
            ‹
          </button>
          <span className="cal-month">{monthLabel}</span>
          <button type="button" className="cal-nav-btn" onClick={() => shiftMonth(1)} aria-label="Mese successivo">
            ›
          </button>
          <button type="button" className="pill-button" onClick={goToday}>
            Oggi
          </button>
          {canCreate && (
            <button type="button" onClick={() => nuovaUscita(selectedKey >= todayKey ? selectedKey : null)}>
              + Nuova uscita
            </button>
          )}
        </div>
      </header>

      <div className="cal-grid" role="grid" aria-label={`Uscite di ${monthLabel}`}>
        {WEEKDAYS_IT.map((label) => (
          <div key={label} className="cal-weekday" role="columnheader">
            {label}
          </div>
        ))}
        {grid.map((cell) => {
          const dayUscite = byDay.get(cell.key) ?? [];
          const classes = ['cal-day'];
          if (!cell.inMonth) classes.push('cal-day--out');
          if (cell.key === todayKey) classes.push('cal-day--today');
          if (cell.key === selectedKey) classes.push('cal-day--selected');
          if (dayUscite.length) classes.push('cal-day--busy');
          return (
            <button
              key={cell.key}
              type="button"
              className={classes.join(' ')}
              onClick={() => selectDay(cell)}
              aria-pressed={cell.key === selectedKey}
              aria-label={`${formatGiorno(cell.key)}${dayUscite.length ? `, ${dayUscite.length} uscite` : ''}`}
            >
              <span className="cal-day-num">{cell.date.getDate()}</span>
              {dayUscite.slice(0, 2).map((uscita) => {
                const mia = riepilogo[uscita.id]?.mia;
                return (
                  <span
                    key={uscita.id}
                    className={`cal-event${uscita.status === 'chiusa' ? ' cal-event--closed' : ''}${
                      mia ? ` cal-event--${mia}` : ''
                    }`}
                  >
                    <span className="cal-event-label">{uscita.titolo || 'Uscita'}</span>
                  </span>
                );
              })}
              {dayUscite.length > 2 && <span className="cal-more">+{dayUscite.length - 2}</span>}
            </button>
          );
        })}
      </div>

      <section className="cal-agenda" aria-live="polite">
        <h3>{formatGiorno(selectedKey)}</h3>
        {loading ? (
          <p className="cal-empty">Caricamento…</p>
        ) : selectedUscite.length ? (
          <ul className="cal-list">
            {selectedUscite.map((uscita) => {
              const info = riepilogo[uscita.id];
              const closed = uscita.status === 'chiusa';
              return (
                <li key={uscita.id}>
                  <Link to={`/uscite/${uscita.id}`} className="cal-item">
                    <span className="cal-item-time">{formatOra(uscita.ora) || '—'}</span>
                    <span className="cal-item-body">
                      <strong>{uscita.titolo || 'Uscita'}</strong>
                      <span className="cal-item-meta">
                        {[uscita.luogo, uscita.tipo].filter(Boolean).join(' · ')}
                        {closed ? ' · chiusa' : ''}
                      </span>
                      <span className="cal-item-meta">
                        {info?.si ? `${info.si} ${info.si === 1 ? 'partecipa' : 'partecipano'}` : 'Nessuna adesione'}
                        {info?.forse ? ` · ${info.forse} forse` : ''}
                      </span>
                    </span>
                    <span className={`cal-badge${info?.mia ? ` cal-badge--${info.mia}` : ''}`}>
                      {info?.mia ? RISPOSTA_LABEL[info.mia] : closed ? 'Apri' : 'Rispondi'}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="cal-empty">Nessuna uscita in questo giorno.</p>
        )}
        {canCreate && selectedKey >= todayKey && (
          <button type="button" className="pill-button" onClick={() => nuovaUscita(selectedKey)}>
            + Crea un'uscita in questa data
          </button>
        )}
      </section>
    </article>
  );
}
