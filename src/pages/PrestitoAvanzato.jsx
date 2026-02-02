import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import useAuth from '../context/useAuth.js';
import { getEquipment, setEquipmentAvailability } from '../services/equipment.js';

const initialForm = {
  equipmentId: '',
  quantity: '',
  borrowerName: '',
  borrowerMemberNumber: '',
  notes: '',
};

function formatDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' });
}

function computeReservationDate(uscitaDate) {
  if (!uscitaDate) return null;
  const date = new Date(uscitaDate);
  if (Number.isNaN(date.getTime())) return null;
  date.setDate(date.getDate() - 3);
  return date;
}

export default function PrestitoAvanzato() {
  const [equipment, setEquipment] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [searchParams] = useSearchParams();
  const [activeLoans, setActiveLoans] = useState([]);
  const [loansLoading, setLoansLoading] = useState(true);
  const [loansError, setLoansError] = useState('');
  const navigate = useNavigate();
  const { user } = useAuth();
  const borrowerName = useMemo(() => {
    if (!user) return '';
    return (
      user.user_metadata?.full_name ??
      user.user_metadata?.name ??
      user.user_metadata?.display_name ??
      user.app_metadata?.full_name ??
      user.email ??
      'Socio Speleo'
    );
  }, [user]);
  const borrowerMemberNumber = useMemo(() => {
    if (!user) return '';
    return (
      user.user_metadata?.membership_number ??
      user.user_metadata?.old_id ??
      user.raw_user_meta_data?.old_id ??
      user.app_metadata?.membership_number ??
      ''
    );
  }, [user]);

  useEffect(() => {
    loadData();
    loadActiveLoans();
  }, []);

  useEffect(() => {
    setForm((prev) => {
      const nextName = borrowerName || prev.borrowerName;
      const nextNumber = borrowerMemberNumber ? String(borrowerMemberNumber) : '';
      if (nextName === prev.borrowerName && nextNumber === prev.borrowerMemberNumber) {
        return prev;
      }
      return {
        ...prev,
        borrowerName: nextName,
        borrowerMemberNumber: nextNumber,
      };
    });
  }, [borrowerName, borrowerMemberNumber]);

  const uscitaTitle = searchParams.get('uscitaTitle');
  const uscitaIdParam = searchParams.get('uscita');
  const uscitaDateParam = searchParams.get('uscitaDate');
  const reservedUntilDate = useMemo(() => computeReservationDate(uscitaDateParam), [uscitaDateParam]);

  const preselectedEquipmentId = searchParams.get('equipmentId');

  useEffect(() => {
    setError('');
    setSuccess('');
    setForm({
      ...initialForm,
      borrowerName: borrowerName || '',
      borrowerMemberNumber: borrowerMemberNumber ? String(borrowerMemberNumber) : '',
      equipmentId: preselectedEquipmentId ?? '',
      notes: '',
    });
  }, [uscitaIdParam, uscitaTitle, uscitaDateParam, preselectedEquipmentId, borrowerName, borrowerMemberNumber]);

  useEffect(() => {
    if (uscitaTitle || reservedUntilDate) {
      const dueText = reservedUntilDate ? ` · rientro entro ${formatDate(reservedUntilDate)}` : '';
      const label = uscitaTitle ? `Materiale per uscita: ${uscitaTitle}` : 'Materiale prenotato per uscita';
      setForm((prev) => ({
        ...prev,
        notes: `${label}${dueText}`,
      }));
    }
  }, [uscitaTitle, reservedUntilDate]);

  async function loadData() {
    setLoading(true);
    try {
      const equipmentRes = await getEquipment();
      setEquipment(equipmentRes);
      setError('');
    } catch (equipmentError) {
      console.error('[PrestitoAvanzato] Errore caricamento materiali:', equipmentError);
      setEquipment([]);
      setError(equipmentError.message ?? 'Impossibile caricare l\'inventario, riprova.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (preselectedEquipmentId && equipment.length) {
      const exists = equipment.find((item) => String(item.id ?? item.equipment_id) === preselectedEquipmentId);
      if (exists) {
        setForm((prev) => ({ ...prev, equipmentId: String(exists.id ?? exists.equipment_id) }));
      }
    }
  }, [equipment, preselectedEquipmentId]);

  const selectedEquipment = useMemo(
    () => equipment.find((item) => String(item.id ?? item.equipment_id) === form.equipmentId),
    [equipment, form.equipmentId],
  );

  const equipmentMap = useMemo(() => {
    const map = new Map();
    equipment.forEach((item) => {
      const key = String(item.id ?? item.equipment_id ?? '');
      if (key) {
        map.set(key, item);
      }
    });
    return map;
  }, [equipment]);

  async function loadActiveLoans() {
    setLoansLoading(true);
    setLoansError('');
    let query = supabase
      .from('loans')
      .select('id,equipment_id,borrower_name,quantity,status,delivered_at,notes,reserved_until,uscita_id')
      .eq('status', 'in_corso')
      .order('delivered_at', { ascending: false });
    if (uscitaIdParam) {
      query = query.eq('uscita_id', uscitaIdParam);
    }
    const { data, error: loansFetchError } = await query;

    if (loansFetchError) {
      const friendly =
        loansFetchError.message && loansFetchError.message.includes('public.loans')
          ? 'La tabella "loans" non è stata ancora creata su Supabase. Apri docs/loans-table.sql e incolla lo script nel pannello SQL per abilitarla.'
          : 'Impossibile caricare i prestiti attivi.';
      setLoansError(friendly);
      setActiveLoans([]);
    } else {
      setLoansError('');
      setActiveLoans(data ?? []);
    }
    setLoansLoading(false);
  }

  useEffect(() => {
    loadActiveLoans();
  }, [uscitaIdParam]);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setSuccess('');
    setSubmitting(true);

    if (!selectedEquipment) {
      setError('Seleziona un materiale valido.');
      setSubmitting(false);
      return;
    }

    const quantity = Number(form.quantity);
    if (Number.isNaN(quantity) || quantity <= 0) {
      setError('La quantità deve essere maggiore di zero.');
      setSubmitting(false);
      return;
    }

    const totalAvailable = Number(selectedEquipment.quantity_available ?? selectedEquipment.quantity ?? 0);
    if (quantity > totalAvailable) {
      setError('La quantità richiesta supera la disponibilità attuale.');
      setSubmitting(false);
      return;
    }

    const borrower = (form.borrowerName || borrowerName || '').trim();
    if (!borrower) {
      setError('Impossibile identificare il socio collegato. Esegui di nuovo l\'accesso e riprova.');
      setSubmitting(false);
      return;
    }

    const reservedUntilIso = reservedUntilDate ? reservedUntilDate.toISOString().split('T')[0] : null;

    const payload = {
      equipment_id: selectedEquipment.id ?? selectedEquipment.equipment_id,
      uscita_id: uscitaIdParam || null,
      reserved_until: reservedUntilIso,
      borrower_name: borrower,
      borrower_email: user?.email ?? null,
      borrower_member_number: form.borrowerMemberNumber ? Number(form.borrowerMemberNumber) : null,
      quantity,
      notes: form.notes.trim() || null,
      status: 'in_corso',
      delivered_at: new Date().toISOString(),
    };

    const { error: insertError } = await supabase.from('loans').insert(payload);
    if (insertError) {
      const friendly =
        insertError.message && insertError.message.includes('public.loans')
          ? 'La tabella "loans" non esiste ancora su Supabase. Apri docs/loans-table.sql e incolla il contenuto nell\'SQL Editor per crearla.'
          : insertError.message;
      setError(friendly);
      setSubmitting(false);
      return;
    }

    const newAvailability = Math.max(totalAvailable - quantity, 0);
    try {
      const filter = selectedEquipment.equipment_id
        ? { column: 'equipment_id', value: selectedEquipment.equipment_id }
        : selectedEquipment;
      await setEquipmentAvailability(filter, newAvailability);
      setSuccess('Prestito registrato correttamente.');
      setForm(initialForm);
      loadData();
      loadActiveLoans();
    } catch (availabilityError) {
      console.error('[PrestitoAvanzato] Errore aggiornamento disponibilità:', availabilityError);
      setError(
        availabilityError.message ??
          'Prestito registrato ma impossibile aggiornare il magazzino. Verifica manualmente.',
      );
    }
    setSubmitting(false);
  }

  return (
    <section className="page-grid">
      <header>
        <h1>Prestito avanzato</h1>
        <p>Compila il modulo per consegnare materiale a soci o squadre operative.</p>
      </header>

      <article className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <h2 style={{ margin: 0 }}>Prestiti attivi</h2>
            <p style={{ margin: 0, color: 'var(--color-muted)' }}>Monitoraggio rapido dei materiali fuori sede.</p>
          </div>
          <button type="button" style={{ background: '#adb5bd' }} onClick={() => navigate('/storico-prestiti')}>
            Vai allo storico completo
          </button>
        </div>
        {loansError && <p style={{ color: 'var(--color-accent)' }}>{loansError}</p>}
        {loansLoading ? (
          <p>Caricamento prestiti...</p>
        ) : activeLoans.length ? (
          <ul style={{ listStyle: 'none', padding: 0, margin: '0.75rem 0 0', display: 'grid', gap: '0.5rem' }}>
            {activeLoans.map((loan) => {
              const equipmentRow = equipmentMap.get(String(loan.equipment_id ?? ''));
              const equipmentName = equipmentRow?.name ?? 'Materiale';
              const reservedUntilLabel = loan.reserved_until ? formatDate(loan.reserved_until) : null;
              return (
                <li key={loan.id} style={{ border: '1px solid var(--color-border)', borderRadius: '0.75rem', padding: '0.75rem' }}>
                  <strong>
                    {equipmentName} · x{loan.quantity}
                  </strong>
                  <p style={{ margin: '0.25rem 0', color: 'var(--color-muted)' }}>a: {loan.borrower_name}</p>
                  <small style={{ color: 'var(--color-muted)' }}>
                    consegnato il {loan.delivered_at ? new Date(loan.delivered_at).toLocaleString('it-IT') : '—'}
                  </small>
                  {reservedUntilLabel && (
                    <p style={{ margin: '0.35rem 0 0', color: '#d9480f' }}>Rientro entro {reservedUntilLabel}</p>
                  )}
                  {loan.uscita_id && (
                    <button
                      type="button"
                      style={{ marginTop: '0.35rem', background: 'var(--color-primary-dark)' }}
                      onClick={() => navigate(`/uscite/${loan.uscita_id}`)}
                    >
                      Apri uscita collegata
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p style={{ marginTop: '0.75rem' }}>Non ci sono prestiti in corso.</p>
        )}
      </article>

      {loading ? (
        <p>Caricamento dati...</p>
      ) : (
        <div className="card">
          <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '0.75rem' }}>
            {(uscitaIdParam || reservedUntilDate) && (
              <div
                style={{
                  background: 'rgba(14, 165, 233, 0.12)',
                  borderRadius: '0.75rem',
                  padding: '0.75rem',
                  fontSize: '0.9rem',
                  color: 'var(--color-primary-dark)',
                }}
              >
                {uscitaTitle ? (
                  <strong>Uscita collegata: {uscitaTitle}</strong>
                ) : (
                  <strong>Materiale prenotato per una uscita programmata.</strong>
                )}
                {reservedUntilDate && (
                  <p style={{ margin: '0.35rem 0 0' }}>
                    Deve essere disponibile in magazzino entro il {formatDate(reservedUntilDate)} (3 giorni prima
                    dell&apos;uscita).
                  </p>
                )}
              </div>
            )}

            <select
              value={form.equipmentId}
              onChange={(event) => setForm((prev) => ({ ...prev, equipmentId: event.target.value }))}
              required
            >
              <option value="">Materiale</option>
              {equipment.map((item) => (
                <option key={item.id ?? item.equipment_id} value={item.id ?? item.equipment_id}>
                  {item.name} · Disponibile: {item.quantity_available ?? item.quantity ?? 0}/{item.quantity ?? item.quantity_available ?? 0}
                </option>
              ))}
            </select>

            <input
              type="number"
              min={1}
              placeholder="Quantità"
              value={form.quantity}
              onChange={(event) => setForm((prev) => ({ ...prev, quantity: event.target.value }))}
              required
            />

            <div>
              <label htmlFor="borrowerName" style={{ display: 'block', marginBottom: '0.25rem' }}>
                Consegnato a
              </label>
              <input
                id="borrowerName"
                value={form.borrowerName || borrowerName}
                readOnly
                style={{ background: '#f1f3f5' }}
              />
              <small style={{ color: 'var(--color-muted)' }}>
                Associato automaticamente al profilo connesso ({user?.email ?? 'utente'}).
              </small>
            </div>

            <textarea
              rows={3}
              placeholder="Note (facoltative)"
              value={form.notes}
              onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
            />

            <button type="submit" disabled={submitting}>
              {submitting ? 'Registrazione...' : 'Registra prestito'}
            </button>
            {error && <p style={{ color: 'var(--color-accent)' }}>{error}</p>}
            {success && <p style={{ color: 'var(--color-primary-dark)' }}>{success}</p>}
          </form>
        </div>
      )}
    </section>
  );
}
