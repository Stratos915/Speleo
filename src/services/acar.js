import { supabase } from '../lib/supabaseClient';
import { datiAcar } from '../utils/acar.js';

// Magazzino ACAR: bombole, erogatori, maschere (migrazione 20).

const TABELLA = 'acar_materiale';

export class MigrazioneAcarMancante extends Error {
  constructor() {
    super('Esegui la migrazione 20 (magazzino ACAR) per usare questa sezione.');
    this.name = 'MigrazioneAcarMancante';
  }
}

function controlla(error) {
  if (!error) return;
  if (['42P01', 'PGRST205'].includes(error.code)) throw new MigrazioneAcarMancante();
  if (error.code === '42501') throw new Error('Non hai i permessi per modificare il magazzino ACAR.');
  if (error.code === '23514') throw new Error('Controlla i valori inseriti (percentuale di ossigeno tra 1 e 100, numeri positivi, link che inizia con https://).');
  throw new Error(error.message ?? 'Operazione non riuscita.');
}

export async function getMaterialeAcar() {
  const { data, error } = await supabase.from(TABELLA).select('*').order('created_at', { ascending: true });
  controlla(error);
  return data ?? [];
}

export async function aggiungiAcar(valori) {
  const { data, error } = await supabase.from(TABELLA).insert(datiAcar(valori)).select().single();
  controlla(error);
  return data;
}

export async function aggiornaAcar(id, valori) {
  const { error } = await supabase.from(TABELLA).update(datiAcar(valori)).eq('id', id);
  controlla(error);
}

export async function eliminaAcar(id) {
  const { error } = await supabase.from(TABELLA).delete().eq('id', id);
  controlla(error);
}
