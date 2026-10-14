import { describe, expect, it } from 'vitest';
import { TIPI_USCITA, etichettaTipo } from '../tipiUscita.js';

describe('tipologie uscite', () => {
  it('contiene le nuove tipologie', () => {
    const valori = TIPI_USCITA.map((tipo) => tipo.value);
    expect(valori).toContain('serata_sede');
    expect(valori).toContain('altro_evento');
    expect(valori).toContain('formazione');
  });
  it('etichetta leggibile, con descrizione solo per «Altro evento»', () => {
    expect(etichettaTipo('serata_sede')).toBe('Serata in sede');
    expect(etichettaTipo('altro_evento', ' Cena sociale ')).toBe('Altro evento: Cena sociale');
    expect(etichettaTipo('sociale', 'ignorata')).toBe('Sociale');
    expect(etichettaTipo('vecchio valore')).toBe('vecchio valore');
    expect(etichettaTipo(null)).toBe('');
  });
});

describe('materiale per tipologia', () => {
  it('la serata in sede non usa materiale', async () => {
    const { usaMateriale } = await import('../tipiUscita.js');
    expect(usaMateriale('serata_sede')).toBe(false);
    expect(usaMateriale('esplorazione')).toBe(true);
    expect(usaMateriale('altro_evento')).toBe(true);
    expect(usaMateriale(null)).toBe(true);
  });
});
