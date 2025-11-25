import { useEffect, useMemo, useState } from 'react';
import { createMember, deleteMember, getMembers, updateMember } from '../services/members';

const emptyMember = {
  membership_number: '',
  full_name: '',
  email: '',
  phone: '',
};

export default function Members() {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(emptyMember);
  const [editingId, setEditingId] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadMembers();
  }, []);

  async function loadMembers() {
    setLoading(true);
    setError('');
    try {
      const data = await getMembers();
      setMembers(data);
    } catch (loadError) {
      setError(loadError.message ?? 'Impossibile caricare i soci.');
    } finally {
      setLoading(false);
    }
  }

  const filteredMembers = useMemo(() => {
    if (!search.trim()) return members;
    const term = search.toLowerCase();
    return members.filter(
      (member) =>
        member.full_name?.toLowerCase().includes(term) ||
        String(member.membership_number ?? '').includes(term) ||
        member.email?.toLowerCase().includes(term),
    );
  }, [members, search]);

  function handleChange(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleEdit(member) {
    setEditingId(member.id);
    setForm({
      membership_number: member.membership_number ?? '',
      full_name: member.full_name ?? '',
      email: member.email ?? '',
      phone: member.phone ?? '',
    });
  }

  function resetForm() {
    setEditingId(null);
    setForm(emptyMember);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    const payload = {
      membership_number: form.membership_number ? Number(form.membership_number) : null,
      full_name: form.full_name.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
    };
    try {
      if (editingId) {
        await updateMember(editingId, payload);
      } else {
        await createMember(payload);
      }
      resetForm();
      loadMembers();
    } catch (submitError) {
      setError(submitError.message ?? 'Errore durante il salvataggio del socio.');
    } finally {
      setSubmitting(false);
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
        <h1>Elenco soci</h1>
        <p>Consulta l&apos;anagrafica importata dalla vecchia gestione Firebase ora salvata su Supabase.</p>
      </div>

      <input
        type="search"
        placeholder="Cerca per nome, numero tessera o email"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />

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
        <input
          placeholder="Nome e cognome"
          value={form.full_name}
          onChange={(event) => handleChange('full_name', event.target.value)}
          required
        />
        <input placeholder="Email" value={form.email} onChange={(event) => handleChange('email', event.target.value)} />
        <input placeholder="Telefono" value={form.phone} onChange={(event) => handleChange('phone', event.target.value)} />
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button type="submit" disabled={submitting}>
            {submitting ? 'Salvataggio...' : editingId ? 'Aggiorna' : 'Aggiungi'}
          </button>
          {editingId && (
            <button type="button" style={{ background: '#adb5bd' }} onClick={resetForm}>
              Annulla
            </button>
          )}
        </div>
        {error && <p style={{ color: 'var(--color-accent)' }}>{error}</p>}
      </form>

      {loading ? (
        <p>Caricamento soci...</p>
      ) : (
        <div className="page-grid" style={{ gap: '1rem' }}>
          {filteredMembers.map((member) => (
            <article
              key={member.id}
              style={{
                border: '1px solid var(--color-border)',
                borderRadius: '1rem',
                padding: '1rem',
                background: '#fff',
                boxShadow: '0 10px 20px rgba(0, 0, 0, 0.05)',
              }}
            >
              <header style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div>
                  <h3 style={{ margin: 0 }}>{member.full_name}</h3>
                  <span className="chip">Tessera #{member.membership_number ?? 'N/D'}</span>
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
              <p style={{ color: 'var(--color-muted)' }}>{member.email ?? 'Email non disponibile'}</p>
              <p style={{ color: 'var(--color-muted)' }}>{member.phone ?? 'Telefono non disponibile'}</p>
            </article>
          ))}
          {!filteredMembers.length && <p>Nessun socio trovato.</p>}
        </div>
      )}
    </section>
  );
}
