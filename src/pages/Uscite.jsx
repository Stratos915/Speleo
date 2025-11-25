import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { createUscita, deleteUscita, getUscite, updateUscita } from '../services/uscite';

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
  const [editingId, setEditingId] = useState(null);
  const { role } = useAuth();

  useEffect(() => {
    loadUscite(filters);
  }, [filters]);

  async function loadUscite(currentFilters = filters) {
    setLoading(true);
    const { query, tipo, from, to } = currentFilters;
    try {
      const data = await getUscite();
      const filtered = data.filter((uscita) => {
        const matchesQuery =
          !query.trim() ||
          uscita.titolo?.toLowerCase().includes(query.toLowerCase()) ||
          uscita.luogo?.toLowerCase().includes(query.toLowerCase());
        const matchesTipo = !tipo || uscita.tipo === tipo;
        const uscitaDate = uscita.data ? new Date(uscita.data) : null;
        const matchesFrom = !from || (uscitaDate && uscitaDate >= new Date(from));
        const matchesTo = !to || (uscitaDate && uscitaDate <= new Date(to));
        return matchesQuery && matchesTipo && matchesFrom && matchesTo;
      });
      setUscite(filtered);
      setTotalUscite(data.length);
    } catch (error) {
      setMessage('TODO: la tabella "uscite" sarà disponibile a breve su Supabase.');
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage('');
    const payload = {
      titolo: form.titolo.trim(),
      luogo: form.luogo.trim(),
      data: form.data ? new Date(form.data).toISOString() : null,
      tipo: form.tipo,
    };
    try {
      if (editingId) {
        await updateUscita(editingId, payload);
        setMessage('Uscita aggiornata.');
      } else {
        await createUscita(payload);
        setMessage('Uscita creata con successo');
      }
      setForm(initialForm);
      setEditingId(null);
      loadUscite(filters);
    } catch (error) {
      setMessage(error.message ?? 'Errore durante il salvataggio.');
    }
  }

  function handleEdit(uscita) {
    setEditingId(uscita.id);
    setForm({
      titolo: uscita.titolo ?? '',
      luogo: uscita.luogo ?? '',
      data: uscita.data ? new Date(uscita.data).toISOString().slice(0, 16) : '',
      tipo: uscita.tipo ?? 'sociale',
    });
  }

  async function handleDelete(id) {
    if (!window.confirm('Vuoi eliminare questa uscita?')) return;
    setMessage('');
    try {
      await deleteUscita(id);
      loadUscite(filters);
    } catch (error) {
      setMessage(error.message ?? 'Impossibile eliminare l\'uscita.');
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
