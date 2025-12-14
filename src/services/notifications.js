import { supabase } from '../lib/supabaseClient';

const MOCK_NOTIFICATIONS = [
  {
    id: 'notif-1',
    audience: 'admin',
    roles: ['admin', 'presidente'],
    type: 'warning',
    title: 'Uscite senza responsabile',
    message: '2 uscite prossime entro la settimana non hanno responsabile.',
    link: '/uscite',
  },
  {
    id: 'notif-2',
    audience: 'user',
    user_id: 'demo-user',
    type: 'info',
    title: 'Libro in restituzione',
    message: 'Ricordati di riportare “Manuale CAI” entro il 15/03.',
    link: '/biblioteca',
  },
];

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
    console.warn('[notifications] fallback to mock:', error.message ?? error);
    return MOCK_NOTIFICATIONS.map(normalizeRow);
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
