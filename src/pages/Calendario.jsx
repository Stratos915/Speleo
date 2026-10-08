import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import CalendarioUscite from '../components/CalendarioUscite.jsx';
import { getUscite } from '../services/uscite';

// Pagina del calendario, aperta dalla casella «Calendario» della Dashboard.
// Legge le uscite esistenti; non scrive nulla.

export default function Calendario() {
  const [uscite, setUscite] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let ignore = false;
    getUscite()
      .then((rows) => {
        if (!ignore) setUscite(rows);
      })
      .catch((loadError) => {
        if (!ignore) setError(loadError.message ?? 'Impossibile caricare le uscite.');
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, []);

  return (
    <section className="page-grid">
      <div>
        <Link to="/dashboard" className="cal-all">
          ← Dashboard
        </Link>
      </div>
      {error && <p style={{ color: 'var(--color-accent)' }}>{error}</p>}
      <CalendarioUscite uscite={uscite} loading={loading} />
    </section>
  );
}
