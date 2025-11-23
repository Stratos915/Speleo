import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

export default function UscitaDettaglio() {
  const { id } = useParams();
  const [uscita, setUscita] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDettaglio();
  }, [id]);

  async function loadDettaglio() {
    const { data, error } = await supabase
      .from('uscite')
      .select('*')
      .eq('id', id)
      .single();
    if (!error) {
      setUscita(data);
    }
    setLoading(false);
  }

  if (loading) return <p>Caricamento uscita...</p>;
  if (!uscita) return <p>Uscita non trovata.</p>;

  return (
    <section>
      <h1>{uscita.titolo}</h1>
      <p>Luogo: {uscita.luogo}</p>
      <p>Data: {uscita.data && new Date(uscita.data).toLocaleString()}</p>
      <p>Tipo: {uscita.tipo}</p>
      <p>Note: {uscita.note ?? '-'}</p>
    </section>
  );
}
