// Stato delle scadenze dei DPI (dispositivi di protezione individuale).

export const INSPECTION_WARNING_DAYS = 30;
export const END_OF_LIFE_WARNING_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;

function toUtcDay(value) {
  if (!value) return null;
  const text = String(value).slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return null;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export function daysUntil(dateValue, today = new Date()) {
  const target = toUtcDay(dateValue);
  if (target === null) return null;
  const base = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((target - base) / DAY_MS);
}

function describe(days, warningDays, labels) {
  if (days === null) return null;
  if (days < 0) {
    return { level: 'expired', days, text: `${labels.expired} da ${Math.abs(days)} ${Math.abs(days) === 1 ? 'giorno' : 'giorni'}` };
  }
  if (days === 0) return { level: 'expired', days, text: `${labels.today} oggi` };
  if (days <= warningDays) {
    return { level: 'soon', days, text: `${labels.soon} tra ${days} ${days === 1 ? 'giorno' : 'giorni'}` };
  }
  return { level: 'ok', days, text: null };
}

/** Restituisce gli avvisi da mostrare per un materiale. */
export function getDpiAlerts(material, today = new Date()) {
  const alerts = [];
  const inspection = describe(daysUntil(material?.prossima_ispezione, today), INSPECTION_WARNING_DAYS, {
    expired: 'Ispezione scaduta',
    today: 'Ispezione in scadenza',
    soon: 'Ispezione',
  });
  if (inspection && inspection.level !== 'ok') alerts.push({ kind: 'ispezione', ...inspection });
  const endOfLife = describe(daysUntil(material?.fine_vita, today), END_OF_LIFE_WARNING_DAYS, {
    expired: 'Fine vita superata',
    today: 'Fine vita',
    soon: 'Fine vita',
  });
  if (endOfLife && endOfLife.level !== 'ok') alerts.push({ kind: 'fine_vita', ...endOfLife });
  return alerts;
}

export function isDpiBlocked(material, today = new Date()) {
  const days = daysUntil(material?.fine_vita, today);
  return days !== null && days < 0;
}
