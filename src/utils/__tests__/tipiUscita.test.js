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

describe('uscite ed eventi', () => {
  it('chiama uscite solo le attività in esterno', async () => {
    const { isUscitaEsterna, nomeAttivita } = await import('../tipiUscita.js');
    for (const tipo of ['esplorazione', 'allenamento', 'corso', 'sociale', null]) expect(isUscitaEsterna(tipo)).toBe(true);
    for (const tipo of ['serata_sede', 'altro_evento', 'formazione', 'altro']) expect(isUscitaEsterna(tipo)).toBe(false);
    expect(nomeAttivita('serata_sede')).toBe('Evento');
    expect(nomeAttivita('esplorazione', { minuscolo: true })).toBe('uscita');
  });

  it('conta e descrive uscite ed eventi', async () => {
    const { contaAttivita, testoConteggio } = await import('../tipiUscita.js');
    const conta = contaAttivita([{ tipo: 'corso' }, { tipo: 'serata_sede' }, { tipo: 'esplorazione' }]);
    expect(conta).toEqual({ uscite: 2, eventi: 1 });
    expect(testoConteggio(conta)).toBe('2 uscite · 1 evento');
    expect(testoConteggio({ uscite: 1, eventi: 0 })).toBe('1 uscita');
    expect(testoConteggio({})).toBe('nessuna attività');
  });
});
