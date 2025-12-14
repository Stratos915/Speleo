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
  prestiti: { view: ALL_ROLES, edit: FULL_ACCESS_ROLES },
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
  return allowed.includes(role);
}

export function canEditSection(role, section) {
  const permission = SECTION_PERMISSIONS[section] ?? PAGE_PERMISSIONS[section]?.edit;
  if (!permission) return false;
  const allowed = normalizeRoles(permission);
  return allowed.includes(role);
}

export function canUseAction(role, page, action) {
  const actions = PAGE_PERMISSIONS[page]?.actions;
  if (!actions || !actions[action]) return false;
  const allowed = normalizeRoles(actions[action]);
  return allowed.includes(role);
}

export function getNavigationVisibility(role) {
  return Object.entries(PAGE_PERMISSIONS).reduce((acc, [page, config]) => {
    acc[page] = normalizeRoles(config.view ?? 'all').includes(role);
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
