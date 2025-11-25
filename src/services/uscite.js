import { supabase } from '../lib/supabaseClient';

const TABLE = 'uscite';

export async function getUscite() {
  // TODO: assicurarsi che la tabella "uscite" sia disponibile su Supabase prima del deploy.
  const { data, error } = await supabase.from(TABLE).select('*').order('data', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function createUscita(payload) {
  const { data, error } = await supabase.from(TABLE).insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function updateUscita(id, payload) {
  const { data, error } = await supabase.from(TABLE).update(payload).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteUscita(id) {
  const { error } = await supabase.from(TABLE).delete().eq('id', id);
  if (error) throw error;
}
