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
  const [showForm, setShowForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState('tutte');

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
    setShowForm(true);
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
    <section className="page-grid">
      <header>
        <h1>Uscite</h1>
        <p>Organizza spedizioni, incontri e sessioni di formazione.</p>
      </header>

      <div className="card">
        <input
          type="search"
          placeholder="Cerca per titolo o luogo"
          value={filters.query}
          onChange={(event) => handleFilterChange('query', event.target.value)}
        />
        <div className="pill-group" style={{ marginTop: '0.75rem' }}>
          {['tutte', 'aperte', 'chiuse'].map((status) => (
            <button
              key={status}
              type="button"
              className={`pill-button ${statusFilter === status ? 'pill-button--active' : ''}`}
              onClick={() => setStatusFilter(status)}
            >
              {status === 'tutte' ? 'Tutte' : status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p>Caricamento uscite...</p>
      ) : (
        <div className="card-list">
          {uscite.map((uscita) => (
            <article className="card" key={uscita.id}>
              <header style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div>
                  <strong>{uscita.titolo}</strong>
                  <p style={{ margin: 0, color: 'var(--color-muted)' }}>{uscita.luogo}</p>
                </div>
                <span className="chip">{uscita.tipo ?? 'sociale'}</span>
              </header>
              <p style={{ color: 'var(--color-muted)' }}>{uscita.data && new Date(uscita.data).toLocaleString()}</p>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <Link to={`/uscite/${uscita.id}`}>Apri scheda</Link>
                {role === 'admin' && (
                  <button type="button" style={{ background: '#adb5bd' }} onClick={() => handleEdit(uscita)}>
                    Modifica
                  </button>
                )}
              </div>
            </article>
          ))}
          {!uscite.length && <p>Nessuna uscita presente. TODO: collegare la tabella "uscite" su Supabase.</p>}
        </div>
      )}

      {showForm && role === 'admin' && (
        <div className="card">
          <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '0.5rem' }}>
            <input placeholder="Titolo" value={form.titolo} onChange={(e) => setForm({ ...form, titolo: e.target.value })} required />
            <input placeholder="Luogo" value={form.luogo} onChange={(e) => setForm({ ...form, luogo: e.target.value })} required />
            <input type="datetime-local" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} required />
            <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
              <option value="sociale">Sociale</option>
              <option value="formazione">Formazione</option>
              <option value="esplorazione">Esplorazione</option>
            </select>
            <button type="submit">{editingId ? 'Aggiorna' : 'Crea uscita'}</button>
            {message && <p>{message}</p>}
          </form>
        </div>
      )}

      {role === 'admin' && (
        <button className="floating-button" type="button" onClick={() => { setShowForm((prev) => !prev); setEditingId(null); setForm(initialForm); }}>
          {showForm ? 'Chiudi modulo' : 'Nuova uscita'}
        </button>
      )}
    </section>
  );
}
