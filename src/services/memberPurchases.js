import { supabase } from '../lib/supabaseClient';

const TABLE = 'member_purchases';

// Colonne leggibili dallo staff. Pagamento e data di pagamento sono riservati
// (migrazione 18): si leggono con pagamenti_acquisti() e si cambiano con
// imposta_pagamento_acquisto().
const COLONNE =
  'id, member_id, item_type, size, quantity, price, status, purchase_year, notes, created_at, purchase_date, delivery_date';

function funzioneAssente(error) {
  const code = error?.code ?? '';
  return code === 'PGRST202' || code === '42883';
}

function normalizePurchase(row) {
  if (!row) return row;
  return {
    ...row,
    quantity: Number(row.quantity ?? 1),
    payment_status: row.payment_status ?? null,
    status: row.status ?? 'ordered',
    purchase_year: Number(row.purchase_year) || new Date().getFullYear(),
  };
}

/**
 * Pagamenti: Map(id acquisto → { payment_status, payment_date }).
 * Vuota per chi non può vederli. Prima della migrazione 18 legge le colonne direttamente.
 */
async function getPagamenti() {
  const { data, error } = await supabase.rpc('pagamenti_acquisti');
  const aMappa = (righe, chiave) =>
    new Map(
      (righe ?? []).map((riga) => [
        String(riga[chiave]),
        { payment_status: riga.payment_status ?? 'unpaid', payment_date: riga.payment_date ?? null },
      ]),
    );
  if (!error) return aMappa(data, 'purchase_id');
  if (!funzioneAssente(error)) return new Map();
  const vecchio = await supabase.from(TABLE).select('id, payment_status, payment_date');
  if (vecchio.error) return new Map();
  return aMappa(vecchio.data, 'id');
}

/** Cambia il pagamento (solo admin, presidente e tesoriere: lo controlla il database). */
export async function impostaPagamentoAcquisto(id, stato, data = null) {
  const { error } = await supabase.rpc('imposta_pagamento_acquisto', {
    p_purchase: id,
    p_stato: stato,
    p_data: data || null,
  });
  if (!error) return;
  if (!funzioneAssente(error)) throw error;
  const vecchio = await supabase
    .from(TABLE)
    .update({ payment_status: stato, payment_date: data || null })
    .eq('id', id);
  if (vecchio.error) throw vecchio.error;
}

/** Separa il pagamento dal resto dell'ordine: si salva a parte. */
function separaPagamento(payload = {}) {
  const { payment_status: stato, payment_date: data, ...dati } = payload;
  return { dati, stato, data };
}

export async function getMemberPurchases() {
  const [{ data, error }, pagamenti] = await Promise.all([
    supabase.from(TABLE).select(COLONNE).order('created_at', { ascending: false }),
    getPagamenti(),
  ]);
  if (error) throw error;
  return (data ?? []).map((row) => normalizePurchase({ ...row, ...(pagamenti.get(String(row.id)) ?? {}) }));
}

export async function createMemberPurchase(payload) {
  const { dati, stato, data: dataPagamento } = separaPagamento(payload);
  const { data, error } = await supabase.from(TABLE).insert(dati).select(COLONNE).single();
  if (error) throw error;
  // Un nuovo ordine parte «da saldare»: il pagamento si imposta solo se indicato.
  if (stato === 'paid' || dataPagamento) await impostaPagamentoAcquisto(data.id, stato ?? 'unpaid', dataPagamento);
  return normalizePurchase({ ...data, payment_status: stato ?? null, payment_date: dataPagamento ?? null });
}

export async function updateMemberPurchase(id, payload) {
  const { dati, stato, data: dataPagamento } = separaPagamento(payload);
  let riga;
  if (Object.keys(dati).length) {
    const { data, error } = await supabase.from(TABLE).update(dati).eq('id', id).select(COLONNE).single();
    if (error) throw error;
    riga = data;
  } else {
    const { data, error } = await supabase.from(TABLE).select(COLONNE).eq('id', id).single();
    if (error) throw error;
    riga = data;
  }
  if (stato !== undefined) await impostaPagamentoAcquisto(id, stato, dataPagamento);
  return normalizePurchase({ ...riga, payment_status: stato ?? null, payment_date: dataPagamento ?? null });
}

export async function deleteMemberPurchase(id) {
  const { error } = await supabase.from(TABLE).delete().eq('id', id);
  if (error) throw error;
}
