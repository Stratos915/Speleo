/**
 * Dopo un salvataggio riporta in vista la scheda appena modificata, invece di
 * lasciare la pagina in cima. Se la scheda è già visibile la pagina non si muove.
 * Aspetta che l'elenco aggiornato sia disegnato.
 * Se la scheda non c'è (per esempio è stata filtrata via) non fa nulla.
 */
export function tornaAllaScheda(elementId, tentativi = 10) {
  if (typeof window === 'undefined' || !elementId) return;
  window.requestAnimationFrame(() => {
    const scheda = document.getElementById(elementId);
    if (scheda) {
      scheda.scrollIntoView({ block: 'nearest' });
      return;
    }
    if (tentativi > 0) tornaAllaScheda(elementId, tentativi - 1);
  });
}
