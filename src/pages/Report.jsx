import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { getMembers } from '../services/members.js';
import { getEquipment } from '../services/equipment.js';

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
    { key: 'old_id', label: 'Numero tessera' },
  ],
  scuola_instructors: [
    { key: 'year_label', label: 'Anno' },
    { key: 'course_name', label: 'Corso' },
    { key: 'course_status', label: 'Stato corso' },
    { key: 'full_name', label: 'Nome completo' },
    { key: 'membership_number', label: 'Numero tessera' },
    { key: 'qualification', label: 'Qualifica' },
    { key: 'custom_qualification', label: 'Note aggiuntive' },
    { key: 'email', label: 'Email' },
  ],
  scuola_corsisti: [
    { key: 'year_label', label: 'Anno' },
    { key: 'course_name', label: 'Corso' },
    { key: 'course_status', label: 'Stato corso' },
    { key: 'first_name', label: 'Nome' },
    { key: 'last_name', label: 'Cognome' },
    { key: 'birth_date', label: 'Data di nascita' },
    { key: 'payment_status', label: 'Pagamento' },
    { key: 'regulation_read', label: 'Regolamento' },
    { key: 'privacy_accepted', label: 'Privacy' },
    { key: 'equipment_delivery', label: 'Consegna attrezzatura' },
    { key: 'equipment_return', label: 'Restituzione attrezzatura' },
    { key: 'equipment_notes', label: 'Note attrezzatura' },
  ],
  scuola_registry: [
    { key: 'year_label', label: 'Anno' },
    { key: 'full_name', label: 'Nome completo' },
    { key: 'membership_number', label: 'Numero tessera' },
    { key: 'qualification_date', label: 'Conseguimento' },
    { key: 'last_maintenance_date', label: 'Ultimo mantenimento' },
    { key: 'next_maintenance_date', label: 'Prossimo mantenimento' },
    { key: 'activities', label: 'Attività ultimi 5 anni' },
    { key: 'email', label: 'Email' },
  ],
};

const SCUOLA_STORAGE_KEY = 'speleo-scuola-data-v2';

const paymentStatusLabels = {
  pending: 'Da saldare',
  paid: 'Pagato',
  exempt: 'Esente',
};

const qualificationLabels = {
  istruttore: 'Istruttore',
  aiuto_istruttore: 'Aiuto istruttore',
};

function formatDate(value) {
  if (!value) return '';
  const dateValue = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(dateValue.getTime())) return '';
  return dateValue.toLocaleDateString('it-IT');
}

function formatCellValue(column, value) {
  if (value === null || value === undefined || value === '') return '';
  if (column.key === 'data' && value) {
    return formatDate(value);
  }
  if (column.key === 'birth_date' && value) {
    return formatDate(value);
  }
  if (['equipment_delivery', 'equipment_return', 'qualification_date', 'last_maintenance_date', 'next_maintenance_date'].includes(column.key) && value) {
    return formatDate(value);
  }
  if (column.key === 'payment_status') {
    return paymentStatusLabels[value] ?? value;
  }
  if (column.key === 'regulation_read' || column.key === 'privacy_accepted') {
    return value ? 'SI' : 'NO';
  }
  return String(value);
}

function buildCsv(rows, columns) {
  const safe = (value) => {
    if (value === null || value === undefined) return '';
    const normalized = value instanceof Date ? value.toISOString() : String(value);
    const escaped = normalized.replace(/"/g, '""');
    return /[;"\n]/.test(escaped) ? `"${escaped}"` : escaped;
  };

  const header = columns.map((column) => column.label).join(';');
  const lines = rows.map((row) =>
    columns.map((column) => safe(formatCellValue(column, row[column.key]))).join(';'),
  );
  return [header, ...lines].join('\n');
}

function downloadCsv(rows, key) {
  if (!rows.length) return;
  const columns = csvColumns[key];
  const csv = buildCsv(rows, columns);
  triggerDownload(csv, `${key}-speleo-${new Date().toISOString()}.csv`, 'text/csv;charset=utf-8;');
}

function escapePdfText(value) {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function buildPdfLines(title, columns, rows) {
  const dataRows = rows.map((row) =>
    columns.map((column) => formatCellValue(column, row[column.key]) || '-'),
  );
  const headerRow = columns.map((column) => column.label.toUpperCase());
  const table = [headerRow, ...dataRows];
  const widths = columns.map((_, columnIndex) =>
    Math.max(...table.map((row) => row[columnIndex].length)),
  );

  const formatRow = (row) =>
    row
      .map((cell, index) => cell.padEnd(widths[index]))
      .join(' | ');

  const lines = [title, ''.padEnd(40, '=')];
  lines.push(formatRow(headerRow));
  lines.push(''.padEnd(formatRow(headerRow).length, '-'));
  dataRows.forEach((cells) => lines.push(formatRow(cells)));
  return lines;
}

function generateSimplePdf(lines) {
  const objects = [];
  const addObject = (content) => {
    objects.push(`${objects.length + 1} 0 obj\n${content}\nendobj\n`);
  };

  addObject('<< /Type /Catalog /Pages 2 0 R >>');
  addObject('<< /Type /Pages /Count 1 /Kids [3 0 R] >>');
  addObject(
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
  );

  const contentLines = lines.map((line, index) => {
    const y = 760 - index * 16;
    return `BT /F1 12 Tf 40 ${y} Td (${escapePdfText(line)}) Tj ET`;
  });

  const content = contentLines.join('\n');
  addObject(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

  let pdf = '%PDF-1.3\n';
  const offsets = [0];
  objects.forEach((object) => {
    offsets.push(pdf.length);
    pdf += object;
  });

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  });
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return pdf;
}

function triggerDownload(content, filename, mimeType) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}

function downloadPdf(rows, key) {
  if (!rows.length) return;
  const columns = csvColumns[key];
  const lines = buildPdfLines(`Report ${key}`, columns, rows);
  const pdfContent = generateSimplePdf(lines);
  triggerDownload(pdfContent, `${key}-speleo-${new Date().toISOString()}.pdf`, 'application/pdf');
}

const textEncoder = new TextEncoder();

function escapeXml(value) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function columnLabel(index) {
  let label = '';
  let n = index + 1;
  while (n > 0) {
    const remainder = (n - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    n = Math.floor((n - 1) / 26);
  }
  return label;
}

function buildWorksheetXml(columns, rows) {
  const allRows = [
    columns.map((column) => column.label),
    ...rows.map((row) => columns.map((column) => formatCellValue(column, row[column.key]) || '')),
  ];
  const sheetRows = allRows
    .map((cells, rowIndex) => {
      const cellXml = cells
        .map((cell, cellIndex) => {
          const ref = `${columnLabel(cellIndex)}${rowIndex + 1}`;
          return `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(cell)}</t></is></c>`;
        })
        .join('');
      return `<row r="${rowIndex + 1}">${cellXml}</row>`;
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    ${sheetRows}
  </sheetData>
</worksheet>`;
}

function buildWorkbookXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Report" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`;
}

function buildContentTypesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`;
}

function buildRootRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;
}

function buildWorkbookRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`;
}

function crc32(uint8) {
  let crc = -1;
  for (let i = 0; i < uint8.length; i += 1) {
    crc ^= uint8[i];
    for (let j = 0; j < 8; j += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ -1) >>> 0;
}

function buildZipFile(files) {
  const localChunks = [];
  const centralChunks = [];
  let offset = 0;

  files.forEach((file) => {
    const data = textEncoder.encode(file.content);
    const nameBytes = textEncoder.encode(file.name);
    const crc = crc32(data);

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, 0, true);
    localView.setUint16(12, 0, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, data.length, true);
    localView.setUint32(22, data.length, true);
    localView.setUint16(26, nameBytes.length, true);
    localView.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);
    localChunks.push(localHeader, data);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, 0, true);
    centralView.setUint16(14, 0, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, data.length, true);
    centralView.setUint32(24, data.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);
    centralChunks.push(centralHeader);

    offset += localHeader.length + data.length;
  });

  const centralDirectorySize = centralChunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const centralDirectoryOffset = offset;

  const endRecord = new Uint8Array(22);
  const endView = new DataView(endRecord.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralDirectorySize, true);
  endView.setUint32(16, centralDirectoryOffset, true);

  const totalSize =
    localChunks.reduce((sum, chunk) => sum + chunk.length, 0) +
    centralDirectorySize +
    endRecord.length;
  const output = new Uint8Array(totalSize);
  let pointer = 0;
  [...localChunks, ...centralChunks, endRecord].forEach((chunk) => {
    output.set(chunk, pointer);
    pointer += chunk.length;
  });
  return new Blob([output], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

function downloadXlsx(rows, key) {
  if (!rows.length) return;
  const columns = csvColumns[key];
  const sheetXml = buildWorksheetXml(columns, rows);
  const files = [
    { name: '[Content_Types].xml', content: buildContentTypesXml() },
    { name: '_rels/.rels', content: buildRootRelsXml() },
    { name: 'xl/workbook.xml', content: buildWorkbookXml() },
    { name: 'xl/_rels/workbook.xml.rels', content: buildWorkbookRelsXml() },
    { name: 'xl/worksheets/sheet1.xml', content: sheetXml },
  ];
  const blob = buildZipFile(files);
  triggerDownload(blob, `${key}-speleo-${new Date().toISOString()}.xlsx`);
}

export default function Report() {
  const [members, setMembers] = useState([]);
  const [uscite, setUscite] = useState([]);
  const [magazzino, setMagazzino] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [scuolaData, setScuolaData] = useState(() => {
    if (typeof window === 'undefined') return null;
    try {
      const raw = window.localStorage.getItem(SCUOLA_STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (storageError) {
      console.error('[Report] Impossibile leggere i dati della scuola:', storageError);
      return null;
    }
  });
  const navigate = useNavigate();

  const refreshScuolaData = useCallback(() => {
    if (typeof window === 'undefined') {
      setScuolaData(null);
      return;
    }
    try {
      const raw = window.localStorage.getItem(SCUOLA_STORAGE_KEY);
      if (!raw) {
        setScuolaData(null);
        return;
      }
      const parsed = JSON.parse(raw);
      setScuolaData(parsed);
    } catch (storageError) {
      console.error('[Report] Impossibile leggere i dati della scuola:', storageError);
      setScuolaData(null);
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    async function loadData() {
      setLoading(true);
      setError('');
      const [membersRes, usciteRes, equipmentRes] = await Promise.allSettled([
        getMembers(),
        supabase.from('uscite').select('id, titolo, luogo, data, tipo').order('data', { ascending: false }),
        getEquipment(),
      ]);
      if (ignore) return;

      if (membersRes.status === 'fulfilled') {
        setMembers(membersRes.value ?? []);
      } else {
        console.warn('[Report] Impossibile caricare i soci:', membersRes.reason?.message ?? membersRes.reason);
      }

      if (usciteRes.status === 'fulfilled') {
        setUscite(usciteRes.value.data ?? []);
      } else {
        console.warn('[Report] Impossibile caricare le uscite:', usciteRes.reason?.message ?? usciteRes.reason);
      }

      if (equipmentRes.status === 'fulfilled') {
        setMagazzino(equipmentRes.value ?? []);
      } else {
        console.warn('[Report] Impossibile caricare il magazzino:', equipmentRes.reason?.message ?? equipmentRes.reason);
      }

      if (
        membersRes.status === 'rejected' ||
        usciteRes.status === 'rejected' ||
        equipmentRes.status === 'rejected'
      ) {
        setError('Impossibile caricare tutti i dati, riprova più tardi.');
      }

      setLoading(false);
    }

    loadData();
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleFocus = () => refreshScuolaData();
    const handleStorage = (event) => {
      if (!event.key || event.key === SCUOLA_STORAGE_KEY) {
        refreshScuolaData();
      }
    };
    const handleCustom = () => refreshScuolaData();
    window.addEventListener('focus', handleFocus);
    window.addEventListener('storage', handleStorage);
    window.addEventListener('speleo-scuola-update', handleCustom);
    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('speleo-scuola-update', handleCustom);
    };
  }, [refreshScuolaData]);

  const filteredMembers = useMemo(() => {
    if (!search.trim()) return members;
    const term = search.trim().toLowerCase();
    return members.filter((member) =>
      member.full_name?.toLowerCase().includes(term) ||
      String(member.old_id ?? '').includes(term) ||
      String(member.membership_number ?? '').includes(term),
    );
  }, [members, search]);

  const membersMap = useMemo(() => new Map(members.map((member) => [member.id, member])), [members]);

  const scuolaSummary = useMemo(() => {
    if (!scuolaData) return null;
    const exportedAt = scuolaData.updatedAt ? new Date(scuolaData.updatedAt) : null;
    const yearFolders = Array.isArray(scuolaData.yearFolders) ? scuolaData.yearFolders : [];
    const registry = Array.isArray(scuolaData.registry) ? scuolaData.registry : [];
    return { exportedAt, yearFolders, registry };
  }, [scuolaData]);

  function buildInstructorRows(year, course) {
    return (course.instructors ?? []).map((item) => {
      const member = membersMap.get(item.memberId);
      return {
        id: `${year.id}-${course.id}-${item.memberId}`,
        year_label: year.label,
        course_id: course.id,
        course_name: course.name,
        course_status: course.isClosed ? 'chiuso' : 'aperto',
        member_id: item.memberId,
        full_name: member?.full_name ?? 'Socio senza nome',
        membership_number: member?.old_id ?? member?.membership_number ?? '',
        qualification: qualificationLabels[item.qualification] ?? item.qualification,
        custom_qualification: item.customQualification || '',
        email: member?.email ?? '',
      };
    });
  }

  function buildStudentRows(year, course) {
    return (course.students ?? []).map((student) => ({
      id: student.id,
      year_label: year.label,
      course_id: course.id,
      course_name: course.name,
      course_status: course.isClosed ? 'chiuso' : 'aperto',
      first_name: student.firstName,
      last_name: student.lastName,
      birth_date: student.birthDate,
      payment_status: student.paymentStatus,
      regulation_read: Boolean(student.regulationRead),
      privacy_accepted: Boolean(student.privacyAccepted),
      equipment_delivery: student.equipmentDelivery,
      equipment_return: student.equipmentReturn,
      equipment_notes: student.equipmentNotes,
    }));
  }

  const registryRows = useMemo(() => {
    if (!scuolaSummary) return [];
    const yearLabelMap = new Map(
      (scuolaSummary.yearFolders ?? []).map((year) => [year.id, year.label]),
    );
    return (scuolaSummary.registry ?? []).map((entry) => {
      const member = membersMap.get(entry.memberId);
      return {
        id: entry.id,
        year_label: yearLabelMap.get(entry.yearId) ?? 'Anno non indicato',
        member_id: entry.memberId,
        full_name: member?.full_name ?? 'Socio senza nome',
        membership_number: member?.old_id ?? member?.membership_number ?? '',
        qualification_type: entry.qualificationType,
        qualification: qualificationLabels[entry.qualificationType] ?? entry.qualificationType,
        custom_qualification: entry.customQualification,
        qualification_date: entry.qualificationDate,
        last_maintenance_date: entry.lastMaintenanceDate,
        next_maintenance_date: entry.nextMaintenanceDate,
        activities: entry.activities,
        email: member?.email ?? '',
      };
    });
  }, [scuolaSummary, membersMap]);

  function handleExport(key, format = 'csv') {
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
    if (format === 'pdf') {
      downloadPdf(rows, key);
    } else if (format === 'xlsx') {
      downloadXlsx(rows, key);
    } else {
      downloadCsv(rows, key);
    }
  }

  function handleScuolaExport(yearId, courseId, target, format = 'csv') {
    setError('');
    if (!scuolaSummary) {
      setError('Genera i dati dalla pagina Scuola prima di esportare.');
      return;
    }
    const year = scuolaSummary.yearFolders.find((item) => item.id === yearId);
    if (!year) {
      setError('Anno non disponibile. Reinvialo dalla pagina Scuola.');
      return;
    }
    const course = year.courses.find((item) => item.id === courseId);
    if (!course) {
      setError('Corso non disponibile. Reinvialo dalla pagina Scuola.');
      return;
    }
    const rows = target === 'instructors' ? buildInstructorRows(year, course) : buildStudentRows(year, course);
    if (!rows.length) {
      setError(
        target === 'instructors'
          ? `La cartella "${course.name}" non ha istruttori nell'ultima esportazione.`
          : `La cartella "${course.name}" non ha corsisti nell'ultima esportazione.`,
      );
      return;
    }
    const key = target === 'instructors' ? 'scuola_instructors' : 'scuola_corsisti';
    if (format === 'pdf') {
      downloadPdf(rows, key);
    } else if (format === 'xlsx') {
      downloadXlsx(rows, key);
    } else {
      downloadCsv(rows, key);
    }
  }

  function prepareUsciteForExport() {
    return uscite.map((item) => ({
      ...item,
      data: item.data ? new Date(item.data).toISOString() : '',
    }));
  }

  function handleRegistryExport(format = 'csv') {
    setError('');
    const rows = registryRows;
    if (!rows.length) {
      setError('Il registro istruttori non contiene dati esportabili.');
      return;
    }
    const key = 'scuola_registry';
    if (format === 'pdf') {
      downloadPdf(rows, key);
    } else if (format === 'xlsx') {
      downloadXlsx(rows, key);
    } else {
      downloadCsv(rows, key);
    }
  }

  return (
    <section className="page-grid">
      <header>
        <h1>Report amministratore</h1>
        <p>Scarica gli elenchi aggiornati o sincronizza i dati con strumenti esterni.</p>
      </header>

      {loading && <p>Raccolta dati in corso...</p>}
      {error && <p style={{ color: '#c92a2a' }}>{error}</p>}

      <article className="card">
        <h2>Cartelle corso (Scuola)</h2>
        {scuolaSummary ? (
          scuolaSummary.yearFolders.length ? (
            <>
              <div
                style={{
                  marginTop: '0.25rem',
                  color: 'var(--color-muted)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '0.75rem',
                  flexWrap: 'wrap',
                }}
              >
                <span>
                  Ultimo aggiornamento:{' '}
                  {scuolaSummary.exportedAt ? scuolaSummary.exportedAt.toLocaleString('it-IT') : 'non disponibile'}.
                </span>
                <button type="button" style={{ background: '#adb5bd' }} onClick={refreshScuolaData}>
                  Aggiorna elenco
                </button>
              </div>
              <div className="card-list" style={{ marginTop: '1rem' }}>
                {scuolaSummary.yearFolders.map((year) => (
                  <article key={year.id} className="card" style={{ padding: '1rem' }}>
                    <header style={{ marginBottom: '0.5rem' }}>
                      <strong>{year.label}</strong>
                      <p style={{ margin: '0.25rem 0', color: 'var(--color-muted)' }}>
                        Corsi esportati: {year.courses.length}
                      </p>
                    </header>
                    <div style={{ display: 'grid', gap: '1rem' }}>
                      {year.courses.map((course) => {
                        const instructorRows = buildInstructorRows(year, course);
                        const studentRows = buildStudentRows(year, course);
                        const courseStatus = course.status ?? (course.isClosed ? 'chiuso' : 'aperto');
                        const isClosed = courseStatus === 'chiuso';
                        const closedAt = course.closed_at ?? course.closedAt ?? null;
                        const linkedCount = course.linked_uscite?.length ?? 0;
                        return (
                          <div key={course.id} className="card" style={{ padding: '0.75rem' }}>
                            <header style={{ marginBottom: '0.35rem' }}>
                              <strong>{course.name}</strong>
                              <p style={{ margin: '0.15rem 0', color: 'var(--color-muted)' }}>
                                Istruttori: {course.instructors.length} · Corsisti: {course.students.length}
                              </p>
                              <p style={{ margin: '0.15rem 0', color: isClosed ? '#c92a2a' : '#2f9e44' }}>
                                Stato: <strong>{isClosed ? 'Chiuso' : 'Aperto'}</strong>
                                {closedAt ? ` · chiuso il ${new Date(closedAt).toLocaleDateString('it-IT')}` : ''}
                              </p>
                            </header>
                            <div style={{ display: 'grid', gap: '0.75rem' }}>
                              <div>
                                <strong>Esporta istruttori</strong>
                                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                                  <button type="button" onClick={() => handleScuolaExport(year.id, course.id, 'instructors')}>
                                    CSV
                                  </button>
                                  <button
                                    type="button"
                                    style={{ background: '#228be6' }}
                                    onClick={() => handleScuolaExport(year.id, course.id, 'instructors', 'pdf')}
                                  >
                                    PDF
                                  </button>
                                  <button
                                    type="button"
                                    style={{ background: '#adb5bd' }}
                                    onClick={() => handleScuolaExport(year.id, course.id, 'instructors', 'xlsx')}
                                  >
                                    XLSX
                                  </button>
                                </div>
                              </div>
                              <div>
                                <strong>Esporta corsisti</strong>
                                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                                  <button type="button" onClick={() => handleScuolaExport(year.id, course.id, 'students')}>
                                    CSV
                                  </button>
                                  <button
                                    type="button"
                                    style={{ background: '#228be6' }}
                                    onClick={() => handleScuolaExport(year.id, course.id, 'students', 'pdf')}
                                  >
                                    PDF
                                  </button>
                                  <button
                                    type="button"
                                    style={{ background: '#adb5bd' }}
                                    onClick={() => handleScuolaExport(year.id, course.id, 'students', 'xlsx')}
                                  >
                                    XLSX
                                  </button>
                                </div>
                              </div>
                              <small style={{ color: 'var(--color-muted)' }}>
                                Uscite collegate: {linkedCount ? `${linkedCount} (integrazione in arrivo)` : 'nessuna, integrazione in arrivo'}
                              </small>
                              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', color: 'var(--color-muted)', fontSize: '0.9rem' }}>
                                <span>Istruttori registrati: {instructorRows.length}</span>
                                <span>Corsisti registrati: {studentRows.length}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      {!year.courses.length && (
                        <p style={{ color: 'var(--color-muted)' }}>Nessun corso registrato per questo anno.</p>
                      )}
                    </div>
                  </article>
                ))}
              </div>
              <small style={{ display: 'block', marginTop: '0.75rem', color: 'var(--color-muted)' }}>
                I dati si aggiornano automaticamente quando modifichi la pagina Scuola. Puoi forzare un aggiornamento con il pulsante
                &quot;Aggiorna elenco&quot;.
              </small>
            </>
          ) : (
            <p style={{ marginTop: '0.25rem', color: 'var(--color-muted)' }}>
              Nessuna cartella corso presente nell&apos;ultima esportazione. Aggiorna dalla pagina Scuola.
            </p>
          )
        ) : (
          <p style={{ marginTop: '0.25rem', color: 'var(--color-muted)' }}>
            Non ci sono ancora dati della Scuola salvati. Compila corsi, istruttori e corsisti dalla pagina Scuola per consultarli qui.
          </p>
        )}
      </article>

      <article className="card">
        <h2>Registro istruttori</h2>
        {scuolaSummary ? (
          registryRows.length ? (
            <>
              <p style={{ marginTop: '0.25rem', color: 'var(--color-muted)' }}>
                Ultimo aggiornamento:{' '}
                {scuolaSummary.exportedAt ? scuolaSummary.exportedAt.toLocaleString('it-IT') : 'non disponibile'}.
              </p>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', margin: '0.75rem 0' }}>
                <button type="button" onClick={() => handleRegistryExport()}>
                  CSV
                </button>
                <button type="button" style={{ background: '#228be6' }} onClick={() => handleRegistryExport('pdf')}>
                  PDF
                </button>
                <button type="button" style={{ background: '#adb5bd' }} onClick={() => handleRegistryExport('xlsx')}>
                  XLSX
                </button>
              </div>
              <p style={{ marginTop: '0.25rem', color: 'var(--color-muted)' }}>
                Totale nominativi registrati: {registryRows.length}. Utilizza i pulsanti qui sopra per esportare il dettaglio completo.
              </p>
            </>
          ) : (
            <p style={{ marginTop: '0.25rem', color: 'var(--color-muted)' }}>
              Nessun dato nel registro istruttori. Compila il registro nella pagina Scuola per vederlo qui.
            </p>
          )
        ) : (
          <p style={{ marginTop: '0.25rem', color: 'var(--color-muted)' }}>
            Non sono presenti dati del registro. Modifica la pagina Scuola per iniziare a popolare questa sezione.
          </p>
        )}
      </article>

      <div className="card-list">
        <ReportCard
          title="Elenco soci"
          description="Scarica anagrafica soci aggiornata."
          onCsv={() => handleExport('soci')}
          onPdf={() => handleExport('soci', 'pdf')}
          onXlsx={() => handleExport('soci', 'xlsx')}
          disabled={loading}
        />
        <ReportCard
          title="Uscite"
          description="Esporta elenco uscite registrate."
          onCsv={() => handleExport('uscita')}
          onPdf={() => handleExport('uscita', 'pdf')}
          onXlsx={() => handleExport('uscita', 'xlsx')}
          disabled={loading}
        />
        <ReportCard
          title="Inventario"
          description="Scarica lo stato del magazzino."
          onCsv={() => handleExport('magazzino')}
          onPdf={() => handleExport('magazzino', 'pdf')}
          onXlsx={() => handleExport('magazzino', 'xlsx')}
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
                <p style={{ margin: 0, color: 'var(--color-muted)' }}>Tessera: {member.old_id ?? 'N/D'}</p>
              </div>
              <button type="button" style={{ background: '#adb5bd' }} onClick={() => navigate('/soci')}>
                Apri soci
              </button>
            </div>
          ))}
          {!filteredMembers.length && <p>Nessun socio trovato.</p>}
        </div>
      </div>
    </section>
  );
}

function ReportCard({ title, description, onCsv, onPdf, onXlsx, disabled }) {
  return (
    <article className="card">
      <h3 style={{ margin: '0 0 0.25rem' }}>{title}</h3>
      <p style={{ color: 'var(--color-muted)' }}>{description}</p>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
        <button type="button" onClick={onCsv} disabled={disabled}>
          CSV
        </button>
        <button type="button" style={{ background: '#228be6' }} onClick={onPdf} disabled={disabled}>
          PDF
        </button>
        <button type="button" style={{ background: '#adb5bd' }} onClick={onXlsx} disabled={disabled}>
          XLSX
        </button>
      </div>
    </article>
  );
}
