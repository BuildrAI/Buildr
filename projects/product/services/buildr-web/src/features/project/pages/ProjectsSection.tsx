import { useOutlet } from 'react-router-dom';
import { ProjectsPage } from './ProjectsPage';

/** The application shell owns project navigation; this host only chooses the page. */
export function ProjectsSection() {
  const outlet = useOutlet();
  return outlet || <ProjectsPage />;
}
