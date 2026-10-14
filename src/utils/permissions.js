const ALL_ROLES = [
  'admin',
  'presidente',
  'consiglio',
  'segretario',
  'tesoriere',
  'magazziniere',
  'direttore_scuola',
  'socio',
];

const FULL_ACCESS_ROLES = ['admin', 'presidente'];

// Ruoli che si possono dare «in più» oltre al principale (migrazione 14).
// admin e presidente restano solo ruolo principale.
export const RUOLI_AGGIUNTIVI = ['socio', 'segretario', 'tesoriere', 'consiglio', 'magazziniere', 'direttore_scuola'];

const ETICHETTE_RUOLI = {
  admin: 'Amministratore',
  presidente: 'Presidente',
  consiglio: 'Consiglio',
  segretario: 'Segretario',
  tesoriere: 'Tesoriere',
  magazziniere: 'Magazziniere',
  direttore_scuola: 'Direttore scuola',
  socio: 'Socio',
};

export function etichettaRuolo(ruolo) {
  return ETICHETTE_RUOLI[ruolo] ?? ruolo;
}

/** Tutti i ruoli di un profilo: il principale e quelli in più, senza doppioni. */
export function ruoliDelProfilo(role, extra) {
  const lista = [role ?? 'socio', ...(Array.isArray(extra) ? extra : [])];
  return [...new Set(lista.filter(Boolean))];
}
const VIEW_ALL_ROLES = ALL_ROLES.filter((role) => role !== 'socio');

const PAGE_PERMISSIONS = {
  dashboard: { view: ALL_ROLES },
  magazzino: {
    view: ALL_ROLES,
    edit: [...FULL_ACCESS_ROLES, 'magazziniere'],
    actions: {
      loan: [...FULL_ACCESS_ROLES, 'magazziniere', 'socio'],
    },
  },
  uscite: { view: ALL_ROLES, edit: [...FULL_ACCESS_ROLES, 'magazziniere', 'socio'] },
  prestiti: { view: ALL_ROLES, edit: [...FULL_ACCESS_ROLES, 'magazziniere'] },
  scuola: { view: VIEW_ALL_ROLES, edit: [...FULL_ACCESS_ROLES, 'direttore_scuola'] },
  biblioteca: {
    view: ALL_ROLES,
    edit: FULL_ACCESS_ROLES,
    actions: {
      loan: [...FULL_ACCESS_ROLES, 'magazziniere', 'socio'],
    },
  },
  report: { view: VIEW_ALL_ROLES, edit: [] },
  soci: { view: VIEW_ALL_ROLES, edit: [...FULL_ACCESS_ROLES, 'segretario', 'tesoriere'] },
};

const SECTION_PERMISSIONS = {
  inventory: PAGE_PERMISSIONS.magazzino.edit,
  uscita: PAGE_PERMISSIONS.uscite.edit,
  soci: PAGE_PERMISSIONS.soci.edit,
  scuola: PAGE_PERMISSIONS.scuola.edit,
  biblioteca: PAGE_PERMISSIONS.biblioteca.edit,
  prestiti: PAGE_PERMISSIONS.prestiti.edit,
};

// `role` può essere un ruolo solo o l'elenco dei ruoli dell'utente.
function hasOne(role, allowed) {
  const mine = Array.isArray(role) ? role : [role];
  return mine.some((item) => allowed.includes(item));
}

function normalizeRoles(list) {
  if (!list) return [];
  if (Array.isArray(list)) return list;
  if (list === 'all') return ALL_ROLES;
  return [list];
}

export function canViewPage(role, page) {
  const permission = PAGE_PERMISSIONS[page];
  if (!permission) return true;
  const allowed = normalizeRoles(permission.view ?? 'all');
  return hasOne(role, allowed);
}

export function canEditSection(role, section) {
  const permission = SECTION_PERMISSIONS[section] ?? PAGE_PERMISSIONS[section]?.edit;
  if (!permission) return false;
  const allowed = normalizeRoles(permission);
  return hasOne(role, allowed);
}

export function canUseAction(role, page, action) {
  const actions = PAGE_PERMISSIONS[page]?.actions;
  if (!actions || !actions[action]) return false;
  const allowed = normalizeRoles(actions[action]);
  return hasOne(role, allowed);
}

export function getNavigationVisibility(role) {
  return Object.entries(PAGE_PERMISSIONS).reduce((acc, [page, config]) => {
    acc[page] = hasOne(role, normalizeRoles(config.view ?? 'all'));
    return acc;
  }, {});
}

export function getAllRoles() {
  return [...ALL_ROLES];
}

export function getPageEditRoles(page) {
  const permission = PAGE_PERMISSIONS[page];
  return normalizeRoles(permission?.edit ?? []);
}
