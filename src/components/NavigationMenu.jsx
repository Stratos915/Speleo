import { NavLink } from 'react-router-dom';

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Home', icon: '🏠' },
  { to: '/magazzino', label: 'Inventario', icon: '📦' },
  { to: '/uscite', label: 'Uscite', icon: '🧭' },
  { to: '/prestito-avanzato', label: 'Prestiti', icon: '🔁' },
  { to: '/corsi', label: 'Scuola', icon: '🎓' },
  { to: '/biblioteca', label: 'Biblioteca', icon: '📚' },
  { to: '/report', label: 'Report', icon: '📑' },
  { to: '/soci', label: 'Soci', icon: '👥' },
];

export default function NavigationMenu({ variant = 'bottom' }) {
  const baseClass = variant === 'top' ? 'top-nav' : 'bottom-nav';
  const itemClass = `${baseClass}__item`;
  const activeClass = `${itemClass}--active`;

  return (
    <nav className={baseClass}>
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) => `${itemClass} ${isActive ? activeClass : ''}`}
        >
          <span aria-hidden="true">{item.icon}</span>
          <small>{item.label}</small>
        </NavLink>
      ))}
    </nav>
  );
}
