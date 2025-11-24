import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext.jsx';

const FILTERS = [
  { value: 'all', label: 'Tutti' },
  { value: 'in_corso', label: 'In corso' },
  { value: 'chiuso', label: 'Chiusi' },
];

export default function StoricoPrestiti() {
  const { role } = useAuth();
  const isAdmin = role === 'admin';
  const [loans, setLoans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [error, setError] = useState('');
  const [processingId, setProcessingId] = useState(null);

  useEffect(() => {
    loadLoans();
  }, []);

  async function loadLoans() {
    setLoading(true);
    setError('');
    const { data, error: fetchError } = await supabase
      .from('loans')
      .select(
        `
        id,
        equipment_id,
        borrower_name,
        borrower_member_number,
        quantity,
        status,
        delivered_at,
        returned_at,
        notes,
        equipment:equipment_id (
          name,
          quantity_available
        )
      `,
      )
      .order('delivered_at', { ascending: false });

    if (fetchError) {
      setError('Impossibile caricare lo storico dei prestiti.');
    } else {
      setLoans(data ?? []);
    }
    setLoading(false);
  }

  const filteredLoans = useMemo(() => {
    if (filter === 'all') return loans;
    return loans.filter((loan) => loan.status === filter);
  }, [loans, filter]);

  async function handleRestitution(loan) {
    if (!isAdmin) return;
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

    const { data: equipmentRow, error: equipmentFetchError } = await supabase
      .from('equipment')
      .select('quantity_available')
      .eq('equipment_id', loan.equipment_id)
      .single();
    if (equipmentFetchError) {
      setError('Prestito chiuso ma non è stato possibile aggiornare il magazzino.');
    } else {
      const newAvailability = Number(equipmentRow.quantity_available ?? 0) + loan.quantity;
      const { error: equipmentUpdateError } = await supabase
        .from('equipment')
        .update({ quantity_available: newAvailability })
        .eq('equipment_id', loan.equipment_id);
      if (equipmentUpdateError) {
        setError('Prestito chiuso ma quantità non aggiornata. Controlla il magazzino.');
      }
    }
    setProcessingId(null);
    loadLoans();
  }

  function formatDate(value) {
    if (!value) return '—';
    return new Intl.DateTimeFormat('it-IT', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  }

  return (
    <section className="page-grid">
      <div>
        <h1>Storico prestiti</h1>
        <p>Consulta tutti i prestiti registrati e gestisci le restituzioni del materiale.</p>
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        {FILTERS.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => setFilter(item.value)}
            style={{
              background: filter === item.value ? 'var(--color-primary)' : 'var(--color-border)',
              color: filter === item.value ? '#fff' : 'var(--color-muted)',
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      {error && <p style={{ color: 'var(--color-accent)' }}>{error}</p>}

      {loading ? (
        <p>Caricamento storico...</p>
      ) : (
        <div className="page-grid" style={{ gap: '1rem' }}>
          {filteredLoans.map((loan) => (
            <article
              key={loan.id}
              style={{
                border: '1px solid var(--color-border)',
                borderRadius: '1rem',
                padding: '1rem',
                background: '#fff',
                boxShadow: '0 10px 22px rgba(14, 151, 154, 0.08)',
              }}
            >
              <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h3 style={{ marginBottom: '0.25rem' }}>
                    {loan.equipment?.name ?? 'Materiale'} x {loan.quantity}
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
              {loan.notes && <p style={{ fontStyle: 'italic' }}>Note: {loan.notes}</p>}
              {isAdmin && loan.status === 'in_corso' && (
                <button type="button" disabled={processingId === loan.id} onClick={() => handleRestitution(loan)}>
                  {processingId === loan.id ? 'Aggiornamento...' : 'Restituisci'}
                </button>
              )}
            </article>
          ))}
          {!filteredLoans.length && <p>Nessun prestito trovato per il filtro selezionato.</p>}
        </div>
      )}
    </section>
  );
}
