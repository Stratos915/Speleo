import { describe, expect, it } from 'vitest';
import { colonneSacchi, colonneSacchiPdf, consegneSacchi, riepilogoSacchi, righeSacchi } from '../sacchiExport.js';

const oggi = new Date('2026-11-05T10:00:00');
const sacchi = [
  {
    numero: 2,
    consegnato_a: null,
    materiale: [],
  },
  {
    numero: 1,
    consegnato_a: 'Anna Verdi',
    consegnato_il: '2026-11-01',
    materiale: [
      { nome: 'Imbrago', quantita: 1, matricola: 'IM-1', scheda_url: 'https://drive.google.com/x', prossima_ispezione: '2026-11-20' },
      { nome: 'Moschettoni', quantita: 3 },
    ],
  },
];

describe('esportazione sacchi della scuola', () => {
  it('una riga per articolo, in ordine di sacco, con il sacco vuoto', () => {
    const righe = righeSacchi(sacchi, oggi);
    expect(righe.map((r) => [r.sacco, r.materiale])).toEqual([
      [1, 'Imbrago'],
      [1, 'Moschettoni'],
      [2, '(sacco vuoto)'],
    ]);
    expect(righe[0].consegnato_a).toBe('Anna Verdi');
    expect(righe[0].intestazione).toMatch(/^Sacco n° 1 · consegnato a Anna Verdi il /);
    expect(righe[2].intestazione).toBe('Sacco n° 2');
    expect(righe[0].scheda_url).toBe('https://drive.google.com/x');
    expect(righe[0].scheda).toBe('Sì');
    expect(righe[0].stato).toMatch(/^Ispezione tra 15 giorni$/);
    expect(righe[1].scheda).toBe('No');
    expect(righe[1].quantita).toBe(3);
    expect(righe[1].articolo).toBe('Moschettoni ×3');
    expect(righe[0].stato_breve).toBe('Isp. tra 15 gg');
    expect(righe[1].stato_breve).toBe('no scheda');
  });

  it('le colonne della consegna ci sono solo se serve', () => {
    expect(colonneSacchi(false).some((c) => c.key === 'consegnato_a')).toBe(false);
    expect(colonneSacchi(true).some((c) => c.key === 'consegnato_a')).toBe(true);
    expect(colonneSacchiPdf().some((c) => c.key === 'scheda_url')).toBe(false);
    expect(colonneSacchiPdf().find((c) => c.key === 'sacco').gruppo).toBe(true);
    expect(consegneSacchi(sacchi)[0]).toMatch(/^Consegnati: n\. 1 a Anna Verdi \(/);
    expect(consegneSacchi([{ numero: 1 }])).toEqual([]);
  });

  it('riepilogo leggibile', () => {
    expect(riepilogoSacchi(sacchi, oggi)).toBe(
      "2 sacchi · 2 articoli · 1 consegnato ai corsisti · 1 da controllare · 1 senza scheda d'ispezione",
    );
  });

  it('nel PDF ogni sacco è un blocco con il suo titolo e non si spezza fra due pagine', async () => {
    const { generateTablePdf } = await import('../exporters.js');
    const nomi = Array.from({ length: 11 }, (_, i) => ({ nome: `Articolo ${i + 1}`, quantita: 1 }));
    const molti = Array.from({ length: 5 }, (_, i) => ({ numero: i + 1, materiale: nomi }));
    const pdf = new TextDecoder('latin1').decode(generateTablePdf('Sacchi', colonneSacchiPdf(), righeSacchi(molti, oggi)));
    const pagine = pdf.split('/Type /Page /Parent').slice(1);
    // Ogni pagina contiene sacchi interi: titolo e tutte le 11 righe dello stesso sacco.
    const perPagina = pagine.map((pagina) => (pagina.match(/Sacco n\\260 \d+/g) ?? []).length);
    expect(perPagina.reduce((a, b) => a + b, 0)).toBe(5);
    pagine.forEach((pagina, i) => {
      expect((pagina.match(/\(Articolo \d+\)/g) ?? []).length).toBe(perPagina[i] * 11);
    });
    expect(pagine.length).toBeGreaterThan(1);
  });
});
