// Prestito di un pezzo ACAR o consegna di un sacco scegliendolo da un elenco
// (migrazioni 22 e 23). Si usa nella pagina «Materiale necessario» di un'uscita
// e nella scheda del corsista: compaiono solo i pezzi disponibili, cioè non già
// in prestito e, per l'ACAR, con la revisione non scaduta.
import '../pages/Magazzino.css';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getMaterialeAcar } from '../services/acar.js';
import { getSacchi } from '../services/sacchiScuola.js';
import { getPrestitiAperti } from '../services/prestitiSpeciali.js';
import { etichettaPezzo, pezziDisponibili } from '../utils/prestitiSpeciali.js';
import PrestitoMateriale from './PrestitoMateriale.jsx';

const TESTI = {
  acar: {
    scegli: 'Scegli il pezzo ACAR',
    nessuno: 'Nessun pezzo ACAR disponibile in questo momento.',
    titolo: 'Presta',
  },
  sacco: {
    scegli: 'Scegli il sacco',
    nessuno: 'Nessun sacco disponibile: sono tutti consegnati.',
    titolo: 'Consegna',
  },
};

export default function PrestitoDaElenco({
  tipo,
  uscitaIniziale = '',
  destinatario = null,
  onFatto,
  onAnnulla,
  aggiorna = 0,
}) {
  const testi = TESTI[tipo];
  const [pezzi, setPezzi] = useState([]);
  const [prestiti, setPrestiti] = useState(() => new Map());
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState('');
  const [sceltoId, setSceltoId] = useState('');

  const carica = useCallback(async () => {
    setCaricamento(true);
    setErrore('');
    try {
      const [elenco, aperti] = await Promise.all([
        tipo === 'acar' ? getMaterialeAcar() : getSacchi(),
        getPrestitiAperti(tipo),
      ]);
      setPezzi(elenco ?? []);
      setPrestiti(aperti ?? new Map());
    } catch (error) {
      setErrore(error.message ?? 'Non riesco a leggere il materiale.');
      setPezzi([]);
    } finally {
      setCaricamento(false);
    }
  }, [tipo]);

  useEffect(() => {
    setSceltoId('');
    carica();
  }, [carica, aggiorna]);

  const { disponibili, inPrestito, scaduti } = useMemo(
    () => pezziDisponibili(tipo, pezzi, prestiti),
    [tipo, pezzi, prestiti],
  );
  const scelto = disponibili.find((p) => String(p.id) === sceltoId) ?? null;

  if (caricamento) return <p className="prestito-elenco-nota">Caricamento materiale…</p>;
  if (errore) return <p className="scuola-errore">{errore}</p>;

  return (
    <div className="prestito-elenco">
      {disponibili.length ? (
        <label>
          {testi.scegli}
          <select value={sceltoId} onChange={(event) => setSceltoId(event.target.value)}>
            <option value="">— {disponibili.length} disponibili —</option>
            {disponibili.map((pezzo) => (
              <option key={pezzo.id} value={String(pezzo.id)}>
                {etichettaPezzo(tipo, pezzo)}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="prestito-elenco-nota">{testi.nessuno}</p>
      )}
      {(inPrestito.length > 0 || scaduti.length > 0) && (
        <small className="prestito-elenco-nota">
          {inPrestito.length > 0 && `${inPrestito.length} già ${tipo === 'sacco' ? 'consegnati' : 'in prestito'}`}
          {inPrestito.length > 0 && scaduti.length > 0 && ' · '}
          {scaduti.length > 0 && `${scaduti.length} con la revisione scaduta (non si prestano)`}
        </small>
      )}

      {scelto && (
        <PrestitoMateriale
          key={scelto.id}
          tipo={tipo}
          itemId={scelto.id}
          titolo={`${testi.titolo}: ${etichettaPezzo(tipo, scelto)}`}
          uscitaIniziale={uscitaIniziale}
          destinatario={destinatario}
          onAnnulla={() => setSceltoId('')}
          onFatto={async () => {
            setSceltoId('');
            await carica();
            onFatto?.(scelto);
          }}
        />
      )}
      {!scelto && onAnnulla && (
        <div className="scuola-azioni scuola-azioni--piccole">
          <button type="button" className="scuola-btn-neutro" onClick={onAnnulla}>
            Chiudi
          </button>
        </div>
      )}
    </div>
  );
}
