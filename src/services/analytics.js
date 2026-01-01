import { supabase } from '../lib/supabaseClient';

const ANALYTICS_TRACKING_INTERVAL_MS = 60_000;

export async function trackPageView({ page, user }) {
  if (!page) return;
  const payload = {
    page,
    event: 'page_view',
    user_id: user?.id ?? null,
    user_email: user?.email ?? null,
    meta: {
      user_agent: typeof window !== 'undefined' ? window.navigator.userAgent : null,
    },
  };
  const { error } = await supabase.from('analytics_events').insert(payload);
  if (error) throw error;
}

export async function pingUserSession({ user, extra = {} }) {
  if (!user?.id) return;
  const payload = {
    user_id: user.id,
    user_email: user.email,
    last_seen_at: new Date().toISOString(),
    client_info: {
      user_agent: typeof window !== 'undefined' ? window.navigator.userAgent : null,
      locale: typeof window !== 'undefined' ? window.navigator.language : null,
      ...extra,
    },
  };
  const { error } = await supabase.from('user_sessions').upsert(payload, { onConflict: 'user_id' });
  if (error) throw error;
}

export function startPresencePing({ user, extra }) {
  if (!user?.id) return () => {};
  pingUserSession({ user, extra }).catch((error) => console.error('[Analytics] ping failed', error));
  const timer = setInterval(() => {
    pingUserSession({ user, extra }).catch((error) => console.error('[Analytics] ping failed', error));
  }, ANALYTICS_TRACKING_INTERVAL_MS);
  return () => {
    clearInterval(timer);
  };
}

export async function fetchDailyVisits({ days = 30 } = {}) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase.rpc('analytics_visits_by_day', { since_param: since });
  if (error) throw error;
  return data ?? [];
}

export async function fetchActiveUsers({ minutes = 2 } = {}) {
  const since = new Date(Date.now() - minutes * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('user_sessions')
    .select('user_email, last_seen_at, client_info')
    .gte('last_seen_at', since)
    .order('last_seen_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}
