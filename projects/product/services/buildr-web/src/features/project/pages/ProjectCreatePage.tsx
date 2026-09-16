import { Navigate, useParams } from 'react-router-dom';
export function ProjectCreatePage() {
  const { workspaceId } = useParams();
  return <Navigate to={`/workspaces/${workspaceId}/projects`} replace state={{ createProject: true }} />;
}
