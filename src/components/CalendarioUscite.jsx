import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import usePermissions from '../hooks/usePermissions.js';
import { ElencoUscite, UscitaRiga } from './ElencoUscite.jsx';
import { WEEKDAYS_IT, buildMonthGrid, groupUsciteByDay, prossimeEPassate, toIsoDate } from '../utils/calendario.js';

// Calendario completo delle uscite (pagina /calendario).
// Sola lettura: mostra le uscite esistenti e rimanda alle pagine della
// sezione Uscite (scheda dell'uscita e «Nuova uscita»), senza modificarle.

function formatGiorno(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
}

export default function CalendarioUscite({ uscite = [], loading = false }) {
  const { canEditSection } = usePermissions();
  const canCreate = canEditSection('uscita');

  const todayKey = toIsoDate(new Date());
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [selectedKey, setSelectedKey] = useState(todayKey);

  const grid = useMemo(() => buildMonthGrid(cursor.year, cursor.month), [cursor]);
  const byDay = useMemo(() => groupUsciteByDay(uscite), [uscite]);
  const { prossime, passate } = useMemo(() => prossimeEPassate(uscite, todayKey), [uscite, todayKey]);
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
            <Link to="/uscite/new" className="cal-new">
              + Nuova uscita
            </Link>
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
              {dayUscite.slice(0, 2).map((uscita) => (
                <span
                  key={uscita.id}
                  className={`cal-event${uscita.status === 'chiusa' || cell.key < todayKey ? ' cal-event--past' : ''}`}
                >
                  <span className="cal-event-label">{uscita.titolo || 'Uscita'}</span>
                </span>
              ))}
              {dayUscite.length > 2 && <span className="cal-more">+{dayUscite.length - 2}</span>}
            </button>
          );
        })}
      </div>

      <section className="cal-agenda" aria-live="polite">
        <h3 className="cal-day-title">{formatGiorno(selectedKey)}</h3>
        {loading ? (
          <p className="cal-empty">Caricamento…</p>
        ) : selectedUscite.length ? (
          <ul className="cal-list">
            {selectedUscite.map((uscita) => (
              <UscitaRiga key={uscita.id} uscita={uscita} />
            ))}
          </ul>
        ) : (
          <p className="cal-empty">Nessuna uscita in questo giorno.</p>
        )}
      </section>

      {!loading && (
        <div className="cal-columns">
          <ElencoUscite titolo="Prossime uscite" uscite={prossime} vuoto="Nessuna uscita in programma." />
          <ElencoUscite titolo="Uscite passate" uscite={passate} vuoto="Nessuna uscita passata.">
            <Link to="/uscite" className="cal-all">
              Tutte le uscite →
            </Link>
          </ElencoUscite>
        </div>
      )}
    </article>
  );
}
