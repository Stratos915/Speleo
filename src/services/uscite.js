import { supabase } from '../lib/supabaseClient';

const TABLE = 'uscite';
const SELECT_FIELDS = '*';

export async function getUscite() {
  const { data, error } = await supabase.from(TABLE).select(SELECT_FIELDS).order('data', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getUscitaById(id) {
  const { data, error } = await supabase.from(TABLE).select(SELECT_FIELDS).eq('id', id).single();
  if (error) throw error;
  return data;
}

export async function createUscita(payload) {
  const { data, error } = await supabase.from(TABLE).insert(payload).select(SELECT_FIELDS).single();
  if (error) throw error;
  return data;
}

export async function updateUscita(id, payload) {
  const { data, error } = await supabase.from(TABLE).update(payload).eq('id', id).select(SELECT_FIELDS).single();
  if (error) throw error;
  return data;
}

export async function deleteUscita(id) {
  const { error } = await supabase.from(TABLE).delete().eq('id', id);
  if (error) throw error;
}
