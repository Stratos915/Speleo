import { NavLink } from 'react-router-dom';
import usePermissions from '../hooks/usePermissions.js';

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Home', icon: '🏠', page: 'dashboard' },
  { to: '/magazzino', label: 'Inventario', icon: '📦', page: 'magazzino' },
  { to: '/uscite', label: 'Uscite', icon: '🧭', page: 'uscite' },
  { to: '/prestito-avanzato', label: 'Prestiti', icon: '🔁', page: 'prestiti' },
  { to: '/corsi', label: 'Scuola', icon: '🎓', page: 'scuola' },
  { to: '/biblioteca', label: 'Biblioteca', icon: '📚', page: 'biblioteca' },
  { to: '/report', label: 'Report', icon: '📑', page: 'report' },
  { to: '/soci', label: 'Soci', icon: '👥', page: 'soci' },
];

export default function NavigationMenu({ variant = 'bottom' }) {
  const { canViewPage } = usePermissions();
  const baseClass = variant === 'top' ? 'top-nav' : 'bottom-nav';
  const itemClass = `${baseClass}__item`;
  const activeClass = `${itemClass}--active`;

  return (
    <nav className={baseClass}>
      {NAV_ITEMS.filter((item) => canViewPage(item.page)).map((item) => (
        <NavLink key={item.to} to={item.to} className={({ isActive }) => `${itemClass} ${isActive ? activeClass : ''}`}>
          <span aria-hidden="true">{item.icon}</span>
          <small>{item.label}</small>
        </NavLink>
      ))}
    </nav>
  );
}
