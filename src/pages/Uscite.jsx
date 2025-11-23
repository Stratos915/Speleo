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
  const [totalUscite, setTotalUscite] = useState(0);
  const [filters, setFilters] = useState({
    query: '',
    tipo: '',
    from: '',
    to: '',
  });
  const { role } = useAuth();

  useEffect(() => {
    loadUscite(filters);
  }, [filters]);

  async function loadUscite(currentFilters = filters) {
    setLoading(true);
    const { query, tipo, from, to } = currentFilters;
    let request = supabase.from('uscite').select('*', { count: 'exact' }).order('data', { ascending: true });

    const sanitizedQuery = query.trim().replace(/,/g, ' ');
    if (sanitizedQuery) {
      const pattern = `%${sanitizedQuery}%`;
      request = request.or(`titolo.ilike.${pattern},luogo.ilike.${pattern}`);
    }

    if (tipo) {
      request = request.eq('tipo', tipo);
    }

    if (from) {
      request = request.gte('data', new Date(`${from}T00:00:00.000Z`).toISOString());
    }

    if (to) {
      request = request.lte('data', new Date(`${to}T23:59:59.999Z`).toISOString());
    }

    const { data, error, count } = await request;
    if (!error) {
      setUscite(data ?? []);
      setTotalUscite(typeof count === 'number' ? count : data?.length ?? 0);
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
      loadUscite(filters);
      setMessage('Uscita creata con successo');
    }
  }

  function handleFilterChange(field, value) {
    setFilters((prev) => ({ ...prev, [field]: value }));
  }

  function resetFilters() {
    setFilters({
      query: '',
      tipo: '',
      from: '',
      to: '',
    });
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
        <div
          style={{
            display: 'grid',
            gap: '0.5rem',
            margin: '0.75rem 0 1rem',
            maxWidth: '520px',
            padding: '0.75rem',
            border: '1px solid #e0e0e0',
            borderRadius: '0.5rem',
          }}
        >
          <strong>Filtri rapidi</strong>
          <input
            type="search"
            placeholder="Cerca per titolo o luogo"
            value={filters.query}
            onChange={(event) => handleFilterChange('query', event.target.value)}
          />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.5rem' }}>
            <select value={filters.tipo} onChange={(event) => handleFilterChange('tipo', event.target.value)}>
              <option value="">Tutti i tipi</option>
              <option value="sociale">Sociale</option>
              <option value="formazione">Formazione</option>
              <option value="esplorazione">Esplorazione</option>
            </select>
            <input
              type="date"
              value={filters.from}
              onChange={(event) => handleFilterChange('from', event.target.value)}
              placeholder="Dal"
            />
            <input
              type="date"
              value={filters.to}
              onChange={(event) => handleFilterChange('to', event.target.value)}
              placeholder="Al"
            />
          </div>
          <button type="button" onClick={resetFilters}>
            Pulisci filtri
          </button>
          <span style={{ fontSize: '0.9rem', color: '#555' }}>
            Mostrate {uscite.length} uscite su {totalUscite}
          </span>
        </div>
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
