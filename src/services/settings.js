import { supabase } from '../lib/supabaseClient';

export async function getSetting(key) {
  const { data, error } = await supabase.from('app_settings').select('value').eq('key', key).maybeSingle();
  if (error) throw error;
  return data?.value ?? null;
}

export async function setSetting(key, value, user) {
  const { error } = await supabase.from('app_settings').upsert(
    {
      key,
      value,
      updated_at: new Date().toISOString(),
      updated_by: user?.id ?? null,
    },
    { onConflict: 'key' },
  );
  if (error) throw error;
}
