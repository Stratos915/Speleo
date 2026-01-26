import { supabase } from '../lib/supabaseClient';

const TABLE = 'member_purchases';

function normalizePurchase(row) {
  if (!row) return row;
  return {
    ...row,
    quantity: Number(row.quantity ?? 1),
    payment_status: row.payment_status ?? 'unpaid',
    status: row.status ?? 'ordered',
    purchase_year: Number(row.purchase_year) || new Date().getFullYear(),
  };
}

export async function getMemberPurchases() {
  const { data, error } = await supabase.from(TABLE).select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => normalizePurchase(row));
}

export async function createMemberPurchase(payload) {
  const { data, error } = await supabase.from(TABLE).insert(payload).select('*').single();
  if (error) throw error;
  return normalizePurchase(data);
}

export async function updateMemberPurchase(id, payload) {
  const { data, error } = await supabase.from(TABLE).update(payload).eq('id', id).select('*').single();
  if (error) throw error;
  return normalizePurchase(data);
}

export async function deleteMemberPurchase(id) {
  const { error } = await supabase.from(TABLE).delete().eq('id', id);
  if (error) throw error;
}
