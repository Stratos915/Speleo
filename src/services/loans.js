import { supabase } from '../lib/supabaseClient';

const MISSING_FUNCTION_HINT =
  'Aggiornamento del database non ancora applicato: esegui le migrazioni in supabase/migrations (vedi README).';

export function friendlyDbError(error, fallback = 'Operazione non riuscita. Riprova.') {
  if (!error) return fallback;
  const message = error.message ?? '';
  if (error.code === 'PGRST202' || /Could not find the function/i.test(message)) {
    return MISSING_FUNCTION_HINT;
  }
  if (error.code === '42501' && /row-level security/i.test(message)) {
    return 'Non hai i permessi per questa operazione.';
  }
  return message || fallback;
}

export async function createLoan({
  equipmentId,
  quantity,
  borrowerName = null,
  borrowerMemberNumber = null,
  uscitaId = null,
  reservedUntil = null,
  notes = null,
}) {
  const { data, error } = await supabase.rpc('loan_create', {
    p_equipment_id: equipmentId,
    p_quantity: quantity,
    p_borrower_name: borrowerName,
    p_borrower_member_number: borrowerMemberNumber,
    p_uscita_id: uscitaId ? String(uscitaId) : null,
    p_reserved_until: reservedUntil,
    p_notes: notes,
  });
  if (error) throw new Error(friendlyDbError(error, 'Impossibile registrare il prestito.'));
  return data;
}

export async function returnLoan({ loanId, missingQuantity = 0, missingNotes = null }) {
  const { data, error } = await supabase.rpc('loan_return', {
    p_loan_id: loanId,
    p_missing_quantity: missingQuantity,
    p_missing_notes: missingNotes,
  });
  if (error) throw new Error(friendlyDbError(error, 'Impossibile chiudere il prestito.'));
  return data;
}
