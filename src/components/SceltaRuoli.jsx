import { RUOLI_AGGIUNTIVI, etichettaRuolo } from '../utils/permissions.js';

/**
 * Ruolo principale (menu a tendina) più eventuali ruoli in più (caselle),
 * per esempio Segretario + Socio. Se `extra` è undefined il database non ha
 * ancora la migrazione 14 e le caselle non compaiono.
 */
export default function SceltaRuoli({ ruoli, role, extra, onChange, disabled, label = 'Ruolo app' }) {
  const principale = role ?? 'socio';
  const aggiuntivi = Array.isArray(extra) ? extra : null;
  const opzioniExtra = RUOLI_AGGIUNTIVI.filter((ruolo) => ruolo !== principale);

  function cambiaPrincipale(nuovo) {
    onChange({ role: nuovo, extra: aggiuntivi ? aggiuntivi.filter((ruolo) => ruolo !== nuovo) : undefined });
  }

  function cambiaExtra(ruolo, attivo) {
    const prossimi = attivo
      ? [...(aggiuntivi ?? []), ruolo]
      : (aggiuntivi ?? []).filter((voce) => voce !== ruolo);
    onChange({ role: principale, extra: RUOLI_AGGIUNTIVI.filter((voce) => prossimi.includes(voce)) });
  }

  return (
    <div style={{ display: 'grid', gap: '0.4rem' }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
        {label}
        <select value={principale} onChange={(event) => cambiaPrincipale(event.target.value)} disabled={disabled}>
          {ruoli.map((ruolo) => (
            <option key={ruolo} value={ruolo}>
              {etichettaRuolo(ruolo)}
            </option>
          ))}
        </select>
      </label>
      {aggiuntivi && !['admin', 'presidente'].includes(principale) && (
        <fieldset style={{ border: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.3rem' }}>
          <legend style={{ fontSize: '0.9rem', color: 'var(--color-muted)', padding: 0 }}>È anche:</legend>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem 0.9rem' }}>
            {opzioniExtra.map((ruolo) => (
              <label key={ruolo} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.95rem' }}>
                <input
                  type="checkbox"
                  style={{ width: 'auto' }}
                  checked={aggiuntivi.includes(ruolo)}
                  onChange={(event) => cambiaExtra(ruolo, event.target.checked)}
                  disabled={disabled}
                />
                {etichettaRuolo(ruolo)}
              </label>
            ))}
          </div>
        </fieldset>
      )}
    </div>
  );
}
