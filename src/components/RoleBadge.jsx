import { useAuth } from '../context/AuthContext.jsx';

const badgeStyles = {
  admin: { background: '#ff6b6b', color: '#fff' },
  socio: { background: '#1b98e0', color: '#fff' },
};

export default function RoleBadge() {
  const { role } = useAuth();
  const style = badgeStyles[role] ?? badgeStyles.socio;

  return (
    <span
      style={{
        padding: '0.25rem 0.75rem',
        borderRadius: '999px',
        fontSize: '0.85rem',
        ...style,
      }}
    >
      {role.toUpperCase()}
    </span>
  );
}
