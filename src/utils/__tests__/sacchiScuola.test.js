import { describe, expect, it } from 'vitest';
import { canEditSacchiScuola, canViewSacchiScuola } from '../permissions.js';

describe('materiale della scuola nei sacchi', () => {
  it('non è visibile ai soci semplici', () => {
    expect(canViewSacchiScuola('socio')).toBe(false);
    expect(canViewSacchiScuola(['socio'])).toBe(false);
  });

  it('è visibile allo staff, anche come ruolo in più', () => {
    for (const ruolo of ['admin', 'presidente', 'consiglio', 'segretario', 'tesoriere', 'magazziniere', 'direttore_scuola']) {
      expect(canViewSacchiScuola(ruolo)).toBe(true);
    }
    expect(canViewSacchiScuola(['socio', 'magazziniere'])).toBe(true);
  });

  it('lo modificano admin, presidente, magazziniere e direttore scuola', () => {
    expect(canEditSacchiScuola('direttore_scuola')).toBe(true);
    expect(canEditSacchiScuola(['socio', 'magazziniere'])).toBe(true);
    expect(canEditSacchiScuola('presidente')).toBe(true);
    expect(canEditSacchiScuola('consiglio')).toBe(false);
    expect(canEditSacchiScuola('socio')).toBe(false);
  });
});
