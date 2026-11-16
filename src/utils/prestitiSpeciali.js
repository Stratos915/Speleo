// Prestiti del materiale ACAR e dei sacchi della scuola (migrazione 22):
// testi brevi, uscite da proporre e corsisti dei corsi della scuola.
import { etichettaTipo } from './tipiUscita.js';

/** Tipo di uscita da proporre per primo: ACAR per il materiale ACAR, corso per i sacchi. */
export const TIPO_USCITA_PREFERITO = { acar: 'acar', sacco: 'corso' };

function dataBreve(valore) {
  if (!valore) return '';
  const testo = String(valore);
  const data = new Date(testo.length <= 10 ? `${testo}T12:00:00` : testo);
  if (Number.isNaN(data.getTime())) return '';
  return data.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
}

/** Etichetta di un'uscita nelle tendine: «16 nov · Grotta di Frasassi (ACAR)». */
export function etichettaUscita(uscita) {
  if (!uscita) return '';
  const tipo = etichettaTipo(uscita.tipo, uscita.tipo_descrizione);
  return [dataBreve(uscita.data), `${uscita.titolo || 'Senza titolo'}${tipo ? ` (${tipo})` : ''}`]
    .filter(Boolean)
    .join(' · ');
}

/**
 * Uscite a cui collegare un prestito: quelle non chiuse, divise in
 * «consigliate» (del tipo preferito) e «altre», ciascuna in ordine di data.
 */
export function usciteDaProporre(uscite = [], tipoPreferito = null) {
  const aperte = (uscite ?? [])
    .filter((uscita) => uscita?.id && uscita.status !== 'chiusa')
    .sort((a, b) => String(a.data ?? '').localeCompare(String(b.data ?? '')));
  const consigliate = tipoPreferito ? aperte.filter((u) => u.tipo === tipoPreferito) : [];
  const altre = aperte.filter((u) => !consigliate.includes(u));
  return { consigliate, altre };
}

/**
 * Corsi della scuola con i loro corsisti, dai più recenti; i corsi chiusi
 * restano in fondo. rif = «idAnno::idCorso».
 */
export function corsiConCorsisti(documento) {
  const anni = Array.isArray(documento?.yearFolders) ? documento.yearFolders : [];
  const corsi = anni.flatMap((anno) =>
    (anno.courses ?? []).map((corso) => ({
      rif: `${anno.id}::${corso.id}`,
      nome: `${corso.name || 'Corso'} · ${anno.label || ''}`.trim().replace(/ ·$/, ''),
      chiuso: Boolean(corso.isClosed),
      anno: Number(String(anno.label ?? '').replace(/\D+/g, '')) || 0,
      corsisti: (corso.students ?? [])
        .map((studente) => ({
          rif: `${anno.id}::${corso.id}::${studente.id}`,
          nome: `${studente.firstName ?? ''} ${studente.lastName ?? ''}`.trim() || 'Corsista senza nome',
        }))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'it', { sensitivity: 'base' })),
    })),
  );
  return corsi.sort((a, b) => Number(a.chiuso) - Number(b.chiuso) || b.anno - a.anno);
}

/** «Mario Rossi dal 16 nov · uscita: Frasassi · corso: Corso 2026 · rientro entro 20 nov» */
export function descriviPrestito(prestito, uscita = null) {
  if (!prestito) return '';
  const parti = [`${prestito.borrower_name || 'non indicato'}${prestito.delivered_at ? ` dal ${dataBreve(prestito.delivered_at)}` : ''}`];
  if (uscita) parti.push(`uscita: ${uscita.titolo || 'senza titolo'}`);
  if (prestito.corso_nome) parti.push(`corso: ${prestito.corso_nome}`);
  if (prestito.reserved_until) parti.push(`rientro entro ${dataBreve(prestito.reserved_until)}`);
  return parti.join(' · ');
}

/** Nome del materiale di un prestito: generale, ACAR o sacco. */
export function nomeMaterialePrestito(prestito, nomeGenerale = '') {
  return nomeGenerale || prestito?.equipment?.name || prestito?.materiale_nome || 'Materiale';
}
