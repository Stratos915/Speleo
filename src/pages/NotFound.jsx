import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <section>
      <h1>Ops! Pagina non trovata.</h1>
      <Link to="/">Torna alla login</Link>
    </section>
  );
}
