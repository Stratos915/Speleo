// Area del magazzino per il materiale ACAR: bombole, erogatori, maschere.
// Per ogni pezzo: matricola, scadenza della revisione e, per le bombole,
// tipologia (composito / acciaio), capacità, pressione e percentuale di ossigeno.
// Come il materiale scuola la vedono tutti tranne i soci semplici; la modificano
// admin, presidente e magazziniere (migrazioni 20 e 21).
import { useCallback, useEffect, useMemo, useState } from 'react';
import usePermissions from '../hooks/usePermissions.js';
import { canEditAcar, canViewAcar } from '../utils/permissions.js';
import { tornaAllaScheda } from '../utils/scorrimento.js';
import {
  REVISIONE_WARNING_DAYS,
  TIPI_ACAR,
  TIPOLOGIE_BOMBOLA,
  avvisoRevisione,
  corrispondeAcar,
  datiTecnici,
  raggruppaAcar,
  riepilogoAcar,
  tipoAcar,
} from '../utils/acar.js';
import {
  MigrazioneAcarMancante,
  aggiornaAcar,
  aggiungiAcar,
  eliminaAcar,
  getMaterialeAcar,
} from '../services/acar.js';

const CHIAVE_APERTA = 'speleo-magazzino-acar-aperto';
const VUOTO = {
  tipo: 'bombola',
  descrizione: '',
  matricola: '',
  tipologia: '',
  capacita_litri: '',
  pressione_bar: '',
  percentuale_ossigeno: '',
  scadenza_revisione: '',
  scheda_url: '',
  note: '',
};

function leggiAperta() {
  try {
    return window.localStorage.getItem(CHIAVE_APERTA) === '1';
  } catch {
    return false;
  }
}

function salvaAperta(valore) {
  try {
    window.localStorage.setItem(CHIAVE_APERTA, valore ? '1' : '0');
  } catch {
    // Solo una comodità: se il browser non salva, si riparte chiusa.
  }
}

function dataIt(valore) {
  if (!valore) return '';
  const data = new Date(`${String(valore).slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(data.getTime())) return String(valore);
  return data.toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });
}

function valoriDa(pezzo) {
  const testo = (v) => (v === null || v === undefined ? '' : String(v));
  return {
    tipo: pezzo.tipo ?? 'altro',
    descrizione: testo(pezzo.descrizione),
    matricola: testo(pezzo.matricola),
    tipologia: testo(pezzo.tipologia),
    capacita_litri: testo(pezzo.capacita_litri),
    pressione_bar: testo(pezzo.pressione_bar),
    percentuale_ossigeno: testo(pezzo.percentuale_ossigeno),
    scadenza_revisione: testo(pezzo.scadenza_revisione).slice(0, 10),
    scheda_url: testo(pezzo.scheda_url),
    note: testo(pezzo.note),
  };
}

export default function MagazzinoAcar() {
  const { roles } = usePermissions();
  const puoVedere = canViewAcar(roles);
  const puoModificare = canEditAcar(roles);

  const [aperta, setAperta] = useState(leggiAperta);
  const [materiale, setMateriale] = useState([]);
  const [caricato, setCaricato] = useState(false);
  const [mancaMigrazione, setMancaMigrazione] = useState(false);
  const [errore, setErrore] = useState('');
  const [inCorso, setInCorso] = useState(false);
  const [cerca, setCerca] = useState('');
  const [soloDaRevisionare, setSoloDaRevisionare] = useState(false);
  // Modulo aperto: { id|null }
  const [modulo, setModulo] = useState(null);
  const [valori, setValori] = useState(VUOTO);

  const carica = useCallback(async () => {
    try {
      setMateriale(await getMaterialeAcar());
      setMancaMigrazione(false);
      setErrore('');
    } catch (error) {
      if (error instanceof MigrazioneAcarMancante) setMancaMigrazione(true);
      else setErrore(error.message);
    } finally {
      setCaricato(true);
    }
  }, []);

  useEffect(() => {
    if (puoVedere && aperta && !caricato) carica();
  }, [puoVedere, aperta, caricato, carica]);

  const daRevisionare = useMemo(() => materiale.filter((p) => avvisoRevisione(p)).length, [materiale]);

  const gruppi = useMemo(() => {
    const filtrati = materiale.filter(
      (pezzo) => corrispondeAcar(pezzo, cerca) && (!soloDaRevisionare || avvisoRevisione(pezzo)),
    );
    return raggruppaAcar(filtrati);
  }, [materiale, cerca, soloDaRevisionare]);

  if (!puoVedere) return null;

  const cambiaAperta = () => {
    setAperta((prima) => {
      salvaAperta(!prima);
      return !prima;
    });
  };

  const chiudiModulo = () => {
    setModulo(null);
    setErrore('');
  };

  const esegui = async (azione, dopo) => {
    setInCorso(true);
    setErrore('');
    try {
      const esito = await azione();
      await carica();
      const destinazione = typeof dopo === 'function' ? dopo(esito) : dopo;
      if (destinazione) tornaAllaScheda(destinazione);
      return true;
    } catch (error) {
      setErrore(error.message);
      return false;
    } finally {
      setInCorso(false);
    }
  };

  const nuovo = (tipo) => {
    setValori({ ...VUOTO, tipo, percentuale_ossigeno: tipo === 'bombola' ? '21' : '' });
    setModulo({ id: null });
    tornaAllaScheda('acar-modulo-nuovo');
  };

  // Stessi dati, senza matricola né scheda: comodo per più bombole uguali.
  const duplica = (pezzo) => {
    setValori({ ...valoriDa(pezzo), matricola: '', scheda_url: '' });
    setModulo({ id: null });
    tornaAllaScheda('acar-modulo-nuovo');
  };

  const modifica = (pezzo) => {
    setValori(valoriDa(pezzo));
    setModulo({ id: pezzo.id });
  };

  const salva = async (event) => {
    event.preventDefault();
    if (valori.tipo === 'bombola' && valori.percentuale_ossigeno !== '') {
      const o2 = Number(String(valori.percentuale_ossigeno).replace(',', '.'));
      if (!Number.isFinite(o2) || o2 <= 0 || o2 > 100) {
        setErrore('La percentuale di ossigeno va da 1 a 100 (21 = aria).');
        return;
      }
    }
    const id = modulo.id;
    const ok = await esegui(
      async () => (id ? (await aggiornaAcar(id, valori), { id }) : aggiungiAcar(valori)),
      (esito) => (esito?.id ? `acar-${esito.id}` : null),
    );
    if (ok) setModulo(null);
  };

  const elimina = async (pezzo) => {
    const nome = [tipoAcar(pezzo.tipo).label, pezzo.descrizione, pezzo.matricola ? `matr. ${pezzo.matricola}` : '']
      .filter(Boolean)
      .join(' ');
    if (!window.confirm(`Eliminare «${nome}» dal magazzino ACAR?`)) return;
    await esegui(() => eliminaAcar(pezzo.id));
  };

  const campo = (nome) => ({
    value: valori[nome] ?? '',
    onChange: (event) => setValori((prima) => ({ ...prima, [nome]: event.target.value })),
  });

  const bombola = valori.tipo === 'bombola';
  const moduloPezzo = (
    <form className="scuola-modulo scuola-modulo--pezzo" onSubmit={salva}>
      <strong>{modulo?.id ? 'Modifica materiale ACAR' : 'Nuovo materiale ACAR'}</strong>
      <div className="scuola-campi">
        <label>
          Tipo
          <select {...campo('tipo')}>
            {TIPI_ACAR.map((tipo) => (
              <option key={tipo.value} value={tipo.value}>{tipo.label}</option>
            ))}
          </select>
        </label>
        <label>
          Marca / modello
          <input type="text" placeholder={bombola ? 'Es. Faber 10 L' : 'Es. Apeks XTX50'} {...campo('descrizione')} />
        </label>
        <label>
          Matricola / n° di serie
          <input type="text" {...campo('matricola')} />
        </label>
      </div>

      {bombola && (
        <fieldset className="scuola-consegna">
          <legend>Dati della bombola</legend>
          <div className="acar-tipologia" role="radiogroup" aria-label="Tipologia">
            {TIPOLOGIE_BOMBOLA.map((t) => (
              <label key={t.value} className="acar-scelta">
                <input
                  type="radio"
                  name="acar-tipologia"
                  value={t.value}
                  checked={valori.tipologia === t.value}
                  onChange={() => setValori((prima) => ({ ...prima, tipologia: t.value }))}
                />
                {t.label}
              </label>
            ))}
          </div>
          <div className="scuola-campi">
            <label>
              Capacità (litri)
              <input type="number" min="0.1" step="0.1" inputMode="decimal" {...campo('capacita_litri')} />
            </label>
            <label>
              Pressione di esercizio (bar)
              <input type="number" min="1" step="1" inputMode="numeric" {...campo('pressione_bar')} />
            </label>
            <label>
              Ossigeno (%)
              <input type="number" min="1" max="100" step="0.1" inputMode="decimal" placeholder="21 = aria" {...campo('percentuale_ossigeno')} />
            </label>
          </div>
        </fieldset>
      )}

      <div className="scuola-campi">
        <label>
          Scadenza revisione
          <input type="date" {...campo('scadenza_revisione')} />
        </label>
        <label>
          Link certificato / scheda revisione
          <input type="url" placeholder="https://drive.google.com/…" {...campo('scheda_url')} />
        </label>
      </div>
      <label>
        Note
        <input type="text" {...campo('note')} />
      </label>
      {errore && <p className="scuola-errore">{errore}</p>}
      <div className="scuola-azioni">
        <button type="submit" disabled={inCorso}>{inCorso ? 'Salvataggio…' : modulo?.id ? 'Salva' : 'Aggiungi'}</button>
        <button type="button" className="scuola-btn-neutro" onClick={chiudiModulo}>Annulla</button>
      </div>
    </form>
  );

  const riepilogo = caricato && !mancaMigrazione
    ? materiale.length
      ? ` · ${riepilogoAcar(materiale)}`
      : ' · vuoto'
    : '';

  return (
    <section className="card scuola-cartella acar-cartella" aria-label="Magazzino ACAR">
      <button type="button" className="scuola-cartella-titolo" aria-expanded={aperta} onClick={cambiaAperta}>
        <span aria-hidden="true">{aperta ? '📂' : '📁'}</span>
        <span className="scuola-cartella-nome">
          Magazzino ACAR
          <small>
            Riservato: non visibile ai soci{riepilogo}
            {daRevisionare ? ` · ⚠️ ${daRevisionare} da revisionare` : ''}
          </small>
        </span>
        <span aria-hidden="true" className="scuola-freccia">{aperta ? '▾' : '▸'}</span>
      </button>

      {aperta && (
        <div className="scuola-contenuto">
          {!caricato && <p>Caricamento…</p>}

          {mancaMigrazione && (
            <p className="scuola-errore">
              Questa sezione non è ancora attiva: va eseguita la migrazione 20 (magazzino ACAR) su Supabase.
            </p>
          )}

          {caricato && !mancaMigrazione && (
            <>
              {puoModificare && (
                <div className="scuola-barra">
                  {TIPI_ACAR.map((tipo) => (
                    <button
                      key={tipo.value}
                      type="button"
                      className={tipo.value === 'altro' ? 'scuola-btn-neutro' : undefined}
                      onClick={() => nuovo(tipo.value)}
                      disabled={inCorso}
                    >
                      + {tipo.label}
                    </button>
                  ))}
                </div>
              )}

              {modulo && !modulo.id && <div id="acar-modulo-nuovo">{moduloPezzo}</div>}

              {materiale.length > 0 && (
                <div className="acar-filtri">
                  <input
                    type="search"
                    placeholder="Cerca per tipo, modello, matricola, % ossigeno"
                    value={cerca}
                    onChange={(event) => setCerca(event.target.value)}
                  />
                  {daRevisionare > 0 && (
                    <label className="acar-scelta">
                      <input
                        type="checkbox"
                        checked={soloDaRevisionare}
                        onChange={(event) => setSoloDaRevisionare(event.target.checked)}
                      />
                      Solo da revisionare
                    </label>
                  )}
                </div>
              )}

              {errore && !modulo && <p className="scuola-errore">{errore}</p>}

              {!materiale.length && (
                <p className="scuola-vuoto">
                  Nessun materiale ACAR ancora.{puoModificare ? ' Aggiungi bombole, erogatori e maschere con i pulsanti qui sopra.' : ''}
                </p>
              )}

              {gruppi.map((gruppo) => (
                <section key={gruppo.value} className="scuola-contenuto-sacco" aria-label={gruppo.plurale}>
                  <h4>
                    <span aria-hidden="true">{gruppo.icona}</span> {gruppo.plurale}
                    <small> · {gruppo.pezzi.length}</small>
                  </h4>
                  <ul className="scuola-pezzi">
                    {gruppo.pezzi.map((pezzo) => {
                      if (modulo?.id === pezzo.id) {
                        return <li key={pezzo.id} id={`acar-${pezzo.id}`}>{moduloPezzo}</li>;
                      }
                      const avviso = avvisoRevisione(pezzo);
                      const tecnici = datiTecnici(pezzo);
                      return (
                        <li key={pezzo.id} id={`acar-${pezzo.id}`} className="scuola-pezzo">
                          <div className="scuola-pezzo-testa">
                            <span>
                              <strong>{pezzo.descrizione || tipoAcar(pezzo.tipo).label}</strong>
                              {pezzo.matricola ? <small> · matr. {pezzo.matricola}</small> : null}
                            </span>
                            {pezzo.scheda_url && (
                              <a href={pezzo.scheda_url} target="_blank" rel="noreferrer">📄 Certificato</a>
                            )}
                          </div>
                          {tecnici && <span className="acar-tecnici">{tecnici}</span>}
                          <small className="scuola-date">
                            {pezzo.scadenza_revisione
                              ? `Scadenza revisione: ${dataIt(pezzo.scadenza_revisione)}`
                              : 'Scadenza revisione non indicata'}
                          </small>
                          {avviso && (
                            <span className={`scuola-avviso scuola-avviso--${avviso.level}`}>
                              {avviso.text}
                              {avviso.level === 'expired' && pezzo.tipo === 'bombola' ? ' · non caricare' : ''}
                            </span>
                          )}
                          {pezzo.note && <small className="scuola-note">{pezzo.note}</small>}
                          {puoModificare && (
                            <div className="scuola-azioni scuola-azioni--piccole">
                              <button type="button" onClick={() => modifica(pezzo)} disabled={inCorso}>Modifica</button>
                              <button type="button" className="scuola-btn-neutro" onClick={() => duplica(pezzo)} disabled={inCorso}>
                                ⧉ Duplica
                              </button>
                              <button type="button" className="scuola-btn-elimina" onClick={() => elimina(pezzo)} disabled={inCorso}>
                                Elimina
                              </button>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}

              {materiale.length > 0 && !gruppi.length && (
                <p className="scuola-vuoto">Nessun materiale corrisponde alla ricerca.</p>
              )}
              {materiale.length > 0 && (
                <small className="scuola-vuoto">
                  L&apos;avviso compare {REVISIONE_WARNING_DAYS} giorni prima della scadenza della revisione.
                </small>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
