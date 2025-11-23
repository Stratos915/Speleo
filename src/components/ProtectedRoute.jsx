import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function ProtectedRoute({ children, roles = [] }) {
  const { loading, user, role } = useAuth();

  if (loading) {
    return <p>Verifica credenziali in corso...</p>;
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }

  if (roles.length > 0 && !roles.includes(role)) {
    // Reindirizziamo alla dashboard per evitare loop sulla login quando l'utente non ha i permessi.
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}
