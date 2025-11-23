import { Link } from 'react-router-dom';

export default function Header() {
  return (
    <header style={{ padding: '1rem', background: '#0d1b2a', color: '#fff' }}>
      <nav style={{ display: 'flex', gap: '1rem' }}>
        <Link to="/dashboard">Dashboard</Link>
        <Link to="/uscite">Uscite</Link>
        <Link to="/magazzino">Magazzino</Link>
        <Link to="/corsi">Corsi</Link>
        <Link to="/biblioteca">Biblioteca</Link>
        <Link to="/report">Report</Link>
      </nav>
    </header>
  );
}
