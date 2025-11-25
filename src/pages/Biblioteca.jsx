const mockLibrary = [
  { id: 1, titolo: 'Manuale tecnico CNSAS', tipo: 'PDF', note: 'Ultimo aggiornamento 2024' },
  { id: 2, titolo: 'Cartografia Monte Nerone', tipo: 'Carta', note: 'Disponibile in sede' },
];

export default function Biblioteca() {
  return (
    <section className="page-grid">
      <div>
        <h1>Biblioteca tecnica</h1>
        <p>Presto i materiali saranno sincronizzati con una tabella dedicata su Supabase.</p>
      </div>
      {mockLibrary.map((item) => (
        <article key={item.id} style={{ border: '1px solid var(--color-border)', borderRadius: '1rem', padding: '1rem' }}>
          <h3>{item.titolo}</h3>
          <p>Formato: {item.tipo}</p>
          <p style={{ color: 'var(--color-muted)' }}>{item.note}</p>
          <p style={{ color: 'var(--color-muted)' }}>TODO: collegare questa sezione alla tabella "library_documents".</p>
        </article>
      ))}
    </section>
  );
}
