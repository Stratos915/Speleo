import { describe, expect, it } from 'vitest';
import {
  corsiConCorsisti,
  descriviPrestito,
  etichettaUscita,
  nomeMaterialePrestito,
  usciteDaProporre,
} from '../prestitiSpeciali.js';

const uscite = [
  { id: 'a', titolo: 'Frasassi', data: '2026-11-20', tipo: 'acar', status: 'aperta' },
  { id: 'b', titolo: 'Palestra', data: '2026-11-18', tipo: 'corso', status: 'aperta' },
  { id: 'c', titolo: 'Vecchia', data: '2026-10-01', tipo: 'acar', status: 'chiusa' },
  { id: 'd', titolo: 'Sociale', data: '2026-11-17', tipo: 'sociale' },
];

describe('uscite da proporre', () => {
  it('toglie le chiuse e mette prima il tipo preferito', () => {
    const { consigliate, altre } = usciteDaProporre(uscite, 'acar');
    expect(consigliate.map((u) => u.id)).toEqual(['a']);
    expect(altre.map((u) => u.id)).toEqual(['d', 'b']);
  });
  it('etichetta con data, titolo e tipo', () => {
    expect(etichettaUscita(uscite[0])).toMatch(/Frasassi \(ACAR\)$/);
  });
});

describe('corsi con corsisti', () => {
  it('elenca corsi aperti prima, con corsisti in ordine alfabetico', () => {
    const doc = {
      yearFolders: [
        { id: 'y25', label: 'Anno 2025', courses: [{ id: 'c1', name: 'Corso 2025', isClosed: true, students: [] }] },
        {
          id: 'y26',
          label: 'Anno 2026',
          courses: [
            {
              id: 'c2',
              name: 'Corso 2026',
              students: [
                { id: 's2', firstName: 'Zeno', lastName: 'Verdi' },
                { id: 's1', firstName: 'Anna', lastName: 'Rossi' },
              ],
            },
          ],
        },
      ],
    };
    const corsi = corsiConCorsisti(doc);
    expect(corsi.map((c) => c.rif)).toEqual(['y26::c2', 'y25::c1']);
    expect(corsi[0].nome).toBe('Corso 2026 · Anno 2026');
    expect(corsi[0].corsisti.map((s) => s.nome)).toEqual(['Anna Rossi', 'Zeno Verdi']);
    expect(corsi[0].corsisti[0].rif).toBe('y26::c2::s1');
    expect(corsiConCorsisti(null)).toEqual([]);
  });
});

describe('descrizione del prestito', () => {
  it('riassume chi, uscita, corso e rientro', () => {
    const testo = descriviPrestito(
      { borrower_name: 'Anna Rossi', delivered_at: '2026-11-16T10:00:00Z', corso_nome: 'Corso 2026', reserved_until: '2026-11-30' },
      { titolo: 'Palestra' },
    );
    expect(testo).toMatch(/^Anna Rossi dal 16 nov · uscita: Palestra · corso: Corso 2026 · rientro entro 30 nov$/);
  });
  it('usa il nome salvato per ACAR e sacchi', () => {
    expect(nomeMaterialePrestito({ materiale_nome: 'Sacco scuola n° 4' })).toBe('Sacco scuola n° 4');
    expect(nomeMaterialePrestito({ equipment: { name: 'Corda' }, materiale_nome: 'x' })).toBe('Corda');
  });
});
