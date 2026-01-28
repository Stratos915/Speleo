import { Navigate, useLocation } from 'react-router-dom';
import useAuth from '../context/useAuth.js';
import usePermissions from '../hooks/usePermissions.js';

export default function ProtectedRoute({ children, roles = [], page }) {
  const { loading, user, role, needsPasswordReset, approvalStatus } = useAuth();
  const { canViewPage } = usePermissions();
  const location = useLocation();
  const isResetPath = ['/reset', '/reset-password'].includes(location.pathname);
  const isApprovalPath = location.pathname === '/approval-pending';

  if (loading) {
    return <p>Caricamento credenziali...</p>;
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }

  if (user && needsPasswordReset && !isResetPath) {
    return <Navigate to="/reset-password?reason=setup" replace />;
  }

  if (user && approvalStatus && approvalStatus !== 'approved' && !isApprovalPath) {
    return <Navigate to="/approval-pending" replace />;
  }

  if (page && !canViewPage(page)) {
    return <Navigate to="/dashboard" replace />;
  }

  if (roles.length > 0 && !roles.includes(role)) {
    // Reindirizziamo alla dashboard per evitare loop verso la login quando il ruolo non è autorizzato.
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}
