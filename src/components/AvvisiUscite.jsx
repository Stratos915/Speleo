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

// Preferenze degli avvisi: email sì/no e notifiche su questo dispositivo.
// Si apre dal pulsante «🔔 Avvisi» nell'intestazione (variante "pannello").
// Valgono per nuove uscite, uscite modificate o annullate e promemoria prestiti.
// Se la migrazione 09 non c'è ancora, il pannello lo dice e non mostra comandi.

export default function AvvisiUscite({ variante = 'card' }) {
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
      setMessaggio(valore ? 'Riceverai gli avvisi anche per email.' : 'Email disattivate.');
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

  const Contenitore = variante === 'pannello' ? 'div' : 'article';
  const classe = variante === 'pannello' ? 'avvisi avvisi--pannello' : 'card avvisi';

  if (!pronto) {
    return variante === 'pannello' ? (
      <div className={classe}>
        <p className="avvisi-nota">Caricamento…</p>
      </div>
    ) : null;
  }
  if (!disponibile) {
    return variante === 'pannello' ? (
      <div className={classe}>
        <p className="avvisi-nota">Gli avvisi non sono ancora disponibili.</p>
      </div>
    ) : null;
  }

  return (
    <Contenitore className={classe}>
      <h3>🔔 Avvisi</h3>
      <p className="avvisi-nota">
        Ti avvisiamo entro mezz&apos;ora quando un&apos;uscita viene aggiunta, modificata o annullata, e il giorno
        prima della riconsegna di un materiale che hai in prestito.
      </p>

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
    </Contenitore>
  );
}
