import { supabase } from '../lib/supabaseClient';

const TABLE = 'uscite';
const BASE_FIELDS = 'id,titolo,luogo,data,ora,tipo,responsabile_id,note,created_at';

async function attachResponsabile(records) {
  const list = Array.isArray(records) ? records : records ? [records] : [];
  if (!list.length) {
    return Array.isArray(records) ? [] : null;
  }

  const responsabiliIds = [
    ...new Set(list.map((record) => record?.responsabile_id).filter(Boolean)),
  ];
  if (!responsabiliIds.length) {
    return Array.isArray(records) ? list : list[0];
  }

  const { data: members, error } = await supabase
    .from('members')
    .select('id,full_name')
    .in('id', responsabiliIds);
  if (error) throw error;

  const map = members.reduce((acc, member) => {
    acc[member.id] = member.full_name;
    return acc;
  }, {});

  const enriched = list.map((record) => ({
    ...record,
    responsabile_full_name: map[record.responsabile_id] ?? null,
  }));

  return Array.isArray(records) ? enriched : enriched[0];
}

export async function getUscite() {
  const { data, error } = await supabase.from(TABLE).select(BASE_FIELDS).order('data', { ascending: true });
  if (error) throw error;
  return attachResponsabile(data ?? []);
}

export async function getUscitaById(id) {
  const { data, error } = await supabase.from(TABLE).select(BASE_FIELDS).eq('id', id).single();
  if (error) throw error;
  return attachResponsabile(data);
}

export async function createUscita(payload) {
  const { data, error } = await supabase.from(TABLE).insert(payload).select(BASE_FIELDS).single();
  if (error) throw error;
  return attachResponsabile(data);
}

export async function updateUscita(id, payload) {
  const { data, error } = await supabase.from(TABLE).update(payload).eq('id', id).select(BASE_FIELDS).single();
  if (error) throw error;
  return attachResponsabile(data);
}

export async function deleteUscita(id) {
  const { error } = await supabase.from(TABLE).delete().eq('id', id);
  if (error) throw error;
}
