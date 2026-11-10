function resolveFullName(member) {
  if (!member) return '';
  const candidates = [
    member.full_name,
    [member.nome, member.cognome].filter(Boolean).join(' ').trim(),
    [member.first_name, member.last_name].filter(Boolean).join(' ').trim(),
    member.display_name,
    member.name,
    member.email,
  ];
  return candidates.find((value) => Boolean(value && value.trim()))?.trim() ?? '';
}

function getMembershipNumber(member) {
  if (!member) return null;
  return member.membership_number ?? member.old_id ?? member.card_number ?? member.numero_tessera ?? null;
}

export function formatMemberLabel(member, { includeMembership = true, fallback = 'Socio senza nome' } = {}) {
  if (!member) return fallback;
  const name = resolveFullName(member);
  const membership = includeMembership ? getMembershipNumber(member) : null;
  if (membership && name) return `${membership} · ${name}`;
  if (name) return name;
  if (membership) return `Tessera ${membership}`;
  return fallback;
}

export function buildMemberTooltip(member) {
  if (!member) return 'Dati socio non disponibili';
  const details = [
    member.id ? `ID: ${member.id}` : null,
    getMembershipNumber(member) ? `Tessera: ${getMembershipNumber(member)}` : null,
    resolveFullName(member) ? `Nome: ${resolveFullName(member)}` : null,
    member.email ? `Email: ${member.email}` : null,
  ].filter(Boolean);
  return details.length ? details.join(' · ') : 'Dettagli socio non disponibili';
}

// Particelle che fanno parte del cognome: «Marta di Biase» → «di Biase».
const PARTICELLE = new Set(['di', 'de', 'da', 'del', 'della', 'dei', 'degli', 'dal', 'dalla', 'lo', 'la', 'van', 'von', 'mc']);

/**
 * Cognome dal nome completo, scritto «Nome Cognome»: l'ultima parola, con le
 * particelle che la precedono. Un nome di una sola parola vale come cognome.
 */
export function cognomeSocio(member) {
  const parole = resolveFullName(member).split(/\s+/).filter(Boolean);
  if (parole.length <= 1) return parole[0] ?? '';
  let inizio = parole.length - 1;
  while (inizio > 1 && PARTICELLE.has(parole[inizio - 1].toLowerCase())) inizio -= 1;
  return parole.slice(inizio).join(' ');
}

/** Ordine alfabetico per cognome, poi per nome (come un registro). */
export function confrontaPerCognome(a, b) {
  const opzioni = { sensitivity: 'base' };
  const perCognome = cognomeSocio(a).localeCompare(cognomeSocio(b), 'it', opzioni);
  if (perCognome) return perCognome;
  return resolveFullName(a).localeCompare(resolveFullName(b), 'it', opzioni);
}

export function dedupeMembers(list = []) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  return list.filter((member) => {
    if (!member) return false;
    const key =
      getMembershipNumber(member) ??
      member.id ??
      member.email ??
      resolveFullName(member);
    if (!key) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Nome del socio come appare nelle tendine («Nome Cognome»). */
export function nomeSocio(member) {
  return resolveFullName(member);
}

/** Numero di tessera del socio, se c'è. */
export function tesseraSocio(member) {
  return getMembershipNumber(member);
}

const normalizzaTesto = (value) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

/** Ordine alfabetico come si legge nella tendina: per nome completo. */
export function ordinaSociPerNome(list = []) {
  if (!Array.isArray(list)) return [];
  const opzioni = { sensitivity: 'base', numeric: true };
  return [...list].sort((a, b) => {
    const perNome = resolveFullName(a).localeCompare(resolveFullName(b), 'it', opzioni);
    if (perNome) return perNome;
    return String(getMembershipNumber(a) ?? '').localeCompare(String(getMembershipNumber(b) ?? ''), 'it', opzioni);
  });
}

/**
 * Ricerca libera: ogni parola scritta deve comparire nel nome, nella tessera
 * o nell'email (senza badare a maiuscole e accenti).
 */
export function filtraSoci(list = [], testo = '') {
  if (!Array.isArray(list)) return [];
  const parole = normalizzaTesto(testo).split(' ').filter(Boolean);
  if (!parole.length) return list;
  return list.filter((member) => {
    const campi = normalizzaTesto(
      [resolveFullName(member), getMembershipNumber(member), member?.email].filter(Boolean).join(' '),
    );
    return parole.every((parola) => campi.includes(parola));
  });
}

/** Email per nome: le righe degli anni diversi dello stesso socio si completano a vicenda. */
export function mappaEmailSoci(list = []) {
  const mappa = new Map();
  (Array.isArray(list) ? list : []).forEach((member) => {
    const email = String(member?.email ?? '').trim();
    const nome = normalizzaTesto(resolveFullName(member));
    if (email && nome && !mappa.has(nome)) mappa.set(nome, email);
  });
  return mappa;
}

export function emailSocio(member, mappa) {
  const propria = String(member?.email ?? '').trim();
  if (propria) return propria;
  return mappa?.get(normalizzaTesto(resolveFullName(member))) ?? '';
}
