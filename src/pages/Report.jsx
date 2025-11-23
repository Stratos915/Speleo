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
    { key: 'nome', label: 'Nome' },
    { key: 'qty_disponibile', label: 'Disponibile' },
    { key: 'qty_totale', label: 'Totale' },
  ],
  soci: [
    { key: 'full_name', label: 'Nome completo' },
    { key: 'role', label: 'Ruolo' },
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
        { data: magazzinoData, error: magazzinoError },
      ] = await Promise.all([
        supabase.from('profiles').select('id, full_name, role').order('full_name', { ascending: true }),
        supabase.from('uscite').select('id, titolo, luogo, data, tipo').order('data', { ascending: false }),
        supabase.from('magazzino').select('id, nome, qty_disponibile, qty_totale').order('nome', { ascending: true }),
      ]);
      if (!ignore) {
        setMembers(memberData ?? []);
        setUscite(uscitaData ?? []);
        setMagazzino(magazzinoData ?? []);
        const firstError = membersError || uscitaError || magazzinoError;
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
    <section>
      <h1>Area Report</h1>
      <p>
        Genera esportazioni aggiornate per uscite, magazzino e soci. I dataset vengono letti in tempo reale da
        Supabase.
      </p>
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '1rem' }}>
        <button onClick={() => handleExport('uscita')} disabled={loading}>
          Esporta uscite
        </button>
        <button onClick={() => handleExport('magazzino')} disabled={loading}>
          Esporta magazzino
        </button>
        <button onClick={() => handleExport('soci')} disabled={loading}>
          Esporta soci
        </button>
      </div>
      {loading && <p style={{ marginTop: '1rem' }}>Raccolta dati in corso...</p>}
      {error && (
        <p style={{ marginTop: '0.75rem', color: '#c92a2a' }}>
          {error}
        </p>
      )}
      <div style={{ marginTop: '2rem' }}>
        <h2>Elenco Soci</h2>
        <p>Verifica rapidamente gli iscritti e applica un filtro testuale.</p>
        <input
          type="search"
          placeholder="Filtra per nome"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          style={{ margin: '0.5rem 0', padding: '0.5rem', width: '100%', maxWidth: '320px' }}
        />
        {filteredMembers.length === 0 ? (
          <p>Nessun socio trovato.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc', paddingBottom: '0.25rem' }}>
                  Nome
                </th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc', paddingBottom: '0.25rem' }}>
                  Ruolo
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredMembers.map((member) => (
                <tr key={member.id}>
                  <td style={{ padding: '0.35rem 0' }}>{member.full_name ?? 'N/D'}</td>
                  <td style={{ padding: '0.35rem 0' }}>{member.role ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
