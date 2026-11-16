import { supabase } from '../lib/supabaseClient';
import { friendlyDbError } from './loans.js';

// Prestiti dei pezzi ACAR e dei sacchi della scuola (migrazione 22).

export class MigrazionePrestitiMancante extends Error {
  constructor() {
    super('Per prestare il materiale ACAR e i sacchi va eseguita la migrazione 22 su Supabase.');
    this.name = 'MigrazionePrestitiMancante';
  }
}

function mancaMigrazione(error) {
  if (!error) return false;
  const testo = `${error.message ?? ''} ${error.details ?? ''}`;
  return (
    ['42703', 'PGRST202', 'PGRST204'].includes(error.code) ||
    /acar_id|sacco_id|loan_create_speciale/i.test(testo)
  );
}

/** Prestiti aperti dei pezzi ACAR (tipo 'acar') o dei sacchi (tipo 'sacco'), per id del pezzo. */
export async function getPrestitiAperti(tipo) {
  const colonna = tipo === 'acar' ? 'acar_id' : 'sacco_id';
  const { data, error } = await supabase
    .from('loans')
    .select('*')
    .not(colonna, 'is', null)
    .in('status', ['in_corso', 'active'])
    .order('delivered_at', { ascending: false });
  if (mancaMigrazione(error)) throw new MigrazionePrestitiMancante();
  if (error) throw new Error(friendlyDbError(error, 'Impossibile leggere i prestiti.'));
  const mappa = new Map();
  for (const prestito of data ?? []) mappa.set(prestito[colonna], prestito);
  return mappa;
}

/**
 * Nuovo prestito di un pezzo ACAR o di un sacco.
 * dati: { ricevente, tessera, uscitaId, corsoRif, corsoNome, corsistaRif, rientro, note }
 */
export async function creaPrestitoSpeciale(tipo, itemId, dati) {
  const { data, error } = await supabase.rpc('loan_create_speciale', {
    p_tipo: tipo,
    p_item_id: itemId,
    p_borrower_name: dati.ricevente,
    p_borrower_member_number: Number.isInteger(Number(dati.tessera)) && dati.tessera !== '' && dati.tessera !== null
      ? Number(dati.tessera)
      : null,
    p_uscita_id: dati.uscitaId || null,
    p_corso_rif: dati.corsoRif || null,
    p_corso_nome: dati.corsoNome || null,
    p_corsista_rif: dati.corsistaRif || null,
    p_reserved_until: dati.rientro || null,
    p_notes: dati.note || null,
  });
  if (mancaMigrazione(error)) throw new MigrazionePrestitiMancante();
  if (error) throw new Error(friendlyDbError(error, 'Impossibile registrare il prestito.'));
  return data;
}
