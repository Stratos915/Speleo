import useAuth from '../context/useAuth.js';

const ACCENT_ROLES = ['admin', 'presidente'];

export default function RoleBadge() {
  const { role } = useAuth();
  const badgeClass = ACCENT_ROLES.includes(role) ? 'badge badge-admin' : 'badge badge-socio';
  const label = role ? role.replace(/_/g, ' ').toUpperCase() : 'SOCIO';

  return <span className={badgeClass}>{label}</span>;
}
