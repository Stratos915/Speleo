import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

const csvColumns = {
  uscita: [
    { key: 'titolo', label: 'Titolo' },
    { key: 'luogo', label: 'Luogo' },
    { key: 'data', label: 'Data' },
    { key: 'tipo', label: 'Tipo' },
  ],
  magazzino: [
    { key: 'name', label: 'Nome' },
    { key: 'description', label: 'Descrizione' },
    { key: 'quantity', label: 'Quantità' },
  ],
  soci: [
    { key: 'full_name', label: 'Nome completo' },
    { key: 'membership_number', label: 'Numero tessera' },
  ],
};

function buildCsv(rows, columns) {
  const safe = (value) => {
    if (value === null || value === undefined) return '';
    const normalized =
      value instanceof Date
        ? value.toISOString()
        : typeof value === 'string'
        ? value
        : String(value);
    const escaped = normalized.replace(/"/g, '""');
    return /[;"\n]/.test(escaped) ? `"${escaped}"` : escaped;
  };

  const header = columns.map((column) => column.label).join(';');
  const lines = rows.map((row) =>
    columns.map((column) => {
      if (column.key === 'data' && row[column.key]) {
        return safe(new Date(row[column.key]));
      }
      return safe(row[column.key]);
    }).join(';'),
  );
  return [header, ...lines].join('\n');
}

function downloadCsv(rows, key) {
  if (!rows.length) return;
  const columns = csvColumns[key];
  const csv = buildCsv(rows, columns);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.setAttribute('download', `${key}-speleo-${new Date().toISOString()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}

export default function Report() {
  const [members, setMembers] = useState([]);
  const [uscite, setUscite] = useState([]);
  const [magazzino, setMagazzino] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    let ignore = false;
    async function loadData() {
      setLoading(true);
      setError('');
      const [
        { data: memberData, error: membersError },
        { data: uscitaData, error: uscitaError },
        { data: equipmentData, error: equipmentError },
      ] = await Promise.all([
        supabase.from('members').select('id, full_name, membership_number').order('full_name', { ascending: true }),
        supabase.from('uscite').select('id, titolo, luogo, data, tipo').order('data', { ascending: false }).catch(() => ({ data: [] })),
        supabase.from('equipment').select('id, name, description, quantity').order('name', { ascending: true }),
      ]);
      if (!ignore) {
        setMembers(memberData ?? []);
        setUscite(uscitaData ?? []);
        setMagazzino(equipmentData ?? []);
        const firstError = membersError || uscitaError || equipmentError;
        if (firstError) {
          setError('Impossibile caricare tutti i dati, riprova più tardi.');
        }
        setLoading(false);
      }
    }

    loadData();
    return () => {
      ignore = true;
    };
  }, []);

  const filteredMembers = useMemo(() => {
    if (!search.trim()) return members;
    return members.filter((member) =>
      member.full_name?.toLowerCase().includes(search.trim().toLowerCase()),
    );
  }, [members, search]);

  function handleExport(key) {
    setError('');
    const dataMap = {
      uscita: prepareUsciteForExport(),
      magazzino,
      soci: members,
    };
    const rows = dataMap[key];
    if (!rows?.length) {
      setError('Non ci sono dati da esportare per questa sezione.');
      return;
    }
    downloadCsv(rows, key);
  }

  function prepareUsciteForExport() {
    return uscite.map((item) => ({
      ...item,
      data: item.data ? new Date(item.data).toISOString() : '',
    }));
  }

  return (
    <section className="page-grid">
      <header>
        <h1>Report amministratore</h1>
        <p>Scarica gli elenchi aggiornati o sincronizza i dati con strumenti esterni.</p>
      </header>

      {loading && <p>Raccolta dati in corso...</p>}
      {error && <p style={{ color: '#c92a2a' }}>{error}</p>}

      <div className="card-list">
        <ReportCard
          title="Elenco soci"
          description="Scarica anagrafica soci aggiornata."
          onCsv={() => handleExport('soci')}
          disabled={loading}
        />
        <ReportCard
          title="Uscite"
          description="Esporta elenco uscite registrate (TODO: tabella Supabase)."
          onCsv={() => handleExport('uscita')}
          disabled={loading}
        />
        <ReportCard
          title="Inventario"
          description="Scarica lo stato del magazzino."
          onCsv={() => handleExport('magazzino')}
          disabled={loading}
        />
      </div>

      <div className="card">
        <h2>Gestione soci</h2>
        <input
          type="search"
          placeholder="Cerca per nome o tessera"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <div className="card-list" style={{ marginTop: '1rem' }}>
          {filteredMembers.map((member) => (
            <div key={member.id} style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div>
                <strong>{member.full_name}</strong>
                <p style={{ margin: 0, color: 'var(--color-muted)' }}>Tessera: {member.membership_number ?? 'N/D'}</p>
              </div>
              <button type="button" style={{ background: '#adb5bd' }}>
                TODO
              </button>
            </div>
          ))}
          {!filteredMembers.length && <p>Nessun socio trovato.</p>}
        </div>
      </div>
    </section>
  );
}

function ReportCard({ title, description, onCsv, disabled }) {
  return (
    <article className="card">
      <h3 style={{ margin: '0 0 0.25rem' }}>{title}</h3>
      <p style={{ color: 'var(--color-muted)' }}>{description}</p>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
        <button type="button" onClick={onCsv} disabled={disabled}>
          CSV
        </button>
        <button type="button" style={{ background: '#adb5bd' }} disabled>
          PDF
        </button>
        <button type="button" style={{ background: '#adb5bd' }} disabled>
          XLSX
        </button>
      </div>
    </article>
  );
}
