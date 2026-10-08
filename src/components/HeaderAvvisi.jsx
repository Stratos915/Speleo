import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import AvvisiUscite from './AvvisiUscite.jsx';

// Pulsante «🔔 Avvisi» nell'intestazione, sotto ruolo e nome del socio.
// Apre un pannello con le preferenze (email e notifiche sul dispositivo).

export default function HeaderAvvisi() {
  const contenitore = useRef(null);
  const { pathname } = useLocation();
  // Il pannello resta aperto solo sulla pagina in cui è stato aperto.
  const [apertoSu, setApertoSu] = useState(null);
  const aperto = apertoSu === pathname;
  const setAperto = (valore) =>
    setApertoSu((attuale) => {
      const prossimo = typeof valore === 'function' ? valore(attuale === pathname) : valore;
      return prossimo ? pathname : null;
    });

  // Si chiude premendo Esc o toccando fuori dal pannello.
  useEffect(() => {
    if (!aperto) return undefined;
    function fuori(event) {
      if (contenitore.current && !contenitore.current.contains(event.target)) setApertoSu(null);
    }
    function esc(event) {
      if (event.key === 'Escape') setApertoSu(null);
    }
    document.addEventListener('pointerdown', fuori);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', fuori);
      document.removeEventListener('keydown', esc);
    };
  }, [aperto]);

  return (
    <div className="header-avvisi" ref={contenitore}>
      <button
        type="button"
        className="header-avvisi__toggle"
        aria-expanded={aperto}
        aria-controls="pannello-avvisi"
        onClick={() => setAperto((valore) => !valore)}
      >
        🔔 Avvisi
      </button>
      {aperto && (
        <div id="pannello-avvisi" className="header-avvisi__pannello" role="dialog" aria-label="Avvisi">
          <AvvisiUscite variante="pannello" />
        </div>
      )}
    </div>
  );
}
