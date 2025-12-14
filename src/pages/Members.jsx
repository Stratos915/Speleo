import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useAuth from '../context/useAuth.js';
import { bulkCreateMembers, createMember, deleteMember, getMembers, updateMember } from '../services/members';
import usePermissions from '../hooks/usePermissions.js';
import { safeLogActivity } from '../services/activityLogs.js';

const YEAR_START = 2025;
const YEAR_END = 2050;
const currentYear = new Date().getFullYear();
const DEFAULT_YEAR = Math.max(YEAR_START, Math.min(currentYear, YEAR_END));

const emptyMember = {
  membership_number: '',
  full_name: '',
  email: '',
  phone: '',
  membership_paid: false,
  membership_year: DEFAULT_YEAR,
};
const DEFAULT_YEAR_STRING = String(DEFAULT_YEAR);

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
  const [supportsYear, setSupportsYear] = useState(false);
  const [yearColumn, setYearColumn] = useState('membership_year');
  const [yearFilter, setYearFilter] = useState(DEFAULT_YEAR_STRING);
  const formRef = useRef(null);
  const duplicatedYearsRef = useRef(new Set());
  const [cloningYear, setCloningYear] = useState(null);
  const { user } = useAuth();
  const { canEditSection } = usePermissions();
  const canEditMembers = canEditSection('soci');

  const yearOptions = useMemo(() => {
    const maxYear = Math.max(YEAR_END, currentYear + 5);
    return Array.from({ length: maxYear - YEAR_START + 1 }, (_item, index) => YEAR_START + index);
  }, []);

  const loadMembers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getMembers();
      setMembers(data);
      setSupportsEmail(data.some((item) => Object.prototype.hasOwnProperty.call(item, 'email')));
      setSupportsPhone(data.some((item) => Object.prototype.hasOwnProperty.call(item, 'phone')));
      const first = data[0];
      if (first) {
        if (Object.prototype.hasOwnProperty.call(first, 'membership_year')) {
          setYearColumn('membership_year');
          setSupportsYear(true);
        } else if (Object.prototype.hasOwnProperty.call(first, 'year')) {
          setYearColumn('year');
          setSupportsYear(true);
        } else if (Object.prototype.hasOwnProperty.call(first, 'anno')) {
          setYearColumn('anno');
          setSupportsYear(true);
        } else {
          setSupportsYear(false);
        }
      }
    } catch (loadError) {
      setError(loadError.message ?? 'Impossibile caricare i soci.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  useEffect(() => {
    if (showForm && formRef.current) {
      formRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [showForm]);

  useEffect(() => {
    if (!canEditMembers && showForm) {
      setShowForm(false);
    }
  }, [canEditMembers, showForm]);

  useEffect(() => {
    if (editingId) return;
    if (yearFilter === 'all' || yearFilter === 'unknown') return;
    setForm((prev) => ({
      ...prev,
      membership_year: Number(yearFilter) || DEFAULT_YEAR,
    }));
  }, [yearFilter, editingId]);

  const availableYears = useMemo(() => {
    const set = new Set();
    members.forEach((member) => {
      const parsed = Number(member.membership_year);
      if (Number.isFinite(parsed)) {
        set.add(parsed);
      }
    });
    if (set.size === 0) {
      set.add(DEFAULT_YEAR);
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [members]);

  const duplicateYear = useCallback(
    async (targetYear) => {
      if (!supportsYear || !canEditMembers) return;
      if (!Number.isFinite(targetYear)) return;
      const baseYear =
        availableYears
          .slice()
          .reverse()
          .find((year) => year < targetYear) ?? availableYears[availableYears.length - 1] ?? DEFAULT_YEAR;
      const templateMembers = members.filter((member) => Number(member.membership_year) === baseYear);
      if (!templateMembers.length) {
        setError('Nessun socio disponibile da usare per il nuovo anno.');
        return;
      }
      setCloningYear(targetYear);
      setError('');
      try {
        const payloads = templateMembers.map((member) => {
          const membershipNumber = member.membership_number ?? member.old_id ?? null;
          const payload = {
            full_name: member.full_name,
            old_id: member.old_id ?? membershipNumber,
            membership_number: membershipNumber,
            membership_paid: false,
          };
          if (supportsEmail) payload.email = member.email ?? null;
          if (supportsPhone) payload.phone = member.phone ?? null;
          if (yearColumn) {
            payload[yearColumn] = targetYear;
          }
          if (yearColumn !== 'membership_year') {
            payload.membership_year = targetYear;
          }
          return payload;
        });
        await bulkCreateMembers(payloads);
        safeLogActivity(
          {
            action: 'duplicate_members_year',
            entity: 'members',
            details: { targetYear, records: payloads.length },
          },
          user,
        );
        await loadMembers();
      } catch (dupError) {
        setError(dupError.message ?? 'Impossibile popolare il nuovo anno.');
        duplicatedYearsRef.current.delete(targetYear);
      } finally {
        setCloningYear(null);
      }
    },
    [supportsYear, canEditMembers, members, availableYears, supportsEmail, supportsPhone, yearColumn, loadMembers],
  );

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
      const memberYear = Number(member.membership_year);
      const matchesYear =
        yearFilter === 'all' ||
        (Number.isFinite(memberYear) ? String(memberYear) === yearFilter : yearFilter === 'unknown');
      return matchesText && matchesStatus && matchesYear;
    });
  }, [members, search, statusFilter, yearFilter]);

  const selectedYearNumber = Number(yearFilter);
  const hasSelectedYearData = useMemo(
    () => Number.isFinite(selectedYearNumber) && members.some((member) => Number(member.membership_year) === selectedYearNumber),
    [members, selectedYearNumber],
  );

  const summaryByYear = useMemo(() => {
    const map = new Map();
    yearOptions.forEach((year) => map.set(String(year), { year: String(year), total: 0, paid: 0, unpaid: 0 }));
    map.set('unknown', { year: 'N/D', total: 0, paid: 0, unpaid: 0 });
    members.forEach((member) => {
      const parsedYear = Number(member.membership_year);
      const key = Number.isFinite(parsedYear) ? String(parsedYear) : 'unknown';
      if (!map.has(key)) {
        map.set(key, { year: Number.isFinite(parsedYear) ? String(parsedYear) : 'N/D', total: 0, paid: 0, unpaid: 0 });
      }
      const entry = map.get(key);
      entry.total += 1;
      if (member.membership_paid) entry.paid += 1;
      else entry.unpaid += 1;
    });
    return Array.from(map.values()).sort((a, b) => {
      const yearA = Number(a.year);
      const yearB = Number(b.year);
      if (Number.isNaN(yearA) && Number.isNaN(yearB)) return 0;
      if (Number.isNaN(yearA)) return 1;
      if (Number.isNaN(yearB)) return -1;
      return yearB - yearA;
    });
  }, [members, yearOptions]);

  const activeSummaryYear = useMemo(() => {
    if (yearFilter === 'all' || yearFilter === 'unknown') {
      return String(Math.min(Math.max(currentYear, YEAR_START), YEAR_END));
    }
    return yearFilter;
  }, [yearFilter]);

  const activeSummary = useMemo(() => {
    const fallback = { year: activeSummaryYear, total: 0, paid: 0, unpaid: 0 };
    return summaryByYear.find((item) => item.year === activeSummaryYear) ?? fallback;
  }, [summaryByYear, activeSummaryYear]);

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
      membership_year: Number(member.membership_year) || DEFAULT_YEAR,
    });
    setShowForm(true);
  }

  function resetForm(yearValue = yearFilter) {
    setEditingId(null);
    setForm({
      membership_number: '',
      full_name: '',
      email: '',
      phone: '',
      membership_paid: false,
      membership_year: Number(yearValue) || DEFAULT_YEAR,
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    const membershipValue = form.membership_number ? Number(form.membership_number) : null;
    const normalizedYear = Number(form.membership_year) || DEFAULT_YEAR;
    const payload = {
      full_name: form.full_name.trim(),
      email: supportsEmail ? form.email.trim() || null : undefined,
      phone: supportsPhone ? form.phone.trim() || null : undefined,
      membership_paid: Boolean(form.membership_paid),
      old_id: membershipValue,
    };
    if (supportsYear && yearColumn) {
      payload[yearColumn] = normalizedYear;
    }
    if (!supportsEmail) delete payload.email;
    if (!supportsPhone) delete payload.phone;
    try {
      let savedMember;
      if (editingId) {
        savedMember = await updateMember(editingId, payload);
        safeLogActivity(
          {
            action: 'update_member',
            entity: 'members',
            entityId: savedMember.id,
            details: { name: savedMember.full_name, year: normalizedYear },
          },
          user,
        );
      } else {
        savedMember = await createMember(payload);
        safeLogActivity(
          {
            action: 'create_member',
            entity: 'members',
            entityId: savedMember.id,
            details: { name: savedMember.full_name, year: normalizedYear },
          },
          user,
        );
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
      const nextStatus = !member.membership_paid;
      await updateMember(member.id, { membership_paid: nextStatus });
      safeLogActivity(
        {
          action: 'toggle_membership_payment',
          entity: 'members',
          entityId: member.id,
          details: { status: nextStatus },
        },
        user,
      );
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
      safeLogActivity(
        {
          action: 'delete_member',
          entity: 'members',
          entityId: id,
        },
        user,
      );
      loadMembers();
    } catch (deleteError) {
      setError(deleteError.message ?? 'Impossibile eliminare il socio.');
    }
  }

  useEffect(() => {
    if (!supportsYear || !canEditMembers) return;
    if (yearFilter === 'all' || yearFilter === 'unknown') return;
    if (!Number.isFinite(selectedYearNumber)) return;
    if (selectedYearNumber < YEAR_START) return;
    if (hasSelectedYearData) return;
    if (duplicatedYearsRef.current.has(selectedYearNumber)) return;
    duplicatedYearsRef.current.add(selectedYearNumber);
    duplicateYear(selectedYearNumber);
  }, [yearFilter, supportsYear, canEditMembers, selectedYearNumber, hasSelectedYearData, duplicateYear]);

  return (
    <section className="page-grid">
      <div>
        <h1>Gestione soci</h1>
        <p>Anagrafica aggiornata importata dalla versione precedente.</p>
      </div>

      {error && (
        <article
          className="card"
          style={{
            background: '#fff5f5',
            borderColor: '#ff8787',
            color: '#c92a2a',
            marginBottom: '1rem',
          }}
        >
          {error}
        </article>
      )}

      <div
        className="card"
        style={{
          padding: '0.75rem 1rem',
          marginBottom: '1rem',
          background: '#f8f9fa',
          borderRadius: '0.75rem',
          border: '1px solid rgba(0,0,0,0.08)',
        }}
      >
        <strong>Anno {activeSummary.year}</strong>
        <p style={{ margin: '0.25rem 0', color: 'var(--color-muted)' }}>
          Totale soci: {activeSummary.total} · Quota pagata: {activeSummary.paid} · Da saldare: {activeSummary.unpaid}
        </p>
        <small style={{ color: 'var(--color-muted)' }}>Il riepilogo segue automaticamente l&apos;anno selezionato o quello corrente del dispositivo.</small>
      </div>

      {!canEditMembers && (
        <p className="card" style={{ background: '#fff5f5', borderColor: '#ffc9c9', color: '#c92a2a' }}>
          Non hai i permessi per modificare l&apos;anagrafica. Puoi solo consultare i dati.
        </p>
      )}

      <div
        className="card"
        style={{
          marginBottom: '1rem',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '1rem',
          alignItems: 'center',
        }}
      >
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: '220px', flex: '1 1 220px' }}>
          Cartella anno
          <select value={yearFilter} onChange={(event) => setYearFilter(event.target.value)}>
            <option value="all">Tutti gli anni</option>
            {yearOptions.map((yearOption) => (
              <option key={yearOption} value={String(yearOption)}>
                {yearOption}
              </option>
            ))}
            <option value="unknown">N/D</option>
          </select>
        </label>
        <p style={{ flex: '2 1 320px', margin: 0, color: 'var(--color-muted)' }}>
          Seleziona l&apos;anno per consultare l&apos;elenco soci dedicato e preparare le cartelle future (2025-2050). I nuovi soci ereditano automaticamente
          l&apos;anno attivo.
        </p>
        {cloningYear && (
          <p style={{ flexBasis: '100%', margin: 0, color: '#1971c2' }}>
            Sto popolando l&apos;anno {cloningYear} con l&apos;elenco attuale...
          </p>
        )}
        {!cloningYear &&
          supportsYear &&
          yearFilter !== 'all' &&
          yearFilter !== 'unknown' &&
          Number.isFinite(selectedYearNumber) &&
          selectedYearNumber >= YEAR_START &&
          selectedYearNumber <= YEAR_END &&
          !hasSelectedYearData && (
            <button
              type="button"
              style={{ marginLeft: 'auto', background: '#228be6' }}
              onClick={() => duplicateYear(selectedYearNumber)}
            >
              Popola anno {selectedYearNumber}
            </button>
          )}
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

      {showForm && canEditMembers && (
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
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              Anno di riferimento
              <select
                value={form.membership_year}
                onChange={(event) => handleChange('membership_year', Number(event.target.value))}
              >
                {yearOptions.map((yearOption) => (
                  <option key={yearOption} value={yearOption}>
                    {yearOption}
                  </option>
                ))}
              </select>
            </label>
            <input
              placeholder="Nome e cognome"
              value={form.full_name}
              onChange={(event) => handleChange('full_name', event.target.value)}
              required
            />
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
                {canEditMembers && (
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button type="button" onClick={() => handleEdit(member)}>
                      Modifica
                    </button>
                    <button type="button" style={{ background: '#e03131' }} onClick={() => handleDelete(member.id)}>
                      Elimina
                    </button>
                  </div>
                )}
              </header>
              <p style={{ margin: '0.25rem 0', color: 'var(--color-muted)' }}>
                Anno di riferimento: {Number(member.membership_year) || Number(member.year) || Number(member.anno) || 'N/D'}
              </p>
              {supportsEmail && (
                <p style={{ color: 'var(--color-muted)' }}>{member.email ?? 'Email non disponibile'}</p>
              )}
              {supportsPhone && (
                <p style={{ color: 'var(--color-muted)' }}>{member.phone ?? 'Telefono non disponibile'}</p>
              )}
              <div style={{ marginTop: '0.75rem' }}>
                <p style={{ margin: '0 0 0.35rem', fontWeight: 600, color: 'var(--color-muted)' }}>Quota annuale</p>
                {canEditMembers ? (
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
                ) : (
                  <div
                    style={{
                      width: '100%',
                      borderRadius: '999px',
                      padding: '0.4rem',
                      background: member.membership_paid ? 'rgba(34,197,94,0.15)' : 'rgba(250,176,5,0.15)',
                      color: member.membership_paid ? '#2b8a3e' : '#d9480f',
                      textAlign: 'center',
                      fontWeight: 600,
                    }}
                  >
                    {member.membership_paid ? 'Pagato' : 'Da saldare'}
                  </div>
                )}
              </div>
            </article>
          ))}
          {!filteredMembers.length && <p>Nessun socio trovato.</p>}
        </div>
      )}

      {canEditMembers && (
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
      )}
    </section>
  );
}
