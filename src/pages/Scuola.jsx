// Pagina Scuola: la gestione dei corsi piu' il blocco dei riferimenti CNSS-SSI.
// Tenuti separati per non gonfiare ulteriormente Corso.jsx.
import Corso from './Corso.jsx';
import RiferimentiSSI from '../components/RiferimentiSSI.jsx';

export default function Scuola() {
  return (
    <>
      <Corso />
      <section className="page-grid" style={{ marginTop: '1rem' }}>
        <RiferimentiSSI />
      </section>
    </>
  );
}
