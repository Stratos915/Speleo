import { supabase } from '../lib/supabaseClient';

// Adesioni dei soci alle uscite (tabella uscite_partecipazioni, migrazione 09).
// Ogni utente può scrivere solo la propria risposta: lo garantiscono le policy.

const TABLE = 'uscite_partecipazioni';

export const RISPOSTE = [
  { value: 'si', label: 'Partecipo' },
  { value: 'forse', label: 'Forse' },
  { value: 'no', label: 'Non partecipo' },
];

/** Tutte le risposte (senza nomi), per i contatori nel calendario. */
export async function getPartecipazioni() {
  const { data, error } = await supabase.from(TABLE).select('uscita_id,user_id,risposta');
  if (error) throw error;
  return data ?? [];
}

/** Risposte di un'uscita con il nome di chi ha risposto. */
export async function getAdesioniUscita(uscitaId) {
  const { data, error } = await supabase.rpc('uscita_adesioni', { p_uscita: uscitaId });
  if (error) throw error;
  return data ?? [];
}

/** Imposta (o cambia) la risposta dell'utente collegato. */
export async function setMiaPartecipazione(uscitaId, userId, risposta, nota = null) {
  const { error } = await supabase
    .from(TABLE)
    .upsert(
      { uscita_id: uscitaId, user_id: userId, risposta, nota: nota?.trim() || null },
      { onConflict: 'uscita_id,user_id' },
    );
  if (error) throw error;
}

/** Ritira la risposta dell'utente collegato. */
export async function deleteMiaPartecipazione(uscitaId, userId) {
  const { error } = await supabase.from(TABLE).delete().eq('uscita_id', uscitaId).eq('user_id', userId);
  if (error) throw error;
}
