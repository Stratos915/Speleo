import { useAuth } from '../context/AuthContext.jsx';

export default function RoleBadge() {
  const { role } = useAuth();
  const badgeClass = role === 'admin' ? 'badge badge-admin' : 'badge badge-socio';

  return <span className={badgeClass}>{role.toUpperCase()}</span>;
}
