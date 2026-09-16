import { Navigate, useLocation } from 'react-router-dom';
export function ProjectEditPage() {
  const location = useLocation();
  return <Navigate to={location.pathname.replace(/\/edit$/, '')} replace state={{ editResource: true }} />;
}
