// Esportazione di una singola uscita: dati dell'uscita in testa e l'elenco delle persone
// (partecipanti ufficiali, esterni e risposte «Partecipo · Forse · No»).
// Usata dal pulsante PDF nella scheda dell'uscita e dalla sezione Report.
import { etichettaTipo } from './tipiUscita.js';
import { buildCsv, buildXlsxBlob, downloadPdfTable, triggerDownload } from './exporters.js';

export const COLONNE_USCITA_SINGOLA = [
  { key: 'n', label: 'N.' },
  { key: 'nome', label: 'Nome' },
  { key: 'chi', label: 'Socio / esterno' },
  { key: 'elenco', label: 'Tra i partecipanti' },
  { key: 'risposta', label: 'Risposta' },
];

const RISPOSTA = { si: 'Partecipo', forse: 'Forse', no: 'No' };
// Ordine delle righe: prima chi viene, poi i forse, poi i no.
const PESO = { ufficiale: 0, esterno: 1, si: 2, forse: 3, no: 4 };

/** Partecipanti esterni scritti a mano: uno per riga o separati da virgola. */
export function esterniDaTesto(testo) {
  return String(testo ?? '')
    .split(/[\n,;]+/)
    .map((nome) => nome.trim())
    .filter(Boolean);
}

function giornoEsteso(data, ora) {
  const testo = String(data ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(testo)) return 'data non indicata';
  const giorno = new Date(`${testo}T12:00:00`).toLocaleDateString('it-IT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const hhmm = /^(\d{2}:\d{2})/.exec(String(ora ?? ''))?.[1];
  return hhmm ? `${giorno} alle ${hhmm}` : giorno;
}

function nomeFile(uscita, estensione) {
  const data = String(uscita?.data ?? '').slice(0, 10) || 'senza-data';
  const titolo = String(uscita?.titolo ?? 'uscita')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `uscita-${data}-${titolo || 'uscita'}.${estensione}`;
}

/**
 * @param uscita     riga di uscite
 * @param nomeSocio  (memberId) => nome del socio oppure null
 * @param adesioni   risultato di uscita_adesioni ({ risposte, senza_risposta }) o null
 */
export function buildUscitaSingola({ uscita, nomeSocio = () => null, adesioni = null }) {
  const risposte = adesioni?.risposte ?? [];
  const rispostaSocio = new Map(risposte.filter((r) => r.member_id).map((r) => [String(r.member_id), r.risposta]));
  const ufficiali = (uscita?.participants_ids ?? []).map(String);
  const inElenco = new Set(ufficiali);

  const righe = [];
  ufficiali.forEach((id) => {
    righe.push({
      peso: PESO.ufficiale,
      nome: nomeSocio(id) || 'Socio non trovato',
      chi: 'Socio',
      elenco: 'Sì',
      risposta: RISPOSTA[rispostaSocio.get(id)] ?? '',
    });
  });
  esterniDaTesto(uscita?.participants_manual).forEach((nome) => {
    righe.push({ peso: PESO.esterno, nome, chi: 'Esterno', elenco: 'Sì', risposta: '' });
  });
  risposte
    .filter((r) => !(r.member_id && inElenco.has(String(r.member_id))))
    .forEach((r) => {
      righe.push({
        peso: PESO[r.risposta] ?? PESO.no,
        nome: r.nome || (r.member_id && nomeSocio(String(r.member_id))) || 'Socio',
        chi: 'Socio',
        elenco: '',
        risposta: RISPOSTA[r.risposta] ?? r.risposta ?? '',
      });
    });
  righe.sort((a, b) => a.peso - b.peso || a.nome.localeCompare(b.nome, 'it'));
  const rows = righe.map((riga, index) => ({
    n: index + 1,
    nome: riga.nome,
    chi: riga.chi,
    elenco: riga.elenco,
    risposta: riga.risposta,
  }));

  const conta = (valore) => risposte.filter((r) => r.risposta === valore).length;
  const esterni = rows.filter((r) => r.chi === 'Esterno').length;
  const responsabile =
    uscita?.responsabile_nome?.trim() ||
    (uscita?.responsabile_id && nomeSocio(String(uscita.responsabile_id))) ||
    'Da assegnare';
  const intro = [
    `Quando: ${giornoEsteso(uscita?.data, uscita?.ora)}`,
    `Luogo: ${uscita?.luogo || 'non indicato'}`,
    uscita?.tipo ? `Tipo: ${etichettaTipo(uscita.tipo, uscita.tipo_descrizione)}` : null,
    `Responsabile: ${responsabile}`,
    `Partecipanti ufficiali: ${ufficiali.length + esterni} (soci ${ufficiali.length}, esterni ${esterni})`,
    adesioni
      ? `Risposte: ${conta('si')} partecipo, ${conta('forse')} forse, ${conta('no')} no, ${adesioni.senza_risposta ?? 0} senza risposta`
      : null,
    uscita?.note ? `Note: ${uscita.note}` : null,
    `Elenco aggiornato al ${new Date().toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })}`,
  ].filter(Boolean);

  return {
    title: `Uscita: ${uscita?.titolo ?? 'senza titolo'}`,
    intro,
    columns: COLONNE_USCITA_SINGOLA,
    rows,
    nomeFile: (estensione) => nomeFile(uscita, estensione),
  };
}

/** Scarica l'elenco dell'uscita in PDF (con carta intestata), XLSX o CSV. */
export async function scaricaUscitaSingola(dati, formato = 'pdf') {
  if (formato === 'pdf') {
    await downloadPdfTable(dati.title, dati.columns, dati.rows, dati.nomeFile('pdf'), { intro: dati.intro });
  } else if (formato === 'xlsx') {
    triggerDownload(buildXlsxBlob(dati.columns, dati.rows), dati.nomeFile('xlsx'));
  } else {
    triggerDownload(buildCsv(dati.rows, dati.columns), dati.nomeFile('csv'), 'text/csv;charset=utf-8;');
  }
}
