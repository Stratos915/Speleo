import { supabase } from '../lib/supabaseClient';

const TABLE = 'uscite';
// La select include l'alias "responsabile" per recuperare il nome del socio collegato via FK.
const USCITE_SELECT =
  'id,titolo,luogo,data,ora,tipo,responsabile_id,note,created_at,responsabile:members!uscite_responsabile_id_fkey(id,full_name)';

function withResponsabile(data) {
  if (!data) return data;
  return {
    ...data,
    responsabile_full_name: data.responsabile?.full_name ?? null,
  };
}

export async function getUscite() {
  const { data, error } = await supabase.from(TABLE).select(USCITE_SELECT).order('data', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(withResponsabile);
}

export async function getUscitaById(id) {
  const { data, error } = await supabase.from(TABLE).select(USCITE_SELECT).eq('id', id).single();
  if (error) throw error;
  return withResponsabile(data);
}

export async function createUscita(payload) {
  const { data, error } = await supabase.from(TABLE).insert(payload).select(USCITE_SELECT).single();
  if (error) throw error;
  return withResponsabile(data);
}

export async function updateUscita(id, payload) {
  const { data, error } = await supabase.from(TABLE).update(payload).eq('id', id).select(USCITE_SELECT).single();
  if (error) throw error;
  return withResponsabile(data);
}

export async function deleteUscita(id) {
  const { error } = await supabase.from(TABLE).delete().eq('id', id);
  if (error) throw error;
}
