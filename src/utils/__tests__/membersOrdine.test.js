import { describe, expect, it } from 'vitest';
import { cognomeSocio, confrontaPerCognome } from '../members.js';

describe('ordine dei soci per cognome', () => {
  it('prende il cognome dall\'ultima parola, con le particelle', () => {
    expect(cognomeSocio({ full_name: 'Alberto Gaudio' })).toBe('Gaudio');
    expect(cognomeSocio({ full_name: 'Marta di Biase' })).toBe('di Biase');
    expect(cognomeSocio({ full_name: 'Walcher De Andrè' })).toBe('De Andrè');
    expect(cognomeSocio({ full_name: 'Thomas Sperandio Iacomucci' })).toBe('Iacomucci');
    expect(cognomeSocio({ full_name: 'Stratos' })).toBe('Stratos');
  });

  it('ordina per cognome e poi per nome', () => {
    const elenco = ['Michele Magnoni', 'Nicola Amadori', 'Alba Magnoni', 'Marta di Biase', 'Massimo Amadori'].map(
      (full_name) => ({ full_name }),
    );
    expect(elenco.sort(confrontaPerCognome).map((m) => m.full_name)).toEqual([
      'Massimo Amadori',
      'Nicola Amadori',
      'Marta di Biase',
      'Alba Magnoni',
      'Michele Magnoni',
    ]);
  });
});
