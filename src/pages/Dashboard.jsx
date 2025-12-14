import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuth from '../context/useAuth.js';
import { supabase } from '../lib/supabaseClient';
import { getEquipment } from '../services/equipment';
import { getMembers } from '../services/members';
import { getUscite } from '../services/uscite';
import AlertList from '../components/AlertList.jsx';
import useAlerts from '../hooks/useAlerts.js';
import { dedupeMembers } from '../utils/members.js';

function countManualParticipants(value) {
  if (!value) return 0;
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean).length;
}

export default function Dashboard() {
  const { user, role, loading: authLoading } = useAuth();
  const { adminAlerts, userAlerts, dismissAlert } = useAlerts();
  const navigate = useNavigate();
  const [stats, setStats] = useState({ equipment: 0, members: 0, uscite: 0 });
  const [statsLoading, setStatsLoading] = useState(true);
  const [insights, setInsights] = useState({ participants: 0, upcoming: 0, loans: 0 });
  const [trend, setTrend] = useState([]);

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      let equipmentCount = 0;
      let membersCount = 0;
      let usciteList = [];
      let loansList = [];

      try {
        const equipment = await getEquipment();
        equipmentCount = equipment.length;
      } catch (equipmentError) {
        console.warn('[Dashboard] Impossibile leggere i materiali:', equipmentError);
      }

      try {
        const members = await getMembers();
        membersCount = dedupeMembers(members).length;
      } catch (membersError) {
        console.warn('[Dashboard] Impossibile leggere i soci:', membersError);
      }

      try {
        usciteList = await getUscite();
      } catch (usciteError) {
        console.warn('[Dashboard] Impossibile leggere le uscite:', usciteError);
      }

      try {
        const { data } = await supabase.from('loans').select('id,status,delivered_at');
        loansList = data ?? [];
      } catch (loansError) {
        console.warn('[Dashboard] Impossibile leggere i prestiti attivi:', loansError);
      }

      const nextStats = {
        equipment: equipmentCount,
        members: membersCount,
        uscite: usciteList.length,
      };

      if (usciteList.length) {
        const today = new Date();
        const participants = usciteList.reduce((sum, uscita) => {
          const idsCount = uscita.participants_ids?.length ?? 0;
          const manualCount = countManualParticipants(uscita.participants_manual);
          return sum + idsCount + manualCount;
        }, 0);
        const upcoming = usciteList.filter((uscita) => {
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
        usciteList.forEach((uscita) => {
          if (!uscita.data) return;
          const uscitaDate = new Date(uscita.data);
          if (Number.isNaN(uscitaDate.getTime())) return;
          const key = `${uscitaDate.getFullYear()}-${uscitaDate.getMonth()}`;
          if (months.has(key)) {
            months.get(key).value += 1;
          }
        });
        setTrend(Array.from(months.values()));
        const activeLoans = loansList.filter((loan) => loan.status === 'in_corso' || loan.status === 'active').length;
        setInsights({ participants, upcoming, loans: activeLoans });
      } else {
        setTrend([]);
        setInsights({ participants: 0, upcoming: 0, loans: 0 });
      }

      setStats(nextStats);
    } catch (error) {
      console.error('Errore caricamento dashboard', error);
      setStats({ equipment: 0, members: 0, uscite: 0 });
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading || !user) return;
    loadStats();
  }, [authLoading, user, loadStats]);


  return (
    <section className="page-grid">
      <div>
        <h1>Dashboard</h1>
        <p>Benvenuto {user?.email ?? 'socio'} (ruolo: {role ?? 'socio'}).</p>
      </div>
      <AlertList
        alerts={role && ['admin', 'presidente'].includes(role) ? adminAlerts : userAlerts}
        navigate={navigate}
        onDismiss={dismissAlert}
      />
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
