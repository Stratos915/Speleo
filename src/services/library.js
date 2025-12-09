import { supabase } from '../lib/supabaseClient';

const TABLE = 'library_books';
const SELECT_FIELDS =
  'id, code, title, author, topic, shelf_position, notes, status, borrower_name, borrower_contact, loan_notes, loaned_at, created_at, updated_at';

export async function getLibraryBooks() {
  const { data, error } = await supabase.from(TABLE).select(SELECT_FIELDS).order('title', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function createLibraryBook(payload) {
  const { data, error } = await supabase.from(TABLE).insert(payload).select(SELECT_FIELDS).single();
  if (error) throw error;
  return data;
}

export async function updateLibraryBook(id, payload) {
  const { data, error } = await supabase.from(TABLE).update(payload).eq('id', id).select(SELECT_FIELDS).single();
  if (error) throw error;
  return data;
}

export async function deleteLibraryBook(id) {
  const { error } = await supabase.from(TABLE).delete().eq('id', id);
  if (error) throw error;
}
