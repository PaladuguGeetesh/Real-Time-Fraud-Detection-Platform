import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import LoadingIndicator from '../ui/LoadingIndicator';

function ProtectedRoute({ children }) {
  const { isAuthenticated } = useAuth();

  // isAuthenticated === null: the /api/auth/me check is still in
  // flight -- wait for it rather than redirecting prematurely, or
  // every page load would flash the login screen before bouncing back.
  if (isAuthenticated === null) {
    return <LoadingIndicator />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

export default ProtectedRoute;
