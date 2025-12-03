import { useEffect, useMemo, useRef, useState } from 'react';
import { createMember, deleteMember, getMembers, updateMember } from '../services/members';

const emptyMember = {
  membership_number: '',
  full_name: '',
  email: '',
  phone: '',
  membership_paid: false,
};

export default function Members() {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [form, setForm] = useState(emptyMember);
  const [editingId, setEditingId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [togglingId, setTogglingId] = useState(null);
  const [supportsEmail, setSupportsEmail] = useState(true);
  const [supportsPhone, setSupportsPhone] = useState(true);
  const formRef = useRef(null);

  useEffect(() => {
    loadMembers();
  }, []);

  useEffect(() => {
    if (showForm && formRef.current) {
      formRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [showForm]);

  async function loadMembers() {
    setLoading(true);
    setError('');
    try {
      const data = await getMembers();
      setMembers(data);
      setSupportsEmail(data.some((item) => Object.prototype.hasOwnProperty.call(item, 'email')));
      setSupportsPhone(data.some((item) => Object.prototype.hasOwnProperty.call(item, 'phone')));
    } catch (loadError) {
      setError(loadError.message ?? 'Impossibile caricare i soci.');
    } finally {
      setLoading(false);
    }
  }

  const filteredMembers = useMemo(() => {
    const term = search.toLowerCase();
    return members.filter((member) => {
      const matchesText =
        !term ||
        member.full_name?.toLowerCase().includes(term) ||
        String(member.old_id ?? '').includes(term) ||
        member.email?.toLowerCase().includes(term);
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'paid' ? member.membership_paid : !member.membership_paid);
      return matchesText && matchesStatus;
    });
  }, [members, search, statusFilter]);

  function handleChange(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleEdit(member) {
    setEditingId(member.id);
    setForm({
      membership_number: member.old_id ?? '',
      full_name: member.full_name ?? '',
      email: supportsEmail ? member.email ?? '' : '',
      phone: supportsPhone ? member.phone ?? '' : '',
      membership_paid: Boolean(member.membership_paid),
    });
    setShowForm(true);
  }

  function resetForm() {
    setEditingId(null);
    setForm(emptyMember);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    const membershipValue = form.membership_number ? Number(form.membership_number) : null;
    const payload = {
      full_name: form.full_name.trim(),
      email: supportsEmail ? form.email.trim() || null : undefined,
      phone: supportsPhone ? form.phone.trim() || null : undefined,
      membership_paid: Boolean(form.membership_paid),
      old_id: membershipValue,
    };
    if (!supportsEmail) delete payload.email;
    if (!supportsPhone) delete payload.phone;
    try {
      if (editingId) {
        await updateMember(editingId, payload);
      } else {
        await createMember(payload);
      }
      resetForm();
      setShowForm(false);
      loadMembers();
    } catch (submitError) {
      setError(submitError.message ?? 'Errore durante il salvataggio del socio.');
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleMembershipPayment(member) {
    setTogglingId(member.id);
    setError('');
    try {
      await updateMember(member.id, { membership_paid: !member.membership_paid });
      await loadMembers();
    } catch (toggleError) {
      setError(toggleError.message ?? 'Impossibile aggiornare lo stato della tessera.');
    } finally {
      setTogglingId(null);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Vuoi eliminare questo socio?')) return;
    setError('');
    try {
      await deleteMember(id);
      loadMembers();
    } catch (deleteError) {
      setError(deleteError.message ?? 'Impossibile eliminare il socio.');
    }
  }

  return (
    <section className="page-grid">
      <div>
        <h1>Gestione soci</h1>
        <p>Anagrafica aggiornata importata dalla versione precedente.</p>
      </div>

      <input
        type="search"
        placeholder="Cerca per nome, numero tessera o email"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <div className="pill-group">
        {[
          { value: 'all', label: 'Tutti' },
          { value: 'paid', label: 'Pagati' },
          { value: 'unpaid', label: 'Da saldare' },
        ].map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => setStatusFilter(item.value)}
            className={`pill-button ${statusFilter === item.value ? 'pill-button--active' : ''}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {showForm && (
        <div className="card" ref={formRef}>
          <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '0.75rem' }}>
            <h2>{editingId ? 'Modifica socio' : 'Nuovo socio'}</h2>
            <input
              type="number"
              min={0}
              placeholder="Numero tessera"
              value={form.membership_number}
              onChange={(event) => handleChange('membership_number', event.target.value)}
              required
            />
            <input placeholder="Nome e cognome" value={form.full_name} onChange={(event) => handleChange('full_name', event.target.value)} required />
            {supportsEmail && (
              <input placeholder="Email" value={form.email} onChange={(event) => handleChange('email', event.target.value)} />
            )}
            {supportsPhone && (
              <input placeholder="Telefono" value={form.phone} onChange={(event) => handleChange('phone', event.target.value)} />
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="checkbox"
                checked={Boolean(form.membership_paid)}
                onChange={(event) => handleChange('membership_paid', event.target.checked)}
              />
              <span>Quota annuale pagata</span>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="submit" disabled={submitting}>
                {submitting ? 'Salvataggio...' : editingId ? 'Aggiorna' : 'Aggiungi'}
              </button>
              <button type="button" style={{ background: '#adb5bd' }} onClick={() => { resetForm(); setShowForm(false); }}>
                Annulla
              </button>
            </div>
            {error && <p style={{ color: 'var(--color-accent)' }}>{error}</p>}
          </form>
        </div>
      )}

      {loading ? (
        <p>Caricamento soci...</p>
      ) : (
        <div className="card-list">
          {filteredMembers.map((member) => (
            <article className="card" key={member.id}>
              <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ margin: 0 }}>{member.full_name}</h3>
                  <span className="chip">Tessera #{member.old_id ?? 'N/D'}</span>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button type="button" onClick={() => handleEdit(member)}>
                    Modifica
                  </button>
                  <button type="button" style={{ background: '#e03131' }} onClick={() => handleDelete(member.id)}>
                    Elimina
                  </button>
                </div>
              </header>
              {supportsEmail && (
                <p style={{ color: 'var(--color-muted)' }}>{member.email ?? 'Email non disponibile'}</p>
              )}
              {supportsPhone && (
                <p style={{ color: 'var(--color-muted)' }}>{member.phone ?? 'Telefono non disponibile'}</p>
              )}
              <div style={{ marginTop: '0.75rem' }}>
                <p style={{ margin: '0 0 0.35rem', fontWeight: 600, color: 'var(--color-muted)' }}>Quota annuale</p>
                <button
                  type="button"
                  onClick={() => toggleMembershipPayment(member)}
                  disabled={togglingId === member.id}
                  style={{
                    width: '100%',
                    borderRadius: '999px',
                    border: 'none',
                    padding: '0.4rem',
                    background: member.membership_paid ? 'rgba(34,197,94,0.2)' : 'rgba(250,176,5,0.2)',
                    color: member.membership_paid ? '#2b8a3e' : '#d9480f',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {togglingId === member.id
                    ? 'Aggiornamento...'
                    : member.membership_paid
                    ? 'Pagato'
                    : 'Da saldare'}
                </button>
              </div>
            </article>
          ))}
          {!filteredMembers.length && <p>Nessun socio trovato.</p>}
        </div>
      )}

      <button
        className="floating-button"
        type="button"
        onClick={() => {
          setShowForm((prev) => !prev);
          resetForm();
        }}
      >
        {showForm ? 'Chiudi modulo' : 'Aggiungi socio'}
      </button>
    </section>
  );
}
