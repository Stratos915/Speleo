// Esportazione dei sacchi della scuola (pagina Report): una riga per ogni articolo.
import { getDpiAlerts } from './dpi.js';
import { formatDate } from './exporters.js';

/** Colonne complete per CSV ed Excel: anche il link alla scheda d'ispezione. */
export function colonneSacchi(conConsegna) {
  return [
    { key: 'sacco', label: 'Sacco n°' },
    ...(conConsegna
      ? [
        { key: 'consegnato_a', label: 'Consegnato a' },
        { key: 'consegnato_il', label: 'Consegnato il' },
      ]
      : []),
    { key: 'materiale', label: 'Materiale' },
    { key: 'quantita', label: 'Quantità' },
    { key: 'matricola', label: 'Matricola' },
    { key: 'prossima_ispezione', label: 'Prossima ispezione' },
    { key: 'fine_vita', label: 'Fine vita' },
    { key: 'stato', label: 'Stato' },
    { key: 'scheda_url', label: 'Scheda ispezione' },
    { key: 'note', label: 'Note' },
  ];
}

/**
 * Colonne per il PDF: larghezze fisse perché stiano nella pagina. Niente link lunghi:
 * la consegna ai corsisti va nell'introduzione (vedi consegneSacchi).
 */
export function colonneSacchiPdf() {
  return [
    { key: 'sacco', label: 'Sacco', chars: 6 },
    { key: 'articolo', label: 'Materiale', chars: 31 },
    { key: 'matricola', label: 'Matricola', chars: 10 },
    { key: 'prossima_ispezione', label: 'Ispezione', chars: 10 },
    { key: 'fine_vita', label: 'Fine vita', chars: 10 },
    { key: 'stato_breve', label: 'Stato', chars: 15 },
  ];
}

function statoBreve(avvisi, conScheda) {
  const parti = avvisi.map((avviso) => {
    const giorni = Math.abs(avviso.days);
    if (avviso.kind === 'ispezione') {
      return avviso.level === 'expired' ? (avviso.days === 0 ? 'Isp. oggi' : 'Isp. scaduta') : `Isp. tra ${giorni} gg`;
    }
    return avviso.level === 'expired' ? 'DA RITIRARE' : `Fine vita ${giorni} gg`;
  });
  if (!conScheda) parti.push('no scheda');
  return parti.join(', ');
}

/** Righe di introduzione al PDF con le consegne ai corsisti, se ce ne sono. */
export function consegneSacchi(sacchi) {
  const consegnati = [...(sacchi ?? [])]
    .filter((sacco) => sacco.consegnato_a)
    .sort((a, b) => Number(a.numero) - Number(b.numero));
  if (!consegnati.length) return [];
  return [
    `Consegnati: ${consegnati
      .map((sacco) => {
        const quando = sacco.consegnato_il
          ? ` (${formatDate(`${String(sacco.consegnato_il).slice(0, 10)}T12:00:00`)})`
          : '';
        return `n. ${sacco.numero} a ${sacco.consegnato_a}${quando}`;
      })
      .join('; ')}`,
  ];
}

/**
 * Righe da esportare, in ordine di sacco e di posizione nel sacco.
 * Un sacco vuoto ha comunque la sua riga, così nell'elenco non manca.
 */
export function righeSacchi(sacchi, oggi = new Date()) {
  const ordinati = [...(sacchi ?? [])].sort((a, b) => Number(a.numero) - Number(b.numero));
  return ordinati.flatMap((sacco) => {
    const base = {
      sacco: sacco.numero,
      consegnato_a: sacco.consegnato_a ?? '',
      consegnato_il: sacco.consegnato_il ? formatDate(`${String(sacco.consegnato_il).slice(0, 10)}T12:00:00`) : '',
    };
    const materiale = sacco.materiale ?? [];
    if (!materiale.length) {
      return [{ ...base, materiale: '(sacco vuoto)', articolo: '(sacco vuoto)', quantita: '', matricola: '', prossima_ispezione: '', fine_vita: '', stato: '', stato_breve: '', scheda_url: '', scheda: '', note: sacco.note ?? '' }];
    }
    return materiale.map((pezzo) => {
      const allarmi = getDpiAlerts(pezzo, oggi);
      const avvisi = allarmi.map((avviso) => avviso.text);
      const quantita = pezzo.quantita ?? 1;
      return {
        ...base,
        materiale: pezzo.nome,
        articolo: quantita > 1 ? `${pezzo.nome} ×${quantita}` : pezzo.nome,
        stato_breve: statoBreve(allarmi, Boolean(pezzo.scheda_url)),
        quantita,
        matricola: pezzo.matricola ?? '',
        prossima_ispezione: pezzo.prossima_ispezione ? formatDate(`${String(pezzo.prossima_ispezione).slice(0, 10)}T12:00:00`) : '',
        fine_vita: pezzo.fine_vita ? formatDate(`${String(pezzo.fine_vita).slice(0, 10)}T12:00:00`) : '',
        stato: avvisi.length ? avvisi.join(' · ') : (pezzo.prossima_ispezione || pezzo.fine_vita ? 'In regola' : ''),
        scheda_url: pezzo.scheda_url ?? '',
        scheda: pezzo.scheda_url ? 'Sì' : 'No',
        note: pezzo.note ?? '',
      };
    });
  });
}

/** Riga di riepilogo per il PDF: quanti sacchi, articoli, consegnati, da controllare. */
export function riepilogoSacchi(sacchi, oggi = new Date()) {
  const lista = sacchi ?? [];
  const pezzi = lista.flatMap((sacco) => sacco.materiale ?? []);
  const consegnati = lista.filter((sacco) => sacco.consegnato_a).length;
  const daControllare = pezzi.filter((pezzo) => getDpiAlerts(pezzo, oggi).length).length;
  const senzaScheda = pezzi.filter((pezzo) => !pezzo.scheda_url).length;
  const parti = [
    `${lista.length} ${lista.length === 1 ? 'sacco' : 'sacchi'}`,
    `${pezzi.length} ${pezzi.length === 1 ? 'articolo' : 'articoli'}`,
  ];
  if (consegnati) parti.push(`${consegnati} ${consegnati === 1 ? 'consegnato' : 'consegnati'} ai corsisti`);
  if (daControllare) parti.push(`${daControllare} da controllare`);
  if (senzaScheda) parti.push(`${senzaScheda} senza scheda d'ispezione`);
  return parti.join(' · ');
}
