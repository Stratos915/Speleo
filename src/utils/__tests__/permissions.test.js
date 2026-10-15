import { describe, expect, it } from 'vitest';
import { canEditSection, canUseAction, canViewPage, getNavigationVisibility, getPageEditRoles } from '../permissions.js';
import { ruoliDelProfilo } from '../permissions.js';

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

describe('doppio ruolo', () => {
  it('segretario da solo non crea uscite, segretario + socio sì', () => {
    expect(canEditSection('segretario', 'uscita')).toBe(false);
    expect(canEditSection(['segretario', 'socio'], 'uscita')).toBe(true);
    expect(canEditSection(['segretario', 'socio'], 'soci')).toBe(true);
    expect(canUseAction(['tesoriere', 'socio'], 'magazzino', 'loan')).toBe(true);
  });

  it('ruoliDelProfilo unisce principale e ruoli in più senza doppioni', () => {
    expect(ruoliDelProfilo('segretario', ['socio', 'socio'])).toEqual(['segretario', 'socio']);
    expect(ruoliDelProfilo(null, undefined)).toEqual(['socio']);
  });
});

describe('stato delle quote', () => {
  it('lo vedono solo admin, presidente, consiglio e tesoriere', async () => {
    const { canViewQuote } = await import('../permissions.js');
    for (const ruolo of ['admin', 'presidente', 'consiglio', 'tesoriere']) expect(canViewQuote(ruolo)).toBe(true);
    for (const ruolo of ['socio', 'segretario', 'magazziniere', 'direttore_scuola']) expect(canViewQuote(ruolo)).toBe(false);
    expect(canViewQuote(['segretario', 'tesoriere'])).toBe(true);
  });

  it('lo cambiano solo admin, presidente e tesoriere', async () => {
    const { canEditQuote } = await import('../permissions.js');
    expect(canEditQuote('tesoriere')).toBe(true);
    expect(canEditQuote('presidente')).toBe(true);
    expect(canEditQuote('consiglio')).toBe(false);
    expect(canEditQuote(['segretario', 'socio'])).toBe(false);
  });
});
