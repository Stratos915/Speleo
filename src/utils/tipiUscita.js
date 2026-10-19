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

// Tipologie che non usano materiale del magazzino: niente «Materiale necessario»
// né «Prestiti collegati» (eventi in sede).
export const TIPI_SENZA_MATERIALE = ['serata_sede'];

/** False per le tipologie senza materiale (es. «Serata in sede»). */
export function usaMateriale(tipo) {
  return !TIPI_SENZA_MATERIALE.includes(String(tipo ?? '').toLowerCase());
}

// «Uscite» sono solo le attività in esterno; tutte le altre sono «eventi».
// Un'attività senza tipo (vecchi dati) resta un'uscita.
export const TIPI_ESTERNI = ['esplorazione', 'allenamento', 'corso', 'sociale'];

/** True per le uscite in esterno, false per gli eventi (serata in sede, formazione, altro…). */
export function isUscitaEsterna(tipo) {
  const codice = String(tipo ?? '').toLowerCase();
  return !codice || TIPI_ESTERNI.includes(codice);
}

/** «Uscita» o «Evento» secondo il tipo. */
export function nomeAttivita(tipo, { minuscolo = false } = {}) {
  const nome = isUscitaEsterna(tipo) ? 'Uscita' : 'Evento';
  return minuscolo ? nome.toLowerCase() : nome;
}

/** «uscita» / «evento» con articolo: «l'uscita», «l'evento». */
export function conArticolo(tipo) {
  return `l'${nomeAttivita(tipo, { minuscolo: true })}`;
}

/** Conta uscite ed eventi di un elenco: { uscite, eventi }. */
export function contaAttivita(elenco = []) {
  return elenco.reduce(
    (acc, item) => {
      if (isUscitaEsterna(item?.tipo)) acc.uscite += 1;
      else acc.eventi += 1;
      return acc;
    },
    { uscite: 0, eventi: 0 },
  );
}

/** «3 uscite · 1 evento», «nessuna attività». */
export function testoConteggio({ uscite = 0, eventi = 0 } = {}) {
  const parti = [];
  if (uscite) parti.push(`${uscite} ${uscite === 1 ? 'uscita' : 'uscite'}`);
  if (eventi) parti.push(`${eventi} ${eventi === 1 ? 'evento' : 'eventi'}`);
  return parti.length ? parti.join(' · ') : 'nessuna attività';
}
