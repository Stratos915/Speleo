import { NavLink } from 'react-router-dom';

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Home', icon: '🏠' },
  { to: '/magazzino', label: 'Inventario', icon: '📦' },
  { to: '/uscite', label: 'Uscite', icon: '🧭' },
  { to: '/prestito-avanzato', label: 'Prestiti', icon: '🔁' },
  { to: '/report', label: 'Report', icon: '📑' },
];

export default function BottomNav() {
  return (
    <nav className="bottom-nav">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) => `bottom-nav__item ${isActive ? 'bottom-nav__item--active' : ''}`}
        >
          <span aria-hidden="true">{item.icon}</span>
          <small>{item.label}</small>
        </NavLink>
      ))}
    </nav>
  );
}
