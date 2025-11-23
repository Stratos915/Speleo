import { useAuth } from '../context/AuthContext.jsx';

export default function Dashboard() {
  const { profile } = useAuth();

  return (
    <section>
      <h1>Dashboard</h1>
      <p>Benvenuto {profile?.full_name ?? 'socio'}.</p>
      <p>Ruolo attivo: {profile?.role ?? 'socio'}.</p>
    </section>
  );
}
