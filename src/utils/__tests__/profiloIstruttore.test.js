import { describe, expect, it } from 'vitest';
import { buildProfiloIstruttore, righeAttivita, statoMantenimento } from '../profiloIstruttore.js';

const testo = [
  '27/03/2025 – 22/06/2025 · I livello · URBINO',
  '31/01/2025 – 02/02/2025 · II livello · BORSO DEL GRAPPA (TV) · ESAMI AI/IT',
  '',
  'Prima di novembre 2021 (1):',
  '30/03/2019 – 31/03/2019 · III livello · LETTOMANOPELLO (PE) · CARTOGRAFIA',
  'Incarichi:',
  'Direttore corso 2018',
  '2018-2021: Direttore scuola URBINO',
].join('\n');

describe('righeAttivita', () => {
  it('divide periodo, livello, luogo e attività per sezione', () => {
    const righe = righeAttivita(testo);
    expect(righe).toHaveLength(5);
    expect(righe[0]).toMatchObject({ n: 1, periodo: '27/03/2025 – 22/06/2025', livello: 'I livello', luogo: 'URBINO', attivita: '' });
    expect(righe[1].attivita).toBe('ESAMI AI/IT');
    expect(righe[2]).toMatchObject({ sezione: 'Prima di novembre 2021 (1)', n: 1, luogo: 'LETTOMANOPELLO (PE)' });
    expect(righe[3]).toMatchObject({ sezione: 'Incarichi', periodo: '', attivita: 'Direttore corso 2018' });
    expect(righe[4]).toMatchObject({ sezione: 'Incarichi', periodo: '2018-2021', attivita: 'Direttore scuola URBINO' });
  });
});

describe('statoMantenimento', () => {
  const oggi = new Date('2026-11-11');
  it('distingue scaduto, in scadenza e in regola', () => {
    expect(statoMantenimento('2026-10-01', oggi)).toBe('scaduto');
    expect(statoMantenimento('2027-02-01', oggi)).toBe('in scadenza');
    expect(statoMantenimento('2031-09-27', oggi)).toBe('in regola');
    expect(statoMantenimento('', oggi)).toBe('');
  });
});

describe('buildProfiloIstruttore', () => {
  it('mette i dati principali sotto il titolo', () => {
    const profilo = buildProfiloIstruttore({
      entry: { qualificationType: 'itca', customQualification: 'AI 2010 · IT 2012', lastMaintenanceDate: '2025-06-22', nextMaintenanceDate: '2030-06-22', activities: testo, documents: [{ name: 'cv.pdf' }] },
      member: { full_name: 'Michele Magnoni', old_id: 7 },
      email: 'mm@example.it',
      annoCartella: 'Anno 2026',
      oggi: new Date('2026-11-11'),
    });
    expect(profilo.title).toBe('Profilo istruttore: Michele Magnoni');
    expect(profilo.intro).toContain('Qualifica: ITCA · Istruttore cavità artificiali');
    expect(profilo.intro).toContain('Tessera: 7 · Email: mm@example.it');
    expect(profilo.intro).toContain('Prossimo mantenimento: 22/6/2030 (in regola)'.replace('22/6/2030', new Date('2030-06-22').toLocaleDateString('it-IT')));
    expect(profilo.intro).toContain('Documenti allegati: cv.pdf');
    expect(profilo.nomeFile('pdf')).toMatch(/^profilo-istruttore-michele-magnoni-\d{4}-\d{2}-\d{2}\.pdf$/);
  });
});
