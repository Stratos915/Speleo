// Cartella del magazzino riservata alla scuola: il materiale diviso per numero di sacco.
// Ogni sacco si consegna a un corsista e contiene un elenco di pezzi, ognuno con il
// link alla sua scheda d'ispezione. I soci semplici non vedono questa sezione (e il
// database non gliela fa leggere, migrazione 19).
import { useCallback, useEffect, useMemo, useState } from 'react';
import usePermissions from '../hooks/usePermissions.js';
import { canEditSacchiScuola, canViewSacchiScuola } from '../utils/permissions.js';
import { getDpiAlerts } from '../utils/dpi.js';
import { tornaAllaScheda } from '../utils/scorrimento.js';
import {
  MigrazioneSacchiMancante,
  aggiornaPezzo,
  aggiornaSacco,
  aggiungiPezzo,
  copiaElenco,
  creaSacchiNumerati,
  creaSacco,
  eliminaPezzo,
  eliminaSacco,
  getSacchi,
} from '../services/sacchiScuola.js';

const CHIAVE_APERTA = 'speleo-materiale-scuola-aperto';
const SACCO_VUOTO = { numero: '', consegnato_a: '', consegnato_il: '', note: '' };
const PEZZO_VUOTO = { nome: '', quantita: '1', matricola: '', scheda_url: '', prossima_ispezione: '', fine_vita: '', note: '' };

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

function prossimoNumero(sacchi) {
  return sacchi.reduce((max, sacco) => Math.max(max, Number(sacco.numero) || 0), 0) + 1;
}

export default function MaterialeScuola() {
  const { roles } = usePermissions();
  const puoVedere = canViewSacchiScuola(roles);
  const puoModificare = canEditSacchiScuola(roles);

  const [aperta, setAperta] = useState(leggiAperta);
  const [sacchi, setSacchi] = useState([]);
  const [caricato, setCaricato] = useState(false);
  const [mancaMigrazione, setMancaMigrazione] = useState(false);
  const [errore, setErrore] = useState('');
  const [inCorso, setInCorso] = useState(false);
  const [cerca, setCerca] = useState('');
  const [saccoAperto, setSaccoAperto] = useState(() => new Set());
  // Modulo aperto: { tipo: 'sacco', id|null } oppure { tipo: 'pezzo', saccoId, id|null }
  const [modulo, setModulo] = useState(null);
  const [valori, setValori] = useState(SACCO_VUOTO);
  const [quantiSacchi, setQuantiSacchi] = useState('');

  const carica = useCallback(async () => {
    try {
      setSacchi(await getSacchi());
      setMancaMigrazione(false);
      setErrore('');
    } catch (error) {
      if (error instanceof MigrazioneSacchiMancante) setMancaMigrazione(true);
      else setErrore(error.message);
    } finally {
      setCaricato(true);
    }
  }, []);

  useEffect(() => {
    if (puoVedere && aperta && !caricato) carica();
  }, [puoVedere, aperta, caricato, carica]);

  const avvisiTotali = useMemo(
    () => sacchi.reduce((somma, sacco) => somma + sacco.materiale.filter((p) => getDpiAlerts(p).length).length, 0),
    [sacchi],
  );

  const filtrati = useMemo(() => {
    const testo = cerca.trim().toLowerCase();
    if (!testo) return sacchi;
    return sacchi.filter((sacco) =>
      String(sacco.numero) === testo ||
      [sacco.consegnato_a, sacco.note].some((v) => String(v ?? '').toLowerCase().includes(testo)) ||
      sacco.materiale.some((p) => [p.nome, p.matricola, p.note].some((v) => String(v ?? '').toLowerCase().includes(testo))),
    );
  }, [sacchi, cerca]);

  if (!puoVedere) return null;

  const cambiaAperta = () => {
    setAperta((prima) => {
      salvaAperta(!prima);
      return !prima;
    });
  };

  const apriSacco = (id, forza) => {
    setSaccoAperto((prima) => {
      const nuovo = new Set(prima);
      if (forza === true || (forza === undefined && !nuovo.has(id))) nuovo.add(id);
      else nuovo.delete(id);
      return nuovo;
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
      await azione();
      await carica();
      if (dopo) tornaAllaScheda(dopo);
      return true;
    } catch (error) {
      setErrore(error.message);
      return false;
    } finally {
      setInCorso(false);
    }
  };

  // ---- Sacchi ----------------------------------------------------------
  const nuovoSacco = () => {
    setValori({ ...SACCO_VUOTO, numero: String(prossimoNumero(sacchi)) });
    setModulo({ tipo: 'sacco', id: null });
  };

  const modificaSacco = (sacco) => {
    setValori({
      numero: String(sacco.numero),
      consegnato_a: sacco.consegnato_a ?? '',
      consegnato_il: sacco.consegnato_il ?? '',
      note: sacco.note ?? '',
    });
    setModulo({ tipo: 'sacco', id: sacco.id });
  };

  const salvaSacco = async (event) => {
    event.preventDefault();
    const numero = Number(valori.numero);
    if (!Number.isInteger(numero) || numero < 1) {
      setErrore('Il numero del sacco deve essere un numero intero da 1 in su.');
      return;
    }
    const id = modulo.id;
    let nuovoId = id;
    const ok = await esegui(async () => {
      if (id) await aggiornaSacco(id, valori);
      else nuovoId = (await creaSacco(valori)).id;
    });
    if (ok) {
      setModulo(null);
      if (nuovoId) {
        apriSacco(nuovoId, true);
        tornaAllaScheda(`sacco-${nuovoId}`);
      }
    }
  };

  const preparaSacchi = async () => {
    const quanti = Number(quantiSacchi);
    if (!Number.isInteger(quanti) || quanti < 1 || quanti > 100) {
      setErrore('Indica quanti sacchi preparare (da 1 a 100).');
      return;
    }
    const primo = prossimoNumero(sacchi);
    const numeri = Array.from({ length: quanti }, (_, i) => primo + i);
    const ok = await esegui(() => creaSacchiNumerati(numeri));
    if (ok) setQuantiSacchi('');
  };

  const cancellaSacco = async (sacco) => {
    const pezzi = sacco.materiale.length;
    const conferma = window.confirm(
      `Eliminare il sacco n° ${sacco.numero}${pezzi ? ` e l'elenco dei ${pezzi} pezzi che contiene` : ''}?\n` +
        'Le schede d\'ispezione su Drive non vengono toccate.',
    );
    if (!conferma) return;
    await esegui(() => eliminaSacco(sacco.id));
  };

  const copiaDa = async (sacco, daId) => {
    const origine = sacchi.find((s) => s.id === daId);
    if (!origine) return;
    if (!origine.materiale.length) {
      setErrore(`Il sacco n° ${origine.numero} è vuoto.`);
      return;
    }
    await esegui(() => copiaElenco(origine, sacco.id, sacco.materiale.length), `sacco-${sacco.id}`);
  };

  // ---- Pezzi -----------------------------------------------------------
  const nuovoPezzo = (sacco) => {
    setValori(PEZZO_VUOTO);
    setModulo({ tipo: 'pezzo', saccoId: sacco.id, id: null });
    apriSacco(sacco.id, true);
  };

  const modificaPezzo = (pezzo) => {
    setValori({
      nome: pezzo.nome ?? '',
      quantita: String(pezzo.quantita ?? 1),
      matricola: pezzo.matricola ?? '',
      scheda_url: pezzo.scheda_url ?? '',
      prossima_ispezione: pezzo.prossima_ispezione ?? '',
      fine_vita: pezzo.fine_vita ?? '',
      note: pezzo.note ?? '',
    });
    setModulo({ tipo: 'pezzo', saccoId: pezzo.sacco_id, id: pezzo.id });
  };

  const salvaPezzo = async (event) => {
    event.preventDefault();
    const { saccoId, id } = modulo;
    const sacco = sacchi.find((s) => s.id === saccoId);
    const ok = await esegui(async () => {
      if (id) await aggiornaPezzo(id, valori);
      else await aggiungiPezzo(saccoId, valori, sacco?.materiale.length ?? 0);
    }, id ? `pezzo-${id}` : `sacco-${saccoId}`);
    if (ok) {
      if (id) setModulo(null);
      else setValori(PEZZO_VUOTO); // pronto per il pezzo successivo
    }
  };

  const cancellaPezzo = async (pezzo) => {
    if (!window.confirm(`Togliere «${pezzo.nome}» dall'elenco del sacco?`)) return;
    await esegui(() => eliminaPezzo(pezzo.id), `sacco-${pezzo.sacco_id}`);
  };

  const campo = (nome) => ({
    value: valori[nome] ?? '',
    onChange: (event) => setValori((prima) => ({ ...prima, [nome]: event.target.value })),
  });

  // ---- Moduli ----------------------------------------------------------
  const moduloSacco = (
    <form className="card scuola-modulo" onSubmit={salvaSacco}>
      <h3>{modulo?.id ? 'Modifica sacco' : 'Nuovo sacco'}</h3>
      <div className="scuola-campi">
        <label>
          Numero del sacco
          <input type="number" min="1" step="1" required {...campo('numero')} />
        </label>
        <label>
          Consegnato a (corsista)
          <input type="text" placeholder="Nome e cognome" {...campo('consegnato_a')} />
        </label>
        <label>
          Consegnato il
          <input type="date" {...campo('consegnato_il')} />
        </label>
      </div>
      <label>
        Note
        <textarea rows={2} {...campo('note')} />
      </label>
      {errore && <p className="scuola-errore">{errore}</p>}
      <div className="scuola-azioni">
        <button type="submit" disabled={inCorso}>{inCorso ? 'Salvataggio…' : 'Salva'}</button>
        <button type="button" className="scuola-btn-neutro" onClick={chiudiModulo}>Annulla</button>
      </div>
    </form>
  );

  const moduloPezzo = (
    <form className="scuola-modulo scuola-modulo--pezzo" onSubmit={salvaPezzo}>
      <strong>{modulo?.id ? 'Modifica materiale' : 'Aggiungi materiale al sacco'}</strong>
      <div className="scuola-campi">
        <label>
          Materiale
          <input type="text" required placeholder="Es. Imbrago, Croll, Discensore…" {...campo('nome')} />
        </label>
        <label>
          Quantità
          <input type="number" min="1" step="1" {...campo('quantita')} />
        </label>
        <label>
          Matricola / n° di serie
          <input type="text" {...campo('matricola')} />
        </label>
      </div>
      <label>
        Link scheda d&apos;ispezione (Drive)
        <input type="url" placeholder="https://drive.google.com/…" {...campo('scheda_url')} />
      </label>
      <div className="scuola-campi">
        <label>
          Prossima ispezione
          <input type="date" {...campo('prossima_ispezione')} />
        </label>
        <label>
          Fine vita
          <input type="date" {...campo('fine_vita')} />
        </label>
      </div>
      <label>
        Note
        <input type="text" {...campo('note')} />
      </label>
      {errore && <p className="scuola-errore">{errore}</p>}
      <div className="scuola-azioni">
        <button type="submit" disabled={inCorso}>
          {inCorso ? 'Salvataggio…' : modulo?.id ? 'Salva' : 'Aggiungi'}
        </button>
        <button type="button" className="scuola-btn-neutro" onClick={chiudiModulo}>
          {modulo?.id ? 'Annulla' : 'Chiudi'}
        </button>
      </div>
    </form>
  );

  // ---- Vista -----------------------------------------------------------
  const conMateriale = sacchi.filter((s) => s.materiale.length);

  return (
    <section className="card scuola-cartella" aria-label="Materiale della scuola">
      <button
        type="button"
        className="scuola-cartella-titolo"
        aria-expanded={aperta}
        onClick={cambiaAperta}
      >
        <span aria-hidden="true">{aperta ? '📂' : '📁'}</span>
        <span className="scuola-cartella-nome">
          Materiale scuola
          <small>
            Riservato: non visibile ai soci
            {caricato && !mancaMigrazione ? ` · ${sacchi.length} ${sacchi.length === 1 ? 'sacco' : 'sacchi'}` : ''}
            {avvisiTotali ? ` · ⚠️ ${avvisiTotali} da controllare` : ''}
          </small>
        </span>
        <span aria-hidden="true" className="scuola-freccia">{aperta ? '▾' : '▸'}</span>
      </button>

      {aperta && (
        <div className="scuola-contenuto">
          {!caricato && <p>Caricamento…</p>}

          {mancaMigrazione && (
            <p className="scuola-errore">
              Questa sezione non è ancora attiva: va eseguita la migrazione 19 (sacchi della scuola) su Supabase.
            </p>
          )}

          {caricato && !mancaMigrazione && (
            <>
              {puoModificare && (
                <div className="scuola-barra">
                  <button type="button" onClick={nuovoSacco} disabled={inCorso}>+ Nuovo sacco</button>
                  <span className="scuola-prepara">
                    <input
                      type="number"
                      min="1"
                      max="100"
                      placeholder="Quanti"
                      aria-label="Quanti sacchi preparare"
                      value={quantiSacchi}
                      onChange={(event) => setQuantiSacchi(event.target.value)}
                    />
                    <button type="button" className="scuola-btn-neutro" onClick={preparaSacchi} disabled={inCorso}>
                      Prepara sacchi numerati
                    </button>
                  </span>
                </div>
              )}

              {sacchi.length > 0 && (
                <input
                  type="search"
                  placeholder="Cerca sacco, corsista, materiale o matricola"
                  value={cerca}
                  onChange={(event) => setCerca(event.target.value)}
                />
              )}

              {errore && !modulo && <p className="scuola-errore">{errore}</p>}
              {modulo?.tipo === 'sacco' && !modulo.id && moduloSacco}

              {!sacchi.length && (
                <p className="scuola-vuoto">
                  Nessun sacco ancora.{puoModificare ? ' Crea il primo con «+ Nuovo sacco» o preparane più di uno insieme.' : ''}
                </p>
              )}

              <div className="card-list">
                {filtrati.map((sacco) => {
                  if (modulo?.tipo === 'sacco' && modulo.id === sacco.id) {
                    return <div key={sacco.id} id={`sacco-${sacco.id}`}>{moduloSacco}</div>;
                  }
                  const espanso = saccoAperto.has(sacco.id) || Boolean(cerca.trim());
                  const avvisi = sacco.materiale.filter((p) => getDpiAlerts(p).length).length;
                  const altri = conMateriale.filter((s) => s.id !== sacco.id);
                  return (
                    <article key={sacco.id} id={`sacco-${sacco.id}`} className="scuola-sacco">
                      <button
                        type="button"
                        className="scuola-sacco-titolo"
                        aria-expanded={espanso}
                        onClick={() => apriSacco(sacco.id)}
                      >
                        <span className="scuola-numero">{sacco.numero}</span>
                        <span className="scuola-sacco-info">
                          <strong>Sacco n° {sacco.numero}</strong>
                          <small>
                            {sacco.consegnato_a
                              ? `Consegnato a ${sacco.consegnato_a}${sacco.consegnato_il ? ` il ${dataIt(sacco.consegnato_il)}` : ''}`
                              : 'In magazzino'}
                            {' · '}
                            {sacco.materiale.length} {sacco.materiale.length === 1 ? 'pezzo' : 'pezzi'}
                            {avvisi ? ` · ⚠️ ${avvisi}` : ''}
                          </small>
                        </span>
                        <span aria-hidden="true" className="scuola-freccia">{espanso ? '▾' : '▸'}</span>
                      </button>

                      {espanso && (
                        <div className="scuola-sacco-corpo">
                          {sacco.note && <p className="scuola-note">Note: {sacco.note}</p>}

                          {sacco.materiale.length ? (
                            <ul className="scuola-pezzi">
                              {sacco.materiale.map((pezzo) => {
                                if (modulo?.tipo === 'pezzo' && modulo.id === pezzo.id) {
                                  return <li key={pezzo.id} id={`pezzo-${pezzo.id}`}>{moduloPezzo}</li>;
                                }
                                const avvisiPezzo = getDpiAlerts(pezzo);
                                return (
                                  <li key={pezzo.id} id={`pezzo-${pezzo.id}`} className="scuola-pezzo">
                                    <div className="scuola-pezzo-testa">
                                      <span>
                                        <strong>{pezzo.nome}</strong>
                                        {pezzo.quantita > 1 ? ` ×${pezzo.quantita}` : ''}
                                        {pezzo.matricola ? <small> · matr. {pezzo.matricola}</small> : null}
                                      </span>
                                      {pezzo.scheda_url ? (
                                        <a href={pezzo.scheda_url} target="_blank" rel="noreferrer">📄 Scheda ispezione</a>
                                      ) : (
                                        <small className="scuola-senza-scheda">Nessuna scheda collegata</small>
                                      )}
                                    </div>
                                    {(pezzo.prossima_ispezione || pezzo.fine_vita) && (
                                      <small className="scuola-date">
                                        {pezzo.prossima_ispezione ? `Prossima ispezione: ${dataIt(pezzo.prossima_ispezione)}` : ''}
                                        {pezzo.prossima_ispezione && pezzo.fine_vita ? ' · ' : ''}
                                        {pezzo.fine_vita ? `Fine vita: ${dataIt(pezzo.fine_vita)}` : ''}
                                      </small>
                                    )}
                                    {avvisiPezzo.map((avviso) => (
                                      <span
                                        key={avviso.kind}
                                        className={`scuola-avviso scuola-avviso--${avviso.level}`}
                                      >
                                        {avviso.text}
                                        {avviso.kind === 'fine_vita' && avviso.level === 'expired' ? ' · non usare, da ritirare' : ''}
                                      </span>
                                    ))}
                                    {pezzo.note && <small className="scuola-note">{pezzo.note}</small>}
                                    {puoModificare && (
                                      <div className="scuola-azioni scuola-azioni--piccole">
                                        <button type="button" onClick={() => modificaPezzo(pezzo)} disabled={inCorso}>Modifica</button>
                                        <button type="button" className="scuola-btn-elimina" onClick={() => cancellaPezzo(pezzo)} disabled={inCorso}>
                                          Togli
                                        </button>
                                      </div>
                                    )}
                                  </li>
                                );
                              })}
                            </ul>
                          ) : (
                            <p className="scuola-vuoto">Sacco vuoto.</p>
                          )}

                          {modulo?.tipo === 'pezzo' && !modulo.id && modulo.saccoId === sacco.id && moduloPezzo}

                          {puoModificare && (
                            <div className="scuola-azioni">
                              {!(modulo?.tipo === 'pezzo' && !modulo.id && modulo.saccoId === sacco.id) && (
                                <button type="button" onClick={() => nuovoPezzo(sacco)} disabled={inCorso}>+ Aggiungi materiale</button>
                              )}
                              {!sacco.materiale.length && altri.length > 0 && (
                                <select
                                  aria-label="Copia l'elenco da un altro sacco"
                                  value=""
                                  disabled={inCorso}
                                  onChange={(event) => copiaDa(sacco, event.target.value)}
                                >
                                  <option value="">Copia l&apos;elenco dal sacco…</option>
                                  {altri.map((s) => (
                                    <option key={s.id} value={s.id}>
                                      n° {s.numero} ({s.materiale.length} {s.materiale.length === 1 ? 'pezzo' : 'pezzi'})
                                    </option>
                                  ))}
                                </select>
                              )}
                              <button type="button" className="scuola-btn-neutro" onClick={() => modificaSacco(sacco)} disabled={inCorso}>
                                Modifica sacco
                              </button>
                              <button type="button" className="scuola-btn-elimina" onClick={() => cancellaSacco(sacco)} disabled={inCorso}>
                                Elimina sacco
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
              {cerca.trim() && !filtrati.length && <p className="scuola-vuoto">Nessun sacco corrisponde alla ricerca.</p>}
            </>
          )}
        </div>
      )}
    </section>
  );
}
