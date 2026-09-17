import { describe, expect, it } from 'vitest';
import { buildCsv, buildXlsxBlob, columnLabel, crc32, formatCellValue } from '../exporters.js';

describe('esportazioni', () => {
  it('produce un CSV con separatore punto e virgola ed escape corretto', () => {
    const csv = buildCsv(
      [{ nome: 'Grotta "Nera"; ramo 2', data: '2026-09-16' }],
      [
        { key: 'nome', label: 'Nome' },
        { key: 'data', label: 'Data' },
      ],
    );
    const [header, row] = csv.split('\n');
    expect(header).toBe('Nome;Data');
    expect(row.startsWith('"Grotta ""Nera""; ramo 2";')).toBe(true);
  });

  it('traduce stati di pagamento e sì/no', () => {
    expect(formatCellValue({ key: 'payment_status' }, 'paid')).toBe('Pagato');
    expect(formatCellValue({ key: 'privacy_accepted' }, true)).toBe('SI');
    expect(formatCellValue({ key: 'x' }, null)).toBe('');
  });

  it('calcola le lettere delle colonne Excel', () => {
    expect(columnLabel(0)).toBe('A');
    expect(columnLabel(25)).toBe('Z');
    expect(columnLabel(26)).toBe('AA');
  });

  it('calcola il CRC32 standard', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('genera un file XLSX (archivio ZIP) valido', async () => {
    const blob = buildXlsxBlob([{ key: 'a', label: 'A' }], [{ a: 'uno' }]);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect([bytes[0], bytes[1]]).toEqual([0x50, 0x4b]);
    expect(blob.type).toContain('spreadsheetml');
  });
});
