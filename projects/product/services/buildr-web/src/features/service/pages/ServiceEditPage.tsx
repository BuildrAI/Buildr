import { Navigate, useLocation } from 'react-router-dom';
export function ServiceEditPage() {
  const location = useLocation();
  return <Navigate to={location.pathname.replace(/\/edit$/, '')} replace state={{ editResource: true }} />;
}
