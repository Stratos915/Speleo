// Funzioni pure per i dati della Scuola (testate in src/utils/__tests__).

export const LEGACY_SCUOLA_STORAGE_KEY = 'speleo-scuola-data-v2';
export const SCUOLA_UI_STATE_KEY = 'speleo-scuola-ui-v1';

/** Estrae dal payload solo i dati condivisi (niente stato dell'interfaccia). */
export function extractScuolaDocument(payload) {
  const source = payload && typeof payload === 'object' ? payload : {};
  return {
    yearFolders: Array.isArray(source.yearFolders) ? source.yearFolders : [],
    registry: Array.isArray(source.registry) ? source.registry : [],
    teachingMaterials: Array.isArray(source.teachingMaterials) ? source.teachingMaterials : [],
  };
}

export function hasScuolaContent(document) {
  const doc = extractScuolaDocument(document);
  const hasCourses = doc.yearFolders.some((year) => (year.courses ?? []).some((course) => {
    return (course.instructors ?? []).length || (course.students ?? []).length || course.name;
  }));
  return hasCourses || doc.registry.length > 0 || doc.teachingMaterials.length > 0;
}

/** Elenca i file ancora salvati come data URL dentro il documento. */
export function collectInlineFiles(document) {
  const doc = extractScuolaDocument(document);
  const files = [];
  doc.registry.forEach((entry) => {
    (entry.documents ?? []).forEach((file) => {
      if (typeof file?.dataUrl === 'string' && file.dataUrl.startsWith('data:')) {
        files.push({ scope: 'registro', ownerId: entry.id, file });
      }
    });
  });
  doc.teachingMaterials.forEach((file) => {
    if (typeof file?.dataUrl === 'string' && file.dataUrl.startsWith('data:')) {
      files.push({ scope: 'materiali', ownerId: null, file });
    }
  });
  return files;
}

/** Sostituisce i file inline con i percorsi nello storage (mappa id -> path). */
export function replaceInlineFiles(document, uploadedPaths) {
  const doc = extractScuolaDocument(document);
  const swap = (file) => {
    const path = uploadedPaths.get(file?.id);
    if (!path) return file;
    const { dataUrl: _dataUrl, ...rest } = file;
    return { ...rest, storagePath: path };
  };
  return {
    ...doc,
    registry: doc.registry.map((entry) => ({
      ...entry,
      documents: (entry.documents ?? []).map(swap),
    })),
    teachingMaterials: doc.teachingMaterials.map(swap),
  };
}

export function dataUrlToBlob(dataUrl) {
  const match = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(dataUrl ?? '');
  if (!match) throw new Error('File non leggibile.');
  const mime = match[1] || 'application/octet-stream';
  const isBase64 = Boolean(match[2]);
  const payload = match[3];
  if (!isBase64) {
    return new Blob([decodeURIComponent(payload)], { type: mime });
  }
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mime });
}

export function safeStorageName(name) {
  const cleaned = String(name ?? 'file')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return cleaned.slice(-80) || 'file';
}
