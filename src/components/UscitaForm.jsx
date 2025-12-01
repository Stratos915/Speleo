import { useEffect, useMemo, useState } from 'react';
import { getMembers } from '../services/members';

const EMPTY_FORM = {
  titolo: '',
  luogo: '',
  data: '',
  ora: '',
  tipo: 'sociale',
  responsabile_id: '',
  note: '',
};

function dateForInput(value) {
  if (!value) return '';
  if (value.includes('T')) {
    return value.split('T')[0];
  }
  return value;
}

function timetzForInput(value) {
  if (!value) return '';
  const time = value.split('+')[0]; // Drop timezone info returned by Supabase.
  return time.slice(0, 5);
}

function timeToTimetz(value) {
  if (!value) return null;
  // Supabase richiede un valore di tipo timetz, aggiungiamo i secondi + timezone per compatibilità.
  return `${value}:00+00`;
}

export default function UscitaForm({
  initialValues = null,
  onSubmit,
  submitting = false,
  errorMessage = '',
  successMessage = '',
  onCancel,
  submitLabel = 'Salva uscita',
}) {
  const [form, setForm] = useState(() => ({
    ...EMPTY_FORM,
    ...(initialValues ?? {}),
    data: initialValues?.data ? dateForInput(initialValues.data) : '',
    ora: initialValues?.ora ? timetzForInput(initialValues.ora) : '',
  }));
  const [members, setMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [membersError, setMembersError] = useState('');

  useEffect(() => {
    setForm({
      ...EMPTY_FORM,
      ...(initialValues ?? {}),
      data: initialValues?.data ? dateForInput(initialValues.data) : '',
      ora: initialValues?.ora ? timetzForInput(initialValues.ora) : '',
    });
  }, [initialValues]);

  useEffect(() => {
    let ignore = false;
    async function loadMembers() {
      setMembersLoading(true);
      setMembersError('');
      try {
        const data = await getMembers();
        if (!ignore) {
          setMembers(data);
        }
      } catch (error) {
        if (!ignore) {
          setMembersError(error.message ?? 'Impossibile recuperare la lista soci.');
        }
      } finally {
        if (!ignore) {
          setMembersLoading(false);
        }
      }
    }
    loadMembers();
    return () => {
      ignore = true;
    };
  }, []);

  const isSubmitDisabled = useMemo(() => {
    return submitting || membersLoading;
  }, [membersLoading, submitting]);

  function handleChange(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!onSubmit) return;
    const payload = {
      titolo: form.titolo.trim(),
      luogo: form.luogo.trim(),
      data: form.data || null,
      ora: timeToTimetz(form.ora),
      tipo: form.tipo.trim() || null,
      responsabile_id: form.responsabile_id || null,
      note: form.note?.trim() ? form.note.trim() : null,
    };
    await onSubmit(payload);
  }

  return (
    <form className="page-grid" onSubmit={handleSubmit}>
      <div className="card">
        <label htmlFor="titolo">Titolo</label>
        <input
          id="titolo"
          value={form.titolo}
          onChange={(event) => handleChange('titolo', event.target.value)}
          required
          placeholder="Es. Escursione formativa"
        />
      </div>

      <div className="card">
        <label htmlFor="luogo">Luogo</label>
        <input
          id="luogo"
          value={form.luogo}
          onChange={(event) => handleChange('luogo', event.target.value)}
          required
          placeholder="Es. Grotta XYZ"
        />
      </div>

      <div className="card">
        <label htmlFor="data">Data</label>
        <input id="data" type="date" value={form.data} onChange={(event) => handleChange('data', event.target.value)} required />
      </div>

      <div className="card">
        <label htmlFor="ora">Ora</label>
        <input id="ora" type="time" value={form.ora} onChange={(event) => handleChange('ora', event.target.value)} required />
      </div>

      <div className="card">
        <label htmlFor="tipo">Tipo</label>
        <input
          id="tipo"
          value={form.tipo}
          onChange={(event) => handleChange('tipo', event.target.value)}
          placeholder="Es. Corso, Allenamento..."
        />
      </div>

      <div className="card">
        <label htmlFor="responsabile">Responsabile</label>
        {membersLoading ? (
          <p>Caricamento soci...</p>
        ) : (
          <select
            id="responsabile"
            value={form.responsabile_id}
            onChange={(event) => handleChange('responsabile_id', event.target.value)}
            required
          >
            <option value="">Seleziona responsabile</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.full_name}
              </option>
            ))}
          </select>
        )}
        {membersError && <p style={{ color: 'var(--color-accent)' }}>{membersError}</p>}
      </div>

      <div className="card">
        <label htmlFor="note">Note</label>
        <textarea
          id="note"
          rows={3}
          value={form.note}
          onChange={(event) => handleChange('note', event.target.value)}
          placeholder="Dettagli logistici, materiale necessario..."
        />
      </div>

      {errorMessage && <p style={{ color: 'var(--color-accent)' }}>{errorMessage}</p>}
      {successMessage && <p style={{ color: 'var(--color-primary)' }}>{successMessage}</p>}

      <div className="card" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        {onCancel && (
          <button type="button" style={{ background: '#adb5bd' }} onClick={onCancel}>
            Annulla
          </button>
        )}
        <button type="submit" disabled={isSubmitDisabled}>
          {submitting ? 'Salvataggio...' : submitLabel}
        </button>
      </div>
    </form>
  );
}
