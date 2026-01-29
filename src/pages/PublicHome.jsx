import logo from '../assets/logo-gsu.png';

export default function PublicHome() {
  return (
    <main className="page-grid">
      <article className="card" style={{ maxWidth: 720, margin: '2rem auto', textAlign: 'center' }}>
        <img
          src={logo}
          alt="Logo Gruppo Speleologico Urbino"
          style={{ width: 120, height: 120, objectFit: 'contain', marginBottom: '0.75rem' }}
        />
        <h1>Speleo App</h1>
        <p style={{ color: 'var(--color-muted)', fontSize: '1.05rem' }}>
          Portale gestionale del Gruppo Speleologico per la gestione soci, attività, inventario e report.
        </p>
        <p style={{ color: 'var(--color-muted)' }}>
          L&apos;accesso è riservato ai membri autorizzati. Se hai ricevuto l&apos;approvazione, puoi accedere con le
          tue credenziali.
        </p>
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap', marginTop: '1.5rem' }}>
          <a href="/" className="button" style={{ textDecoration: 'none' }}>
            Accedi
          </a>
          <a href="/privacy" style={{ color: 'var(--color-muted)' }}>
            Privacy
          </a>
          <a href="/terms" style={{ color: 'var(--color-muted)' }}>
            Termini di servizio
          </a>
        </div>
      </article>
    </main>
  );
}
