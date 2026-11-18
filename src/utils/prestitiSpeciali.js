// Prestiti del materiale ACAR e dei sacchi della scuola (migrazione 22):
// testi brevi, uscite da proporre e corsisti dei corsi della scuola.
import { etichettaTipo } from './tipiUscita.js';

/** Tipo di uscita da proporre per primo: ACAR per il materiale ACAR, corso per i sacchi. */
export const TIPO_USCITA_PREFERITO = { acar: 'acar', sacco: 'corso' };

function dataBreve(valore) {
  if (!valore) return '';
  const testo = String(valore);
  const data = new Date(testo.length <= 10 ? `${testo}T12:00:00` : testo);
  if (Number.isNaN(data.getTime())) return '';
  return data.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
}

/** Etichetta di un'uscita nelle tendine: «16 nov · Grotta di Frasassi (ACAR)». */
export function etichettaUscita(uscita) {
  if (!uscita) return '';
  const tipo = etichettaTipo(uscita.tipo, uscita.tipo_descrizione);
  return [dataBreve(uscita.data), `${uscita.titolo || 'Senza titolo'}${tipo ? ` (${tipo})` : ''}`]
    .filter(Boolean)
    .join(' · ');
}

/**
 * Uscite a cui collegare un prestito: quelle non chiuse, divise in
 * «consigliate» (del tipo preferito) e «altre», ciascuna in ordine di data.
 */
export function usciteDaProporre(uscite = [], tipoPreferito = null) {
  const aperte = (uscite ?? [])
    .filter((uscita) => uscita?.id && uscita.status !== 'chiusa')
    .sort((a, b) => String(a.data ?? '').localeCompare(String(b.data ?? '')));
  const consigliate = tipoPreferito ? aperte.filter((u) => u.tipo === tipoPreferito) : [];
  const altre = aperte.filter((u) => !consigliate.includes(u));
  return { consigliate, altre };
}

/** Riferimento di un corso salvato nei prestiti: «idAnno::idCorso». */
export function rifCorso(anno, corso) {
  return `${anno?.id ?? ''}::${corso?.id ?? ''}`;
}

/** Riferimento di un corsista salvato nei prestiti: «idAnno::idCorso::idCorsista». */
export function rifCorsista(anno, corso, studente) {
  return `${rifCorso(anno, corso)}::${studente?.id ?? ''}`;
}

/** Nome del corso salvato nei prestiti: «Corso 2026 · Anno 2026». */
export function nomeCorso(anno, corso) {
  return `${corso?.name || 'Corso'} · ${anno?.label || ''}`.trim().replace(/ ·$/, '');
}

/** Nome e cognome del corsista. */
export function nomeCorsista(studente) {
  return `${studente?.firstName ?? ''} ${studente?.lastName ?? ''}`.trim() || 'Corsista senza nome';
}

/**
 * Corsi della scuola con i loro corsisti, dai più recenti; i corsi chiusi
 * restano in fondo. rif = «idAnno::idCorso».
 */
export function corsiConCorsisti(documento) {
  const anni = Array.isArray(documento?.yearFolders) ? documento.yearFolders : [];
  const corsi = anni.flatMap((anno) =>
    (anno.courses ?? []).map((corso) => ({
      rif: rifCorso(anno, corso),
      nome: nomeCorso(anno, corso),
      chiuso: Boolean(corso.isClosed),
      anno: Number(String(anno.label ?? '').replace(/\D+/g, '')) || 0,
      corsisti: (corso.students ?? [])
        .map((studente) => ({
          rif: rifCorsista(anno, corso, studente),
          nome: nomeCorsista(studente),
        }))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'it', { sensitivity: 'base' })),
    })),
  );
  return corsi.sort((a, b) => Number(a.chiuso) - Number(b.chiuso) || b.anno - a.anno);
}

/** «Mario Rossi dal 16 nov · uscita: Frasassi · corso: Corso 2026 · rientro entro 20 nov» */
export function descriviPrestito(prestito, uscita = null) {
  if (!prestito) return '';
  const parti = [`${prestito.borrower_name || 'non indicato'}${prestito.delivered_at ? ` dal ${dataBreve(prestito.delivered_at)}` : ''}`];
  if (uscita) parti.push(`uscita: ${uscita.titolo || 'senza titolo'}`);
  if (prestito.corso_nome) parti.push(`corso: ${prestito.corso_nome}`);
  if (prestito.reserved_until) parti.push(`rientro entro ${dataBreve(prestito.reserved_until)}`);
  return parti.join(' · ');
}

/** Nome del materiale di un prestito: generale, ACAR o sacco. */
export function nomeMaterialePrestito(prestito, nomeGenerale = '') {
  return nomeGenerale || prestito?.equipment?.name || prestito?.materiale_nome || 'Materiale';
}

// ---------------------------------------------------------------------
// Prestiti da un'uscita e dalla scheda del corsista
// ---------------------------------------------------------------------

/** Da dove si prende il materiale: magazzino generale, Magazzino ACAR, sacchi della scuola. */
export const SCHEDE_MATERIALE = [
  { value: 'generale', label: 'Magazzino generale' },
  { value: 'acar', label: 'Magazzino ACAR' },
  { value: 'sacco', label: 'Sacchi scuola' },
];

/** Scheda da aprire per prima: ACAR per un'uscita ACAR, sacchi per un'uscita del corso. */
export function schedaIniziale(tipoUscita) {
  if (tipoUscita === 'acar') return 'acar';
  if (tipoUscita === 'corso') return 'sacco';
  return 'generale';
}

function oggiIso(oggi = new Date()) {
  const y = oggi.getFullYear();
  const m = String(oggi.getMonth() + 1).padStart(2, '0');
  const d = String(oggi.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Il pezzo ACAR ha la revisione scaduta (o in scadenza oggi)? Allora non si presta. */
export function revisioneScaduta(pezzo, oggi = new Date()) {
  const scadenza = String(pezzo?.scadenza_revisione ?? '').slice(0, 10);
  if (!scadenza) return false;
  return scadenza <= oggiIso(oggi);
}

/** Nome del pezzo nelle tendine: «Bombola Faber 10 L · matr. 123», «Sacco n° 4». */
export function etichettaPezzo(tipo, pezzo) {
  if (!pezzo) return '';
  if (tipo === 'sacco') return `Sacco n° ${pezzo.numero}`;
  const tipoNome = pezzo.tipo ? `${String(pezzo.tipo).charAt(0).toUpperCase()}${String(pezzo.tipo).slice(1)}` : 'Pezzo';
  const nome = pezzo.descrizione ? String(pezzo.descrizione) : tipoNome;
  return pezzo.matricola ? `${nome} · matr. ${pezzo.matricola}` : nome;
}

/**
 * Pezzi che si possono prestare adesso: non già in prestito e, per l'ACAR,
 * con la revisione non scaduta. Ritorna { disponibili, inPrestito, scaduti }.
 */
export function pezziDisponibili(tipo, pezzi = [], prestitiAperti = new Map(), oggi = new Date()) {
  const ordinati = [...(pezzi ?? [])].sort((a, b) =>
    tipo === 'sacco'
      ? Number(a.numero ?? 0) - Number(b.numero ?? 0)
      : etichettaPezzo(tipo, a).localeCompare(etichettaPezzo(tipo, b), 'it', { sensitivity: 'base' }),
  );
  const disponibili = [];
  const inPrestito = [];
  const scaduti = [];
  for (const pezzo of ordinati) {
    if (prestitiAperti?.has?.(pezzo.id)) inPrestito.push(pezzo);
    else if (tipo === 'acar' && revisioneScaduta(pezzo, oggi)) scaduti.push(pezzo);
    else disponibili.push(pezzo);
  }
  return { disponibili, inPrestito, scaduti };
}

/** Prestiti aperti di un corsista, dal più recente. */
export function prestitiDelCorsista(prestiti = [], corsistaRif) {
  if (!corsistaRif) return [];
  return (prestiti ?? [])
    .filter((p) => p?.corsista_rif === corsistaRif)
    .sort((a, b) => String(b.delivered_at ?? '').localeCompare(String(a.delivered_at ?? '')));
}

/**
 * Date «Consegna / Restituzione attrezzatura» del corsista, aggiornate da sole:
 * alla consegna si scrive la data di consegna (se vuota) e si toglie quella di
 * restituzione; al rientro dell'ultimo pezzo si scrive la data di restituzione.
 * Restano sempre modificabili a mano. Ritorna solo i campi da cambiare.
 */
export function dateAttrezzatura(studente, evento, { aperti = 0, oggi = new Date() } = {}) {
  const giorno = oggiIso(oggi);
  const cambi = {};
  if (evento === 'consegna') {
    if (!studente?.equipmentDelivery) cambi.equipmentDelivery = giorno;
    if (studente?.equipmentReturn) cambi.equipmentReturn = '';
  } else if (evento === 'rientro' && aperti === 0) {
    if (studente?.equipmentReturn !== giorno) cambi.equipmentReturn = giorno;
  }
  return cambi;
}

/** Tessera del socio con lo stesso nome del corsista (il corsista è anche socio). */
export function tesseraPerNome(soci = [], nome = '') {
  const chiave = String(nome).trim().toLocaleLowerCase('it');
  if (!chiave) return null;
  const socio = (soci ?? []).find((s) => String(s?.full_name ?? '').trim().toLocaleLowerCase('it') === chiave);
  return socio ? socio.old_id ?? socio.membership_number ?? null : null;
}
