import { supabase } from '../lib/supabaseClient';

const TABLE = 'members';

function buildFullName(row) {
  if (row.full_name) return row.full_name;
  const itName = [row.nome, row.cognome].filter(Boolean).join(' ').trim();
  if (itName) return itName;
  const enName = [row.first_name, row.last_name].filter(Boolean).join(' ').trim();
  if (enName) return enName;
  return row.display_name ?? row.name ?? row.email ?? 'Socio senza nome';
}

export function normalizeMemberRow(row) {
  if (!row) return row;
  const membershipNumber =
    row.membership_number ?? row.old_id ?? row.numero_tessera ?? row.card_number ?? row.tessera ?? null;
  const resolvedYear =
    row.membership_year ??
    row.year ??
    row.anno ??
    (row.created_at && !Number.isNaN(new Date(row.created_at).getTime())
      ? new Date(row.created_at).getFullYear()
      : null);
  return {
    ...row,
    full_name: buildFullName(row),
    membership_number: membershipNumber,
    old_id: row.old_id ?? membershipNumber,
    membership_paid: Boolean(row.membership_paid),
    membership_year: resolvedYear ?? 2025,
  };
}

export async function getMembers() {
  const { data, error } = await supabase.from(TABLE).select('*');
  if (error) throw error;
  return (data ?? [])
    .map((row) => normalizeMemberRow(row))
    .sort((a, b) => {
      const aNumber = Number(a.membership_number);
      const bNumber = Number(b.membership_number);
      if (!Number.isNaN(aNumber) || !Number.isNaN(bNumber)) {
        if (Number.isNaN(aNumber)) return 1;
        if (Number.isNaN(bNumber)) return -1;
        if (aNumber !== bNumber) return aNumber - bNumber;
      }
      return a.full_name.localeCompare(b.full_name, 'it', { sensitivity: 'base' });
    });
}

export async function createMember(payload) {
  const { data, error } = await supabase.from(TABLE).insert(payload).select('*').single();
  if (error) throw error;
  return normalizeMemberRow(data);
}

export async function bulkCreateMembers(rows) {
  if (!rows?.length) return [];
  const { data, error } = await supabase.from(TABLE).insert(rows).select('*');
  if (error) throw error;
  return (data ?? []).map((row) => normalizeMemberRow(row));
}

export async function updateMember(id, payload) {
  const { data, error } = await supabase.from(TABLE).update(payload).eq('id', id).select('*').single();
  if (error) throw error;
  return normalizeMemberRow(data);
}

export async function deleteMember(id) {
  const { error } = await supabase.from(TABLE).delete().eq('id', id);
  if (error) throw error;
}
