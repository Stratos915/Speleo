import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext.jsx';

const initialForm = {
  equipmentId: '',
  quantity: '',
  borrowerName: '',
  borrowerMemberNumber: '',
  notes: '',
};

export default function PrestitoAvanzato() {
  const { role } = useAuth();
  const isAdmin = role === 'admin';
  const [equipment, setEquipment] = useState([]);
  const [members, setMembers] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const [{ data: equipmentData, error: equipmentError }, { data: membersData, error: membersError }] = await Promise.all([
      supabase.from('equipment').select('*').order('name', { ascending: true }),
      supabase.from('members').select('*').order('full_name', { ascending: true }),
    ]);
    if (equipmentError || membersError) {
      setError('Impossibile caricare materiali o soci. Riprova più tardi.');
    } else {
      setEquipment(equipmentData ?? []);
      setMembers(membersData ?? []);
    }
    setLoading(false);
  }

  const selectedEquipment = useMemo(
    () => equipment.find((item) => String(item.equipment_id) === form.equipmentId),
    [equipment, form.equipmentId],
  );

  function handleMemberSelection(value) {
    if (!value) {
      setForm((prev) => ({ ...prev, borrowerMemberNumber: '', borrowerName: prev.borrowerName }));
      return;
    }
    const member = members.find((item) => String(item.membership_number) === value);
    if (member) {
      setForm((prev) => ({
        ...prev,
        borrowerMemberNumber: String(member.membership_number),
        borrowerName: member.full_name,
      }));
    }
  }

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

    if (quantity > selectedEquipment.quantity_available) {
      setError('La quantità richiesta supera la disponibilità attuale.');
      setSubmitting(false);
      return;
    }

    if (!form.borrowerName.trim()) {
      setError('Inserisci il nome della persona a cui consegni il materiale.');
      setSubmitting(false);
      return;
    }

    const payload = {
      equipment_id: selectedEquipment.equipment_id,
      borrower_name: form.borrowerName.trim(),
      borrower_member_number: form.borrowerMemberNumber ? Number(form.borrowerMemberNumber) : null,
      quantity,
      notes: form.notes.trim() || null,
    };

    const { error: insertError } = await supabase.from('loans').insert(payload);
    if (insertError) {
      setError(insertError.message);
      setSubmitting(false);
      return;
    }

    const { error: updateError } = await supabase
      .from('equipment')
      .update({
        quantity_available: selectedEquipment.quantity_available - quantity,
      })
      .eq('equipment_id', selectedEquipment.equipment_id);

    if (updateError) {
      setError('Prestito registrato ma impossibile aggiornare il magazzino. Verifica manualmente.');
    } else {
      setSuccess('Prestito registrato correttamente.');
      setForm(initialForm);
      loadData();
    }
    setSubmitting(false);
  }

  if (!isAdmin) {
    return (
      <section>
        <h1>Prestito avanzato</h1>
        <p>Solo gli amministratori possono registrare nuovi prestiti.</p>
      </section>
    );
  }

  return (
    <section className="page-grid">
      <div>
        <h1>Prestito avanzato</h1>
        <p>Registra nuove consegne di materiale e tieni traccia di chi lo utilizza.</p>
      </div>

      {loading ? (
        <p>Caricamento dati...</p>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '1rem' }}>
          <div>
            <label htmlFor="equipmentId">Materiale</label>
            <select
              id="equipmentId"
              value={form.equipmentId}
              onChange={(event) => setForm((prev) => ({ ...prev, equipmentId: event.target.value }))}
              required
            >
              <option value="">Seleziona materiale</option>
              {equipment.map((item) => (
                <option key={item.equipment_id} value={item.equipment_id}>
                  {item.name} — Disponibile: {item.quantity_available}
                </option>
              ))}
            </select>
          </div>

          {selectedEquipment && (
            <div className="chip">
              Disponibile: {selectedEquipment.quantity_available} / {selectedEquipment.quantity_total}
            </div>
          )}

          <div>
            <label htmlFor="quantity">Quantità</label>
            <input
              id="quantity"
              type="number"
              min={1}
              value={form.quantity}
              onChange={(event) => setForm((prev) => ({ ...prev, quantity: event.target.value }))}
              required
            />
          </div>

          <div>
            <label htmlFor="memberSelect">Seleziona socio (facoltativo)</label>
            <select
              id="memberSelect"
              value={form.borrowerMemberNumber}
              onChange={(event) => handleMemberSelection(event.target.value)}
            >
              <option value="">Nessuno</option>
              {members.map((member) => (
                <option key={member.membership_number} value={member.membership_number}>
                  {member.membership_number} — {member.full_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="borrowerName">Consegnato a</label>
            <input
              id="borrowerName"
              placeholder="Nome e cognome"
              value={form.borrowerName}
              onChange={(event) => setForm((prev) => ({ ...prev, borrowerName: event.target.value }))}
              required
            />
          </div>

          <div>
            <label htmlFor="notes">Note (facoltative)</label>
            <textarea
              id="notes"
              placeholder="Inserisci eventuali note, luogo o motivazione"
              value={form.notes}
              onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
            />
          </div>

          <button type="submit" disabled={submitting}>
            {submitting ? 'Registrazione...' : 'Registra prestito'}
          </button>

          {error && <p style={{ color: 'var(--color-accent)' }}>{error}</p>}
          {success && <p style={{ color: 'var(--color-primary-dark)' }}>{success}</p>}
        </form>
      )}
    </section>
  );
}
