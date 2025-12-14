import useAuth from '../context/useAuth.js';
import { canEditSection, canUseAction, canViewPage } from '../utils/permissions.js';

export default function usePermissions() {
  const { role } = useAuth();

  return {
    role,
    canViewPage: (page) => canViewPage(role, page),
    canEditSection: (section) => canEditSection(role, section),
    canUseAction: (page, action) => canUseAction(role, page, action),
  };
}
