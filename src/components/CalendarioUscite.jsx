import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import usePermissions from '../hooks/usePermissions.js';
import { WEEKDAYS_IT, buildMonthGrid, dayKey, groupUsciteByDay, toIsoDate } from '../utils/calendario.js';

// Calendario delle uscite per la Dashboard.
// Sola lettura: mostra le uscite esistenti e rimanda alle pagine della
// sezione Uscite (scheda dell'uscita e «Nuova uscita»), senza modificarle.

const ELENCO_MAX = 4;

function formatOra(value) {
  if (!value) return '';
  return String(value).split('+')[0].slice(0, 5);
}

function formatGiorno(key, options = { weekday: 'long', day: 'numeric', month: 'long' }) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('it-IT', options);
}

function UscitaRiga({ uscita, showDate = false }) {
  const key = dayKey(uscita.data);
  const closed = uscita.status === 'chiusa';
  return (
    <li>
      <Link to={`/uscite/${uscita.id}`} className="cal-item">
        <span className="cal-item-time">
          {showDate && key ? formatGiorno(key, { day: 'numeric', month: 'short' }) : formatOra(uscita.ora) || '—'}
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
  const selectedUscite = byDay.get(selectedKey) ?? [];

  // Prossime (da oggi in avanti) e passate (le più recenti per prime).
  const { prossime, passate } = useMemo(() => {
    const ordinate = [...uscite]
      .filter((u) => dayKey(u.data))
      .sort((a, b) =>
        `${dayKey(a.data)} ${a.ora ?? ''}`.localeCompare(`${dayKey(b.data)} ${b.ora ?? ''}`),
      );
    return {
      prossime: ordinate.filter((u) => dayKey(u.data) >= todayKey).slice(0, ELENCO_MAX),
      passate: ordinate
        .filter((u) => dayKey(u.data) < todayKey)
        .reverse()
        .slice(0, ELENCO_MAX),
    };
  }, [uscite, todayKey]);

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
          <section className="cal-agenda">
            <h3>Prossime uscite</h3>
            {prossime.length ? (
              <ul className="cal-list">
                {prossime.map((uscita) => (
                  <UscitaRiga key={uscita.id} uscita={uscita} showDate />
                ))}
              </ul>
            ) : (
              <p className="cal-empty">Nessuna uscita in programma.</p>
            )}
          </section>
          <section className="cal-agenda">
            <h3>Uscite passate</h3>
            {passate.length ? (
              <ul className="cal-list">
                {passate.map((uscita) => (
                  <UscitaRiga key={uscita.id} uscita={uscita} showDate />
                ))}
              </ul>
            ) : (
              <p className="cal-empty">Nessuna uscita passata.</p>
            )}
            <Link to="/uscite" className="cal-all">
              Tutte le uscite →
            </Link>
          </section>
        </div>
      )}
    </article>
  );
}
