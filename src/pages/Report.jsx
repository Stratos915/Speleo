export default function Report() {
  return (
    <section>
      <h1>Area Report</h1>
      <p>Genera esportazioni per tutte le sezioni (uscite, magazzino, corsi, biblioteca).</p>
      <h2>Strumenti disponibili</h2>
      <ul>
        <li>CSV/Excel per uscite e partecipanti</li>
        <li>Inventario materiali con saldo</li>
        <li>Storico corsi e attestati</li>
        <li>Elenco soci aggiornato</li>
      </ul>
      <div style={{ marginTop: '1rem' }}>
        <h3>Elenco Soci</h3>
        <p>Placeholder: qui verrà caricato il dataset dei soci dal database Supabase.</p>
      </div>
    </section>
  );
}
