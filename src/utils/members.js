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
