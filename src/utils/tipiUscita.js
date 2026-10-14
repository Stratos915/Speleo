// Tipologie delle uscite: un solo elenco per modulo, filtri ed etichette.
// Il valore salvato in uscite.tipo resta il codice (es. «serata_sede»).
export const TIPI_USCITA = [
  { value: 'sociale', label: 'Sociale' },
  { value: 'corso', label: 'Corso' },
  { value: 'allenamento', label: 'Allenamento' },
  { value: 'formazione', label: 'Formazione' },
  { value: 'esplorazione', label: 'Esplorazione' },
  { value: 'serata_sede', label: 'Serata in sede' },
  { value: 'altro_evento', label: 'Altro evento' },
  { value: 'altro', label: 'Altro' },
];

// Tipologia che chiede una descrizione libera (uscite.tipo_descrizione).
export const TIPO_CON_DESCRIZIONE = 'altro_evento';

const ETICHETTE = new Map(TIPI_USCITA.map((tipo) => [tipo.value, tipo.label]));

/** Etichetta leggibile; per «Altro evento» con descrizione: «Altro evento: …». */
export function etichettaTipo(tipo, descrizione) {
  if (!tipo) return '';
  const base = ETICHETTE.get(String(tipo).toLowerCase()) ?? String(tipo);
  const testo = String(descrizione ?? '').trim();
  return tipo === TIPO_CON_DESCRIZIONE && testo ? `${base}: ${testo}` : base;
}
