import { supabase } from '../lib/supabaseClient';
import {
  LEGACY_SCUOLA_STORAGE_KEY,
  collectInlineFiles,
  dataUrlToBlob,
  extractScuolaDocument,
  replaceInlineFiles,
  safeStorageName,
} from '../utils/scuolaData.js';

export const SCUOLA_BUCKET = 'scuola-documenti';

export class ScuolaConflictError extends Error {
  constructor(message) {
    super(message ?? 'Qualcun altro ha modificato i dati della scuola. Ricarica la pagina.');
    this.name = 'ScuolaConflictError';
  }
}

function newId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export async function loadScuolaData() {
  const { data, error } = await supabase
    .from('scuola_dati')
    .select('data, version, updated_at, updated_by_email')
    .eq('id', 'principale')
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    document: extractScuolaDocument(data.data),
    version: data.version,
    updatedAt: data.updated_at,
    updatedByEmail: data.updated_by_email,
  };
}

export async function saveScuolaData(document, expectedVersion) {
  const { data, error } = await supabase.rpc('scuola_salva', {
    p_data: extractScuolaDocument(document),
    p_expected_version: expectedVersion ?? 0,
  });
  if (error) {
    if (error.code === 'PT409' || /modificato i dati della scuola/i.test(error.message ?? '')) {
      throw new ScuolaConflictError(error.message);
    }
    throw error;
  }
  return { version: data.version, updatedAt: data.updated_at };
}

export async function uploadScuolaFile(file, scope = 'materiali') {
  const path = `${scope}/${newId()}-${safeStorageName(file.name)}`;
  const { error } = await supabase.storage.from(SCUOLA_BUCKET).upload(path, file, {
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  });
  if (error) throw new Error(error.message ?? `Impossibile caricare ${file.name}`);
  return path;
}

export async function removeScuolaFile(storagePath) {
  if (!storagePath) return;
  const { error } = await supabase.storage.from(SCUOLA_BUCKET).remove([storagePath]);
  if (error) console.warn('[Scuola] file non rimosso dallo storage:', error.message);
}

export async function getScuolaFileUrl(storagePath, downloadName) {
  const { data, error } = await supabase.storage
    .from(SCUOLA_BUCKET)
    .createSignedUrl(storagePath, 60 * 10, downloadName ? { download: downloadName } : undefined);
  if (error) throw new Error(error.message ?? 'Impossibile aprire il file.');
  return data.signedUrl;
}

export function readLegacyLocalScuola() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(LEGACY_SCUOLA_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Conserva una copia di sicurezza e smette di usare la vecchia chiave. */
export function archiveLegacyLocalScuola() {
  if (typeof window === 'undefined') return;
  try {
    const raw = window.localStorage.getItem(LEGACY_SCUOLA_STORAGE_KEY);
    if (!raw) return;
    window.localStorage.setItem(`${LEGACY_SCUOLA_STORAGE_KEY}-backup-importato`, raw);
    window.localStorage.removeItem(LEGACY_SCUOLA_STORAGE_KEY);
  } catch (error) {
    console.warn('[Scuola] impossibile archiviare i dati locali:', error);
  }
}

/** Carica nello storage i file che erano salvati dentro il browser. */
export async function moveInlineFilesToStorage(document) {
  const inline = collectInlineFiles(document);
  const uploaded = new Map();
  const failures = [];
  for (const { scope, file } of inline) {
    try {
      const blob = dataUrlToBlob(file.dataUrl);
      const upload = new File([blob], file.name ?? 'file', { type: file.type || blob.type });
      uploaded.set(file.id, await uploadScuolaFile(upload, scope));
    } catch (error) {
      failures.push({ name: file.name, message: error.message });
    }
  }
  return { document: replaceInlineFiles(document, uploaded), failures };
}
