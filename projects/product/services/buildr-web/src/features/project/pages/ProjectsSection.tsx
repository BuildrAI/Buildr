import { useOutlet } from 'react-router-dom';
import { ProjectsPage } from './ProjectsPage';

/** 项目目录与项目全景的路由宿主；导航由平级侧栏与页面级页签承担。 */
export function ProjectsSection() {
  const outlet = useOutlet();
  return outlet || <ProjectsPage />;
}
