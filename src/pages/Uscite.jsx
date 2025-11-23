import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext.jsx';

const initialForm = {
  titolo: '',
  luogo: '',
  data: '',
  tipo: 'sociale',
};

export default function Uscite() {
  const [uscite, setUscite] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(initialForm);
  const [message, setMessage] = useState('');
  const { role } = useAuth();

  useEffect(() => {
    loadUscite();
  }, []);

  async function loadUscite() {
    setLoading(true);
    const { data, error } = await supabase
      .from('uscite')
      .select('*')
      .order('data', { ascending: true });
    if (!error) {
      setUscite(data);
    }
    setLoading(false);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage('');
    const payload = {
      ...form,
      data: form.data ? new Date(form.data).toISOString() : null,
    };
    const { error } = await supabase.from('uscite').insert(payload);
    if (error) {
      setMessage(error.message);
    } else {
      setForm(initialForm);
      loadUscite();
      setMessage('Uscita creata con successo');
    }
  }

  return (
    <section>
      <h1>Gestione Uscite</h1>

      {role === 'admin' && (
        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '0.5rem', maxWidth: '480px' }}>
          <h2>Nuova uscita</h2>
          <input
            placeholder="Titolo"
            value={form.titolo}
            onChange={(e) => setForm({ ...form, titolo: e.target.value })}
            required
          />
          <input
            placeholder="Luogo"
            value={form.luogo}
            onChange={(e) => setForm({ ...form, luogo: e.target.value })}
            required
          />
          <input
            type="datetime-local"
            value={form.data}
            onChange={(e) => setForm({ ...form, data: e.target.value })}
            required
          />
          <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
            <option value="sociale">Sociale</option>
            <option value="formazione">Formazione</option>
            <option value="esplorazione">Esplorazione</option>
          </select>
          <button>Crea uscita</button>
          {message && <p>{message}</p>}
        </form>
      )}

      <div style={{ marginTop: '2rem' }}>
        <h2>Elenco uscite</h2>
        {loading ? (
          <p>Caricamento...</p>
        ) : (
          <ul style={{ display: 'grid', gap: '0.75rem' }}>
            {uscite.map((uscita) => (
              <li key={uscita.id} style={{ border: '1px solid #ccc', padding: '0.75rem' }}>
                <h3>{uscita.titolo}</h3>
                <p>{uscita.luogo}</p>
                <p>{uscita.data && new Date(uscita.data).toLocaleString()}</p>
                <Link to={`/uscite/${uscita.id}`}>Dettagli</Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
