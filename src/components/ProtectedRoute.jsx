import { Navigate } from 'react-router-dom';
import useAuth from '../context/useAuth.js';

export default function ProtectedRoute({ children, roles = [] }) {
  const { loading, user, role } = useAuth();

  if (loading) {
    return <p>Caricamento credenziali...</p>;
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }

  if (roles.length > 0 && !roles.includes(role)) {
    // Reindirizziamo alla dashboard per evitare loop verso la login quando il ruolo non è autorizzato.
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}
