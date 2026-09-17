// Esportazione tabelle in CSV, PDF (con carta intestata) e XLSX senza dipendenze esterne.
// Estratto da pages/Report.jsx per poterlo testare e riutilizzare.

export const paymentStatusLabels = {
  pending: 'Da saldare',
  paid: 'Pagato',
  exempt: 'Esente',
};

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

export function formatDate(value) {
  if (!value) return '';
  const dateValue = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(dateValue.getTime())) return '';
  return dateValue.toLocaleDateString('it-IT');
}

export function formatDateTime(value) {
  if (!value) return '';
  const dateValue = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(dateValue.getTime())) return '';
  return dateValue.toLocaleString('it-IT');
}

export function summarizeClientInfo(info) {
  if (!info || typeof info !== 'object') return '-';
  const candidate = info.user_agent || info.device || '';
  if (!candidate) return '-';
  return candidate.length > 80 ? `${candidate.slice(0, 77)}...` : candidate;
}

export function formatCellValue(column, value) {
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

export function buildCsv(rows, columns) {
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

export function downloadCsv(rows, key, columns) {
  if (!rows.length) return;
  const csv = buildCsv(rows, columns);
  triggerDownload(csv, `${key}-speleo-${new Date().toISOString()}.csv`, 'text/csv;charset=utf-8;');
}

let letterheadPromise = null;

export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

export function blobToBytes(blob) {
  return blob.arrayBuffer().then((buffer) => new Uint8Array(buffer));
}

export async function loadLetterheadImage() {
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
  } catch {
    return null;
  }
}

export async function getLetterheadImage() {
  if (!letterheadPromise) {
    letterheadPromise = loadLetterheadImage();
  }
  return letterheadPromise;
}

export function escapePdfText(value) {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

export function splitIntoLines(text, maxChars) {
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

export function computeColumnWidths(columns, rows) {
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

export function generateTablePdf(title, columns, rows, { backgroundImage } = {}) {
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

export function triggerDownload(content, filename, mimeType) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}

export async function downloadPdf(rows, key, columns) {
  if (!rows.length) return;
  const backgroundImage = await getLetterheadImage();
  const pdfContent = generateTablePdf(`Report ${key}`, columns, rows, { backgroundImage });
  triggerDownload(pdfContent, `${key}-speleo-${new Date().toISOString()}.pdf`, 'application/pdf');
}

export async function downloadPdfTable(title, columns, rows, filename) {
  const backgroundImage = await getLetterheadImage();
  const pdfContent = generateTablePdf(title, columns, rows, { backgroundImage });
  triggerDownload(pdfContent, filename, 'application/pdf');
}

const textEncoder = new TextEncoder();

export function escapeXml(value) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function columnLabel(index) {
  let label = '';
  let n = index + 1;
  while (n > 0) {
    const remainder = (n - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    n = Math.floor((n - 1) / 26);
  }
  return label;
}

export function buildWorksheetXml(columns, rows) {
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

export function buildWorkbookXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Report" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`;
}

export function buildContentTypesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`;
}

export function buildRootRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;
}

export function buildWorkbookRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`;
}

export function crc32(uint8) {
  let crc = -1;
  for (let i = 0; i < uint8.length; i += 1) {
    crc ^= uint8[i];
    for (let j = 0; j < 8; j += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ -1) >>> 0;
}

export function buildZipFile(files) {
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

export function buildXlsxBlob(columns, rows) {
  const files = [
    { name: '[Content_Types].xml', content: buildContentTypesXml() },
    { name: '_rels/.rels', content: buildRootRelsXml() },
    { name: 'xl/workbook.xml', content: buildWorkbookXml() },
    { name: 'xl/_rels/workbook.xml.rels', content: buildWorkbookRelsXml() },
    { name: 'xl/worksheets/sheet1.xml', content: buildWorksheetXml(columns, rows) },
  ];
  return buildZipFile(files);
}

export function downloadXlsx(rows, key, columns) {
  if (!rows.length) return;
  triggerDownload(buildXlsxBlob(columns, rows), `${key}-speleo-${new Date().toISOString()}.xlsx`);
}
