import { useEffect, useState } from 'react';
import useAuth from '../context/useAuth.js';
import { supabase } from '../lib/supabaseClient';
import { getEquipment } from '../services/equipment';
import { getMembers } from '../services/members';
import { getUscite } from '../services/uscite';

function countManualParticipants(value) {
  if (!value) return 0;
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean).length;
}

export default function Dashboard() {
  const { user, role, loading: authLoading } = useAuth();
  const [stats, setStats] = useState({ equipment: 0, members: 0, uscite: 0 });
  const [statsLoading, setStatsLoading] = useState(true);
  const [insights, setInsights] = useState({ participants: 0, upcoming: 0, loans: 0 });
  const [trend, setTrend] = useState([]);

  useEffect(() => {
    if (authLoading) return;

    async function loadStats() {
      setStatsLoading(true);
      try {
        const [equipmentRes, membersRes, usciteRes, loansRes] = await Promise.allSettled([
          getEquipment(),
          getMembers(),
          getUscite(),
          supabase.from('loans').select('id,status,delivered_at'),
        ]);

        const nextStats = {
          equipment: equipmentRes.status === 'fulfilled' ? equipmentRes.value.length : 0,
          members: membersRes.status === 'fulfilled' ? membersRes.value.length : 0,
          uscite: usciteRes.status === 'fulfilled' ? usciteRes.value.length : 0,
        };

        if (usciteRes.status === 'fulfilled') {
          const uscitaList = usciteRes.value ?? [];
          const today = new Date();
          const participants = uscitaList.reduce((sum, uscita) => {
            const idsCount = uscita.participants_ids?.length ?? 0;
            const manualCount = countManualParticipants(uscita.participants_manual);
            return sum + idsCount + manualCount;
          }, 0);
          const upcoming = uscitaList.filter((uscita) => {
            if (!uscita.data) return false;
            const uscitaDate = new Date(uscita.data);
            if (Number.isNaN(uscitaDate.getTime())) return false;
            return uscitaDate >= today;
          }).length;

          const months = new Map();
          const now = new Date();
          for (let i = 5; i >= 0; i -= 1) {
            const ref = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const key = `${ref.getFullYear()}-${ref.getMonth()}`;
            months.set(key, { label: ref.toLocaleString('it-IT', { month: 'short' }), value: 0 });
          }
          uscitaList.forEach((uscita) => {
            if (!uscita.data) return;
            const uscitaDate = new Date(uscita.data);
            if (Number.isNaN(uscitaDate.getTime())) return;
            const key = `${uscitaDate.getFullYear()}-${uscitaDate.getMonth()}`;
            if (months.has(key)) {
              months.get(key).value += 1;
            }
          });
          setTrend(Array.from(months.values()));
          const activeLoans =
            loansRes.status === 'fulfilled'
              ? (loansRes.value ?? []).filter((loan) => loan.status === 'in_corso' || loan.status === 'active').length
              : 0;
          setInsights({ participants, upcoming, loans: activeLoans });
        } else {
          setTrend([]);
          setInsights({ participants: 0, upcoming: 0, loans: 0 });
        }

        if (equipmentRes.status === 'rejected' || membersRes.status === 'rejected' || usciteRes.status === 'rejected') {
          console.warn('Dashboard parziale: impossibile leggere tutte le tabelle.');
        }

        setStats(nextStats);
      } catch (error) {
        console.error('Errore caricamento dashboard', error);
        setStats({ equipment: 0, members: 0, uscite: 0 });
      } finally {
        setStatsLoading(false);
      }
    }
    loadStats();
  }, [authLoading, user]);

  return (
    <section className="page-grid">
      <div>
        <h1>Dashboard</h1>
        <p>Benvenuto {user?.email ?? 'socio'} (ruolo: {role ?? 'socio'}).</p>
      </div>
      <div className="page-grid" style={{ gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        <DashboardCard title="Materiali" value={stats.equipment} loading={statsLoading} />
        <DashboardCard title="Soci" value={stats.members} loading={statsLoading} />
        <DashboardCard title="Uscite" value={stats.uscite} loading={statsLoading} />
      </div>
      <article className="card">
        <h2>Indicatori rapidi</h2>
        <div className="page-grid" style={{ gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <IndicatorCard
            label="Partecipanti registrati"
            value={insights.participants}
            helper="Somma dei nominativi inseriti nelle uscite imminenti e passate."
          />
          <IndicatorCard
            label="Uscite imminenti"
            value={insights.upcoming}
            helper="Numero di uscite con data futura nel calendario."
          />
          <IndicatorCard
            label="Prestiti attivi"
            value={insights.loans}
            helper="Materiali e libri segnati come “in corso”."
          />
        </div>
      </article>

      <article className="card">
        <h2>Tendenza uscite (ultimi 6 mesi)</h2>
        {trend.length ? (
          <div style={{ display: 'grid', gap: '0.5rem', marginTop: '0.75rem' }}>
            {trend.map((item) => (
              <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ width: '4rem', fontWeight: 600 }}>{item.label}</span>
                <div style={{ flex: 1, background: '#edf2ff', borderRadius: '999px', height: '10px' }}>
                  <div
                    style={{
                      width: `${Math.min(100, item.value * 20)}%`,
                      height: '100%',
                      background: '#364fc7',
                      borderRadius: '999px',
                    }}
                  />
                </div>
                <span style={{ width: '2rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{item.value}</span>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ marginTop: '0.25rem', color: 'var(--color-muted)' }}>Non ci sono ancora uscite registrate negli ultimi mesi.</p>
        )}
      </article>
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

function IndicatorCard({ label, value, helper }) {
  return (
    <div
      style={{
        border: '1px solid var(--color-border)',
        borderRadius: '1rem',
        padding: '1rem',
        background: '#f8f9fa',
      }}
    >
      <p style={{ margin: 0, color: 'var(--color-muted)' }}>{label}</p>
      <h3 style={{ margin: '0.25rem 0 0' }}>{value}</h3>
      <small style={{ color: 'var(--color-muted)' }}>{helper}</small>
    </div>
  );
}
