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

function stessaChiave(attuale, attesa) {
  if (!attuale) return true; // il browser non la espone: la diamo per buona
  const a = new Uint8Array(attuale);
  if (a.length !== attesa.length) return false;
  return a.every((byte, i) => byte === attesa[i]);
}

function entro(ms, promessa, messaggio) {
  return Promise.race([
    promessa,
    new Promise((_, reject) => setTimeout(() => reject(new Error(messaggio)), ms)),
  ]);
}

/** Registrazione del service worker già attiva (serve per iscriversi alle push). */
async function registrazioneAttiva() {
  const esistente = await navigator.serviceWorker.getRegistration();
  if (!esistente) await navigator.serviceWorker.register('/sw.js');
  return entro(
    15000,
    navigator.serviceWorker.ready,
    'Il componente delle notifiche non si è avviato. Ricarica la pagina e riprova.',
  );
}

/** Traduce gli errori del browser in un messaggio comprensibile. */
export function messaggioErrorePush(errore) {
  const nome = errore?.name ?? '';
  const testo = String(errore?.message ?? errore ?? '');
  if (nome === 'NotAllowedError' || /permission|denied/i.test(testo)) {
    return 'Le notifiche sono bloccate per questo sito: riattivale dalle impostazioni del browser (lucchetto accanto all\'indirizzo → Notifiche → Consenti).';
  }
  if (nome === 'AbortError' || /push service|registration failed/i.test(testo)) {
    return 'Il servizio di notifiche del telefono non ha risposto. Riprova tra poco; se l\'errore resta, su questo dispositivo le notifiche web non sono disponibili (succede per esempio sui telefoni senza servizi Google): usa l\'email.';
  }
  if (nome === 'InvalidStateError') {
    return 'Il browser aveva un\'iscrizione vecchia alle notifiche. Ricarica la pagina e riprova.';
  }
  return `Impossibile attivare le notifiche${testo ? ` (${testo})` : ''}.`;
}

/** Iscrizione di questo dispositivo, se c'è. */
export async function iscrizioneCorrente() {
  if (!pushSupportato()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

export async function attivaPushQui() {
  if (!pushSupportato()) throw new Error('Questo browser non supporta le notifiche.');
  const permesso = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (permesso !== 'granted') {
    throw new Error(
      permesso === 'denied'
        ? 'Le notifiche sono bloccate per questo sito: riattivale dalle impostazioni del browser (lucchetto accanto all\'indirizzo → Notifiche → Consenti).'
        : 'Permesso non concesso.',
    );
  }

  let sub;
  try {
    const reg = await registrazioneAttiva();
    const chiave = chiaveInBytes(VAPID_PUBLIC_KEY);
    sub = await reg.pushManager.getSubscription();
    // Un'iscrizione fatta con un'altra chiave non riceverebbe nulla: si rifà.
    if (sub && !stessaChiave(sub.options?.applicationServerKey, chiave)) {
      await sub.unsubscribe();
      sub = null;
    }
    if (!sub) {
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chiave });
    }
  } catch (pushError) {
    console.warn('[Avvisi] iscrizione push non riuscita:', pushError);
    throw new Error(messaggioErrorePush(pushError));
  }

  const json = sub.toJSON();
  const { error } = await supabase.rpc('push_registra', {
    p_endpoint: json.endpoint,
    p_p256dh: json.keys?.p256dh,
    p_auth: json.keys?.auth,
    p_user_agent: navigator.userAgent,
  });
  if (error) {
    console.warn('[Avvisi] registrazione dispositivo non riuscita:', error);
    throw new Error(`Notifiche attivate sul dispositivo ma non salvate sul server: ${error.message}`);
  }
}

export async function disattivaPushQui() {
  const sub = await iscrizioneCorrente();
  if (!sub) return;
  const { error } = await supabase.rpc('push_rimuovi', { p_endpoint: sub.endpoint });
  if (error) throw error;
  await sub.unsubscribe();
}
