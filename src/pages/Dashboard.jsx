import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { getEquipment } from '../services/equipment';
import { getMembers } from '../services/members';
import { getUscite } from '../services/uscite';

export default function Dashboard() {
  const { user, role } = useAuth();
  const [stats, setStats] = useState({ equipment: 0, members: 0, uscite: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadStats() {
      setLoading(true);
      try {
        const [equipmentRes, membersRes, usciteRes] = await Promise.allSettled([
          getEquipment(),
          getMembers(),
          getUscite(),
        ]);

        const nextStats = {
          equipment: equipmentRes.status === 'fulfilled' ? equipmentRes.value.length : 0,
          members: membersRes.status === 'fulfilled' ? membersRes.value.length : 0,
          uscite: usciteRes.status === 'fulfilled' ? usciteRes.value.length : 0,
        };

        if (equipmentRes.status === 'rejected' || membersRes.status === 'rejected' || usciteRes.status === 'rejected') {
          console.warn('Dashboard parziale: impossibile leggere tutte le tabelle.');
        }

        setStats(nextStats);
      } catch (error) {
        console.error('Errore caricamento dashboard', error);
        setStats({ equipment: 0, members: 0, uscite: 0 });
      } finally {
        setLoading(false);
      }
    }
    loadStats();
  }, []);

  return (
    <section className="page-grid">
      <div>
        <h1>Dashboard</h1>
        <p>Benvenuto {user?.email ?? 'socio'} (ruolo: {role ?? 'socio'}).</p>
      </div>
      <div className="page-grid" style={{ gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        <DashboardCard title="Materiali" value={stats.equipment} loading={loading} />
        <DashboardCard title="Soci" value={stats.members} loading={loading} />
        <DashboardCard title="Uscite" value={stats.uscite} loading={loading} />
      </div>
      <p style={{ color: 'var(--color-muted)' }}>
        TODO: aggiungere grafici e indicatori dedicati (partecipanti alle uscite, prestiti attivi, ecc.).
      </p>
    </section>
  );
}

function DashboardCard({ title, value, loading }) {
  return (
    <article
      style={{
        border: '1px solid var(--color-border)',
        borderRadius: '1rem',
        padding: '1rem',
        background: '#fff',
        boxShadow: '0 10px 24px rgba(0, 0, 0, 0.06)',
      }}
    >
      <p style={{ margin: 0, color: 'var(--color-muted)' }}>{title}</p>
      <h2 style={{ margin: '0.25rem 0 0' }}>{loading ? '...' : value}</h2>
    </article>
  );
}
