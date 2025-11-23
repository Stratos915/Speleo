import { useAuth } from '../context/AuthContext.jsx';

export default function Dashboard() {
  const { user, role } = useAuth();

  return (
    <section>
      <h1>Dashboard</h1>
      <p>Benvenuto {user?.email ?? 'socio'}.</p>
      <p>Ruolo attivo: {role ?? 'socio'}.</p>
    </section>
  );
}
