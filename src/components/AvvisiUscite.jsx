import { useEffect, useState } from 'react';
import useAuth from '../context/useAuth.js';
import {
  attivaPushQui,
  disattivaPushQui,
  getPreferenze,
  iosSenzaInstallazione,
  iscrizioneCorrente,
  pushSupportato,
  salvaPreferenze,
} from '../services/avvisi.js';

// Riquadro «Avvisi nuove uscite» della Dashboard: email sì/no e notifiche
// su questo dispositivo. Se la migrazione 09 non c'è ancora, non compare.

export default function AvvisiUscite() {
  const { user } = useAuth();
  const [pronto, setPronto] = useState(false);
  const [disponibile, setDisponibile] = useState(true);
  const [email, setEmail] = useState(true);
  const [pushQui, setPushQui] = useState(false);
  const [lavoro, setLavoro] = useState(false);
  const [messaggio, setMessaggio] = useState('');
  const [errore, setErrore] = useState('');

  const supportato = pushSupportato();
  const iosDaInstallare = iosSenzaInstallazione();

  useEffect(() => {
    if (!user) return undefined;
    let ignore = false;
    (async () => {
      try {
        const pref = await getPreferenze(user.id);
        const sub = await iscrizioneCorrente().catch(() => null);
        if (ignore) return;
        setEmail(pref.email);
        setPushQui(Boolean(sub) && Notification.permission === 'granted');
      } catch (loadError) {
        console.warn('[Avvisi] Non disponibili:', loadError?.message ?? loadError);
        if (!ignore) setDisponibile(false);
      } finally {
        if (!ignore) setPronto(true);
      }
    })();
    return () => {
      ignore = true;
    };
  }, [user]);

  async function cambiaEmail(valore) {
    setLavoro(true);
    setErrore('');
    setMessaggio('');
    try {
      await salvaPreferenze(user.id, { email: valore });
      setEmail(valore);
      setMessaggio(valore ? 'Riceverai un\'email per ogni nuova uscita.' : 'Email disattivate.');
    } catch (saveError) {
      setErrore(saveError.message ?? 'Impossibile salvare.');
    } finally {
      setLavoro(false);
    }
  }

  async function cambiaPush() {
    setLavoro(true);
    setErrore('');
    setMessaggio('');
    try {
      if (pushQui) {
        await disattivaPushQui();
        setPushQui(false);
        setMessaggio('Notifiche disattivate su questo dispositivo.');
      } else {
        await attivaPushQui();
        setPushQui(true);
        setMessaggio('Notifiche attive su questo dispositivo.');
      }
    } catch (pushError) {
      setErrore(pushError.message ?? 'Operazione non riuscita.');
    } finally {
      setLavoro(false);
    }
  }

  if (!pronto || !disponibile) return null;

  return (
    <article className="card avvisi">
      <h3>🔔 Avvisi nuove uscite</h3>
      <p className="avvisi-nota">Quando viene aggiunta un&apos;uscita al calendario ti avvisiamo entro mezz&apos;ora.</p>

      <label className="avvisi-riga">
        <input type="checkbox" checked={email} disabled={lavoro} onChange={(event) => cambiaEmail(event.target.checked)} />
        <span>Ricevi un&apos;email</span>
      </label>

      <div className="avvisi-riga">
        {supportato && !iosDaInstallare ? (
          <>
            <button type="button" className={pushQui ? 'pill-button' : ''} disabled={lavoro} onClick={cambiaPush}>
              {pushQui ? 'Disattiva notifiche su questo dispositivo' : 'Attiva notifiche su questo dispositivo'}
            </button>
            {pushQui && <span className="avvisi-ok">✓ attive qui</span>}
          </>
        ) : (
          <p className="avvisi-nota">
            {iosDaInstallare
              ? 'Su iPhone le notifiche funzionano con l\'app aggiunta alla schermata Home (Condividi → «Aggiungi alla schermata Home»), poi riapri l\'app da lì.'
              : 'Questo browser non supporta le notifiche: usa l\'email, oppure apri l\'app da Chrome, Edge, Firefox o Safari aggiornati.'}
          </p>
        )}
      </div>

      {messaggio && <p className="avvisi-ok">{messaggio}</p>}
      {errore && <p className="avvisi-errore">{errore}</p>}
    </article>
  );
}
