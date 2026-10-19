import { supabase } from '../lib/supabaseClient';
import { confrontaPerCognome } from '../utils/members.js';

const TABLE = 'members';

// Colonne leggibili da tutti i soci. Lo stato della quota (membership_paid) è riservato
// (migrazione 17): si legge con quote_soci() e si cambia con imposta_quota().
const COLONNE = 'id, old_id, full_name, membership_number, email, phone, membership_year';

function funzioneAssente(error) {
  const code = error?.code ?? '';
  return code === 'PGRST202' || code === '42883';
}

/**
 * Stato delle quote: Map(id socio → pagata). Vuota per chi non può vederlo.
 * Prima della migrazione 17 legge ancora la colonna direttamente.
 */
async function getQuote() {
  const { data, error } = await supabase.rpc('quote_soci');
  if (!error) return new Map((data ?? []).map((riga) => [String(riga.member_id), Boolean(riga.membership_paid)]));
  if (!funzioneAssente(error)) return new Map();
  const vecchio = await supabase.from(TABLE).select('id, membership_paid');
  if (vecchio.error) return new Map();
  return new Map((vecchio.data ?? []).map((riga) => [String(riga.id), Boolean(riga.membership_paid)]));
}

/** Cambia la quota (solo admin, presidente e tesoriere: lo controlla il database). */
export async function impostaQuota(memberId, pagata) {
  const { error } = await supabase.rpc('imposta_quota', { p_member: memberId, p_pagata: Boolean(pagata) });
  if (!error) return;
  if (!funzioneAssente(error)) throw error;
  const vecchio = await supabase.from(TABLE).update({ membership_paid: Boolean(pagata) }).eq('id', memberId);
  if (vecchio.error) throw vecchio.error;
}

/** Separa la quota dal resto dei dati: la quota si salva a parte. */
function separaQuota(payload = {}) {
  const { membership_paid: quota, ...dati } = payload;
  return { dati, quota };
}

function buildFullName(row) {
  if (row.full_name) return row.full_name;
  const itName = [row.nome, row.cognome].filter(Boolean).join(' ').trim();
  if (itName) return itName;
  const enName = [row.first_name, row.last_name].filter(Boolean).join(' ').trim();
  if (enName) return enName;
  return row.display_name ?? row.name ?? row.email ?? 'Socio senza nome';
}

export function normalizeMemberRow(row) {
  if (!row) return row;
  const membershipNumber =
    row.membership_number ?? row.old_id ?? row.numero_tessera ?? row.card_number ?? row.tessera ?? null;
  const resolvedYear =
    row.membership_year ??
    row.year ??
    row.anno ??
    (row.created_at && !Number.isNaN(new Date(row.created_at).getTime())
      ? new Date(row.created_at).getFullYear()
      : null);
  return {
    ...row,
    full_name: buildFullName(row),
    membership_number: membershipNumber,
    old_id: row.old_id ?? membershipNumber,
    membership_paid: Boolean(row.membership_paid),
    membership_year: resolvedYear ?? 2025,
  };
}

export async function getMembers() {
  const [{ data, error }, quote] = await Promise.all([supabase.from(TABLE).select(COLONNE), getQuote()]);
  if (error) throw error;
  return (data ?? [])
    .map((row) => normalizeMemberRow({ ...row, membership_paid: quote.get(String(row.id)) ?? false }))
    // In ordine alfabetico di cognome; la stessa persona in più anni resta vicina, per anno.
    .sort((a, b) => confrontaPerCognome(a, b) || Number(a.membership_year ?? 0) - Number(b.membership_year ?? 0));
}

export async function createMember(payload) {
  const { dati, quota } = separaQuota(payload);
  const { data, error } = await supabase.from(TABLE).insert(dati).select(COLONNE).single();
  if (error) throw error;
  // Un nuovo socio parte «da saldare»: la quota si imposta solo se è pagata.
  if (quota) await impostaQuota(data.id, true);
  return normalizeMemberRow({ ...data, membership_paid: Boolean(quota) });
}

export async function bulkCreateMembers(rows) {
  if (!rows?.length) return [];
  const separati = rows.map((row) => separaQuota(row));
  const { data, error } = await supabase.from(TABLE).insert(separati.map((riga) => riga.dati)).select(COLONNE);
  if (error) throw error;
  const creati = data ?? [];
  for (let i = 0; i < creati.length; i += 1) {
    if (separati[i]?.quota) await impostaQuota(creati[i].id, true);
  }
  return creati.map((row, i) => normalizeMemberRow({ ...row, membership_paid: Boolean(separati[i]?.quota) }));
}

export async function updateMember(id, payload) {
  const { dati, quota } = separaQuota(payload);
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
  if (quota !== undefined) await impostaQuota(id, quota);
  return normalizeMemberRow({ ...riga, membership_paid: Boolean(quota) });
}

export async function deleteMember(id) {
  const { error } = await supabase.from(TABLE).delete().eq('id', id);
  if (error) throw error;
}
