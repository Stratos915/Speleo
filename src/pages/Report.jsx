import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { createMember, getMembers, updateMember } from '../services/members.js';
import { getEquipment } from '../services/equipment.js';
import { getActivityLogs } from '../services/activityLogs.js';
import useAuth from '../context/useAuth.js';
import { formatMemberLabel } from '../utils/members.js';
import { getAllRoles } from '../utils/permissions.js';
import { fetchAccessEvents, fetchDailyVisits } from '../services/analytics.js';

const csvColumns = {
  uscita: [
    { key: 'titolo', label: 'Titolo' },
    { key: 'luogo', label: 'Luogo' },
    { key: 'data', label: 'Data' },
    { key: 'tipo', label: 'Tipo' },
    { key: 'responsabile', label: 'Responsabile' },
    { key: 'participants', label: 'Partecipanti soci' },
    { key: 'participants_manual', label: 'Partecipanti esterni' },
    { key: 'note', label: 'Note' },
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
  soci_full: [
    { key: 'year', label: 'Anno' },
    { key: 'full_name', label: 'Nome completo' },
    { key: 'old_id', label: 'Numero tessera' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Telefono' },
    { key: 'status_label', label: 'Quota' },
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
    { key: 'qualification', label: 'Qualifica' },
    { key: 'qualification_date', label: 'Conseguimento' },
    { key: 'last_maintenance_date', label: 'Ultimo mantenimento' },
    { key: 'next_maintenance_date', label: 'Prossimo mantenimento' },
    { key: 'activities', label: 'Attività ultimi 5 anni' },
    { key: 'email', label: 'Email' },
  ],
  activity_logs: [
    { key: 'created_at', label: 'Data' },
    { key: 'user_email', label: 'Utente' },
    { key: 'user_role', label: 'Ruolo' },
    { key: 'action', label: 'Azione' },
    { key: 'entity', label: 'Entità' },
    { key: 'entity_id', label: 'ID' },
    { key: 'message', label: 'Messaggio' },
  ],
  analytics_visits: [
    { key: 'day', label: 'Giorno' },
    { key: 'visits', label: 'Visite' },
    { key: 'unique_users', label: 'Utenti unici' },
  ],
  access_events: [
    { key: 'user_email', label: 'Email' },
    { key: 'access_at', label: 'Accesso' },
    { key: 'client_info', label: 'Client' },
  ],
};

const SCUOLA_STORAGE_KEY = 'speleo-scuola-data-v2';
const LETTERHEAD_PATH = '/letterhead.png';
const PDF_PAGE_WIDTH = 612;
const PDF_PAGE_HEIGHT = 792;
const PDF_MARGIN = 40;
const PDF_FONT_SIZE = 8;
const PDF_TITLE_FONT_SIZE = 12;
const PDF_LINE_HEIGHT = 11;
const PDF_CHAR_WIDTH = 6;
const PDF_CELL_PADDING = 3;
const PDF_MIN_COL_CHARS = 6;
const PDF_MAX_COL_CHARS = 32;

const paymentStatusLabels = {
  pending: 'Da saldare',
  paid: 'Pagato',
  exempt: 'Esente',
};

const YEAR_START = 2025;
const YEAR_END = 2050;

const qualificationLabels = {
  istruttore: 'Istruttore',
  aiuto_istruttore: 'Aiuto istruttore',
};

const sociSummaryColumns = [
  { key: 'year', label: 'Anno' },
  { key: 'total', label: 'Totale soci' },
  { key: 'paid', label: 'Quote pagate' },
  { key: 'unpaid', label: 'Quote da saldare' },
];

function resolveYearValue(input) {
  if (Number.isFinite(input)) return Number(input);
  const numeric = Number(input);
  if (Number.isFinite(numeric)) return numeric;
  const match = String(input ?? '').match(/(20\d{2})/);
  if (match) return Number(match[0]);
  return null;
}

function formatDate(value) {
  if (!value) return '';
  const dateValue = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(dateValue.getTime())) return '';
  return dateValue.toLocaleDateString('it-IT');
}

function formatDateTime(value) {
  if (!value) return '';
  const dateValue = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(dateValue.getTime())) return '';
  return dateValue.toLocaleString('it-IT');
}

function summarizeClientInfo(info) {
  if (!info || typeof info !== 'object') return '-';
  const candidate = info.user_agent || info.device || '';
  if (!candidate) return '-';
  return candidate.length > 80 ? `${candidate.slice(0, 77)}...` : candidate;
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

let letterheadPromise = null;

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function blobToBytes(blob) {
  return blob.arrayBuffer().then((buffer) => new Uint8Array(buffer));
}

async function loadLetterheadImage() {
  try {
    const response = await fetch(LETTERHEAD_PATH, { cache: 'force-cache' });
    if (!response.ok) return null;
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    try {
      const img = await loadImage(objectUrl);
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(img, 0, 0);
      const jpegBlob = await new Promise((resolve) => {
        canvas.toBlob((file) => resolve(file), 'image/jpeg', 0.92);
      });
      if (!jpegBlob) return null;
      const binary = await blobToBytes(jpegBlob);
      return {
        data: binary,
        width: canvas.width,
        height: canvas.height,
      };
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  } catch (_error) {
    return null;
  }
}

async function getLetterheadImage() {
  if (!letterheadPromise) {
    letterheadPromise = loadLetterheadImage();
  }
  return letterheadPromise;
}

function escapePdfText(value) {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function splitIntoLines(text, maxChars) {
  const safe = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!safe) return [''];
  if (safe.length <= maxChars) return [safe];
  const words = safe.split(/\s+/);
  const lines = [];
  let current = '';
  words.forEach((word) => {
    if (!current && word.length > maxChars) {
      for (let i = 0; i < word.length; i += maxChars) {
        lines.push(word.slice(i, i + maxChars));
      }
      return;
    }
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars) {
      lines.push(current || word);
      current = current ? word : '';
    } else {
      current = next;
    }
  });
  if (current) lines.push(current);
  return lines;
}

function computeColumnWidths(columns, rows) {
  const values = rows.map((row) => columns.map((column) => formatCellValue(column, row[column.key]) || ''));
  const rawChars = columns.map((column, index) => {
    const headerLength = String(column.label ?? '').length;
    const maxValueLength = values.reduce((max, row) => Math.max(max, String(row[index] ?? '').length), 0);
    const candidate = Math.max(headerLength, maxValueLength, PDF_MIN_COL_CHARS);
    return Math.min(candidate, PDF_MAX_COL_CHARS);
  });
  const minWidth = PDF_MIN_COL_CHARS * PDF_CHAR_WIDTH + PDF_CELL_PADDING * 2;
  let widths = rawChars.map((count) => count * PDF_CHAR_WIDTH + PDF_CELL_PADDING * 2);
  const available = PDF_PAGE_WIDTH - PDF_MARGIN * 2;
  let total = widths.reduce((sum, width) => sum + width, 0);
  if (total > available) {
    const scale = available / total;
    widths = widths.map((width) => Math.max(width * scale, minWidth));
    total = widths.reduce((sum, width) => sum + width, 0);
    if (total > available) {
      const excess = total - available;
      const adjustable = widths
        .map((width, index) => ({ index, slack: width - minWidth }))
        .filter((entry) => entry.slack > 0);
      const slackTotal = adjustable.reduce((sum, entry) => sum + entry.slack, 0) || 1;
      widths = widths.map((width, index) => {
        const entry = adjustable.find((item) => item.index === index);
        if (!entry) return width;
        const reduction = (entry.slack / slackTotal) * excess;
        return Math.max(width - reduction, minWidth);
      });
    }
  }
  const charLimits = widths.map((width) =>
    Math.max(PDF_MIN_COL_CHARS, Math.floor((width - PDF_CELL_PADDING * 2) / PDF_CHAR_WIDTH)),
  );
  return { widths, charLimits };
}

function generateTablePdf(title, columns, rows, { backgroundImage } = {}) {
  const hasBackground = Boolean(backgroundImage?.data?.length);
  const startY = hasBackground ? 640 : PDF_PAGE_HEIGHT - PDF_MARGIN;
  const bottomY = hasBackground ? 90 : PDF_MARGIN;
  const { widths, charLimits } = computeColumnWidths(columns, rows);
  const headerLines = columns.map((column, index) => splitIntoLines(column.label, charLimits[index]));
  const headerHeight =
    Math.max(...headerLines.map((lines) => lines.length), 1) * PDF_LINE_HEIGHT + PDF_CELL_PADDING * 2;
  const rowLines = rows.map((row) =>
    columns.map((column, index) => splitIntoLines(formatCellValue(column, row[column.key]), charLimits[index])),
  );

  const pages = [];
  let current = [];
  let cursorY = startY;
  let firstPage = true;
  rowLines.forEach((row) => {
    const rowHeight =
      Math.max(...row.map((lines) => lines.length), 1) * PDF_LINE_HEIGHT + PDF_CELL_PADDING * 2;
    const headerSpace = firstPage ? headerHeight + PDF_LINE_HEIGHT * 2 : headerHeight;
    if (cursorY - headerSpace - rowHeight < bottomY) {
      pages.push({ rows: current, firstPage });
      current = [];
      cursorY = startY;
      firstPage = false;
    }
    current.push(row);
    cursorY -= rowHeight;
  });
  pages.push({ rows: current, firstPage });

  const pageObjectNumbers = pages.map((_page, index) => 3 + index * 2);
  const contentObjectNumbers = pageObjectNumbers.map((number) => number + 1);
  const fontObjectNumber = 3 + pages.length * 2;
  const imageObjectNumber = hasBackground ? fontObjectNumber + 1 : null;

  const encoder = new TextEncoder();
  const parts = [];
  const offsets = [0];
  let length = 0;

  const pushString = (value) => {
    const bytes = encoder.encode(value);
    parts.push(bytes);
    length += bytes.length;
  };
  const pushBytes = (bytes) => {
    parts.push(bytes);
    length += bytes.length;
  };
  const startObject = () => {
    offsets.push(length);
  };

  pushString('%PDF-1.3\n');

  startObject();
  pushString('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

  const kids = pageObjectNumbers.map((number) => `${number} 0 R`).join(' ');
  startObject();
  pushString(`2 0 obj\n<< /Type /Pages /Count ${pages.length} /Kids [${kids}] >>\nendobj\n`);

  pages.forEach((pageData, index) => {
    const pageNumber = pageObjectNumbers[index];
    const contentNumber = contentObjectNumbers[index];
    const resources = hasBackground
      ? `<< /Font << /F1 ${fontObjectNumber} 0 R >> /XObject << /Im1 ${imageObjectNumber} 0 R >> >>`
      : `<< /Font << /F1 ${fontObjectNumber} 0 R >> >>`;
    startObject();
    pushString(
      `${pageNumber} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PDF_PAGE_WIDTH} ${PDF_PAGE_HEIGHT}] /Contents ${contentNumber} 0 R /Resources ${resources} >>\nendobj\n`,
    );

    const contentLines = [];
    if (hasBackground) {
      contentLines.push(`q ${PDF_PAGE_WIDTH} 0 0 ${PDF_PAGE_HEIGHT} 0 0 cm /Im1 Do Q`);
    }
    contentLines.push('0.6 w');
    let y = startY;
    if (pageData.firstPage) {
      contentLines.push(`BT /F1 ${PDF_TITLE_FONT_SIZE} Tf ${PDF_MARGIN} ${y} Td (${escapePdfText(title)}) Tj ET`);
      y -= PDF_LINE_HEIGHT * 2;
    }

    const drawRow = (row, yTop) => {
      const rowHeight =
        Math.max(...row.map((lines) => lines.length), 1) * PDF_LINE_HEIGHT + PDF_CELL_PADDING * 2;
      let x = PDF_MARGIN;
      row.forEach((lines, colIndex) => {
        const width = widths[colIndex];
        contentLines.push(`${x} ${yTop - rowHeight} ${width} ${rowHeight} re S`);
        lines.forEach((line, lineIndex) => {
          const textY = yTop - PDF_CELL_PADDING - PDF_FONT_SIZE - lineIndex * PDF_LINE_HEIGHT;
          contentLines.push(
            `BT /F1 ${PDF_FONT_SIZE} Tf ${x + PDF_CELL_PADDING} ${textY} Td (${escapePdfText(line)}) Tj ET`,
          );
        });
        x += width;
      });
      return yTop - rowHeight;
    };

    y = drawRow(headerLines, y);
    pageData.rows.forEach((row) => {
      y = drawRow(row, y);
    });
    const content = contentLines.join('\n');
    startObject();
    const contentBytes = encoder.encode(content);
    pushString(`${contentNumber} 0 obj\n<< /Length ${contentBytes.length} >>\nstream\n`);
    pushBytes(contentBytes);
    pushString('\nendstream\nendobj\n');
  });

  startObject();
  pushString(`${fontObjectNumber} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>\nendobj\n`);

  if (hasBackground) {
    startObject();
    pushString(
      `${imageObjectNumber} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${backgroundImage.width} /Height ${backgroundImage.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${backgroundImage.data.length} >>\nstream\n`,
    );
    pushBytes(backgroundImage.data);
    pushString('\nendstream\nendobj\n');
  }

  const xrefOffset = length;
  pushString(`xref\n0 ${offsets.length}\n`);
  pushString('0000000000 65535 f \n');
  offsets.slice(1).forEach((offset) => {
    pushString(`${String(offset).padStart(10, '0')} 00000 n \n`);
  });
  pushString(`trailer << /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

  const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(totalLength);
  let position = 0;
  parts.forEach((part) => {
    output.set(part, position);
    position += part.length;
  });
  return output;
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

async function downloadPdf(rows, key) {
  if (!rows.length) return;
  const columns = csvColumns[key];
  const backgroundImage = await getLetterheadImage();
  const pdfContent = generateTablePdf(`Report ${key}`, columns, rows, { backgroundImage });
  triggerDownload(pdfContent, `${key}-speleo-${new Date().toISOString()}.pdf`, 'application/pdf');
}

async function downloadPdfTable(title, columns, rows, filename) {
  const backgroundImage = await getLetterheadImage();
  const pdfContent = generateTablePdf(title, columns, rows, { backgroundImage });
  triggerDownload(pdfContent, filename, 'application/pdf');
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
  const { role, isAuthenticated, user } = useAuth();
  const canViewActivityLog = role === 'admin' || role === 'presidente';
  const canApproveUsers = role === 'admin' || role === 'presidente';
  const rolesList = useMemo(() => getAllRoles(), []);
  const [members, setMembers] = useState([]);
  const [uscite, setUscite] = useState([]);
  const [magazzino, setMagazzino] = useState([]);
  const [activityLogs, setActivityLogs] = useState([]);
  const [pendingProfiles, setPendingProfiles] = useState([]);
  const [approvalsLoading, setApprovalsLoading] = useState(false);
  const [approvalsError, setApprovalsError] = useState('');
  const [approvalsUpdating, setApprovalsUpdating] = useState({});
  const [roleAssignments, setRoleAssignments] = useState({});
  const [approvalHistory, setApprovalHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [visitsRange, setVisitsRange] = useState(30);
  const [visitsData, setVisitsData] = useState([]);
  const [visitsLoading, setVisitsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState('');
  const [activeUsers, setActiveUsers] = useState([]);
  const [activeLoading, setActiveLoading] = useState(false);
  const [activeError, setActiveError] = useState('');
  const [activeRange, setActiveRange] = useState('2m');
  const ACTIVE_REFRESH_MS = 30_000;
  const visitsSummary = useMemo(() => {
    if (!visitsData.length) {
      return { total: 0, lastDay: null };
    }
    const total = visitsData.reduce((sum, row) => sum + Number(row?.visits ?? 0), 0);
    const lastDay = visitsData[visitsData.length - 1] ?? null;
    return { total, lastDay };
  }, [visitsData]);
  const visitsRows = useMemo(
    () =>
      visitsData.map((row) => ({
        day: row.day ? formatDate(row.day) : '',
        visits: row.visits ?? 0,
        unique_users: row.unique_users ?? 0,
      })),
    [visitsData],
  );
  const activeRows = useMemo(
    () =>
      activeUsers.map((session) => ({
        user_email: session.user_email ?? '',
        access_at: formatDateTime(session.created_at ?? session.last_seen_at),
        client_info: summarizeClientInfo(session.meta ?? session.client_info),
      })),
    [activeUsers],
  );
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
      const logsPromise = canViewActivityLog ? getActivityLogs(500) : Promise.resolve([]);
      const [membersRes, usciteRes, equipmentRes, logsRes] = await Promise.allSettled([
        getMembers(),
        supabase.from('uscite').select('id, titolo, luogo, data, tipo').order('data', { ascending: false }),
        getEquipment(),
        logsPromise,
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

      if (logsRes.status === 'fulfilled') {
        setActivityLogs(canViewActivityLog ? logsRes.value ?? [] : []);
      } else if (canViewActivityLog) {
        console.warn('[Report] Impossibile caricare i log:', logsRes.reason?.message ?? logsRes.reason);
      }

      if (
        membersRes.status === 'rejected' ||
        usciteRes.status === 'rejected' ||
        equipmentRes.status === 'rejected' ||
        (canViewActivityLog && logsRes.status === 'rejected')
      ) {
        setError('Impossibile caricare tutti i dati, riprova più tardi.');
      }

      setLoading(false);
    }

    loadData();
    return () => {
      ignore = true;
    };
  }, [canViewActivityLog]);

  useEffect(() => {
    if (!isAuthenticated) {
      setVisitsData([]);
      return undefined;
    }
    let ignore = false;
    async function loadVisits() {
      setAnalyticsError('');
      setVisitsLoading(true);
      try {
        const rows = await fetchDailyVisits({ days: visitsRange });
        if (!ignore) setVisitsData(rows);
      } catch (analyticsErr) {
        console.error('[Report] Impossibile caricare le statistiche visite:', analyticsErr);
        if (!ignore) {
          setAnalyticsError('Impossibile caricare le statistiche di accesso.');
          setVisitsData([]);
        }
      } finally {
        if (!ignore) setVisitsLoading(false);
      }
    }

    loadVisits();
    return () => {
      ignore = true;
    };
  }, [isAuthenticated, visitsRange]);

  useEffect(() => {
    if (!isAuthenticated) {
      setActiveUsers([]);
      return undefined;
    }
    let ignore = false;
    let firstLoad = true;

    async function loadActiveUsers() {
      setActiveError('');
      if (firstLoad) setActiveLoading(true);
      try {
        let rows = [];
        if (activeRange === 'all') {
          rows = await fetchAccessEvents({ minutes: null, hours: null, days: null, limit: 2000 });
        } else if (activeRange.endsWith('d')) {
          const days = Number(activeRange.replace('d', ''));
          rows = await fetchAccessEvents({ days, limit: 2000 });
        } else if (activeRange.endsWith('h')) {
          const hours = Number(activeRange.replace('h', '')) || 1;
          rows = await fetchAccessEvents({ hours, limit: 2000 });
        } else {
          const minutes = Number(activeRange.replace('m', '')) || 2;
          rows = await fetchAccessEvents({ minutes, limit: 2000 });
        }
        if (!ignore) setActiveUsers(rows);
      } catch (activeErr) {
        console.error('[Report] Impossibile caricare gli accessi utenti:', activeErr);
        if (!ignore) setActiveError('Impossibile caricare gli accessi utenti.');
      } finally {
        if (firstLoad && !ignore) {
          setActiveLoading(false);
          firstLoad = false;
        }
      }
    }

    loadActiveUsers();
    const interval = setInterval(loadActiveUsers, ACTIVE_REFRESH_MS);
    return () => {
      ignore = true;
      clearInterval(interval);
    };
  }, [isAuthenticated, ACTIVE_REFRESH_MS, activeRange]);

  const loadPendingProfiles = useCallback(async () => {
    if (!canApproveUsers) return;
    setApprovalsLoading(true);
    setApprovalsError('');
    try {
      const { data, error: profilesError } = await supabase
        .from('profiles')
        .select('id,email,role,approval_status,created_at,first_name,last_name,phone,member_id')
        .eq('approval_status', 'pending')
        .order('created_at', { ascending: false });
      if (profilesError) throw profilesError;
      const rows = data ?? [];
      setPendingProfiles(rows);
      const nextAssignments = {};
      rows.forEach((row) => {
        nextAssignments[row.id] = row.role ?? 'socio';
      });
      setRoleAssignments(nextAssignments);
    } catch (loadError) {
      setApprovalsError(loadError.message ?? 'Impossibile caricare le richieste in attesa.');
    } finally {
      setApprovalsLoading(false);
    }
  }, [canApproveUsers]);

  const loadApprovalHistory = useCallback(async () => {
    if (!canApproveUsers) return;
    setHistoryLoading(true);
    setHistoryError('');
    try {
      const { data, error: historyErrorRes } = await supabase
        .from('approval_audit')
        .select('id,created_at,actor_email,target_email,action,from_status,to_status,from_role,to_role')
        .order('created_at', { ascending: false })
        .limit(200);
      if (historyErrorRes) throw historyErrorRes;
      setApprovalHistory(data ?? []);
    } catch (loadError) {
      setHistoryError(loadError.message ?? 'Impossibile caricare lo storico.');
    } finally {
      setHistoryLoading(false);
    }
  }, [canApproveUsers]);

  useEffect(() => {
    if (!canApproveUsers) {
      setPendingProfiles([]);
      setApprovalHistory([]);
      return;
    }
    loadPendingProfiles();
    loadApprovalHistory();
  }, [canApproveUsers, loadPendingProfiles, loadApprovalHistory]);

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

  const membersMap = useMemo(
    () => new Map(members.map((member) => [String(member.id), member])),
    [members],
  );

  const normalizeName = useCallback((value) => {
    return String(value ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
  }, []);

  const buildProfileFullName = useCallback(
    (profile) => `${profile?.first_name ?? ''} ${profile?.last_name ?? ''}`.trim(),
    [],
  );

  const findMemberMatch = useCallback(
    (profile) => {
      const targetName = normalizeName(buildProfileFullName(profile));
      if (!targetName) return null;
      return (
        members.find((member) => {
          const fullName = normalizeName(member.full_name);
          const itaName = normalizeName(`${member.nome ?? ''} ${member.cognome ?? ''}`.trim());
          const altName = normalizeName(`${member.first_name ?? ''} ${member.last_name ?? ''}`.trim());
          return [fullName, itaName, altName].some((candidate) => candidate && candidate === targetName);
        }) ?? null
      );
    },
    [members, buildProfileFullName, normalizeName],
  );

  const ensureMemberForProfile = useCallback(
    async (profile) => {
      if (!profile) return { memberId: null, action: 'none' };
      const profileName = buildProfileFullName(profile);
      const profileEmail = profile.email?.trim() ?? '';
      const profilePhone = profile.phone?.trim() ?? '';
      let member =
        profile.member_id && membersMap.has(String(profile.member_id))
          ? membersMap.get(String(profile.member_id))
          : null;
      if (!member && profileName) {
        member = findMemberMatch(profile);
      }
      if (!member && profileName) {
        const payload = {
          full_name: profileName,
          email: profileEmail || null,
          phone: profilePhone || null,
          membership_year: new Date().getFullYear(),
          membership_paid: false,
        };
        const created = await createMember(payload);
        return { memberId: created.id, action: 'created' };
      }
      if (member) {
        const updates = {};
        if (profileName && !member.full_name) updates.full_name = profileName;
        if (profileEmail && !member.email) updates.email = profileEmail;
        if (profilePhone && !member.phone) updates.phone = profilePhone;
        if (Object.keys(updates).length) {
          await updateMember(member.id, updates);
        }
        return { memberId: member.id, action: 'linked' };
      }
      return { memberId: null, action: 'none' };
    },
    [buildProfileFullName, findMemberMatch, membersMap],
  );

  const handleApproveProfile = useCallback(
    async (profileId) => {
      setApprovalsUpdating((prev) => ({ ...prev, [profileId]: true }));
      setApprovalsError('');
      try {
        const nextRole = roleAssignments[profileId] ?? 'socio';
        const target = pendingProfiles.find((row) => row.id === profileId);
        const { memberId } = await ensureMemberForProfile(target);
        const { error: updateError } = await supabase
          .from('profiles')
          .update({
            approval_status: 'approved',
            role: nextRole,
            approved_at: new Date().toISOString(),
            member_id: memberId ?? target?.member_id ?? null,
          })
          .eq('id', profileId);
        if (updateError) throw updateError;
        await supabase.from('approval_audit').insert({
          actor_id: user?.id ?? null,
          actor_email: user?.email ?? null,
          target_id: profileId,
          target_email: target?.email ?? null,
          action: 'approve',
          from_status: target?.approval_status ?? 'pending',
          to_status: 'approved',
          from_role: target?.role ?? null,
          to_role: nextRole,
        });
        if (target?.email) {
          try {
            const { error: notifyError } = await supabase.functions.invoke('send-approval-email', {
              body: {
                email: target.email,
                first_name: target.first_name ?? '',
                last_name: target.last_name ?? '',
                app_url: window.location.origin,
              },
            });
            if (!notifyError) {
              await supabase.from('approval_audit').insert({
                actor_id: user?.id ?? null,
                actor_email: user?.email ?? null,
                target_id: profileId,
                target_email: target?.email ?? null,
                action: 'notify_email',
                from_status: 'approved',
                to_status: 'approved',
                from_role: nextRole,
                to_role: nextRole,
              });
            }
          } catch (notifyErr) {
            console.warn('[Report] Invio email approvazione fallito:', notifyErr);
          }
        }
        await loadPendingProfiles();
        await loadApprovalHistory();
      } catch (updateError) {
        setApprovalsError(updateError.message ?? 'Impossibile approvare il profilo.');
      } finally {
        setApprovalsUpdating((prev) => ({ ...prev, [profileId]: false }));
      }
    },
    [roleAssignments, loadPendingProfiles, pendingProfiles, loadApprovalHistory, user, ensureMemberForProfile],
  );

  const handleRejectProfile = useCallback(
    async (profileId) => {
      setApprovalsUpdating((prev) => ({ ...prev, [profileId]: true }));
      setApprovalsError('');
      try {
        const target = pendingProfiles.find((row) => row.id === profileId);
        const { error: updateError } = await supabase
          .from('profiles')
          .update({
            approval_status: 'rejected',
            approved_at: null,
          })
          .eq('id', profileId);
        if (updateError) throw updateError;
        await supabase.from('approval_audit').insert({
          actor_id: user?.id ?? null,
          actor_email: user?.email ?? null,
          target_id: profileId,
          target_email: target?.email ?? null,
          action: 'reject',
          from_status: target?.approval_status ?? 'pending',
          to_status: 'rejected',
          from_role: target?.role ?? null,
          to_role: target?.role ?? null,
        });
        await loadPendingProfiles();
        await loadApprovalHistory();
      } catch (updateError) {
        setApprovalsError(updateError.message ?? 'Impossibile rifiutare il profilo.');
      } finally {
        setApprovalsUpdating((prev) => ({ ...prev, [profileId]: false }));
      }
    },
    [loadPendingProfiles, pendingProfiles, loadApprovalHistory, user],
  );

  const handleRoleChange = useCallback(
    async (profile) => {
      const nextRole = roleAssignments[profile.id] ?? 'socio';
      if (nextRole === profile.role) return;
      setApprovalsUpdating((prev) => ({ ...prev, [profile.id]: true }));
      setApprovalsError('');
      try {
        const { error: updateError } = await supabase
          .from('profiles')
          .update({ role: nextRole })
          .eq('id', profile.id);
        if (updateError) throw updateError;
        await supabase.from('approval_audit').insert({
          actor_id: user?.id ?? null,
          actor_email: user?.email ?? null,
          target_id: profile.id,
          target_email: profile.email ?? null,
          action: 'role_change',
          from_status: profile.approval_status ?? null,
          to_status: profile.approval_status ?? null,
          from_role: profile.role ?? null,
          to_role: nextRole,
        });
        await loadPendingProfiles();
        await loadApprovalHistory();
      } catch (updateError) {
        setApprovalsError(updateError.message ?? 'Impossibile aggiornare il ruolo.');
      } finally {
        setApprovalsUpdating((prev) => ({ ...prev, [profile.id]: false }));
      }
    },
    [roleAssignments, loadPendingProfiles, loadApprovalHistory, user],
  );

  const detectMembershipYear = useCallback((member) => {
    if (member.membership_year) return member.membership_year;
    if (member.year) return member.year;
    if (member.anno) return member.anno;
    if (member.created_at) {
      const parsed = new Date(member.created_at);
      if (!Number.isNaN(parsed.getTime())) return parsed.getFullYear();
    }
    return 'N/D';
  }, []);

  const [membersYearFilter, setMembersYearFilter] = useState('all');
  const [scuolaYearFilter, setScuolaYearFilter] = useState('all');

  const membersSummary = useMemo(() => {
    const map = new Map();
    members.forEach((member) => {
      const year = detectMembershipYear(member);
      const entry = map.get(year) ?? { year, total: 0, paid: 0, unpaid: 0 };
      entry.total += 1;
      if (member.membership_paid) entry.paid += 1;
      else entry.unpaid += 1;
      map.set(year, entry);
    });
    return Array.from(map.values()).sort((a, b) => {
      const yearA = Number(a.year);
      const yearB = Number(b.year);
      if (!Number.isNaN(yearA) && !Number.isNaN(yearB)) {
        return yearB - yearA;
      }
      return String(a.year).localeCompare(String(b.year));
    });
  }, [members, detectMembershipYear]);

  const activityRows = useMemo(
    () =>
      activityLogs.map((log) => ({
        created_at: log.created_at ? new Date(log.created_at).toLocaleString('it-IT') : '',
        user_email: log.user_email ?? 'N/D',
        user_role: log.user_role ?? 'N/D',
        action: log.action,
        entity: log.entity ?? '',
        entity_id: log.entity_id ?? '',
        message: log.message ?? '',
      })),
    [activityLogs],
  );

  const memberYears = useMemo(() => {
    const set = new Set();
    for (let year = YEAR_START; year <= YEAR_END; year += 1) {
      set.add(String(year));
    }
    members.forEach((member) => {
      const year = detectMembershipYear(member);
      if (year) {
        set.add(String(year));
      }
    });
    return Array.from(set).sort((a, b) => Number(b) - Number(a));
  }, [members, detectMembershipYear]);

  const membersFullRows = useMemo(() => {
    const rows = members.map((member) => {
      const year = detectMembershipYear(member);
      const numericCard = Number(member.old_id ?? member.membership_number);
      return {
        id: member.id,
        year,
        full_name: member.full_name ?? 'Socio senza nome',
        old_id: member.old_id ?? member.membership_number ?? '',
        email: member.email ?? '',
        phone: member.phone ?? '',
        status_label: member.membership_paid ? 'Pagato' : 'Da saldare',
        order_number: Number.isNaN(numericCard) ? null : numericCard,
      };
    });
    rows.sort((a, b) => {
      if (a.order_number !== null || b.order_number !== null) {
        if (a.order_number === null) return 1;
        if (b.order_number === null) return -1;
        if (a.order_number !== b.order_number) return a.order_number - b.order_number;
      }
      return a.full_name.localeCompare(b.full_name, 'it', { sensitivity: 'base' });
    });
    return rows;
  }, [members, detectMembershipYear]);

  const filteredMembersFullRows = useMemo(() => {
    if (membersYearFilter === 'all') return membersFullRows;
    return membersFullRows.filter((row) => String(row.year) === membersYearFilter);
  }, [membersFullRows, membersYearFilter]);

  const scuolaSummary = useMemo(() => {
    if (!scuolaData) return null;
    const exportedAt = scuolaData.updatedAt ? new Date(scuolaData.updatedAt) : null;
    const yearFolders = Array.isArray(scuolaData.yearFolders) ? scuolaData.yearFolders : [];
    const registry = Array.isArray(scuolaData.registry) ? scuolaData.registry : [];
    return { exportedAt, yearFolders, registry };
  }, [scuolaData]);

  const scuolaYearOptions = useMemo(() => {
    const options = [];
    for (let year = YEAR_START; year <= YEAR_END; year += 1) {
      options.push(String(year));
    }
    return options;
  }, []);

  const filteredYearFolders = useMemo(() => {
    if (!scuolaSummary) return [];
    if (scuolaYearFilter === 'all') return scuolaSummary.yearFolders;
    return scuolaSummary.yearFolders.filter((folder) => {
      const folderYear = resolveYearValue(folder.year ?? folder.value ?? folder.label ?? folder.id);
      if (!folderYear) return false;
      return String(folderYear) === scuolaYearFilter;
    });
  }, [scuolaSummary, scuolaYearFilter]);

  const courseOptions = useMemo(() => {
    if (!filteredYearFolders.length) return [];
    return filteredYearFolders.flatMap((folder) =>
      (folder.courses ?? []).map((course) => ({
        key: `${folder.id}::${course.id}`,
        yearId: folder.id,
        yearLabel: folder.label,
        courseId: course.id,
        courseName: course.name,
        instructors: course.instructors ?? [],
        students: course.students ?? [],
      })),
    );
  }, [filteredYearFolders]);

  const [selectedCourseKey, setSelectedCourseKey] = useState(null);

  useEffect(() => {
    if (!courseOptions.length) {
      setSelectedCourseKey(null);
    } else if (!selectedCourseKey || !courseOptions.some((option) => option.key === selectedCourseKey)) {
      setSelectedCourseKey(courseOptions[0].key);
    }
  }, [courseOptions, selectedCourseKey]);

  const selectedCourse = courseOptions.find((option) => option.key === selectedCourseKey) ?? null;

  const filteredCourseStats = useMemo(() => {
    const instructors = courseOptions.reduce((sum, course) => sum + course.instructors.length, 0);
    const students = courseOptions.reduce((sum, course) => sum + course.students.length, 0);
    return {
      folders: filteredYearFolders.length,
      courses: courseOptions.length,
      instructors,
      students,
    };
  }, [courseOptions, filteredYearFolders]);

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
    return uscite.map((item) => {
      const responsabileMember = item.responsabile_id ? membersMap.get(item.responsabile_id) : null;
      const responsabileLabel =
        (responsabileMember && formatMemberLabel(responsabileMember)) ||
        (item.responsabile_nome?.trim() || 'Non assegnato');
      const participantNames = (item.participants_ids ?? [])
        .map((id) => membersMap.get(id))
        .filter(Boolean)
        .map((member) => formatMemberLabel(member));

      return {
        titolo: item.titolo,
        luogo: item.luogo,
        data: item.data ? formatDate(item.data) : '',
        tipo: item.tipo ?? '',
        responsabile: responsabileLabel,
        participants: participantNames.join(', '),
        participants_manual: item.participants_manual ?? '',
        note: item.note ?? '',
      };
    });
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

  async function handleMembersSummaryExport(format = 'csv') {
    setError('');
    if (!membersSummary.length) {
      setError('Nessun dato riepilogativo soci disponibile.');
      return;
    }
    if (format === 'pdf') {
      await downloadPdfTable(
        'Riepilogo soci per anno',
        sociSummaryColumns,
        membersSummary,
        `soci-summary-${new Date().toISOString()}.pdf`,
      );
    } else if (format === 'xlsx') {
      const sheet = buildWorksheetXml(sociSummaryColumns, membersSummary);
      const files = [
        { name: '[Content_Types].xml', content: buildContentTypesXml() },
        { name: '_rels/.rels', content: buildRootRelsXml() },
        { name: 'xl/workbook.xml', content: buildWorkbookXml() },
        { name: 'xl/_rels/workbook.xml.rels', content: buildWorkbookRelsXml() },
        { name: 'xl/worksheets/sheet1.xml', content: sheet },
      ];
      const blob = buildZipFile(files);
      triggerDownload(blob, `soci-summary-${new Date().toISOString()}.xlsx`);
    } else {
      const csv = buildCsv(membersSummary, sociSummaryColumns);
      triggerDownload(csv, `soci-summary-${new Date().toISOString()}.csv`, 'text/csv;charset=utf-8;');
    }
  }

  async function handleMembersFullExport(format = 'csv') {
    setError('');
    const rows = filteredMembersFullRows;
    if (!rows.length) {
      setError('Nessun socio disponibile da esportare.');
      return;
    }
    const suffix = membersYearFilter !== 'all' ? `-${membersYearFilter}` : '';
    if (format === 'pdf') {
      await downloadPdfTable(
        'Elenco soci completo',
        csvColumns.soci_full,
        rows,
        `soci-full${suffix}-${new Date().toISOString()}.pdf`,
      );
    } else if (format === 'xlsx') {
      const sheet = buildWorksheetXml(csvColumns.soci_full, rows);
      const files = [
        { name: '[Content_Types].xml', content: buildContentTypesXml() },
        { name: '_rels/.rels', content: buildRootRelsXml() },
        { name: 'xl/workbook.xml', content: buildWorkbookXml() },
        { name: 'xl/_rels/workbook.xml.rels', content: buildWorkbookRelsXml() },
        { name: 'xl/worksheets/sheet1.xml', content: sheet },
      ];
      const blob = buildZipFile(files);
      triggerDownload(blob, `soci-full${suffix}-${new Date().toISOString()}.xlsx`);
    } else {
      const csv = buildCsv(rows, csvColumns.soci_full);
      triggerDownload(csv, `soci-full${suffix}-${new Date().toISOString()}.csv`, 'text/csv;charset=utf-8;');
    }
  }

  async function handleActivityExport(format = 'csv') {
    setError('');
    if (!activityRows.length) {
      setError('Nessun log attività disponibile.');
      return;
    }
    if (format === 'pdf') {
      await downloadPdfTable(
        'Activity log',
        csvColumns.activity_logs,
        activityRows,
        `activity-log-${new Date().toISOString()}.pdf`,
      );
    } else if (format === 'xlsx') {
      const sheet = buildWorksheetXml(csvColumns.activity_logs, activityRows);
      const files = [
        { name: '[Content_Types].xml', content: buildContentTypesXml() },
        { name: '_rels/.rels', content: buildRootRelsXml() },
        { name: 'xl/workbook.xml', content: buildWorkbookXml() },
        { name: 'xl/_rels/workbook.xml.rels', content: buildWorkbookRelsXml() },
        { name: 'xl/worksheets/sheet1.xml', content: sheet },
      ];
      const blob = buildZipFile(files);
      triggerDownload(blob, `activity-log-${new Date().toISOString()}.xlsx`);
    } else {
      const csv = buildCsv(activityRows, csvColumns.activity_logs);
      triggerDownload(csv, `activity-log-${new Date().toISOString()}.csv`, 'text/csv;charset=utf-8;');
    }
  }

  async function handleVisitsExport(format = 'csv') {
    setError('');
    if (!visitsRows.length) {
      setError('Nessun dato accessi disponibile.');
      return;
    }
    const suffix = visitsRange ? `-${visitsRange}g` : '';
    if (format === 'pdf') {
      await downloadPdfTable(
        'Statistiche accessi',
        csvColumns.analytics_visits,
        visitsRows,
        `statistiche-accessi${suffix}-${new Date().toISOString()}.pdf`,
      );
    } else if (format === 'xlsx') {
      const sheet = buildWorksheetXml(csvColumns.analytics_visits, visitsRows);
      const files = [
        { name: '[Content_Types].xml', content: buildContentTypesXml() },
        { name: '_rels/.rels', content: buildRootRelsXml() },
        { name: 'xl/workbook.xml', content: buildWorkbookXml() },
        { name: 'xl/_rels/workbook.xml.rels', content: buildWorkbookRelsXml() },
        { name: 'xl/worksheets/sheet1.xml', content: sheet },
      ];
      const blob = buildZipFile(files);
      triggerDownload(blob, `statistiche-accessi${suffix}-${new Date().toISOString()}.xlsx`);
    } else {
      const csv = buildCsv(visitsRows, csvColumns.analytics_visits);
      triggerDownload(
        csv,
        `statistiche-accessi${suffix}-${new Date().toISOString()}.csv`,
        'text/csv;charset=utf-8;',
      );
    }
  }

  async function handleActiveUsersExport(format = 'csv') {
    setError('');
    if (!activeRows.length) {
      setError('Nessun accesso disponibile.');
      return;
    }
    const suffix = activeRange ? `-${activeRange}` : '';
    if (format === 'pdf') {
      await downloadPdfTable(
        'Accessi utenti',
        csvColumns.access_events,
        activeRows,
        `utenti-collegati${suffix}-${new Date().toISOString()}.pdf`,
      );
    } else if (format === 'xlsx') {
      const sheet = buildWorksheetXml(csvColumns.access_events, activeRows);
      const files = [
        { name: '[Content_Types].xml', content: buildContentTypesXml() },
        { name: '_rels/.rels', content: buildRootRelsXml() },
        { name: 'xl/workbook.xml', content: buildWorkbookXml() },
        { name: 'xl/_rels/workbook.xml.rels', content: buildWorkbookRelsXml() },
        { name: 'xl/worksheets/sheet1.xml', content: sheet },
      ];
      const blob = buildZipFile(files);
      triggerDownload(blob, `utenti-collegati${suffix}-${new Date().toISOString()}.xlsx`);
    } else {
      const csv = buildCsv(activeRows, csvColumns.access_events);
      triggerDownload(
        csv,
        `utenti-collegati${suffix}-${new Date().toISOString()}.csv`,
        'text/csv;charset=utf-8;',
      );
    }
  }

  return (
    <section className="page-grid">
      <header>
        <h1>Report amministratore</h1>
        <p>Scarica gli elenchi aggiornati o sincronizza i dati con strumenti esterni.</p>
      </header>
      <article className="card">
        <details open>
          <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Statistiche accessi</summary>
        <p style={{ color: 'var(--color-muted)', margin: '0 0 0.5rem' }}>
          Cronologia delle visite registrate dal portale amministrativo.
        </p>
        <div
          style={{
            display: 'flex',
            gap: '1rem',
            flexWrap: 'wrap',
            alignItems: 'flex-end',
            marginBottom: '0.75rem',
          }}
        >
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            Periodo
            <select value={visitsRange} onChange={(event) => setVisitsRange(Number(event.target.value))}>
              <option value={1}>Giorno</option>
              <option value={7}>Settimana</option>
              <option value={30}>Mese</option>
              <option value={365}>Anno</option>
            </select>
          </label>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button type="button" onClick={() => handleVisitsExport()}>
              CSV
            </button>
            <button type="button" style={{ background: '#228be6' }} onClick={() => handleVisitsExport('pdf')}>
              PDF
            </button>
            <button type="button" style={{ background: '#adb5bd' }} onClick={() => handleVisitsExport('xlsx')}>
              XLSX
            </button>
          </div>
          <div style={{ color: 'var(--color-muted)', fontSize: '0.9rem' }}>
            Visite totali nel periodo:{' '}
            <strong style={{ color: 'var(--color-foreground)' }}>{visitsSummary.total}</strong>.{' '}
            {visitsSummary.lastDay ? (
              <>
                Ultimo giorno (<strong>{formatDate(visitsSummary.lastDay.day)}</strong>):
                visite {visitsSummary.lastDay.visits}, utenti unici {visitsSummary.lastDay.unique_users}.
              </>
            ) : (
              'Nessun dato registrato.'
            )}
          </div>
        </div>
        {analyticsError && <p style={{ color: '#c92a2a' }}>{analyticsError}</p>}
        {visitsLoading ? (
          <p>Caricamento statistiche...</p>
        ) : visitsData.length ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}>Giorno</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}>Visite</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}>Utenti unici</th>
                </tr>
              </thead>
              <tbody>
                {visitsData.map((row, index) => (
                  <tr key={`${row.day ?? index}`}>
                    <td style={{ padding: '0.35rem 0' }}>{formatDate(row.day)}</td>
                    <td style={{ padding: '0.35rem 0' }}>{row.visits}</td>
                    <td style={{ padding: '0.35rem 0' }}>{row.unique_users}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>Nessuna visita registrata nel periodo selezionato.</p>
        )}
        </details>
      </article>

      <article className="card">
        <details open>
          <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Accessi utenti</summary>
        <div
          style={{
            display: 'flex',
            gap: '1rem',
            flexWrap: 'wrap',
            alignItems: 'flex-end',
            marginBottom: '0.75rem',
          }}
        >
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            Periodo
            <select value={activeRange} onChange={(event) => setActiveRange(event.target.value)}>
              <option value="2m">Ultimi 2 minuti</option>
              <option value="1h">Ultima ora</option>
              <option value="1d">Ultimo giorno</option>
              <option value="7d">Ultima settimana</option>
              <option value="30d">Ultimo mese</option>
              <option value="all">Tutti</option>
            </select>
          </label>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button type="button" onClick={() => handleActiveUsersExport()}>
              CSV
            </button>
            <button type="button" style={{ background: '#228be6' }} onClick={() => handleActiveUsersExport('pdf')}>
              PDF
            </button>
            <button type="button" style={{ background: '#adb5bd' }} onClick={() => handleActiveUsersExport('xlsx')}>
              XLSX
            </button>
          </div>
        </div>
        {activeError && <p style={{ color: '#c92a2a' }}>{activeError}</p>}
        {activeLoading ? (
          <p>Verifica utenti online...</p>
        ) : activeUsers.length ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}>Email</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}>Accesso</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}>Client</th>
                </tr>
              </thead>
              <tbody>
                {activeUsers.map((session) => (
                  <tr key={`${session.user_email}-${session.created_at ?? session.last_seen_at}`}>
                    <td style={{ padding: '0.35rem 0' }}>{session.user_email}</td>
                    <td style={{ padding: '0.35rem 0' }}>
                      {formatDateTime(session.created_at ?? session.last_seen_at)}
                    </td>
                    <td style={{ padding: '0.35rem 0' }}>
                      {summarizeClientInfo(session.meta ?? session.client_info)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>Nessun accesso registrato nel periodo selezionato.</p>
        )}
        </details>
      </article>

      {canApproveUsers && (
        <article className="card">
          <details open>
            <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Approvazioni accessi</summary>
            <div style={{ marginTop: '0.75rem' }}>
              {approvalsError && <p style={{ color: '#c92a2a' }}>{approvalsError}</p>}
              {approvalsLoading ? (
                <p>Caricamento richieste...</p>
              ) : pendingProfiles.length ? (
                <div style={{ display: 'grid', gap: '0.75rem' }}>
                  {pendingProfiles.map((profile) => (
                    <div
                      key={profile.id}
                      style={{
                        border: '1px solid var(--color-border)',
                        borderRadius: '0.75rem',
                        padding: '0.75rem',
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '0.75rem',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div>
                        <strong>{profile.email ?? 'Email non disponibile'}</strong>
                        {profile.first_name || profile.last_name ? (
                          <p style={{ margin: '0.25rem 0', color: 'var(--color-muted)' }}>
                            {`${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim()}
                            {profile.phone ? ` · ${profile.phone}` : ''}
                          </p>
                        ) : null}
                        <p style={{ margin: '0.25rem 0', color: 'var(--color-muted)' }}>
                          Stato: in attesa · Creato il {profile.created_at ? formatDateTime(profile.created_at) : 'N/D'}
                        </p>
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                          Ruolo
                          <select
                            value={roleAssignments[profile.id] ?? 'socio'}
                            onChange={(event) =>
                              setRoleAssignments((prev) => ({ ...prev, [profile.id]: event.target.value }))
                            }
                          >
                            {rolesList.map((roleOption) => (
                              <option key={roleOption} value={roleOption}>
                                {roleOption}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button
                          type="button"
                          style={{ background: '#adb5bd' }}
                          onClick={() => handleRoleChange(profile)}
                          disabled={approvalsUpdating[profile.id]}
                        >
                          Aggiorna ruolo
                        </button>
                        <button
                          type="button"
                          onClick={() => handleApproveProfile(profile.id)}
                          disabled={approvalsUpdating[profile.id]}
                        >
                          Approva
                        </button>
                        <button
                          type="button"
                          style={{ background: '#adb5bd' }}
                          onClick={() => handleRejectProfile(profile.id)}
                          disabled={approvalsUpdating[profile.id]}
                        >
                          Rifiuta
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p>Nessuna richiesta in attesa.</p>
              )}
              <div style={{ marginTop: '1rem' }}>
                <strong>Storico approvazioni</strong>
                {historyError && <p style={{ color: '#c92a2a' }}>{historyError}</p>}
                {historyLoading ? (
                  <p>Caricamento storico...</p>
                ) : approvalHistory.length ? (
                  <div style={{ overflowX: 'auto', marginTop: '0.5rem' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          <th style={{ textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}>Data</th>
                          <th style={{ textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}>Azione</th>
                          <th style={{ textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}>Utente</th>
                          <th style={{ textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}>Da</th>
                          <th style={{ textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}>A</th>
                          <th style={{ textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}>Operatore</th>
                        </tr>
                      </thead>
                      <tbody>
                        {approvalHistory.map((entry) => (
                          <tr key={entry.id}>
                            <td style={{ padding: '0.35rem 0' }}>{formatDateTime(entry.created_at)}</td>
                            <td style={{ padding: '0.35rem 0' }}>{entry.action}</td>
                            <td style={{ padding: '0.35rem 0' }}>{entry.target_email ?? 'N/D'}</td>
                            <td style={{ padding: '0.35rem 0' }}>
                              {entry.from_status ?? ''} {entry.from_role ? `· ${entry.from_role}` : ''}
                            </td>
                            <td style={{ padding: '0.35rem 0' }}>
                              {entry.to_status ?? ''} {entry.to_role ? `· ${entry.to_role}` : ''}
                            </td>
                            <td style={{ padding: '0.35rem 0' }}>{entry.actor_email ?? 'N/D'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p>Nessuna azione registrata.</p>
                )}
              </div>
            </div>
          </details>
        </article>
      )}

      {loading && <p>Raccolta dati in corso...</p>}
      {error && <p style={{ color: '#c92a2a' }}>{error}</p>}

      <article className="card">
        <details open>
          <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Scuola</summary>
        <h3 style={{ margin: '0.25rem 0' }}>Corsi</h3>
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
              <div
                className="card"
                style={{
                  marginTop: '1rem',
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '1rem',
                  alignItems: 'center',
                }}
              >
                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: '220px' }}>
                  Anno corsi
                  <select value={scuolaYearFilter} onChange={(event) => setScuolaYearFilter(event.target.value)}>
                    <option value="all">Tutti</option>
                    {scuolaYearOptions.map((yearOption) => (
                      <option key={yearOption} value={yearOption}>
                        {yearOption}
                      </option>
                    ))}
                  </select>
                </label>
                <p style={{ margin: 0, color: 'var(--color-muted)' }}>
                  Riepilogo cartelle: {filteredCourseStats.folders} · Corsi: {filteredCourseStats.courses} · Istruttori: {filteredCourseStats.instructors} ·
                  Corsisti: {filteredCourseStats.students}
                </p>
              </div>
              <div
                className="card"
                style={{
                  marginTop: '1rem',
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '1rem',
                  alignItems: 'center',
                }}
              >
                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: '220px' }}>
                  Seleziona corso
                  <select
                    value={selectedCourseKey ?? ''}
                    onChange={(event) => setSelectedCourseKey(event.target.value)}
                    disabled={!courseOptions.length}
                  >
                    {!courseOptions.length && <option value="">Nessun corso disponibile</option>}
                    {courseOptions.map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.courseName} · {option.yearLabel}
                      </option>
                    ))}
                  </select>
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <div>
                    <strong>Esporta istruttori</strong>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                      <button
                        type="button"
                        onClick={() => selectedCourse && handleScuolaExport(selectedCourse.yearId, selectedCourse.courseId, 'instructors')}
                        disabled={!selectedCourse}
                      >
                        CSV
                      </button>
                      <button
                        type="button"
                        style={{ background: '#228be6' }}
                        onClick={() => selectedCourse && handleScuolaExport(selectedCourse.yearId, selectedCourse.courseId, 'instructors', 'pdf')}
                        disabled={!selectedCourse}
                      >
                        PDF
                      </button>
                      <button
                        type="button"
                        style={{ background: '#adb5bd' }}
                        onClick={() => selectedCourse && handleScuolaExport(selectedCourse.yearId, selectedCourse.courseId, 'instructors', 'xlsx')}
                        disabled={!selectedCourse}
                      >
                        XLSX
                      </button>
                    </div>
                  </div>
                  <div>
                    <strong>Esporta corsisti</strong>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                      <button
                        type="button"
                        onClick={() => selectedCourse && handleScuolaExport(selectedCourse.yearId, selectedCourse.courseId, 'students')}
                        disabled={!selectedCourse}
                      >
                        CSV
                      </button>
                      <button
                        type="button"
                        style={{ background: '#228be6' }}
                        onClick={() => selectedCourse && handleScuolaExport(selectedCourse.yearId, selectedCourse.courseId, 'students', 'pdf')}
                        disabled={!selectedCourse}
                      >
                        PDF
                      </button>
                      <button
                        type="button"
                        style={{ background: '#adb5bd' }}
                        onClick={() => selectedCourse && handleScuolaExport(selectedCourse.yearId, selectedCourse.courseId, 'students', 'xlsx')}
                        disabled={!selectedCourse}
                      >
                        XLSX
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              <div
                className="card"
                style={{
                  marginTop: '1rem',
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '1rem',
                  alignItems: 'center',
                }}
              >
                <div>
                  <h3 style={{ margin: '0 0 0.25rem' }}>Registro corpo istruttori</h3>
                  <p style={{ color: 'var(--color-muted)', margin: '0 0 0.5rem' }}>
                    Totale registrazioni: {registryRows.length}. Esporta l&apos;anagrafica completa del registro.
                  </p>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <button type="button" onClick={() => handleRegistryExport()} disabled={!registryRows.length}>
                      CSV
                    </button>
                    <button
                      type="button"
                      style={{ background: '#228be6' }}
                      onClick={() => handleRegistryExport('pdf')}
                      disabled={!registryRows.length}
                    >
                      PDF
                    </button>
                    <button
                      type="button"
                      style={{ background: '#adb5bd' }}
                      onClick={() => handleRegistryExport('xlsx')}
                      disabled={!registryRows.length}
                    >
                      XLSX
                    </button>
                  </div>
                </div>
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
        </details>
      </article>

      <article className="card">
        <details open>
          <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Esportazioni</summary>
          {memberYears.length > 0 && (
            <div style={{ marginTop: '0.75rem', display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: '220px' }}>
                Anno da esportare
                <select value={membersYearFilter} onChange={(event) => setMembersYearFilter(event.target.value)}>
                  <option value="all">Tutti</option>
                  {memberYears.map((year) => (
                    <option key={year} value={String(year)}>
                      {year}
                    </option>
                  ))}
                </select>
              </label>
              <p style={{ margin: 0, color: 'var(--color-muted)' }}>
                Seleziona l&apos;anno prima di scaricare l&apos;elenco soci completo per esportare solo la cartella desiderata.
              </p>
            </div>
          )}
          <div className="card-list" style={{ marginTop: '0.75rem' }}>
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
            <ReportCard
              title="Elenco soci completo"
              description="Scarica l'anagrafica dettagliata con anno e stato quota."
              onCsv={() => handleMembersFullExport()}
              onPdf={() => handleMembersFullExport('pdf')}
              onXlsx={() => handleMembersFullExport('xlsx')}
              disabled={loading}
            />
            <ReportCard
              title="Riepilogo soci per anno"
              description="Totale soci e quote pagate suddivisi per anno."
              onCsv={() => handleMembersSummaryExport()}
              onPdf={() => handleMembersSummaryExport('pdf')}
              onXlsx={() => handleMembersSummaryExport('xlsx')}
              disabled={loading}
            />
            {canViewActivityLog && (
              <ReportCard
                title="Log attività"
                description="Eventi recenti eseguiti dagli utenti nell'app."
                onCsv={() => handleActivityExport()}
                onPdf={() => handleActivityExport('pdf')}
                onXlsx={() => handleActivityExport('xlsx')}
                disabled={loading}
              />
            )}
          </div>
        </details>
      </article>
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
