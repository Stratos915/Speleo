import { useCallback, useEffect, useMemo, useState } from 'react';
import useAuth from '../context/useAuth.js';
import {
  RISPOSTE,
  deleteMiaPartecipazione,
  getAdesioniUscita,
  setMiaPartecipazione,
} from '../services/partecipazioni.js';

// Blocco "Partecipi?" nella scheda di un'uscita: il socio collegato
// indica la propria adesione e vede chi ha già risposto.

export default function AdesioneUscita({ uscitaId, closed = false }) {
  const { user } = useAuth();
  const [adesioni, setAdesioni] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [unavailable, setUnavailable] = useState(false);
  const [nota, setNota] = useState('');

  const load = useCallback(async () => {
    if (!uscitaId) return;
    setLoading(true);
    try {
      const rows = await getAdesioniUscita(uscitaId);
      setAdesioni(rows);
      setUnavailable(false);
    } catch (loadError) {
      console.warn('[Adesioni] Non disponibili:', loadError?.message ?? loadError);
      setUnavailable(true);
    } finally {
      setLoading(false);
    }
  }, [uscitaId]);

  useEffect(() => {
    load();
  }, [load]);

  const mia = useMemo(() => adesioni.find((row) => row.user_id === user?.id) ?? null, [adesioni, user?.id]);

  useEffect(() => {
    setNota(mia?.nota ?? '');
  }, [mia?.nota]);

  const gruppi = useMemo(
    () =>
      RISPOSTE.map((opzione) => ({
        ...opzione,
        persone: adesioni.filter((row) => row.risposta === opzione.value),
      })),
    [adesioni],
  );

  async function rispondi(risposta) {
    if (!user || closed) return;
    setSaving(true);
    setError('');
    try {
      if (mia?.risposta === risposta && (mia?.nota ?? '') === nota.trim()) {
        await deleteMiaPartecipazione(uscitaId, user.id);
      } else {
        await setMiaPartecipazione(uscitaId, user.id, risposta, nota);
      }
      await load();
    } catch (saveError) {
      setError(saveError.message ?? 'Impossibile salvare la risposta.');
    } finally {
      setSaving(false);
    }
  }

  if (unavailable) return null;

  return (
    <article className="card">
      <h2>Partecipi?</h2>
      {closed ? (
        <p style={{ color: 'var(--color-muted)' }}>L'uscita è chiusa: le adesioni non si possono più modificare.</p>
      ) : (
        <>
          <p style={{ marginTop: 0, color: 'var(--color-muted)' }}>
            {mia
              ? 'Puoi cambiare la tua risposta in qualsiasi momento; toccala di nuovo per ritirarla.'
              : 'Fai sapere al responsabile se ci sarai.'}
          </p>
          <div className="rsvp-actions">
            {RISPOSTE.map((opzione) => (
              <button
                key={opzione.value}
                type="button"
                className={`rsvp-btn rsvp-btn--${opzione.value}${
                  mia?.risposta === opzione.value ? ' rsvp-btn--active' : ''
                }`}
                aria-pressed={mia?.risposta === opzione.value}
                disabled={saving}
                onClick={() => rispondi(opzione.value)}
              >
                {opzione.label}
              </button>
            ))}
          </div>
          <label htmlFor="rsvp-nota" style={{ display: 'block', marginTop: '0.75rem' }}>
            Nota per il responsabile (facoltativa)
          </label>
          <input
            id="rsvp-nota"
            type="text"
            maxLength={280}
            placeholder="Es. arrivo direttamente all'ingresso, ho la macchina con 3 posti…"
            value={nota}
            onChange={(event) => setNota(event.target.value)}
            style={{ width: '100%' }}
          />
          {mia && nota.trim() !== (mia.nota ?? '') && (
            <button
              type="button"
              className="pill-button"
              style={{ marginTop: '0.5rem' }}
              disabled={saving}
              onClick={() => rispondi(mia.risposta)}
            >
              Salva nota
            </button>
          )}
        </>
      )}
      {error && <p style={{ color: 'var(--color-accent)' }}>{error}</p>}

      <div className="rsvp-groups">
        {loading ? (
          <p>Caricamento adesioni…</p>
        ) : adesioni.length ? (
          gruppi
            .filter((gruppo) => gruppo.persone.length)
            .map((gruppo) => (
              <p key={gruppo.value}>
                <strong>
                  {gruppo.label} ({gruppo.persone.length}):
                </strong>{' '}
                {gruppo.persone.map((p) => (p.nota ? `${p.nome} (${p.nota})` : p.nome)).join(', ')}
              </p>
            ))
        ) : (
          <p style={{ color: 'var(--color-muted)' }}>Nessuno ha ancora risposto.</p>
        )}
      </div>
    </article>
  );
}
