import { supabase } from '../lib/supabaseClient';

const TABLE = 'library_loans';
const SELECT_FIELDS =
  'id, book_id, borrower_name, borrower_contact, notes, status, loaned_at, returned_at, created_at, updated_at';

export async function getLibraryLoans() {
  const { data, error } = await supabase
    .from(TABLE)
    .select(SELECT_FIELDS)
    .order('loaned_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createLibraryLoan(payload) {
  const { data, error } = await supabase.from(TABLE).insert(payload).select(SELECT_FIELDS).single();
  if (error) throw error;
  return data;
}

export async function completeLibraryLoan(id) {
  const { data, error } = await supabase
    .from(TABLE)
    .update({ status: 'returned', returned_at: new Date().toISOString() })
    .eq('id', id)
    .select(SELECT_FIELDS)
    .single();
  if (error) throw error;
  return data;
}
