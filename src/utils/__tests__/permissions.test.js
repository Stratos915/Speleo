import { describe, expect, it } from 'vitest';
import { canEditSection, canUseAction, canViewPage, getNavigationVisibility, getPageEditRoles } from '../permissions.js';

describe('permessi per ruolo', () => {
  it('il socio non vede report, soci e scuola', () => {
    expect(canViewPage('socio', 'report')).toBe(false);
    expect(canViewPage('socio', 'soci')).toBe(false);
    expect(canViewPage('socio', 'scuola')).toBe(false);
    expect(canViewPage('socio', 'magazzino')).toBe(true);
  });

  it('solo admin, presidente e direttore scuola modificano la scuola', () => {
    expect(canEditSection('direttore_scuola', 'scuola')).toBe(true);
    expect(canEditSection('presidente', 'scuola')).toBe(true);
    expect(canEditSection('magazziniere', 'scuola')).toBe(false);
  });

  it('il magazziniere gestisce magazzino e prestiti, come previsto dal database', () => {
    expect(canEditSection('magazziniere', 'inventory')).toBe(true);
    expect(canEditSection('magazziniere', 'prestiti')).toBe(true);
    expect(canEditSection('socio', 'prestiti')).toBe(false);
  });

  it('il socio può chiedere un prestito ma non modificare il magazzino', () => {
    expect(canUseAction('socio', 'magazzino', 'loan')).toBe(true);
    expect(canEditSection('socio', 'inventory')).toBe(false);
  });

  it('un ruolo sconosciuto non ottiene permessi di modifica', () => {
    expect(canEditSection('ospite', 'inventory')).toBe(false);
    expect(getNavigationVisibility('ospite').report).toBe(false);
  });

  it('le rotte di creazione uscita accettano il socio', () => {
    expect(getPageEditRoles('uscite')).toContain('socio');
  });
});
