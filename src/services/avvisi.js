import { supabase } from '../lib/supabaseClient';

// Avvisi ai soci per le nuove uscite (migrazione 09).
// - Preferenza email: tabella notifica_preferenze (senza riga = attiva).
// - Notifiche sul dispositivo: iscrizione push registrata con push_registra.
// Gli avvisi li invia il job notification-cron, non il browser.

// Chiave pubblica VAPID: è pubblica per definizione, la privata sta solo sul server.
export const VAPID_PUBLIC_KEY =
  'BPd9kUGice3cEMjhNclo3N9BS6gvUA2PFOocFEvEjrG8kIfo1INOldgNrXHp3a406RfGEtVisYKJFd9SEoxcpW0';

export async function getPreferenze(userId) {
  const { data, error } = await supabase
    .from('notifica_preferenze')
    .select('email, push')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return { email: data?.email ?? true, push: data?.push ?? true };
}

export async function salvaPreferenze(userId, preferenze) {
  const { error } = await supabase
    .from('notifica_preferenze')
    .upsert({ user_id: userId, ...preferenze, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  if (error) throw error;
}

/** Il browser sa ricevere notifiche push? */
export function pushSupportato() {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/** iPhone/iPad: le notifiche arrivano solo con l'app aggiunta alla schermata Home. */
export function iosSenzaInstallazione() {
  if (typeof window === 'undefined') return false;
  const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const installata = window.navigator.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches;
  return ios && !installata;
}

function chiaveInBytes(base64Url) {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

async function registrazione() {
  const esistente = await navigator.serviceWorker.getRegistration();
  return esistente ?? navigator.serviceWorker.register('/sw.js');
}

/** Iscrizione di questo dispositivo, se c'è. */
export async function iscrizioneCorrente() {
  if (!pushSupportato()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

export async function attivaPushQui() {
  const permesso = await Notification.requestPermission();
  if (permesso !== 'granted') {
    throw new Error(
      permesso === 'denied'
        ? 'Le notifiche sono bloccate per questo sito: riattivale dalle impostazioni del browser.'
        : 'Permesso non concesso.',
    );
  }
  const reg = await registrazione();
  await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chiaveInBytes(VAPID_PUBLIC_KEY) }));
  const json = sub.toJSON();
  const { error } = await supabase.rpc('push_registra', {
    p_endpoint: json.endpoint,
    p_p256dh: json.keys?.p256dh,
    p_auth: json.keys?.auth,
    p_user_agent: navigator.userAgent,
  });
  if (error) throw error;
}

export async function disattivaPushQui() {
  const sub = await iscrizioneCorrente();
  if (!sub) return;
  const { error } = await supabase.rpc('push_rimuovi', { p_endpoint: sub.endpoint });
  if (error) throw error;
  await sub.unsubscribe();
}
