import { supabase } from '../lib/supabaseClient';

const TABLE = 'activity_logs';

function normalizeUser(user) {
  if (!user) return { id: null, email: null, role: null };
  const role = user.user_metadata?.role ?? user.app_metadata?.role ?? user.raw_user_meta_data?.role ?? null;
  return { id: user.id ?? null, email: user.email ?? null, role };
}

export async function logActivity(entry, user) {
  const { id, email, role } = normalizeUser(user);
  const payload = {
    user_id: id,
    user_email: email,
    user_role: role,
    action: entry.action,
    entity: entry.entity ?? null,
    entity_id: entry.entityId ?? null,
    message: entry.message ?? null,
    details: entry.details ?? null,
  };
  const { error } = await supabase.from(TABLE).insert(payload);
  if (error) throw error;
}

export async function safeLogActivity(entry, user) {
  try {
    await logActivity(entry, user);
  } catch (error) {
    console.warn('[ActivityLogs] impossibile registrare log:', error.message ?? error);
  }
}

export async function getActivityLogs(limit = 500) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}
