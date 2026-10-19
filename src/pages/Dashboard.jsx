import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import useAuth from '../context/useAuth.js';
import { supabase } from '../lib/supabaseClient';
import { getEquipment } from '../services/equipment';
import { getMembers } from '../services/members';
import { getUscite } from '../services/uscite';
import AlertList from '../components/AlertList.jsx';
import { ElencoUscite } from '../components/ElencoUscite.jsx';
import useAlerts from '../hooks/useAlerts.js';
import { dedupeMembers } from '../utils/members.js';
import { dayKey, prossimeEPassate, toIsoDate } from '../utils/calendario.js';
import { contaAttivita, isUscitaEsterna, testoConteggio } from '../utils/tipiUscita.js';

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
  // «Uscite» sono solo le attività in esterno; le altre sono «eventi».
  const [stats, setStats] = useState({ equipment: 0, members: 0, uscite: 0, eventi: 0 });
  const [statsLoading, setStatsLoading] = useState(true);
  const [insights, setInsights] = useState({ participants: 0, upcoming: { uscite: 0, eventi: 0 }, loans: 0 });
  const [trend, setTrend] = useState([]);
  const [calendarioUscite, setCalendarioUscite] = useState([]);

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
        setCalendarioUscite(usciteList);
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
        ...contaAttivita(usciteList),
      };

      if (usciteList.length) {
        const today = new Date();
        const participants = usciteList.reduce((sum, uscita) => {
          const idsCount = uscita.participants_ids?.length ?? 0;
          const manualCount = countManualParticipants(uscita.participants_manual);
          return sum + idsCount + manualCount;
        }, 0);
        const upcoming = contaAttivita(
          usciteList.filter((uscita) => {
            if (!uscita.data) return false;
            const uscitaDate = new Date(uscita.data);
            if (Number.isNaN(uscitaDate.getTime())) return false;
            return uscitaDate >= today;
          }),
        );

        const months = new Map();
        const now = new Date();
        for (let i = 5; i >= 0; i -= 1) {
          const ref = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const key = `${ref.getFullYear()}-${ref.getMonth()}`;
          months.set(key, { label: ref.toLocaleString('it-IT', { month: 'short' }), uscite: 0, eventi: 0 });
        }
        usciteList.forEach((uscita) => {
          if (!uscita.data) return;
          const uscitaDate = new Date(uscita.data);
          if (Number.isNaN(uscitaDate.getTime())) return;
          const key = `${uscitaDate.getFullYear()}-${uscitaDate.getMonth()}`;
          if (months.has(key)) {
            months.get(key)[isUscitaEsterna(uscita.tipo) ? 'uscite' : 'eventi'] += 1;
          }
        });
        setTrend(Array.from(months.values()));
        const activeLoans = loansList.filter((loan) => loan.status === 'in_corso' || loan.status === 'active').length;
        setInsights({ participants, upcoming, loans: activeLoans });
      } else {
        setTrend([]);
        setInsights({ participants: 0, upcoming: { uscite: 0, eventi: 0 }, loans: 0 });
      }

      setStats(nextStats);
    } catch (error) {
      console.error('Errore caricamento dashboard', error);
      setStats({ equipment: 0, members: 0, uscite: 0, eventi: 0 });
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
        <DashboardCard title="Eventi" value={stats.eventi} loading={statsLoading} />
        <CalendarioCard uscite={calendarioUscite} loading={statsLoading} />
      </div>
      {!statsLoading && (
        <article className="card">
          <ElencoUscite
            titolo="Prossime uscite ed eventi"
            uscite={prossimeEPassate(calendarioUscite, toIsoDate(new Date())).prossime}
            vuoto="Nessuna uscita o evento in programma."
          />
        </article>
      )}
      <article className="card">
        <h2>Indicatori rapidi</h2>
        <div className="page-grid" style={{ gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <IndicatorCard
            label="Partecipanti registrati"
            value={insights.participants}
            helper="Somma dei nominativi inseriti in uscite ed eventi, imminenti e passati."
          />
          <IndicatorCard
            label="Uscite in programma"
            value={insights.upcoming.uscite}
            helper="Uscite in esterno con data futura: esplorazione, allenamento, corso, sociale."
          />
          <IndicatorCard
            label="Eventi in programma"
            value={insights.upcoming.eventi}
            helper="Eventi con data futura: serate in sede, formazione e altri eventi."
          />
          <IndicatorCard
            label="Prestiti attivi"
            value={insights.loans}
            helper="Materiali e libri segnati come “in corso”."
          />
        </div>
      </article>

      <article className="card">
        <h2>Tendenza uscite ed eventi (ultimi 6 mesi)</h2>
        {trend.length ? (
          <>
            <p style={{ margin: '0.25rem 0 0', color: 'var(--color-muted)', fontSize: '0.85rem' }}>
              <span style={{ display: 'inline-block', width: '0.7rem', height: '0.7rem', borderRadius: '2px', background: '#364fc7', marginRight: '0.3rem' }} />
              Uscite
              <span style={{ display: 'inline-block', width: '0.7rem', height: '0.7rem', borderRadius: '2px', background: '#12b886', margin: '0 0.3rem 0 1rem' }} />
              Eventi
            </p>
            <div style={{ display: 'grid', gap: '0.5rem', marginTop: '0.75rem' }}>
              {trend.map((item) => (
                <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ width: '4rem', fontWeight: 600 }}>{item.label}</span>
                  <div style={{ flex: 1, background: '#edf2ff', borderRadius: '999px', height: '10px', display: 'flex', overflow: 'hidden' }}>
                    <div style={{ width: `${Math.min(100, item.uscite * 20)}%`, height: '100%', background: '#364fc7' }} />
                    <div
                      style={{ width: `${Math.min(100 - Math.min(100, item.uscite * 20), item.eventi * 20)}%`, height: '100%', background: '#12b886' }}
                    />
                  </div>
                  <span style={{ minWidth: '3rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {item.uscite} + {item.eventi}
                  </span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p style={{ marginTop: '0.25rem', color: 'var(--color-muted)' }}>Non ci sono ancora uscite o eventi negli ultimi mesi.</p>
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

// Casella «Calendario»: stessa misura delle altre, apre la pagina del calendario.
function CalendarioCard({ uscite, loading }) {
  const now = new Date();
  const meseKey = toIsoDate(now).slice(0, 7);
  const delMese = contaAttivita(uscite.filter((uscita) => dayKey(uscita.data)?.startsWith(meseKey)));
  const mese = now.toLocaleDateString('it-IT', { month: 'long' });
  return (
    <Link to="/calendario" className="dash-cal-card" aria-label="Apri il calendario di uscite ed eventi">
      <p style={{ margin: 0, color: 'var(--color-muted)' }}>Calendario</p>
      <h2 style={{ margin: '0.25rem 0 0', textTransform: 'capitalize' }}>{mese}</h2>
      <small className="dash-cal-card-meta">
        {loading ? '...' : `${testoConteggio(delMese)} questo mese`} · Apri →
      </small>
    </Link>
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
