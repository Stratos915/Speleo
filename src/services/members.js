import { supabase } from '../lib/supabaseClient';

const TABLE = 'members';

export async function getMembers() {
  const { data, error } = await supabase.from(TABLE).select('*').order('full_name', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function createMember(payload) {
  const { data, error } = await supabase.from(TABLE).insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function updateMember(id, payload) {
  const { data, error } = await supabase.from(TABLE).update(payload).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteMember(id) {
  const { error } = await supabase.from(TABLE).delete().eq('id', id);
  if (error) throw error;
}
