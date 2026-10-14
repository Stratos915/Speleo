import { supabase } from '../lib/supabaseClient';

// Adesioni alle uscite («Partecipo · Forse · No»), migrazione 15.

export const RISPOSTE = [
  { value: 'si', label: 'Partecipo', breve: 'Ci sono' },
  { value: 'forse', label: 'Forse', breve: 'Forse' },
  { value: 'no', label: 'No', breve: 'Non vengo' },
];

/** True se l'errore indica che la migrazione 15 non è ancora stata eseguita. */
export function adesioniNonAttive(error) {
  const code = error?.code ?? '';
  return code === 'PGRST202' || code === 'PGRST205' || code === '42P01' || code === '42883';
}

export async function rispondiUscita(uscitaId, risposta) {
  const { data, error } = await supabase.rpc('uscita_rispondi', { p_uscita: uscitaId, p_risposta: risposta });
  if (error) throw error;
  dimenticaMieAdesioni();
  return data;
}

/** Risposta da link personale (email o notifica), anche senza accesso. */
export async function rispondiConLink(token, risposta = null) {
  const { data, error } = await supabase.rpc('uscita_rispondi_token', { p_token: token, p_risposta: risposta });
  if (error) throw error;
  dimenticaMieAdesioni();
  return data;
}

/** { risposte: [{ user_id, member_id, nome, risposta, updated_at }], senza_risposta } */
export async function getAdesioni(uscitaId) {
  const { data, error } = await supabase.rpc('uscita_adesioni', { p_uscita: uscitaId });
  if (error) throw error;
  return data ?? { risposte: [], senza_risposta: 0 };
}

// Le mie risposte (uscita → risposta), condivise da tutte le righe del calendario.
let cache = null;

export function dimenticaMieAdesioni() {
  cache = null;
}

export function getMieAdesioni(userId) {
  if (!userId) return Promise.resolve(new Map());
  if (cache && cache.userId === userId && Date.now() - cache.at < 60_000) return cache.promise;
  const promise = supabase
    .from('uscite_adesioni')
    .select('uscita_id, risposta')
    .eq('user_id', userId)
    .then(({ data, error }) => {
      if (error) return new Map();
      return new Map((data ?? []).map((row) => [row.uscita_id, row.risposta]));
    });
  cache = { userId, at: Date.now(), promise };
  return promise;
}
