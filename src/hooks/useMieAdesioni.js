import { useEffect, useState } from 'react';
import useAuth from '../context/useAuth.js';
import { getMieAdesioni } from '../services/adesioni.js';

/** Mappa uscita → mia risposta («si», «forse», «no»). Vuota se le adesioni non sono attive. */
export default function useMieAdesioni() {
  const { user } = useAuth();
  const [mappa, setMappa] = useState(() => new Map());

  useEffect(() => {
    let ignore = false;
    getMieAdesioni(user?.id).then((risultato) => {
      if (!ignore) setMappa(risultato);
    });
    return () => {
      ignore = true;
    };
  }, [user?.id]);

  return mappa;
}
