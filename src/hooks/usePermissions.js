import useAuth from '../context/useAuth.js';
import { canEditSection, canUseAction, canViewPage } from '../utils/permissions.js';

export default function usePermissions() {
  const { role, roles } = useAuth();
  // Si controllano tutti i ruoli dell'utente, non solo il principale.
  const tutti = roles?.length ? roles : [role];

  return {
    role,
    roles: tutti,
    canViewPage: (page) => canViewPage(tutti, page),
    canEditSection: (section) => canEditSection(tutti, section),
    canUseAction: (page, action) => canUseAction(tutti, page, action),
  };
}
