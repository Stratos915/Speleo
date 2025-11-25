const mockCourses = [
  { id: 1, titolo: 'Corso base Speleo', periodo: 'Primavera 2025', stato: 'Iscrizioni aperte' },
  { id: 2, titolo: 'Aggiornamento tecniche', periodo: 'Autunno 2025', stato: 'In preparazione' },
];

export default function Corso() {
  return (
    <section className="page-grid">
      <div>
        <h1>Gestione corsi</h1>
        <p>Teniamo traccia dei corsi formativi e delle attività di formazione interna.</p>
      </div>
      {mockCourses.map((corso) => (
        <article key={corso.id} style={{ border: '1px solid var(--color-border)', borderRadius: '1rem', padding: '1rem' }}>
          <h3>{corso.titolo}</h3>
          <p>{corso.periodo}</p>
          <span className="chip">{corso.stato}</span>
          <p style={{ color: 'var(--color-muted)' }}>TODO: collegare questa pagina alla futura tabella Supabase "courses".</p>
        </article>
      ))}
    </section>
  );
}
