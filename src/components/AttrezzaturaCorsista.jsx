// Riquadro «Attrezzatura» nella scheda del corsista (pagina Scuola).
// Mostra cosa ha in mano il corsista (sacchi della scuola e pezzi ACAR, cioè i
// prestiti aperti collegati a lui) e permette di consegnare un sacco o un pezzo
// ACAR, con corso e corsista già scelti, e di registrarne il rientro.
import '../pages/Magazzino.css';
import { useState } from 'react';
import { returnLoan } from '../services/loans.js';
import { nomeMaterialePrestito } from '../utils/prestitiSpeciali.js';
import PrestitoDaElenco from './PrestitoDaElenco.jsx';

function dataBreve(valore) {
  if (!valore) return '';
  const data = new Date(valore);
  if (Number.isNaN(data.getTime())) return '';
  return data.toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function AttrezzaturaCorsista({
  destinatario,
  prestiti = [],
  disponibile = true,
  corsoChiuso = false,
  puoSacchi = false,
  puoAcar = false,
  onConsegnato,
  onRientrato,
}) {
  const [apri, setApri] = useState(null);
  const [inCorso, setInCorso] = useState('');
  const [errore, setErrore] = useState('');

  const rientrato = async (prestito) => {
    const nome = nomeMaterialePrestito(prestito);
    if (!window.confirm(`«${nome}» è rientrato da ${destinatario.nome}?`)) return;
    setErrore('');
    setInCorso(prestito.id);
    try {
      await returnLoan({ loanId: prestito.id });
      await onRientrato?.(prestito);
    } catch (error) {
      setErrore(error.message ?? 'Rientro non registrato, riprova.');
    } finally {
      setInCorso('');
    }
  };

  const puoConsegnare = disponibile && !corsoChiuso && (puoSacchi || puoAcar);

  return (
    <div className="attrezzatura-corsista">
      <strong>Attrezzatura in mano</strong>
      {!disponibile ? (
        <small className="prestito-elenco-nota">
          Per collegare sacchi e materiale ACAR va eseguito l&apos;aggiornamento del database (migrazione 22).
        </small>
      ) : prestiti.length ? (
        <ul className="attrezzatura-elenco">
          {prestiti.map((prestito) => (
            <li key={prestito.id}>
              <span>
                {prestito.acar_id ? '🫧 ' : '🎓 '}
                {nomeMaterialePrestito(prestito)}
                <small> · dal {dataBreve(prestito.delivered_at)}</small>
                {prestito.reserved_until && <small> · rientro entro {dataBreve(prestito.reserved_until)}</small>}
              </span>
              {((prestito.sacco_id && puoSacchi) || (prestito.acar_id && puoAcar)) && (
                <button
                  type="button"
                  className="prestito-btn-rientro"
                  onClick={() => rientrato(prestito)}
                  disabled={Boolean(inCorso)}
                >
                  {inCorso === prestito.id ? 'Registro…' : '✓ Rientrato'}
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <small className="prestito-elenco-nota">Nessun sacco o materiale ACAR consegnato.</small>
      )}
      {errore && <p className="scuola-errore">{errore}</p>}

      {puoConsegnare && !apri && (
        <div className="scuola-azioni scuola-azioni--piccole">
          {puoSacchi && (
            <button type="button" className="prestito-btn" onClick={() => setApri('sacco')}>
              🎓 Consegna sacco
            </button>
          )}
          {puoAcar && (
            <button type="button" className="prestito-btn" onClick={() => setApri('acar')}>
              🫧 Consegna materiale ACAR
            </button>
          )}
        </div>
      )}

      {apri && (
        <PrestitoDaElenco
          tipo={apri}
          destinatario={destinatario}
          onAnnulla={() => setApri(null)}
          onFatto={async (pezzo) => {
            setApri(null);
            await onConsegnato?.(apri, pezzo);
          }}
        />
      )}
    </div>
  );
}
