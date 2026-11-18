// Sezioni e righe che si aprono e chiudono con una freccetta (pagina Scuola).
import './Espandibile.css';

/** Intestazione di una sezione: titolo, riepilogo e freccia ▼ che apre/chiude. */
export function SezioneEspandibile({ titolo, riepilogo, aperta, onToggle, children }) {
  return (
    <article className={`card esp-sezione${aperta ? ' esp-aperta' : ''}`}>
      <button type="button" className="esp-sezione-testa" onClick={onToggle} aria-expanded={aperta}>
        <span className="esp-sezione-titolo">
          {titolo}
          {riepilogo ? <small> · {riepilogo}</small> : null}
        </span>
        <span className="esp-freccia" aria-hidden="true">▼</span>
      </button>
      {aperta && <div className="esp-sezione-corpo">{children}</div>}
    </article>
  );
}

/** Riga con un nome, alcune etichette e la freccetta per vedere i dettagli. */
export function RigaEspandibile({ nome, etichette = [], aperta, onToggle, children }) {
  return (
    <div className={`esp-riga${aperta ? ' esp-aperta' : ''}`}>
      <button type="button" className="esp-riga-testa" onClick={onToggle} aria-expanded={aperta}>
        <strong>{nome}</strong>
        <span className="esp-etichette">
          {etichette.map((e) => (
            <span key={e.testo} className={`esp-tag esp-tag--${e.tono ?? 'info'}`}>
              {e.testo}
            </span>
          ))}
        </span>
        <span className="esp-freccia esp-freccia--piccola" aria-hidden="true">▼</span>
      </button>
      {aperta && <div className="esp-riga-corpo">{children}</div>}
    </div>
  );
}

/** «＋ Aggiungi …» che apre il modulo solo quando serve. */
export function AggiungiEspandibile({ testo, aperta, onToggle, children }) {
  return (
    <div className={`esp-aggiungi${aperta ? ' esp-aperta' : ''}`}>
      <button type="button" className="esp-aggiungi-testa" onClick={onToggle} aria-expanded={aperta}>
        <span>＋ {testo}</span>
        <span className="esp-freccia esp-freccia--piccola" aria-hidden="true">▼</span>
      </button>
      {aperta && <div className="esp-riga-corpo">{children}</div>}
    </div>
  );
}
