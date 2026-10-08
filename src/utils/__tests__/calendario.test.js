import { describe, expect, it } from 'vitest';
import { buildMonthGrid, dayKey, groupUsciteByDay, prossimeEPassate, toIsoDate } from '../calendario.js';

describe('calendario', () => {
  it('ottobre 2026 parte da lunedì 28 settembre', () => {
    const grid = buildMonthGrid(2026, 9);
    expect(grid).toHaveLength(42);
    expect(grid[0].key).toBe('2026-09-28');
    expect(grid[0].inMonth).toBe(false);
    expect(grid[3].key).toBe('2026-10-01');
    expect(grid[3].inMonth).toBe(true);
  });

  it('un mese che inizia di lunedì non ha giorni precedenti', () => {
    const grid = buildMonthGrid(2026, 5); // giugno 2026 inizia di lunedì
    expect(grid[0].key).toBe('2026-06-01');
  });

  it('dayKey non slitta di fuso', () => {
    expect(dayKey('2026-10-12')).toBe('2026-10-12');
    expect(dayKey('2026-10-12T23:30:00+00:00')).toBe('2026-10-12');
    expect(dayKey(null)).toBeNull();
    expect(toIsoDate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('raggruppa le uscite per giorno in ordine di ora', () => {
    const map = groupUsciteByDay([
      { id: 'b', data: '2026-10-12', ora: '14:00:00+00' },
      { id: 'a', data: '2026-10-12', ora: '08:00:00+00' },
      { id: 'c', data: null },
    ]);
    expect(map.get('2026-10-12').map((u) => u.id)).toEqual(['a', 'b']);
    expect(map.size).toBe(1);
  });

  it('separa prossime e passate', () => {
    const { prossime, passate } = prossimeEPassate(
      [
        { id: 'p1', data: '2026-09-01' },
        { id: 'f2', data: '2026-10-20' },
        { id: 'oggi', data: '2026-10-08' },
        { id: 'p2', data: '2026-10-01' },
        { id: 'f1', data: '2026-10-10' },
        { id: 'x', data: null },
      ],
      '2026-10-08',
      2,
    );
    expect(prossime.map((u) => u.id)).toEqual(['oggi', 'f1']);
    expect(passate.map((u) => u.id)).toEqual(['p2', 'p1']);
  });
});
