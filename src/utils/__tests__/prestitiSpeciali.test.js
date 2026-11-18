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

describe('prestiti da uscita e da scheda corsista', () => {
  it('apre la scheda giusta per tipo di uscita', async () => {
    const { schedaIniziale } = await import('../prestitiSpeciali.js');
    expect(schedaIniziale('acar')).toBe('acar');
    expect(schedaIniziale('corso')).toBe('sacco');
    expect(schedaIniziale('sociale')).toBe('generale');
    expect(schedaIniziale(undefined)).toBe('generale');
  });

  it('propone solo i pezzi liberi e con revisione valida', async () => {
    const { pezziDisponibili } = await import('../prestitiSpeciali.js');
    const oggi = new Date('2026-11-18T10:00:00');
    const pezzi = [
      { id: 1, tipo: 'bombola', descrizione: 'B', scadenza_revisione: '2027-01-01' },
      { id: 2, tipo: 'bombola', descrizione: 'A', scadenza_revisione: '2026-11-18' },
      { id: 3, tipo: 'erogatore', descrizione: 'C' },
      { id: 4, tipo: 'maschera', descrizione: 'D', scadenza_revisione: '2027-05-01' },
    ];
    const { disponibili, inPrestito, scaduti } = pezziDisponibili('acar', pezzi, new Map([[4, {}]]), oggi);
    expect(disponibili.map((p) => p.id)).toEqual([1, 3]);
    expect(inPrestito.map((p) => p.id)).toEqual([4]);
    expect(scaduti.map((p) => p.id)).toEqual([2]);
  });

  it('ordina i sacchi per numero e toglie quelli consegnati', async () => {
    const { pezziDisponibili, etichettaPezzo } = await import('../prestitiSpeciali.js');
    const sacchi = [{ id: 'c', numero: 10 }, { id: 'a', numero: 2 }, { id: 'b', numero: 3 }];
    const { disponibili } = pezziDisponibili('sacco', sacchi, new Map([['b', {}]]));
    expect(disponibili.map((s) => etichettaPezzo('sacco', s))).toEqual(['Sacco n° 2', 'Sacco n° 10']);
  });

  it('etichetta dei pezzi ACAR', async () => {
    const { etichettaPezzo } = await import('../prestitiSpeciali.js');
    expect(etichettaPezzo('acar', { tipo: 'bombola', descrizione: 'Faber 10 L', matricola: '123' })).toBe('Faber 10 L · matr. 123');
    expect(etichettaPezzo('acar', { tipo: 'erogatore' })).toBe('Erogatore');
  });

  it('riferimenti e nome del corso e del corsista', async () => {
    const { rifCorso, rifCorsista, nomeCorso, nomeCorsista, prestitiDelCorsista } = await import('../prestitiSpeciali.js');
    const anno = { id: 'y1', label: 'Anno 2026' };
    const corso = { id: 'c1', name: 'Corso 2026' };
    const studente = { id: 's1', firstName: 'Mario', lastName: 'Rossi' };
    expect(rifCorso(anno, corso)).toBe('y1::c1');
    expect(rifCorsista(anno, corso, studente)).toBe('y1::c1::s1');
    expect(nomeCorso(anno, corso)).toBe('Corso 2026 · Anno 2026');
    expect(nomeCorsista(studente)).toBe('Mario Rossi');
    const prestiti = [
      { id: 1, corsista_rif: 'y1::c1::s1', delivered_at: '2026-11-01' },
      { id: 2, corsista_rif: 'y1::c1::s2', delivered_at: '2026-11-02' },
      { id: 3, corsista_rif: 'y1::c1::s1', delivered_at: '2026-11-03' },
    ];
    expect(prestitiDelCorsista(prestiti, 'y1::c1::s1').map((p) => p.id)).toEqual([3, 1]);
  });

  it('date attrezzatura: automatiche ma senza cancellare quelle scritte a mano', async () => {
    const { dateAttrezzatura } = await import('../prestitiSpeciali.js');
    const oggi = new Date('2026-11-18T10:00:00');
    expect(dateAttrezzatura({ equipmentDelivery: '', equipmentReturn: '' }, 'consegna', { oggi })).toEqual({
      equipmentDelivery: '2026-11-18',
    });
    // Data di consegna già scritta a mano: resta; la restituzione vecchia si toglie.
    expect(dateAttrezzatura({ equipmentDelivery: '2026-10-01', equipmentReturn: '2026-10-20' }, 'consegna', { oggi })).toEqual({
      equipmentReturn: '',
    });
    // Rientro: la data di restituzione si scrive solo quando non resta nulla in mano.
    expect(dateAttrezzatura({ equipmentReturn: '' }, 'rientro', { aperti: 1, oggi })).toEqual({});
    expect(dateAttrezzatura({ equipmentReturn: '' }, 'rientro', { aperti: 0, oggi })).toEqual({ equipmentReturn: '2026-11-18' });
  });

  it('tessera del socio con lo stesso nome del corsista', async () => {
    const { tesseraPerNome } = await import('../prestitiSpeciali.js');
    const soci = [{ full_name: 'Mario Rossi', old_id: 42 }, { full_name: 'Anna Bianchi', membership_number: 7 }];
    expect(tesseraPerNome(soci, ' mario rossi ')).toBe(42);
    expect(tesseraPerNome(soci, 'Anna Bianchi')).toBe(7);
    expect(tesseraPerNome(soci, 'Luca Verdi')).toBeNull();
  });
});
