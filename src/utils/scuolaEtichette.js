// Etichette brevi accanto ai nomi di istruttori e corsisti (pagina Scuola).

const PAGAMENTO = {
  paid: { testo: 'Pagato', tono: 'ok' },
  exempt: { testo: 'Esente', tono: 'ok' },
  pending: { testo: 'Da saldare', tono: 'attesa' },
};

/** Etichetta della qualifica di un istruttore. */
export function etichettaIstruttore(istruttore, opzioni = []) {
  const voce = opzioni.find((o) => o.value === istruttore?.qualification);
  if (!voce) return [];
  // «ITCA · Istruttore cavità artificiali» → «ITCA»
  return [{ testo: voce.label.split(' · ')[0], tono: 'info' }];
}

/**
 * Etichette di un corsista: pagamento, materiale in mano (sacco o ACAR)
 * e, in rosso, regolamento e privacy mancanti.
 */
export function etichetteCorsista(corsista, prestiti = []) {
  const etichette = [];
  const pagamento = PAGAMENTO[corsista?.paymentStatus];
  if (pagamento) etichette.push(pagamento);

  const sacchi = prestiti.filter((p) => p?.sacco_id);
  const acar = prestiti.filter((p) => p?.acar_id);
  if (sacchi.length === 1) {
    etichette.push({ testo: `🎓 ${String(sacchi[0].materiale_nome ?? 'Sacco').replace(/^Sacco scuola/, 'Sacco')}`, tono: 'info' });
  } else if (sacchi.length > 1) {
    etichette.push({ testo: `🎓 ${sacchi.length} sacchi`, tono: 'info' });
  }
  if (acar.length) {
    etichette.push({ testo: `🫧 ${acar.length} ${acar.length === 1 ? 'pezzo' : 'pezzi'} ACAR`, tono: 'info' });
  }

  if (!corsista?.regulationRead) etichette.push({ testo: 'Regolamento da leggere', tono: 'manca' });
  if (!corsista?.privacyAccepted) etichette.push({ testo: 'Privacy da firmare', tono: 'manca' });
  return etichette;
}
