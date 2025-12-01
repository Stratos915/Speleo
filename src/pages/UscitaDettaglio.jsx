import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import UscitaForm from '../components/UscitaForm.jsx';
import { getUscitaById, updateUscita } from '../services/uscite';

function formatDate(value) {
  if (!value) return '-';
  const source = value.includes('T') ? value : `${value}T00:00:00`;
  const date = new Date(source);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString('it-IT', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
}

function formatTime(value) {
  if (!value) return '-';
  const [timePart] = value.split('+');
  return timePart.slice(0, 5);
}

export default function UscitaDettaglio() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { role } = useAuth();
  const [uscita, setUscita] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [formError, setFormError] = useState('');

  useEffect(() => {
    loadDettaglio();
  }, [id]);

  async function loadDettaglio() {
    setLoading(true);
    setError('');
    try {
      const data = await getUscitaById(id);
      setUscita(data);
    } catch (loadError) {
      setError(loadError.message ?? 'Uscita non trovata.');
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdate(payload) {
    setSaving(true);
    setFormError('');
    setSuccess('');
    try {
      const updated = await updateUscita(id, payload);
      setUscita(updated);
      setSuccess('Uscita aggiornata.');
      setEditMode(false);
    } catch (updateError) {
      setFormError(updateError.message ?? 'Errore durante l\'aggiornamento.');
    } finally {
      setSaving(false);
    }
  }

  const mapsLink = useMemo(() => {
    if (!uscita?.luogo) return null;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(uscita.luogo)}`;
  }, [uscita?.luogo]);

  if (loading) {
    return <p>Caricamento uscita...</p>;
  }

  if (!uscita) {
    return (
      <section className="page-grid">
        <p>{error || 'Uscita non trovata.'}</p>
        <Link to="/uscite">Torna all'elenco</Link>
      </section>
    );
  }

  return (
    <section className="page-grid">
      <header>
        <button type="button" style={{ background: '#adb5bd' }} onClick={() => navigate('/uscite')}>
          ← Torna all'elenco
        </button>
        <h1>{uscita.titolo}</h1>
        <p>Creato il: {uscita.created_at ? new Date(uscita.created_at).toLocaleString('it-IT') : '-'}</p>
      </header>

      {error && <p style={{ color: 'var(--color-accent)' }}>{error}</p>}
      {success && <p style={{ color: 'var(--color-primary)' }}>{success}</p>}

      <article className="card">
        <h2>Dettagli uscita</h2>
        <dl style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '0.75rem' }}>
          <dt>Data</dt>
          <dd>{formatDate(uscita.data)}</dd>
          <dt>Ora</dt>
          <dd>{formatTime(uscita.ora)}</dd>
          <dt>Luogo</dt>
          <dd>
            {mapsLink ? (
              <a href={mapsLink} target="_blank" rel="noopener noreferrer">
                {uscita.luogo}
              </a>
            ) : (
              '-'
            )}
          </dd>
          <dt>Tipo</dt>
          <dd>{uscita.tipo || '-'}</dd>
          <dt>Responsabile</dt>
          <dd>{uscita.responsabile_full_name || 'Da assegnare'}</dd>
          <dt>Note</dt>
          <dd>{uscita.note || 'Nessuna nota inserita.'}</dd>
        </dl>
      </article>

      {role === 'admin' && (
        <article className="card">
          {editMode ? (
            <UscitaForm
              initialValues={uscita}
              onSubmit={handleUpdate}
              submitting={saving}
              errorMessage={formError}
              onCancel={() => {
                setEditMode(false);
                setFormError('');
                setSuccess('');
              }}
              submitLabel="Aggiorna uscita"
            />
          ) : (
            <button
              type="button"
              onClick={() => {
                setEditMode(true);
                setSuccess('');
              }}
            >
              Modifica uscita
            </button>
          )}
        </article>
      )}
    </section>
  );
}
