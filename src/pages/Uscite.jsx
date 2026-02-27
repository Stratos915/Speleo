import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import useAuth from '../context/useAuth.js';
import usePermissions from '../hooks/usePermissions.js';
import useAlerts from '../hooks/useAlerts.js';
import AlertList from '../components/AlertList.jsx';
import { deleteUscita, getUscite, createUscita, updateUscita } from '../services/uscite';
import { getMembers } from '../services/members';
import UscitaForm from '../components/UscitaForm.jsx';
import { supabase } from '../lib/supabaseClient';
import { safeLogActivity } from '../services/activityLogs.js';
import { dedupeMembers } from '../utils/members.js';

const TIPO_OPTIONS = [
  { value: '', label: 'Tutte' },
  { value: 'sociale', label: 'Sociale' },
  { value: 'corso', label: 'Corso' },
  { value: 'allenamento', label: 'Allenamento' },
  { value: 'esplorazione', label: 'Esplorazione' },
  { value: 'altro', label: 'Altro' },
];

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

function buildMapsLink(luogo) {
  if (!luogo) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(luogo)}`;
}

export default function Uscite() {
  const [uscite, setUscite] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({ query: '', tipo: '' });
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState('');
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formSuccess, setFormSuccess] = useState('');
  const { role, user } = useAuth();
  const { canEditSection } = usePermissions();
  const canEditUscite = canEditSection('uscita');
  const { adminAlerts, userAlerts, dismissAlert } = useAlerts();
  const navigate = useNavigate();
  const [activeLoansMap, setActiveLoansMap] = useState(new Map());
  const [statusFilter, setStatusFilter] = useState('open');
  const [statusChangingId, setStatusChangingId] = useState(null);
  const [supportsClosedAt, setSupportsClosedAt] = useState(false);
  const canReopenUscita = role === 'admin' || role === 'presidente';
  const canDeleteUscita = role === 'admin' || role === 'presidente';

  const loadUscite = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [usciteResponse, membersResponse] = await Promise.allSettled([getUscite(), getMembers()]);

      if (usciteResponse.status === 'fulfilled') {
        setUscite(usciteResponse.value);
        const firstRow = usciteResponse.value[0];
        setSupportsClosedAt((prev) =>
          firstRow ? Object.prototype.hasOwnProperty.call(firstRow, 'closed_at') : prev,
        );
      } else {
        throw usciteResponse.reason;
      }

      if (membersResponse.status === 'fulfilled') {
        setMembers(dedupeMembers(membersResponse.value ?? []));
      } else {
        console.warn('[Uscite] Impossibile caricare i soci collegati:', membersResponse.reason?.message ?? membersResponse.reason);
        setMembers([]);
      }
    } catch (loadError) {
      console.error('[Uscite] Errore caricamento', loadError);
      setError('Impossibile caricare le uscite, riprova più tardi.');
    } finally {
      setLoading(false);
    }
    loadActiveLoans();
  }, []);

  useEffect(() => {
    loadUscite();
  }, [loadUscite]);

  async function loadActiveLoans() {
    const { data } = await supabase.from('loans').select('uscita_id,status');
    const map = new Map();
    (data ?? []).forEach((loan) => {
      if (loan.status === 'in_corso' && loan.uscita_id) {
        map.set(loan.uscita_id, true);
      }
    });
    setActiveLoansMap(map);
  }

  async function handleDelete(id) {
    if (!window.confirm('Eliminare questa uscita?')) {
      return;
    }
    try {
      await deleteUscita(id);
      safeLogActivity(
        {
          action: 'delete_uscita',
          entity: 'uscite',
          entityId: id,
        },
        user,
      );
      await loadUscite();
    } catch (deleteError) {
      setError(deleteError.message ?? 'Errore durante l\'eliminazione dell\'uscita.');
    }
  }

  async function handleStatusChange(uscita, nextStatus) {
    if (nextStatus === 'chiusa' && role === 'socio' && activeLoansMap.get(uscita.id)) {
      setError('Per chiudere l\'uscita devi prima restituire tutto il materiale collegato (nessun prestito deve essere in corso).');
      return;
    }
    setStatusChangingId(uscita.id);
    setError('');
    try {
      const payload = { status: nextStatus };
      if (supportsClosedAt) {
        payload.closed_at = nextStatus === 'chiusa' ? new Date().toISOString() : null;
      }
      const updated = await updateUscita(uscita.id, payload);
      safeLogActivity(
        {
          action: 'change_uscita_status',
          entity: 'uscite',
          entityId: updated.id,
          details: { status: nextStatus },
        },
        user,
      );
      await loadUscite();
    } catch (statusError) {
      if (supportsClosedAt && /closed_at/i.test(statusError.message ?? '')) {
        setSupportsClosedAt(false);
        try {
          const fallbackUpdated = await updateUscita(uscita.id, { status: nextStatus });
          safeLogActivity(
            {
              action: 'change_uscita_status',
              entity: 'uscite',
              entityId: fallbackUpdated.id,
              details: { status: nextStatus },
            },
            user,
          );
          await loadUscite();
          return;
        } catch (fallbackError) {
          setError(fallbackError.message ?? 'Impossibile aggiornare lo stato dell\'uscita.');
        }
      } else {
        setError(statusError.message ?? 'Impossibile aggiornare lo stato dell\'uscita.');
      }
    } finally {
      setStatusChangingId(null);
    }
  }

  async function handleCreate(payload) {
    setFormError('');
    setFormSuccess('');
    setFormSubmitting(true);
    try {
      const created = await createUscita(payload);
      safeLogActivity(
        {
          action: 'create_uscita',
          entity: 'uscite',
          entityId: created.id,
          details: { titolo: created.titolo, data: created.data },
        },
        user,
      );
      setFormSuccess('Uscita registrata correttamente.');
      setShowForm(false);
      await loadUscite();
      setFormSubmitting(false);
    } catch (createError) {
      setFormSubmitting(false);
      const message =
        createError.message && createError.message.includes('responsabile')
          ? 'Aggiungi le colonne responsabile_id e responsabile_nome alla tabella "uscite" (vedi README) per salvare il responsabile.'
          : createError.message ?? 'Impossibile creare l\'uscita.';
      setFormError(message);
    }
  }

  const membersMap = useMemo(() => {
    const result = new Map();
    members.forEach((member) => {
      if (member?.id) {
        result.set(String(member.id), member.full_name);
      }
    });
    return result;
  }, [members]);

  function goToPrestito(uscita) {
    const params = new URLSearchParams();
    if (uscita?.id) params.set('uscita', uscita.id);
    if (uscita?.titolo) params.set('uscitaTitle', uscita.titolo);
    if (uscita?.data) params.set('uscitaDate', uscita.data);
    const queryString = params.toString();
    navigate(queryString ? `/prestito-avanzato?${queryString}` : '/prestito-avanzato');
  }

  const filteredUscite = useMemo(() => {
    return uscite.filter((uscita) => {
      const matchesQuery =
        !filters.query ||
        uscita.titolo?.toLowerCase().includes(filters.query.toLowerCase()) ||
        uscita.luogo?.toLowerCase().includes(filters.query.toLowerCase());
      const matchesTipo = !filters.tipo || uscita.tipo?.toLowerCase() === filters.tipo.toLowerCase();
      const isClosed = uscita.status === 'chiusa';
      const matchesStatus =
        statusFilter === 'all' || (statusFilter === 'closed' ? isClosed : !isClosed);
      return matchesQuery && matchesTipo && matchesStatus;
    });
  }, [uscite, filters, statusFilter]);

  return (
    <section className="page-grid">
      <AlertList alerts={[...adminAlerts, ...userAlerts]} navigate={navigate} onDismiss={dismissAlert} />
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
        <select value={filters.tipo} onChange={(event) => setFilters((prev) => ({ ...prev, tipo: event.target.value }))}>
          {TIPO_OPTIONS.map((option) => (
            <option key={option.value || 'all'} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <div className="pill-group">
          {[
            { value: 'all', label: 'Tutte' },
            { value: 'open', label: 'Prossime' },
            { value: 'closed', label: 'Chiuse' },
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
        <small style={{ color: 'var(--color-muted)' }}>
          {filteredUscite.length} uscite su {uscite.length}
        </small>
      </div>

      {error && <p style={{ color: 'var(--color-accent)' }}>{error}</p>}

      {!canEditUscite && (
        <p className="card" style={{ background: '#fff5f5', borderColor: '#ffc9c9', color: '#c92a2a' }}>
          Non puoi modificare le uscite. Hai accesso in sola lettura.
        </p>
      )}

      {showForm && canEditUscite && (
      <UscitaForm
        onSubmit={handleCreate}
        submitting={formSubmitting}
        errorMessage={formError}
        successMessage={formSuccess}
        onCancel={() => {
          setShowForm(false);
          setFormSuccess('');
          setFormError('');
        }}
        membersList={members}
      />
      )}

      {loading ? (
        <p>Caricamento uscite...</p>
      ) : (
        <div className="card-list">
          {filteredUscite.map((uscita) => {
            const participantsList = [
              ...(uscita.participants_ids ?? []).map((id) => membersMap.get(id)).filter(Boolean),
            ];
            const isClosed = uscita.status === 'chiusa';
            const disableLoanButton = isClosed;
            return (
              <article className="card" key={uscita.id}>
              <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.5rem' }}>
                <div>
                  <strong>{uscita.titolo}</strong>
                  <p style={{ margin: 0, color: 'var(--color-muted)' }}>
                    {uscita.luogo ? (
                      <a href={buildMapsLink(uscita.luogo)} target="_blank" rel="noopener noreferrer">
                        {uscita.luogo}
                      </a>
                    ) : (
                      'Luogo non indicato'
                    )}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                  {uscita.tipo && <span className="chip">{uscita.tipo}</span>}
                  {isClosed && (
                    <span className="chip" style={{ background: 'rgba(173,181,189,0.3)', color: '#495057' }}>
                      Chiusa
                    </span>
                  )}
                </div>
              </header>
              <p style={{ color: 'var(--color-muted)' }}>
                {formatDate(uscita.data)} · {formatTime(uscita.ora)}
              </p>
              <p style={{ marginTop: '0.5rem' }}>
                Responsabile:{' '}
                <strong>
                  {uscita.responsabile_nome ??
                    membersMap.get(uscita.responsabile_id) ??
                    'Da assegnare'}
                </strong>
              </p>
              {(participantsList.length || uscita.participants_manual) && (
                <p style={{ color: 'var(--color-muted)' }}>
                  Partecipanti:{' '}
                  <strong>
                    {[...participantsList, uscita.participants_manual]
                      .filter(Boolean)
                      .join(', ')}
                  </strong>
                </p>
              )}
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <Link to={`/uscite/${uscita.id}`}>Apri scheda</Link>
                {canEditUscite && (
                  <button
                    type="button"
                    onClick={() => goToPrestito(uscita)}
                    disabled={disableLoanButton}
                    title={
                      disableLoanButton ? 'Uscita chiusa: non è possibile registrare materiale' : undefined
                    }
                  >
                    Materiale necessario
                  </button>
                )}
                {canEditUscite && (
                  <button
                    type="button"
                    style={{ background: '#adb5bd' }}
                    onClick={() => navigate(`/uscite/${uscita.id}`)}
                    disabled={isClosed}
                    title={isClosed ? 'Non puoi modificare uscite concluse.' : undefined}
                  >
                    Modifica
                  </button>
                )}
                {canEditUscite && (!isClosed || canReopenUscita) && (
                  <button
                    type="button"
                    style={{ background: isClosed ? '#1971c2' : '#2b8a3e' }}
                    onClick={() => handleStatusChange(uscita, isClosed ? 'aperta' : 'chiusa')}
                    disabled={statusChangingId === uscita.id}
                    title={
                      isClosed && !canReopenUscita
                        ? 'Solo admin e presidente possono riaprire un\'uscita chiusa.'
                        : undefined
                    }
                  >
                    {statusChangingId === uscita.id
                      ? 'Aggiornamento...'
                      : isClosed
                      ? 'Riapri'
                      : 'Chiudi'}
                  </button>
                )}
                {canDeleteUscita && (
                  <button type="button" style={{ background: '#f27367' }} onClick={() => handleDelete(uscita.id)}>
                    Elimina
                  </button>
                )}
              </div>
            </article>
            );
          })}
          {!filteredUscite.length && !loading && <p>Nessuna uscita trovata.</p>}
        </div>
      )}

      {canEditUscite && (
        <button
          className="floating-button"
          type="button"
          onClick={() => {
            setShowForm((prev) => !prev);
            setFormError('');
            setFormSuccess('');
          }}
        >
          {showForm ? 'Chiudi modulo' : 'Nuova uscita'}
        </button>
      )}
    </section>
  );
}
