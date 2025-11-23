import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function ProtectedRoute({ children, roles = [] }) {
  const { loading, isAuthenticated, role } = useAuth();

  if (loading) {
    return <p>Caricamento...</p>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  if (roles.length && !roles.includes(role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}
