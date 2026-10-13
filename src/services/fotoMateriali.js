import { supabase } from '../lib/supabaseClient';
import { riduciFoto } from '../utils/immagini.js';

// Foto dei materiali (migrazione 12): archivio pubblico «materiali-foto»,
// percorso salvato in equipment.foto_path.
const BUCKET = 'materiali-foto';
const TIPI_AMMESSI = ['image/jpeg', 'image/png', 'image/webp'];

export function urlFotoMateriale(path) {
  if (!path) return '';
  return supabase.storage.from(BUCKET).getPublicUrl(path).data?.publicUrl ?? '';
}

/** Riduce e carica la foto; restituisce il percorso da salvare sul materiale. */
export async function caricaFotoMateriale(equipmentId, file) {
  if (!file) throw new Error('Nessuna foto selezionata.');
  const ridotta = await riduciFoto(file);
  const tipo = ridotta.type || file.type;
  if (!TIPI_AMMESSI.includes(tipo)) {
    throw new Error('Formato non supportato: usa una foto JPEG, PNG o WebP.');
  }
  if (ridotta.size > 2 * 1024 * 1024) {
    throw new Error('La foto è troppo grande (massimo 2 MB).');
  }
  const estensione = tipo === 'image/png' ? 'png' : tipo === 'image/webp' ? 'webp' : 'jpg';
  const path = `${equipmentId}/${crypto.randomUUID()}.${estensione}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, ridotta, {
    contentType: tipo,
    cacheControl: '31536000',
    upsert: false,
  });
  if (error) throw error;
  return path;
}

export async function rimuoviFotoMateriale(path) {
  if (!path) return;
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) console.warn('[Magazzino] foto non rimossa dall\'archivio:', error.message);
}
