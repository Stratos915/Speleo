import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { deleteUscita, getUscite } from '../services/uscite';

function formatDate(value) {
  if (!value) return '-';
  const source = value.includes('T') ? value : `${value}T00:00:00`;
  const date = new Date(source);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' });
}

function formatTime(value) {
  if (!value) return '-';
  const [timePart] = value.split('+');
  return timePart.slice(0, 5);
}

export default function Uscite() {
  const [uscite, setUscite] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({ query: '', tipo: '' });
  const { role } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    loadUscite();
  }, []);

  async function loadUscite() {
    setLoading(true);
    setError('');
    try {
      const data = await getUscite();
      setUscite(data);
    } catch (loadError) {
      setError(loadError.message ?? 'Impossibile caricare le uscite.');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Eliminare questa uscita?')) {
      return;
    }
    try {
      await deleteUscita(id);
      await loadUscite();
    } catch (deleteError) {
      setError(deleteError.message ?? 'Errore durante l\'eliminazione dell\'uscita.');
    }
  }

  const filteredUscite = useMemo(() => {
    return uscite.filter((uscita) => {
      const matchesQuery =
        !filters.query ||
        uscita.titolo?.toLowerCase().includes(filters.query.toLowerCase()) ||
        uscita.luogo?.toLowerCase().includes(filters.query.toLowerCase());
      const matchesTipo = !filters.tipo || uscita.tipo?.toLowerCase() === filters.tipo.toLowerCase();
      return matchesQuery && matchesTipo;
    });
  }, [uscite, filters]);

  return (
    <section className="page-grid">
      <header>
        <h1>Uscite</h1>
        <p>Elenco aggiornato di spedizioni, corsi e attività in programma.</p>
      </header>

      <div className="card" style={{ display: 'grid', gap: '0.75rem' }}>
        <input
          type="search"
          placeholder="Cerca per titolo o luogo"
          value={filters.query}
          onChange={(event) => setFilters((prev) => ({ ...prev, query: event.target.value }))}
        />
        <input
          placeholder="Filtra per tipo (opzionale)"
          value={filters.tipo}
          onChange={(event) => setFilters((prev) => ({ ...prev, tipo: event.target.value }))}
        />
        <small style={{ color: 'var(--color-muted)' }}>{filteredUscite.length} uscite su {uscite.length}</small>
      </div>

      {error && <p style={{ color: 'var(--color-accent)' }}>{error}</p>}

      {loading ? (
        <p>Caricamento uscite...</p>
      ) : (
        <div className="card-list">
          {filteredUscite.map((uscita) => (
            <article className="card" key={uscita.id}>
              <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.5rem' }}>
                <div>
                  <strong>{uscita.titolo}</strong>
                  <p style={{ margin: 0, color: 'var(--color-muted)' }}>{uscita.luogo}</p>
                </div>
                {uscita.tipo && <span className="chip">{uscita.tipo}</span>}
              </header>
              <p style={{ color: 'var(--color-muted)' }}>
                {formatDate(uscita.data)} · {formatTime(uscita.ora)}
              </p>
              <p style={{ marginTop: '0.5rem' }}>
                Responsabile:{' '}
                <strong>{uscita.responsabile_full_name ?? 'Da assegnare'}</strong>
              </p>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <Link to={`/uscite/${uscita.id}`}>Apri scheda</Link>
                {role === 'admin' && (
                  <button type="button" style={{ background: '#adb5bd' }} onClick={() => navigate(`/uscite/${uscita.id}`)}>
                    Modifica
                  </button>
                )}
                {role === 'admin' && (
                  <button type="button" style={{ background: '#f27367' }} onClick={() => handleDelete(uscita.id)}>
                    Elimina
                  </button>
                )}
              </div>
            </article>
          ))}
          {!filteredUscite.length && !loading && <p>Nessuna uscita trovata.</p>}
        </div>
      )}

      {role === 'admin' && (
        <button className="floating-button" type="button" onClick={() => navigate('/uscite/new')}>
          Nuova uscita
        </button>
      )}
    </section>
  );
}
