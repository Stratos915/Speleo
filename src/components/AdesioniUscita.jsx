import { useCallback, useEffect, useMemo, useState } from 'react';
import { RISPOSTE, adesioniNonAttive, getAdesioni, rispondiUscita } from '../services/adesioni.js';

// Riquadro «Chi partecipa?» nella scheda dell'uscita: i tre pulsanti per rispondere,
// i conteggi e i nomi (visibili a tutti i soci). Chi può modificare l'uscita trova
// anche «Copia nei partecipanti», che porta chi ha detto sì nell'elenco ufficiale.
// Se la migrazione 15 non è stata eseguita il riquadro non compare.

export default function AdesioniUscita({ uscita, userId, puoModificare, onCopiaPartecipanti }) {
  const [dati, setDati] = useState(null);
  const [attive, setAttive] = useState(true);
  const [errore, setErrore] = useState('');
  const [inviando, setInviando] = useState(false);
  const [copiando, setCopiando] = useState(false);
  const [esito, setEsito] = useState('');
  const chiusa = uscita?.status === 'chiusa';

  const carica = useCallback(async () => {
    if (!uscita?.id) return;
    try {
      setDati(await getAdesioni(uscita.id));
      setErrore('');
    } catch (loadError) {
      if (adesioniNonAttive(loadError)) setAttive(false);
      else setErrore(loadError.message ?? 'Impossibile caricare le adesioni.');
    }
  }, [uscita?.id]);

  useEffect(() => {
    carica();
  }, [carica]);

  const risposte = useMemo(() => dati?.risposte ?? [], [dati]);
  const mia = risposte.find((riga) => riga.user_id === userId)?.risposta ?? null;
  const gruppi = useMemo(
    () => Object.fromEntries(RISPOSTE.map(({ value }) => [value, risposte.filter((riga) => riga.risposta === value)])),
    [risposte],
  );

  const daCopiare = useMemo(() => {
    const gia = new Set((uscita?.participants_ids ?? []).map(String));
    const conScheda = gruppi.si?.filter((riga) => riga.member_id) ?? [];
    return {
      nuovi: conScheda.filter((riga) => !gia.has(String(riga.member_id))),
      senzaScheda: gruppi.si?.filter((riga) => !riga.member_id) ?? [],
    };
  }, [gruppi, uscita?.participants_ids]);

  async function rispondi(valore) {
    setInviando(true);
    setErrore('');
    setEsito('');
    try {
      await rispondiUscita(uscita.id, valore);
      await carica();
    } catch (sendError) {
      setErrore(sendError.message ?? 'Risposta non registrata.');
    } finally {
      setInviando(false);
    }
  }

  async function copia() {
    if (!daCopiare.nuovi.length) return;
    setCopiando(true);
    setErrore('');
    setEsito('');
    try {
      const ids = [...new Set([...(uscita.participants_ids ?? []).map(String), ...daCopiare.nuovi.map((riga) => String(riga.member_id))])];
      await onCopiaPartecipanti(ids);
      setEsito(`${daCopiare.nuovi.length} ${daCopiare.nuovi.length === 1 ? 'socio aggiunto' : 'soci aggiunti'} ai partecipanti.`);
    } catch (copyError) {
      setErrore(copyError.message ?? 'Impossibile aggiornare i partecipanti.');
    } finally {
      setCopiando(false);
    }
  }

  if (!attive || !uscita) return null;

  return (
    <article className="card">
      <h2>Chi partecipa?</h2>
      {chiusa ? (
        <p style={{ color: 'var(--color-muted)', margin: '0 0 0.75rem' }}>L&apos;uscita è chiusa: le risposte non si possono più cambiare.</p>
      ) : (
        <>
          <p style={{ margin: 0, color: 'var(--color-muted)' }}>
            {mia ? 'La tua risposta (puoi cambiarla quando vuoi):' : 'Rispondi, così il responsabile sa chi viene:'}
          </p>
          <div className="adesioni-scelta" role="group" aria-label="La tua risposta">
            {RISPOSTE.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                className={value}
                aria-pressed={mia === value}
                disabled={inviando}
                onClick={() => rispondi(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </>
      )}

      {dati && (
        <>
          <div className="adesioni-conteggi">
            <span className="chip">{gruppi.si.length} sì</span>
            <span className="chip">{gruppi.forse.length} forse</span>
            <span className="chip">{gruppi.no.length} no</span>
            <span className="chip" style={{ background: '#eef1f1', color: 'var(--color-muted)' }}>
              {dati.senza_risposta} senza risposta
            </span>
          </div>
          {RISPOSTE.map(({ value, label }) =>
            gruppi[value].length ? (
              <div key={value} className="adesioni-gruppo">
                <h3>{label}</h3>
                <ul className="adesioni-nomi">
                  {gruppi[value].map((riga) => (
                    <li key={riga.user_id}>{riga.nome || 'Socio'}</li>
                  ))}
                </ul>
              </div>
            ) : null,
          )}
          {!risposte.length && <p style={{ color: 'var(--color-muted)' }}>Ancora nessuna risposta.</p>}
        </>
      )}

      {puoModificare && !chiusa && gruppi.si?.length > 0 && (
        <div style={{ marginTop: '0.75rem', display: 'grid', gap: '0.35rem' }}>
          <button type="button" onClick={copia} disabled={copiando || !daCopiare.nuovi.length} style={{ width: 'fit-content' }}>
            {copiando
              ? 'Aggiornamento...'
              : daCopiare.nuovi.length
                ? `Copia nei partecipanti (${daCopiare.nuovi.length})`
                : 'Chi ha detto sì è già tra i partecipanti'}
          </button>
          {daCopiare.senzaScheda.length > 0 && (
            <small style={{ color: 'var(--color-muted)' }}>
              Senza scheda socio collegata, da aggiungere a mano: {daCopiare.senzaScheda.map((riga) => riga.nome).join(', ')}.
            </small>
          )}
        </div>
      )}

      {esito && <p style={{ color: 'var(--color-primary)' }}>{esito}</p>}
      {errore && <p style={{ color: 'var(--color-accent)' }}>{errore}</p>}
    </article>
  );
}
