import { supabase } from '../lib/supabaseClient';

const MOCK_NOTIFICATIONS = [];

function normalizeRow(row) {
  return {
    id: row.id,
    audience: row.audience ?? 'user',
    type: row.type ?? 'info',
    title: row.title ?? 'Notifica',
    message: row.message ?? '',
    link: row.link ?? null,
    roles: row.target_role ? [row.target_role] : null,
    user_id: row.user_id ?? null,
    due_date: row.due_date,
    meta: row.meta ?? null,
    sent_email_at: row.sent_email_at,
    seen_at: row.seen_at,
  };
}

export async function fetchNotifications({ role, userId } = {}) {
  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    return (data ?? []).map(normalizeRow);
  } catch (error) {
    console.warn('[notifications] impossibile leggere le notifiche:', error.message ?? error);
    return [];
  }
}

export async function markNotificationSeen(notificationId) {
  try {
    const { error } = await supabase
      .from('notifications')
      .update({ seen_at: new Date().toISOString() })
      .eq('id', notificationId);
    if (error) throw error;
  } catch (error) {
    console.warn('[notifications] impossibile aggiornare la notifica:', error.message ?? error);
  }
}

export async function fetchAlertCounts() {
  try {
    const [{ count: activeLoans }, { count: activeLibraryLoans }] = await Promise.all([
      supabase.from('loans').select('id', { count: 'exact', head: true }).eq('status', 'in_corso'),
      supabase.from('library_loans').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    ]);
    return {
      activeLoans: activeLoans ?? 0,
      activeLibraryLoans: activeLibraryLoans ?? 0,
    };
  } catch (error) {
    console.warn('[notifications] impossibile leggere i conteggi alert:', error?.message ?? error);
    return { activeLoans: 0, activeLibraryLoans: 0 };
  }
}
