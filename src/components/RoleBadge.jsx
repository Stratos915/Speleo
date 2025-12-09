import useAuth from '../context/useAuth.js';

export default function RoleBadge() {
  const { role } = useAuth();
  const badgeClass = role === 'admin' ? 'badge badge-admin' : 'badge badge-socio';

  return <span className={badgeClass}>{role.toUpperCase()}</span>;
}
