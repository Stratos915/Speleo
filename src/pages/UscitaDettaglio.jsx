import { useParams } from 'react-router-dom';

export default function UscitaDettaglio() {
  const { id } = useParams();

  return (
    <section>
      <h1>Dettaglio uscita</h1>
      <p>Pagina dedicata all'uscita con id: {id}</p>
    </section>
  );
}
