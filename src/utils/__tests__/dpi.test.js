import { describe, expect, it } from 'vitest';
import { daysUntil, getDpiAlerts, isDpiBlocked } from '../dpi.js';

const today = new Date(2026, 8, 16); // 16 settembre 2026

describe('scadenze DPI', () => {
  it('calcola i giorni mancanti ignorando l\'ora', () => {
    expect(daysUntil('2026-09-16', today)).toBe(0);
    expect(daysUntil('2026-09-20', today)).toBe(4);
    expect(daysUntil('2026-09-10', today)).toBe(-6);
    expect(daysUntil('', today)).toBeNull();
    expect(daysUntil('data sbagliata', today)).toBeNull();
  });

  it('avvisa 30 giorni prima dell\'ispezione', () => {
    expect(getDpiAlerts({ prossima_ispezione: '2026-10-16' }, today)[0]).toMatchObject({ kind: 'ispezione', level: 'soon' });
    expect(getDpiAlerts({ prossima_ispezione: '2026-10-17' }, today)).toHaveLength(0);
  });

  it('segnala come scaduta un\'ispezione passata', () => {
    const [alert] = getDpiAlerts({ prossima_ispezione: '2026-09-01' }, today);
    expect(alert.level).toBe('expired');
    expect(alert.text).toBe('Ispezione scaduta da 15 giorni');
  });

  it('avvisa 90 giorni prima della fine vita e blocca dopo', () => {
    expect(getDpiAlerts({ fine_vita: '2026-12-15' }, today)[0]).toMatchObject({ kind: 'fine_vita', level: 'soon' });
    expect(isDpiBlocked({ fine_vita: '2026-09-15' }, today)).toBe(true);
    expect(isDpiBlocked({ fine_vita: '2026-09-16' }, today)).toBe(false);
  });
});
