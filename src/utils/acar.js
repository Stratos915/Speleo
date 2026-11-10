// Magazzino ACAR: bombole, erogatori, maschere. Etichette, scadenze di revisione e testi brevi.
import { daysUntil } from './dpi.js';

/** Avviso «revisione in scadenza» con questo anticipo. */
export const REVISIONE_WARNING_DAYS = 60;

export const TIPI_ACAR = [
  { value: 'bombola', label: 'Bombola', plurale: 'Bombole', icona: '🫧' },
  { value: 'erogatore', label: 'Erogatore', plurale: 'Erogatori', icona: '🔧' },
  { value: 'maschera', label: 'Maschera', plurale: 'Maschere', icona: '🤿' },
  { value: 'altro', label: 'Altro', plurale: 'Altro materiale', icona: '📦' },
];

export const TIPOLOGIE_BOMBOLA = [
  { value: 'acciaio', label: 'Acciaio' },
  { value: 'composito', label: 'Composito' },
];

export function tipoAcar(valore) {
  return TIPI_ACAR.find((tipo) => tipo.value === valore) ?? TIPI_ACAR[TIPI_ACAR.length - 1];
}

export function etichettaTipologia(valore) {
  return TIPOLOGIE_BOMBOLA.find((t) => t.value === valore)?.label ?? '';
}

function numero(valore) {
  if (valore === null || valore === undefined || valore === '') return null;
  const n = Number(valore);
  return Number.isFinite(n) ? n : null;
}

/** «32%» oppure «21% (aria)». */
export function testoOssigeno(valore) {
  const n = numero(valore);
  if (n === null) return '';
  const testo = `${String(n).replace('.', ',')}%`;
  return n === 21 ? `${testo} (aria)` : testo;
}

/** Dati tecnici in una riga: «Acciaio · 10 L · 200 bar · O₂ 32%». */
export function datiTecnici(pezzo) {
  if (pezzo?.tipo !== 'bombola') return '';
  const parti = [];
  if (pezzo.tipologia) parti.push(etichettaTipologia(pezzo.tipologia));
  const litri = numero(pezzo.capacita_litri);
  if (litri !== null) parti.push(`${String(litri).replace('.', ',')} L`);
  const bar = numero(pezzo.pressione_bar);
  if (bar !== null) parti.push(`${bar} bar`);
  const o2 = testoOssigeno(pezzo.percentuale_ossigeno);
  if (o2) parti.push(`O₂ ${o2}`);
  return parti.join(' · ');
}

/**
 * Stato della revisione: null se non c'è la data o se manca ancora molto,
 * altrimenti { level: 'expired' | 'soon', days, text }.
 */
export function avvisoRevisione(pezzo, oggi = new Date()) {
  const giorni = daysUntil(pezzo?.scadenza_revisione, oggi);
  if (giorni === null) return null;
  if (giorni < 0) {
    const n = Math.abs(giorni);
    return { level: 'expired', days: giorni, text: `Revisione scaduta da ${n} ${n === 1 ? 'giorno' : 'giorni'}` };
  }
  if (giorni === 0) return { level: 'expired', days: 0, text: 'Revisione in scadenza oggi' };
  if (giorni <= REVISIONE_WARNING_DAYS) {
    return { level: 'soon', days: giorni, text: `Revisione tra ${giorni} ${giorni === 1 ? 'giorno' : 'giorni'}` };
  }
  return null;
}

/** Materiale diviso per tipo, nell'ordine Bombole, Erogatori, Maschere, Altro. */
export function raggruppaAcar(materiale) {
  return TIPI_ACAR.map((tipo) => ({
    ...tipo,
    pezzi: (materiale ?? [])
      .filter((pezzo) => tipoAcar(pezzo.tipo).value === tipo.value)
      .sort((a, b) =>
        String(a.descrizione ?? '').localeCompare(String(b.descrizione ?? ''), 'it') ||
        String(a.matricola ?? '').localeCompare(String(b.matricola ?? ''), 'it', { numeric: true })),
  })).filter((gruppo) => gruppo.pezzi.length);
}

/** «4 bombole · 2 erogatori · 1 maschera». */
export function riepilogoAcar(materiale) {
  return raggruppaAcar(materiale)
    .map((gruppo) => `${gruppo.pezzi.length} ${gruppo.pezzi.length === 1 ? gruppo.label.toLowerCase() : gruppo.plurale.toLowerCase()}`)
    .join(' · ');
}

/** Il pezzo corrisponde alla ricerca (tipo, descrizione, matricola, tipologia, note, % O₂). */
export function corrispondeAcar(pezzo, testo) {
  const cerca = String(testo ?? '').trim().toLowerCase();
  if (!cerca) return true;
  return [
    tipoAcar(pezzo.tipo).label,
    pezzo.descrizione,
    pezzo.matricola,
    etichettaTipologia(pezzo.tipologia),
    pezzo.note,
    testoOssigeno(pezzo.percentuale_ossigeno),
  ].some((valore) => String(valore ?? '').toLowerCase().includes(cerca));
}

function testo(valore) {
  const t = String(valore ?? '').trim();
  return t ? t : null;
}

function numeroModulo(valore) {
  const t = String(valore ?? '').trim().replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Valori del modulo → riga della tabella. I dati della bombola valgono solo per le bombole. */
export function datiAcar(valori) {
  const bombola = valori.tipo === 'bombola';
  const pressione = numeroModulo(valori.pressione_bar);
  return {
    tipo: valori.tipo || 'altro',
    descrizione: testo(valori.descrizione),
    matricola: testo(valori.matricola),
    tipologia: bombola ? testo(valori.tipologia) : null,
    capacita_litri: bombola ? numeroModulo(valori.capacita_litri) : null,
    pressione_bar: bombola && pressione !== null ? Math.round(pressione) : null,
    percentuale_ossigeno: bombola ? numeroModulo(valori.percentuale_ossigeno) : null,
    scadenza_revisione: testo(valori.scadenza_revisione),
    scheda_url: testo(valori.scheda_url),
    note: testo(valori.note),
  };
}
