import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import useAuth from '../context/useAuth.js';
import usePermissions from '../hooks/usePermissions.js';
import { getEquipment, getEquipmentById, setEquipmentAvailability } from '../services/equipment.js';

const FILTERS = [
  { value: 'all', label: 'Tutti' },
  { value: 'in_corso', label: 'In corso' },
  { value: 'chiuso', label: 'Chiusi' },
];

export default function StoricoPrestiti() {
  const { role, user } = useAuth();
  const { canEditSection } = usePermissions();
  const canManageLoans = canEditSection('prestiti');
  const canDeleteLoans = role === 'admin' || role === 'presidente';
  const navigate = useNavigate();
  const [loans, setLoans] = useState([]);
  const [equipmentList, setEquipmentList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [error, setError] = useState('');
  const [processingId, setProcessingId] = useState(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    loadLoans();
  }, []);

  const equipmentMap = useMemo(() => {
    const map = new Map();
    equipmentList.forEach((item) => {
      const key = String(item.id ?? item.equipment_id ?? '');
      if (key) {
        map.set(key, item);
      }
    });
    return map;
  }, [equipmentList]);

  async function loadLoans() {
    setLoading(true);
    setError('');
    try {
      const [{ data, error: fetchError }, equipmentData] = await Promise.all([
        supabase
          .from('loans')
          .select(
            'id,equipment_id,borrower_name,borrower_member_number,quantity,status,delivered_at,returned_at,notes,uscita_id,reserved_until',
          )
          .order('delivered_at', { ascending: false }),
        getEquipment(),
      ]);
      if (fetchError) {
        throw fetchError;
      }
      setLoans(data ?? []);
      setEquipmentList(equipmentData ?? []);
    } catch (loadError) {
      console.error('[StoricoPrestiti] Errore caricamento prestiti:', loadError);
      setLoans([]);
      setError('Impossibile caricare lo storico dei prestiti.');
    } finally {
      setLoading(false);
    }
  }

  const filteredLoans = useMemo(() => {
    const term = query.trim().toLowerCase();
    return loans.filter((loan) => {
      const matchesFilter = filter === 'all' || loan.status === filter;
      const equipmentName = equipmentMap.get(String(loan.equipment_id ?? ''))?.name?.toLowerCase() ?? '';
      const matchesQuery =
        !term ||
        loan.borrower_name?.toLowerCase().includes(term) ||
        equipmentName.includes(term);
      return matchesFilter && matchesQuery;
    });
  }, [loans, filter, query, equipmentMap]);

  async function handleRestitution(loan) {
    const isOwner = loan.borrower_name && user?.email && loan.borrower_name === user.email;
    if (!canManageLoans && !isOwner) return;
    setProcessingId(loan.id);
    setError('');
    const now = new Date().toISOString();

    const { error: loanError } = await supabase
      .from('loans')
      .update({ status: 'chiuso', returned_at: now })
      .eq('id', loan.id);
    if (loanError) {
      setError('Impossibile chiudere il prestito. Riprova.');
      setProcessingId(null);
      return;
    }

    try {
      let equipmentRow = equipmentMap.get(String(loan.equipment_id ?? ''));
      if (!equipmentRow) {
        equipmentRow = await getEquipmentById(loan.equipment_id);
      }
      const currentAvailable = Number(equipmentRow.quantity_available ?? equipmentRow.quantity ?? 0);
      const newAvailability = currentAvailable + loan.quantity;
      await setEquipmentAvailability({ column: 'equipment_id', value: loan.equipment_id }, newAvailability);
    } catch (availabilityError) {
      console.error('[StoricoPrestiti] Errore aggiornamento magazzino:', availabilityError);
      setError('Prestito chiuso ma quantità non aggiornata. Controlla il magazzino.');
    }
    setProcessingId(null);
    loadLoans();
  }

  async function handleDeleteLoan(loan) {
    if (!canDeleteLoans) return;
    if (!window.confirm('Eliminare questa voce dal registro prestiti?')) {
      return;
    }
    setProcessingId(loan.id);
    setError('');
    const { error: deleteError } = await supabase.from('loans').delete().eq('id', loan.id);
    if (deleteError) {
      setError('Impossibile eliminare il prestito selezionato.');
    }
    setProcessingId(null);
    await loadLoans();
  }

  function formatDate(value) {
    if (!value) return '—';
    return new Intl.DateTimeFormat('it-IT', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  }

  function formatDateOnly(value) {
    if (!value) return '—';
    return new Intl.DateTimeFormat('it-IT', {
      dateStyle: 'medium',
    }).format(new Date(value));
  }

  return (
    <section className="page-grid">
      <div>
        <h1>Storico prestiti</h1>
        <p>Consulta tutti i prestiti registrati e gestisci le restituzioni del materiale.</p>
      </div>

      <input
        type="search"
        placeholder="Cerca per materiale o persona"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />

      <div className="pill-group">
        {FILTERS.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => setFilter(item.value)}
            className={`pill-button ${filter === item.value ? 'pill-button--active' : ''}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {error && <p style={{ color: 'var(--color-accent)' }}>{error}</p>}

      {loading ? (
        <p>Caricamento storico...</p>
      ) : (
        <div className="card-list">
          {filteredLoans.map((loan) => {
            const equipmentRow = equipmentMap.get(String(loan.equipment_id ?? ''));
            const equipmentName = equipmentRow?.name ?? 'Materiale';
            const reservedUntil = loan.reserved_until ? formatDateOnly(loan.reserved_until) : null;
            return (
              <article className="card" key={loan.id}>
                <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <h3 style={{ marginBottom: '0.25rem' }}>
                      {equipmentName} x {loan.quantity}
                    </h3>
                    <p style={{ margin: 0, color: 'var(--color-muted)' }}>a: {loan.borrower_name}</p>
                  </div>
                  <span
                    className="chip"
                    style={{
                      background: loan.status === 'in_corso' ? 'rgba(244, 162, 97, 0.2)' : 'rgba(76, 201, 91, 0.2)',
                      color: loan.status === 'in_corso' ? '#d9480f' : '#2b8a3e',
                    }}
                  >
                    stato: {loan.status === 'in_corso' ? 'in corso' : 'chiuso'}
                  </span>
                </header>
                <p style={{ margin: '0.5rem 0', color: 'var(--color-muted)' }}>il: {formatDate(loan.delivered_at)}</p>
                {loan.status === 'chiuso' && (
                  <p style={{ margin: '0.25rem 0', color: 'var(--color-muted)' }}>
                    restituito il: {formatDate(loan.returned_at)}
                  </p>
                )}
                {reservedUntil && (
                  <p style={{ margin: '0.25rem 0', color: '#d9480f' }}>Disponibile in sede entro {reservedUntil}</p>
                )}
                {loan.notes && <p style={{ fontStyle: 'italic' }}>Note: {loan.notes}</p>}
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {loan.uscita_id && (
                    <button
                      type="button"
                      style={{ background: '#228be6' }}
                      onClick={() => navigate(`/uscite/${loan.uscita_id}`)}
                    >
                      Apri uscita
                    </button>
                  )}
                  {(canManageLoans || (user?.email && loan.borrower_name === user.email)) && loan.status === 'in_corso' && (
                    <button type="button" disabled={processingId === loan.id} onClick={() => handleRestitution(loan)}>
                      {processingId === loan.id ? 'Aggiornamento...' : 'Restituisci'}
                    </button>
                  )}
                  {canDeleteLoans && (
                    <button
                      type="button"
                      style={{ background: '#e03131' }}
                      disabled={processingId === loan.id}
                      onClick={() => handleDeleteLoan(loan)}
                    >
                      Elimina
                    </button>
                  )}
                </div>
              </article>
            );
          })}
          {!filteredLoans.length && <p>Nessun prestito trovato per il filtro selezionato.</p>}
        </div>
      )}
    </section>
  );
}
