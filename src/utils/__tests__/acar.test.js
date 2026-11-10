import { describe, expect, it } from 'vitest';
import { avvisoRevisione, corrispondeAcar, datiAcar, datiTecnici, raggruppaAcar, riepilogoAcar, testoOssigeno } from '../acar.js';
import { canEditAcar, canViewAcar } from '../permissions.js';

const oggi = new Date('2026-11-10T10:00:00');

describe('magazzino ACAR', () => {
  it('permessi: come il materiale scuola (non i soci semplici), modificano admin, presidente e magazziniere', () => {
    expect(canViewAcar(['socio'])).toBe(false);
    expect(canViewAcar(['socio', 'consiglio'])).toBe(true);
    expect(canViewAcar(['direttore_scuola'])).toBe(true);
    expect(canEditAcar(['socio'])).toBe(false);
    expect(canEditAcar(['direttore_scuola'])).toBe(false);
    expect(canEditAcar(['socio', 'magazziniere'])).toBe(true);
    expect(canEditAcar(['presidente'])).toBe(true);
  });

  it('avviso revisione: scaduta, oggi, entro 60 giorni, lontana', () => {
    expect(avvisoRevisione({ scadenza_revisione: '2026-11-01' }, oggi)).toMatchObject({ level: 'expired', text: 'Revisione scaduta da 9 giorni' });
    expect(avvisoRevisione({ scadenza_revisione: '2026-11-10' }, oggi)).toMatchObject({ level: 'expired' });
    expect(avvisoRevisione({ scadenza_revisione: '2026-12-10' }, oggi)).toMatchObject({ level: 'soon', text: 'Revisione tra 30 giorni' });
    expect(avvisoRevisione({ scadenza_revisione: '2027-06-01' }, oggi)).toBeNull();
    expect(avvisoRevisione({}, oggi)).toBeNull();
  });

  it('dati tecnici della bombola in una riga', () => {
    expect(datiTecnici({ tipo: 'bombola', tipologia: 'composito', capacita_litri: 6.8, pressione_bar: 300, percentuale_ossigeno: 32 }))
      .toBe('Composito · 6,8 L · 300 bar · O₂ 32%');
    expect(datiTecnici({ tipo: 'erogatore', tipologia: 'acciaio' })).toBe('');
    expect(testoOssigeno(21)).toBe('21% (aria)');
  });

  it('raggruppa per tipo e riassume', () => {
    const materiale = [
      { tipo: 'maschera', descrizione: 'B' },
      { tipo: 'bombola', descrizione: 'Faber', matricola: '10' },
      { tipo: 'bombola', descrizione: 'Faber', matricola: '2' },
      { tipo: 'erogatore' },
    ];
    const gruppi = raggruppaAcar(materiale);
    expect(gruppi.map((g) => g.value)).toEqual(['bombola', 'erogatore', 'maschera']);
    expect(gruppi[0].pezzi.map((p) => p.matricola)).toEqual(['2', '10']);
    expect(riepilogoAcar(materiale)).toBe('2 bombole · 1 erogatore · 1 maschera');
    expect(corrispondeAcar(materiale[1], 'faber')).toBe(true);
    expect(corrispondeAcar({ tipo: 'bombola', percentuale_ossigeno: 32 }, '32%')).toBe(true);
  });

  it('i dati della bombola si salvano solo per le bombole', () => {
    const base = { tipologia: 'acciaio', capacita_litri: '10,5', pressione_bar: '200', percentuale_ossigeno: '21', descrizione: ' ' };
    expect(datiAcar({ ...base, tipo: 'bombola' })).toMatchObject({
      tipologia: 'acciaio', capacita_litri: 10.5, pressione_bar: 200, percentuale_ossigeno: 21, descrizione: null,
    });
    expect(datiAcar({ ...base, tipo: 'maschera' })).toMatchObject({
      tipologia: null, capacita_litri: null, pressione_bar: null, percentuale_ossigeno: null,
    });
  });
});
