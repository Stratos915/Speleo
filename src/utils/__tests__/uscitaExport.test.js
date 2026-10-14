import { describe, expect, it } from 'vitest';
import { buildUscitaSingola, esterniDaTesto, testoRuoli } from '../uscitaExport.js';
import { escapePdfText, generateTablePdf } from '../exporters.js';

const soci = new Map([
  ['m1', 'Enrico Maria Sacchi'],
  ['m2', 'Marco Alessandrini'],
  ['m3', 'Nicolò Rossi'],
]);
const nomeSocio = (id) => soci.get(String(id)) ?? null;

describe('esportazione di una singola uscita', () => {
  const uscita = {
    id: 'u1',
    titolo: 'Cena in sede per parlare del raduno',
    luogo: 'Sede GSU',
    data: '2026-10-20',
    ora: '20:30:00+02',
    tipo: 'serata_sede',
    responsabile_id: 'm1',
    participants_ids: ['m1'],
    participants_manual: 'Ospite Uno, Ospite Due',
  };
  const adesioni = {
    risposte: [
      { user_id: 'a', member_id: 'm1', nome: 'Enrico Maria Sacchi', risposta: 'si' },
      { user_id: 'b', member_id: 'm2', nome: 'Marco Alessandrini', risposta: 'no' },
      { user_id: 'c', member_id: 'm3', nome: 'Nicolò Rossi', risposta: 'forse' },
      { user_id: 'd', member_id: null, nome: 'Stratos', risposta: 'si' },
    ],
    senza_risposta: 8,
  };

  it('mette i nomi: ufficiali, esterni, poi sì, forse e no', () => {
    const { rows } = buildUscitaSingola({ uscita, nomeSocio, adesioni });
    expect(rows.map((r) => [r.nome, r.chi, r.elenco, r.risposta])).toEqual([
      ['Enrico Maria Sacchi', 'Socio', 'Sì', 'Partecipo'],
      ['Ospite Due', 'Esterno', 'Sì', ''],
      ['Ospite Uno', 'Esterno', 'Sì', ''],
      ['Stratos', 'Socio', '', 'Partecipo'],
      ['Nicolò Rossi', 'Socio', '', 'Forse'],
      ['Marco Alessandrini', 'Socio', '', 'No'],
    ]);
    expect(rows.map((r) => r.n)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('riassume i dati dell’uscita in testa', () => {
    const { title, intro, nomeFile } = buildUscitaSingola({ uscita, nomeSocio, adesioni });
    expect(title).toBe('Uscita: Cena in sede per parlare del raduno');
    expect(intro).toContain('Tipo: Serata in sede');
    expect(intro).toContain('Responsabile: Enrico Maria Sacchi');
    expect(intro).toContain('Partecipanti ufficiali: 3 (soci 1, esterni 2)');
    expect(intro).toContain('Risposte: 2 partecipo, 1 forse, 1 no, 8 senza risposta');
    expect(intro[0]).toMatch(/^Quando: .*20.*ottobre 2026 alle 20:30$/);
    expect(nomeFile('pdf')).toBe('uscita-2026-10-20-cena-in-sede-per-parlare-del-raduno.pdf');
  });

  it('mostra il ruolo nell\'app al posto di «Socio»', () => {
    const ruoli = {
      perSocio: new Map([['m1', ['presidente']], ['m2', ['segretario', 'socio']]]),
      perUtente: new Map([['d', ['admin']]]),
    };
    const { rows } = buildUscitaSingola({ uscita, nomeSocio, adesioni, ruoli });
    const ruolo = Object.fromEntries(rows.map((r) => [r.nome, r.chi]));
    expect(ruolo['Enrico Maria Sacchi']).toBe('Presidente');
    expect(ruolo['Marco Alessandrini']).toBe('Segretario + Socio');
    expect(ruolo['Stratos']).toBe('Amministratore');
    expect(ruolo['Nicolò Rossi']).toBe('Socio');
    expect(ruolo['Ospite Uno']).toBe('Esterno');
    expect(testoRuoli([])).toBe('Socio');
    const { intro } = buildUscitaSingola({ uscita, nomeSocio, adesioni, ruoli });
    expect(intro).toContain('Responsabile: Enrico Maria Sacchi (Presidente)');
  });

  it('funziona anche senza adesioni', () => {
    const { rows, intro } = buildUscitaSingola({ uscita: { titolo: 'Prova', participants_ids: ['m2'] }, nomeSocio });
    expect(rows).toEqual([{ n: 1, nome: 'Marco Alessandrini', chi: 'Socio', elenco: 'Sì', risposta: '' }]);
    expect(intro.some((line) => line.startsWith('Risposte'))).toBe(false);
  });

  it('divide gli esterni scritti a mano', () => {
    expect(esterniDaTesto('Anna, Luca;\nPia\n')).toEqual(['Anna', 'Luca', 'Pia']);
    expect(esterniDaTesto(null)).toEqual([]);
  });
});

describe('PDF con lettere accentate', () => {
  it('codifica gli accenti in WinAnsi', () => {
    expect(escapePdfText('Nicolò (più)')).toBe('Nicol\\362 \\(pi\\371\\)');
    expect(escapePdfText('’Gruppo’ – 5€')).toBe('\\222Gruppo\\222 \\226 5\\200');
    expect(escapePdfText('📄')).toBe('?');
  });

  it('stampa le righe introduttive nel PDF', () => {
    const bytes = generateTablePdf('Uscita', [{ key: 'nome', label: 'Nome' }], [{ nome: 'Nicolò' }], {
      intro: ['Luogo: Sede'],
    });
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain('(Luogo: Sede) Tj');
    expect(text).toContain('(Nicol\\362) Tj');
    expect(text).toContain('/Encoding /WinAnsiEncoding');
  });
});
