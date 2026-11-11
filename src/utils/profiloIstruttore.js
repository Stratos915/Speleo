import { buildCsv, buildXlsxBlob, downloadPdfTable, formatDate, triggerDownload } from './exporters.js';

export const ETICHETTE_QUALIFICA = {
  istruttore: 'Istruttore',
  aiuto_istruttore: 'Aiuto istruttore',
  itca: 'ITCA · Istruttore cavità artificiali',
};

const SEZIONE_RECENTE = 'Attività dal novembre 2021';
const DATA = /^\d{1,2}\/\d{1,2}\/\d{4}/;

// La colonna «Sezione» divide il PDF in blocchi (vedi `gruppo` in generateTablePdf);
// le larghezze fisse (in caratteri) fanno stare la tabella nella pagina.
export const COLONNE_PROFILO = [
  { key: 'sezione', label: 'Sezione', gruppo: true, intestazione: 'sezione' },
  { key: 'n', label: 'N.', chars: 6 },
  { key: 'periodo', label: 'Periodo', chars: 23 },
  { key: 'livello', label: 'Livello', chars: 11 },
  { key: 'luogo', label: 'Luogo', chars: 17 },
  { key: 'attivita', label: 'Attività / ruolo', chars: 26 },
];

/**
 * Trasforma il testo «Attività» del registro in righe: ogni riga è
 * «periodo · livello · luogo · argomento»; una riga che finisce con «:»
 * (es. «Prima di novembre 2021 (32):», «Incarichi:») apre una nuova sezione.
 */
export function righeAttivita(testo) {
  const righe = [];
  let sezione = SEZIONE_RECENTE;
  let contatore = 0;
  String(testo ?? '')
    .split(/\r?\n/)
    .map((riga) => riga.trim())
    .filter(Boolean)
    .forEach((riga) => {
      if (riga.endsWith(':')) {
        sezione = riga.slice(0, -1).trim();
        contatore = 0;
        return;
      }
      // Incarichi: «2010: Direttore corso...» o «2018-2021: Direttore scuola».
      const incarico = riga.match(/^(\d{4}(?:\s*[-–]\s*\d{4})?)\s*:\s*(.+)$/);
      if (incarico) {
        contatore += 1;
        righe.push({ sezione, n: contatore, periodo: incarico[1], livello: '', luogo: '', attivita: incarico[2] });
        return;
      }
      const parti = riga.split(' · ').map((parte) => parte.trim());
      let periodo = '';
      let livello = '';
      if (parti.length > 1 && DATA.test(parti[0])) periodo = parti.shift();
      if (parti.length > 1 && /livello/i.test(parti[0])) livello = parti.shift();
      const luogo = periodo && parti.length ? parti.shift() : '';
      contatore += 1;
      righe.push({ sezione, n: contatore, periodo, livello, luogo, attivita: parti.join(' · ') });
    });
  return righe;
}

/** Stato del mantenimento rispetto a oggi: scaduto, in scadenza entro 6 mesi o in regola. */
export function statoMantenimento(prossimo, oggi = new Date()) {
  if (!prossimo) return '';
  const data = new Date(prossimo);
  if (Number.isNaN(data.getTime())) return '';
  const giorni = Math.floor((data - oggi) / 86_400_000);
  if (giorni < 0) return 'scaduto';
  if (giorni <= 183) return 'in scadenza';
  return 'in regola';
}

function nomeFile(nome, estensione) {
  const pulito = String(nome || 'istruttore')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return `profilo-istruttore-${pulito}-${new Date().toISOString().slice(0, 10)}.${estensione}`;
}

/**
 * Profilo di un istruttore del registro: dati principali (sotto il titolo nel PDF)
 * e lo storico delle attività in tabella.
 */
export function buildProfiloIstruttore({ entry, member, email = '', annoCartella = '', oggi = new Date() }) {
  const nome = member?.full_name || 'Socio non trovato';
  const tessera = member?.old_id ?? member?.membership_number ?? '';
  const stato = statoMantenimento(entry?.nextMaintenanceDate, oggi);
  const documenti = (entry?.documents ?? []).map((doc) => doc.name).filter(Boolean);
  const rows = righeAttivita(entry?.activities);
  const intro = [
    `Qualifica: ${ETICHETTE_QUALIFICA[entry?.qualificationType] ?? entry?.qualificationType ?? 'non indicata'}`,
    entry?.customQualification ? `Percorso e altre qualifiche: ${entry.customQualification}` : null,
    `Tessera: ${tessera || 'N/D'} · Email: ${email || 'non disponibile'}`,
    `Data conseguimento: ${entry?.qualificationDate ? formatDate(entry.qualificationDate) : 'non indicata'}`,
    `Ultimo mantenimento: ${entry?.lastMaintenanceDate ? formatDate(entry.lastMaintenanceDate) : 'non indicato'}`,
    `Prossimo mantenimento: ${entry?.nextMaintenanceDate ? formatDate(entry.nextMaintenanceDate) : 'non indicato'}${
      stato ? ` (${stato})` : ''
    }`,
    annoCartella ? `Cartella del registro: ${annoCartella}` : null,
    `Attività registrate: ${rows.length}`,
    documenti.length ? `Documenti allegati: ${documenti.join(', ')}` : 'Documenti allegati: nessuno',
    `Profilo aggiornato al ${oggi.toLocaleDateString('it-IT')}`,
  ].filter(Boolean);
  return {
    title: `Profilo istruttore: ${nome}`,
    intro,
    columns: COLONNE_PROFILO,
    rows,
    nomeFile: (estensione) => nomeFile(nome, estensione),
  };
}

/** Scarica il profilo in PDF (carta intestata) o Excel. */
export async function scaricaProfiloIstruttore(profilo, formato = 'pdf') {
  // Senza attività la tabella resta con una riga che lo dice.
  const rows = profilo.rows.length
    ? profilo.rows
    : [{ sezione: 'Attività', n: '', periodo: '', livello: '', luogo: '', attivita: 'Nessuna attività registrata' }];
  if (formato === 'pdf') {
    await downloadPdfTable(profilo.title, profilo.columns, rows, profilo.nomeFile('pdf'), { intro: profilo.intro });
    return;
  }
  // In Excel e CSV i dati principali vanno in testa, una riga per voce.
  const colonne = profilo.columns.map((colonna) => ({ key: colonna.key, label: colonna.label }));
  const testa = [{ sezione: profilo.title }, ...profilo.intro.map((riga) => ({ sezione: riga })), {}];
  const tutte = [...testa, ...rows];
  if (formato === 'xlsx') {
    triggerDownload(buildXlsxBlob(colonne, tutte), profilo.nomeFile('xlsx'));
  } else {
    triggerDownload(buildCsv(tutte, colonne), profilo.nomeFile('csv'), 'text/csv;charset=utf-8;');
  }
}
