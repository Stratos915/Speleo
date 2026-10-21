import { supabase } from '../lib/supabaseClient';

// Materiale della scuola diviso per sacco (migrazione 19).
// Le tabelle sono protette dal database: i soci semplici non le leggono.

const SACCHI = 'scuola_sacchi';
const MATERIALE = 'scuola_sacchi_materiale';

export class MigrazioneSacchiMancante extends Error {
  constructor() {
    super('Esegui la migrazione 19 (sacchi della scuola) per usare questa sezione.');
    this.name = 'MigrazioneSacchiMancante';
  }
}

function controlla(error) {
  if (!error) return;
  // Tabella non ancora creata (dal database o dall'API).
  if (['42P01', 'PGRST205'].includes(error.code)) throw new MigrazioneSacchiMancante();
  if (error.code === '23505') throw new Error('Esiste già un sacco con questo numero.');
  if (error.code === '42501') throw new Error('Non hai i permessi per modificare il materiale della scuola.');
  throw new Error(error.message ?? 'Operazione non riuscita.');
}

function vuotoANull(valore) {
  const testo = String(valore ?? '').trim();
  return testo ? testo : null;
}

/** Sacchi in ordine di numero, ognuno con i suoi pezzi. */
export async function getSacchi() {
  const [{ data: sacchi, error: erroreSacchi }, { data: pezzi, error: errorePezzi }] = await Promise.all([
    supabase.from(SACCHI).select('*').order('numero', { ascending: true }),
    supabase.from(MATERIALE).select('*').order('posizione', { ascending: true }).order('created_at', { ascending: true }),
  ]);
  controlla(erroreSacchi);
  controlla(errorePezzi);
  const perSacco = new Map();
  for (const pezzo of pezzi ?? []) {
    const lista = perSacco.get(pezzo.sacco_id) ?? [];
    lista.push(pezzo);
    perSacco.set(pezzo.sacco_id, lista);
  }
  return (sacchi ?? []).map((sacco) => ({ ...sacco, materiale: perSacco.get(sacco.id) ?? [] }));
}

function datiSacco(valori) {
  return {
    numero: Number(valori.numero),
    consegnato_a: vuotoANull(valori.consegnato_a),
    consegnato_il: vuotoANull(valori.consegnato_il),
    note: vuotoANull(valori.note),
  };
}

export async function creaSacco(valori) {
  const { data, error } = await supabase.from(SACCHI).insert(datiSacco(valori)).select().single();
  controlla(error);
  return data;
}

/** Crea più sacchi vuoti con i numeri indicati (per preparare un corso). */
export async function creaSacchiNumerati(numeri) {
  if (!numeri.length) return [];
  const { data, error } = await supabase
    .from(SACCHI)
    .insert(numeri.map((numero) => ({ numero })))
    .select();
  controlla(error);
  return data ?? [];
}

export async function aggiornaSacco(id, valori) {
  const { error } = await supabase.from(SACCHI).update(datiSacco(valori)).eq('id', id);
  controlla(error);
}

/** Elimina il sacco e il suo elenco di materiale. */
export async function eliminaSacco(id) {
  const { error } = await supabase.from(SACCHI).delete().eq('id', id);
  controlla(error);
}

function datiPezzo(valori) {
  const scheda = vuotoANull(valori.scheda_url);
  if (scheda && !/^https?:\/\//i.test(scheda)) {
    throw new Error('Il link alla scheda d\'ispezione deve iniziare con http:// o https://');
  }
  const quantita = Number(valori.quantita || 1);
  return {
    nome: String(valori.nome ?? '').trim(),
    quantita: Number.isFinite(quantita) && quantita > 0 ? Math.round(quantita) : 1,
    matricola: vuotoANull(valori.matricola),
    scheda_url: scheda,
    prossima_ispezione: vuotoANull(valori.prossima_ispezione),
    fine_vita: vuotoANull(valori.fine_vita),
    note: vuotoANull(valori.note),
  };
}

export async function aggiungiPezzo(saccoId, valori, posizione = 0) {
  const dati = datiPezzo(valori);
  if (!dati.nome) throw new Error('Scrivi il nome del materiale.');
  const { error } = await supabase.from(MATERIALE).insert({ ...dati, sacco_id: saccoId, posizione });
  controlla(error);
}

export async function aggiornaPezzo(id, valori) {
  const dati = datiPezzo(valori);
  if (!dati.nome) throw new Error('Scrivi il nome del materiale.');
  const { error } = await supabase.from(MATERIALE).update(dati).eq('id', id);
  controlla(error);
}

export async function eliminaPezzo(id) {
  const { error } = await supabase.from(MATERIALE).delete().eq('id', id);
  controlla(error);
}

/**
 * Copia l'elenco di un sacco in un altro: nome, quantità e note.
 * Matricola, scheda d'ispezione e date restano vuote, perché ogni pezzo ha le sue.
 */
export async function copiaElenco(daSacco, aSaccoId, posizioneIniziale = 0) {
  const righe = (daSacco.materiale ?? []).map((pezzo, indice) => ({
    sacco_id: aSaccoId,
    nome: pezzo.nome,
    quantita: pezzo.quantita ?? 1,
    note: pezzo.note ?? null,
    posizione: posizioneIniziale + indice,
  }));
  if (!righe.length) return 0;
  const { error } = await supabase.from(MATERIALE).insert(righe);
  controlla(error);
  return righe.length;
}
