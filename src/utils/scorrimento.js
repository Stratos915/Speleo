/**
 * Dopo un salvataggio riporta la pagina sulla scheda appena modificata,
 * invece di lasciarla in cima. Aspetta che l'elenco aggiornato sia disegnato.
 * Se la scheda non c'è (per esempio è stata filtrata via) non fa nulla.
 */
export function tornaAllaScheda(elementId, tentativi = 10) {
  if (typeof window === 'undefined' || !elementId) return;
  window.requestAnimationFrame(() => {
    const scheda = document.getElementById(elementId);
    if (scheda) {
      scheda.scrollIntoView({ block: 'center' });
      return;
    }
    if (tentativi > 0) tornaAllaScheda(elementId, tentativi - 1);
  });
}
