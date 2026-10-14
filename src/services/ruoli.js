import { supabase } from '../lib/supabaseClient';

// Ruoli nell'app delle persone di un'uscita (migrazione 16, profili_dei_soci).
// L'anagrafica ha una riga per anno: la funzione trova il profilo della stessa
// persona anche partendo da una riga senza email.

/**
 * @returns {{ perSocio: Map<string, string[]>, perUtente: Map<string, string[]> }}
 * Mappe vuote se la migrazione 16 non c'è o in caso di errore.
 */
export async function getRuoliSoci(memberIds = [], userIds = []) {
  const vuoto = { perSocio: new Map(), perUtente: new Map() };
  const soci = [...new Set(memberIds.filter(Boolean).map(String))];
  const utenti = [...new Set(userIds.filter(Boolean).map(String))];
  if (!soci.length && !utenti.length) return vuoto;
  const { data, error } = await supabase.rpc('profili_dei_soci', { p_member_ids: soci, p_user_ids: utenti });
  if (error) return vuoto;
  for (const riga of data ?? []) {
    if (riga.member_id) vuoto.perSocio.set(String(riga.member_id), riga.ruoli ?? []);
    if (riga.user_id) vuoto.perUtente.set(String(riga.user_id), riga.ruoli ?? []);
  }
  return vuoto;
}

/** Ruoli del responsabile, dei partecipanti e di chi ha risposto. */
export function getRuoliUscita(uscita, adesioni) {
  const risposte = adesioni?.risposte ?? [];
  return getRuoliSoci(
    [...(uscita?.participants_ids ?? []), uscita?.responsabile_id, ...risposte.map((r) => r.member_id)],
    risposte.map((r) => r.user_id),
  );
}
