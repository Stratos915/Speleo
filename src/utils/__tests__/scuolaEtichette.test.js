import { describe, expect, it } from 'vitest';
import { etichettaIstruttore, etichetteCorsista } from '../scuolaEtichette.js';

const opzioni = [
  { value: 'istruttore', label: 'Istruttore' },
  { value: 'itca', label: 'ITCA · Istruttore cavità artificiali' },
];

describe('etichette scuola', () => {
  it('qualifica breve dell\'istruttore', () => {
    expect(etichettaIstruttore({ qualification: 'itca' }, opzioni)).toEqual([{ testo: 'ITCA', tono: 'info' }]);
    expect(etichettaIstruttore({ qualification: 'altro' }, opzioni)).toEqual([]);
  });

  it('corsista in regola con un sacco', () => {
    const testi = etichetteCorsista(
      { paymentStatus: 'paid', regulationRead: true, privacyAccepted: true },
      [{ sacco_id: 's', materiale_nome: 'Sacco scuola n° 2' }],
    ).map((e) => e.testo);
    expect(testi).toEqual(['Pagato', '🎓 Sacco n° 2']);
  });

  it('segnala in rosso regolamento e privacy mancanti, e conta i pezzi ACAR', () => {
    const etichette = etichetteCorsista({ paymentStatus: 'pending' }, [{ acar_id: 'a' }, { acar_id: 'b' }]);
    expect(etichette.map((e) => e.testo)).toEqual([
      'Da saldare',
      '🫧 2 pezzi ACAR',
      'Regolamento da leggere',
      'Privacy da firmare',
    ]);
    expect(etichette.filter((e) => e.tono === 'manca')).toHaveLength(2);
  });
});
