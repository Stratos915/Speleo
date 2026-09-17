import { describe, expect, it } from 'vitest';
import {
  collectInlineFiles,
  dataUrlToBlob,
  extractScuolaDocument,
  hasScuolaContent,
  replaceInlineFiles,
  safeStorageName,
} from '../scuolaData.js';

const legacy = {
  updatedAt: '2026-05-01T10:00:00Z',
  state: { activeYearId: 'y1' },
  yearFolders: [{ id: 'y1', label: 'Anno 2026', courses: [{ id: 'c1', name: 'Corso 2026', students: [{ id: 's1' }] }] }],
  registry: [{ id: 'r1', documents: [{ id: 'd1', name: 'brevetto.pdf', dataUrl: 'data:application/pdf;base64,JVBERi0=' }] }],
  teachingMaterials: [
    { id: 'm1', name: 'dispensa.txt', dataUrl: 'data:text/plain;base64,Y2lhbw==' },
    { id: 'm2', name: 'gia-caricato.pdf', storagePath: 'materiali/x.pdf' },
  ],
};

describe('dati della scuola', () => {
  it('tiene solo i dati condivisi, non lo stato dell\'interfaccia', () => {
    const doc = extractScuolaDocument(legacy);
    expect(Object.keys(doc)).toEqual(['yearFolders', 'registry', 'teachingMaterials']);
    expect(extractScuolaDocument(null)).toEqual({ yearFolders: [], registry: [], teachingMaterials: [] });
  });

  it('riconosce se ci sono dati da trasferire', () => {
    expect(hasScuolaContent(legacy)).toBe(true);
    expect(hasScuolaContent({ yearFolders: [{ id: 'y', courses: [] }] })).toBe(false);
  });

  it('trova i file salvati nel browser e li sostituisce con il percorso nello storage', () => {
    const inline = collectInlineFiles(legacy);
    expect(inline.map((item) => item.file.id)).toEqual(['d1', 'm1']);
    const replaced = replaceInlineFiles(legacy, new Map([['d1', 'registro/d1.pdf'], ['m1', 'materiali/m1.txt']]));
    expect(replaced.registry[0].documents[0]).toEqual({ id: 'd1', name: 'brevetto.pdf', storagePath: 'registro/d1.pdf' });
    expect(replaced.teachingMaterials[0].dataUrl).toBeUndefined();
    expect(replaced.teachingMaterials[1].storagePath).toBe('materiali/x.pdf');
  });

  it('lascia intatti i file non caricati', () => {
    const replaced = replaceInlineFiles(legacy, new Map([['d1', 'registro/d1.pdf']]));
    expect(replaced.teachingMaterials[0].dataUrl).toContain('base64');
  });

  it('decodifica i data URL', async () => {
    const blob = dataUrlToBlob('data:text/plain;base64,Y2lhbw==');
    expect(blob.type).toBe('text/plain');
    expect(await blob.text()).toBe('ciao');
    expect(() => dataUrlToBlob('non-valido')).toThrow();
  });

  it('crea nomi di file sicuri per lo storage', () => {
    expect(safeStorageName('Modulo iscrizione è 2026 (firmato).pdf')).toBe('Modulo-iscrizione-e-2026-firmato-.pdf');
    expect(safeStorageName('')).toBe('file');
  });
});
