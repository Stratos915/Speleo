// Funzioni di supporto per il calendario delle uscite (settimana da lunedì).

const pad = (value) => String(value).padStart(2, '0');

/** Data locale in formato YYYY-MM-DD (come la colonna uscite.data). */
export function toIsoDate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Converte 'YYYY-MM-DD' (o un timestamp) nella chiave giorno, senza slittamenti di fuso. */
export function dayKey(value) {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

/**
 * Griglia di un mese: 6 settimane x 7 giorni, a partire dal lunedì.
 * month è 0-based come in Date.
 */
export function buildMonthGrid(year, month) {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7; // lunedì = 0
  const start = new Date(year, month, 1 - offset);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
    return { date, key: toIsoDate(date), inMonth: date.getMonth() === month };
  });
}

/** Raggruppa le uscite per giorno, ordinate per ora. */
export function groupUsciteByDay(uscite) {
  const map = new Map();
  for (const uscita of uscite ?? []) {
    const key = dayKey(uscita.data);
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(uscita);
  }
  for (const list of map.values()) {
    list.sort((a, b) => String(a.ora ?? '').localeCompare(String(b.ora ?? '')));
  }
  return map;
}

export const WEEKDAYS_IT = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
