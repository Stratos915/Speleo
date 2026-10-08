import { useRouteError } from 'react-router-dom';

// Pagina mostrata quando una pagina dell'app non si carica.
// Il caso più comune: l'app è stata aggiornata mentre la scheda era aperta e
// il browser cerca ancora i file della versione precedente. Basta ricaricare.

function isErroreAggiornamento(error) {
  const testo = String(error?.message ?? error ?? '');
  return /dynamically imported module|Importing a module script failed|MIME type|Failed to fetch|error loading dynamically/i.test(testo);
}

export default function ErroreApp() {
  const error = useRouteError();
  const aggiornamento = isErroreAggiornamento(error);
  console.error('[App] Errore di pagina:', error);

  return (
    <section className="page-grid" style={{ maxWidth: '36rem', margin: '3rem auto' }}>
      <h1>{aggiornamento ? 'L’app è stata aggiornata' : 'Qualcosa è andato storto'}</h1>
      <p>
        {aggiornamento
          ? 'È disponibile una versione nuova del gestionale. Ricarica la pagina per continuare.'
          : 'La pagina non si è caricata correttamente. Prova a ricaricarla; se il problema resta, avvisa la segreteria.'}
      </p>
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <button type="button" onClick={() => window.location.reload()}>
          Ricarica
        </button>
        <button type="button" className="pill-button" onClick={() => window.location.assign('/dashboard')}>
          Vai alla Dashboard
        </button>
      </div>
    </section>
  );
}
