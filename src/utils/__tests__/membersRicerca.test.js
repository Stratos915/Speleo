import { describe, expect, it } from 'vitest';
import { emailSocio, filtraSoci, mappaEmailSoci, ordinaSociPerNome } from '../members.js';

const soci = [
  { id: 1, full_name: 'Michele Magnoni', old_id: 12 },
  { id: 2, full_name: 'Anna Canossa', old_id: 3 },
  { id: 3, full_name: 'Niccolò Bellini', old_id: 40, email: 'nb@example.it' },
];

describe('ordinaSociPerNome', () => {
  it('mette i soci in ordine alfabetico come si leggono', () => {
    expect(ordinaSociPerNome(soci).map((s) => s.id)).toEqual([2, 1, 3]);
  });
});

describe('filtraSoci', () => {
  it('trova per parte del nome senza badare a maiuscole e accenti', () => {
    expect(filtraSoci(soci, 'niccolo').map((s) => s.id)).toEqual([3]);
    expect(filtraSoci(soci, 'MAGN').map((s) => s.id)).toEqual([1]);
  });
  it('trova per tessera ed email e richiede tutte le parole', () => {
    expect(filtraSoci(soci, '40').map((s) => s.id)).toEqual([3]);
    expect(filtraSoci(soci, 'nb@').map((s) => s.id)).toEqual([3]);
    expect(filtraSoci(soci, 'anna magnoni')).toEqual([]);
  });
  it('senza testo restituisce tutti', () => {
    expect(filtraSoci(soci, '  ')).toHaveLength(3);
  });
});

describe('emailSocio', () => {
  it("prende l'email da un altro anno dello stesso socio", () => {
    const righe = [
      { id: 'a', full_name: 'Lino Bedini', membership_year: 2027, email: null },
      { id: 'b', full_name: 'lino  bedini', membership_year: 2025, email: 'lb@example.it' },
    ];
    const mappa = mappaEmailSoci(righe);
    expect(emailSocio(righe[0], mappa)).toBe('lb@example.it');
    expect(emailSocio({ full_name: 'Altro Socio' }, mappa)).toBe('');
  });
});
