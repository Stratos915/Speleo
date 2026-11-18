// Modulo per prestare un pezzo ACAR o consegnare un sacco della scuola (migrazioni 22 e 23).
// Il materiale va a un socio, a un corsista di un corso della scuola (il corsista è
// anche socio) o a una persona scritta a mano; si può collegare a un'uscita.
// uscitaIniziale: uscita già scelta (si apre dalla pagina dell'uscita).
// destinatario: { corsoRif, corsoNome, corsistaRif, nome } se si apre dalla scheda
// del corsista: allora «a chi va» è già deciso.
import { useEffect, useMemo, useState } from 'react';
import SelectSocio from './SelectSocio.jsx';
import { getMembers } from '../services/members.js';
import { getUscite } from '../services/uscite.js';
import { loadScuolaData } from '../services/scuola.js';
import { creaPrestitoSpeciale } from '../services/prestitiSpeciali.js';
import { dedupeMembers } from '../utils/members.js';
import {
  TIPO_USCITA_PREFERITO,
  corsiConCorsisti,
  etichettaUscita,
  tesseraPerNome,
  usciteDaProporre,
} from '../utils/prestitiSpeciali.js';

function giornoDopo(data) {
  if (!data) return '';
  const giorno = new Date(`${String(data).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(giorno.getTime())) return '';
  giorno.setDate(giorno.getDate() + 1);
  return giorno.toISOString().slice(0, 10);
}

export default function PrestitoMateriale({
  tipo,
  itemId,
  titolo,
  onFatto,
  onAnnulla,
  uscitaIniziale = '',
  destinatario = null,
}) {
  const conCorsisti = tipo === 'sacco' || tipo === 'acar';
  const [chi, setChi] = useState(destinatario ? 'corsista' : tipo === 'sacco' ? 'corsista' : 'socio');
  const [soci, setSoci] = useState([]);
  const [uscite, setUscite] = useState([]);
  const [corsi, setCorsi] = useState([]);
  const [caricamento, setCaricamento] = useState(true);
  const [memberId, setMemberId] = useState('');
  const [corsoRif, setCorsoRif] = useState('');
  const [corsistaRif, setCorsistaRif] = useState('');
  const [nomeLibero, setNomeLibero] = useState('');
  const [uscitaId, setUscitaId] = useState(uscitaIniziale ? String(uscitaIniziale) : '');
  const [rientro, setRientro] = useState('');
  const [note, setNote] = useState('');
  const [errore, setErrore] = useState('');
  const [inCorso, setInCorso] = useState(false);

  useEffect(() => {
    let annullato = false;
    async function carica() {
      // Ogni elenco è facoltativo: se uno non arriva il modulo resta usabile.
      const [membri, elencoUscite, scuola] = await Promise.all([
        getMembers().catch(() => []),
        getUscite().catch(() => []),
        conCorsisti && !destinatario ? loadScuolaData().catch(() => null) : Promise.resolve(null),
      ]);
      if (annullato) return;
      const ordinati = [...(membri ?? [])].sort(
        (a, b) => Number(b.membership_year ?? 0) - Number(a.membership_year ?? 0),
      );
      setSoci(dedupeMembers(ordinati));
      setUscite(elencoUscite ?? []);
      // Uscita già scelta: rientro previsto il giorno dopo.
      const giaScelta = uscitaIniziale
        ? (elencoUscite ?? []).find((u) => String(u.id) === String(uscitaIniziale))
        : null;
      if (giaScelta?.data) setRientro((prima) => prima || giornoDopo(giaScelta.data));
      const elencoCorsi = corsiConCorsisti(scuola?.document);
      setCorsi(elencoCorsi);
      if (elencoCorsi.length) setCorsoRif(elencoCorsi[0].rif);
      setCaricamento(false);
    }
    carica();
    return () => {
      annullato = true;
    };
  }, [conCorsisti, destinatario, uscitaIniziale]);

  const { consigliate, altre } = useMemo(
    () => usciteDaProporre(uscite, TIPO_USCITA_PREFERITO[tipo]),
    [uscite, tipo],
  );
  const corso = corsi.find((c) => c.rif === corsoRif) ?? null;
  const etichettaConsigliate = tipo === 'acar' ? 'Uscite ACAR' : 'Uscite del corso';

  const scegliUscita = (id) => {
    setUscitaId(id);
    // Rientro previsto: se non c'è, il giorno dopo l'uscita.
    const uscita = uscite.find((u) => String(u.id) === id);
    if (uscita?.data && !rientro) setRientro(giornoDopo(uscita.data));
  };

  const invia = async (event) => {
    event.preventDefault();
    setErrore('');
    let ricevente = '';
    let tessera = null;
    let corsistaScelto = '';
    // Il corso si salva per i corsisti e, per i sacchi, anche per un socio se scelto.
    const conCorso = chi === 'corsista' || (tipo === 'sacco' && chi === 'socio');
    let corsoScelto = conCorsisti && corso && conCorso ? corso : null;
    if (destinatario) {
      ricevente = destinatario.nome;
      tessera = tesseraPerNome(soci, destinatario.nome);
      corsistaScelto = destinatario.corsistaRif;
      corsoScelto = { rif: destinatario.corsoRif, nome: destinatario.corsoNome };
    } else if (chi === 'socio') {
      const socio = soci.find((s) => String(s.id) === memberId);
      if (!socio) {
        setErrore('Scegli il socio.');
        return;
      }
      ricevente = socio.full_name;
      tessera = socio.old_id ?? socio.membership_number ?? null;
    } else if (chi === 'corsista') {
      const corsista = corso?.corsisti.find((c) => c.rif === corsistaRif);
      if (!corsista) {
        setErrore('Scegli il corso e il corsista.');
        return;
      }
      ricevente = corsista.nome;
      // Il corsista è anche socio: se c'è un socio con lo stesso nome, si salva la tessera.
      tessera = tesseraPerNome(soci, corsista.nome);
      corsistaScelto = corsista.rif;
    } else {
      ricevente = nomeLibero.trim();
      if (!ricevente) {
        setErrore('Scrivi nome e cognome di chi prende il materiale.');
        return;
      }
    }
    setInCorso(true);
    try {
      await creaPrestitoSpeciale(tipo, itemId, {
        ricevente,
        tessera,
        uscitaId,
        // Il corso si ricorda anche quando il materiale va a un socio, se scelto.
        corsoRif: corsoScelto?.rif ?? '',
        corsoNome: corsoScelto?.nome ?? '',
        corsistaRif: corsistaScelto,
        rientro,
        note,
      });
      onFatto?.();
    } catch (error) {
      setErrore(error.message);
    } finally {
      setInCorso(false);
    }
  };

  return (
    <form className="scuola-modulo scuola-modulo--pezzo prestito-modulo" onSubmit={invia}>
      <strong>{titolo}</strong>
      {caricamento ? (
        <p>Caricamento elenchi…</p>
      ) : (
        <>
          {destinatario ? (
            <p className="prestito-destinatario">
              Consegna a <strong>{destinatario.nome}</strong>
              {destinatario.corsoNome ? <> · {destinatario.corsoNome}</> : null}
            </p>
          ) : (
          <>
          <div className="acar-tipologia" role="radiogroup" aria-label="A chi va">
            {conCorsisti && (
              <label className="acar-scelta">
                <input type="radio" name={`chi-${itemId}`} checked={chi === 'corsista'} onChange={() => setChi('corsista')} />
                Corsista
              </label>
            )}
            <label className="acar-scelta">
              <input type="radio" name={`chi-${itemId}`} checked={chi === 'socio'} onChange={() => setChi('socio')} />
              Socio
            </label>
            <label className="acar-scelta">
              <input type="radio" name={`chi-${itemId}`} checked={chi === 'altro'} onChange={() => setChi('altro')} />
              Altra persona
            </label>
          </div>

          {conCorsisti && (chi === 'corsista' || (tipo === 'sacco' && chi === 'socio')) && (
            <label>
              Corso
              <select
                value={corsoRif}
                onChange={(event) => {
                  setCorsoRif(event.target.value);
                  setCorsistaRif('');
                }}
              >
                {!corsi.length && <option value="">Nessun corso nella pagina Scuola</option>}
                {chi === 'socio' && <option value="">Nessun corso</option>}
                {corsi.map((c) => (
                  <option key={c.rif} value={c.rif}>
                    {c.nome}
                    {c.chiuso ? ' (chiuso)' : ''} · {c.corsisti.length} corsisti
                  </option>
                ))}
              </select>
            </label>
          )}

          {chi === 'corsista' && (
            <label>
              Corsista
              <select value={corsistaRif} onChange={(event) => setCorsistaRif(event.target.value)} required>
                <option value="">
                  {corso?.corsisti.length ? 'Scegli il corsista' : 'Nessun corsista in questo corso'}
                </option>
                {(corso?.corsisti ?? []).map((c) => (
                  <option key={c.rif} value={c.rif}>{c.nome}</option>
                ))}
              </select>
            </label>
          )}

          {chi === 'socio' && (
            <label>
              Socio
              <SelectSocio members={soci} value={memberId} onChange={setMemberId} style={{ marginTop: '0.35rem' }} />
            </label>
          )}

          {chi === 'altro' && (
            <label>
              Nome e cognome
              <input type="text" value={nomeLibero} onChange={(event) => setNomeLibero(event.target.value)} />
            </label>
          )}
          </>
          )}

          <label>
            Uscita (facoltativa)
            <select value={uscitaId} onChange={(event) => scegliUscita(event.target.value)}>
              <option value="">Nessuna uscita</option>
              {consigliate.length > 0 && (
                <optgroup label={etichettaConsigliate}>
                  {consigliate.map((u) => (
                    <option key={u.id} value={String(u.id)}>{etichettaUscita(u)}</option>
                  ))}
                </optgroup>
              )}
              {altre.length > 0 && (
                <optgroup label={consigliate.length ? 'Altre uscite ed eventi' : 'Uscite ed eventi'}>
                  {altre.map((u) => (
                    <option key={u.id} value={String(u.id)}>{etichettaUscita(u)}</option>
                  ))}
                </optgroup>
              )}
            </select>
          </label>

          <div className="scuola-campi">
            <label>
              Rientro previsto (facoltativo)
              <input type="date" value={rientro} onChange={(event) => setRientro(event.target.value)} />
            </label>
            <label>
              Note
              <input type="text" value={note} onChange={(event) => setNote(event.target.value)} />
            </label>
          </div>
        </>
      )}
      {errore && <p className="scuola-errore">{errore}</p>}
      <div className="scuola-azioni">
        <button type="submit" disabled={inCorso || caricamento}>
          {inCorso ? 'Registrazione…' : tipo === 'sacco' ? 'Consegna sacco' : 'Registra prestito'}
        </button>
        <button type="button" className="scuola-btn-neutro" onClick={onAnnulla}>Annulla</button>
      </div>
    </form>
  );
}
