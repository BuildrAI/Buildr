import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './app/AppLayout';
import { ArticleDetailPage } from './pages/ArticleDetailPage';
import { ArticlesPage } from './pages/ArticlesPage';
import { ProjectDetailPage } from './pages/ProjectDetailPage';
import { ProjectEditPage } from './pages/ProjectEditPage';
import { ProjectsSection } from './pages/ProjectsSection';
import { ServiceDetailPage } from './pages/ServiceDetailPage';
import { ServiceEditPage } from './pages/ServiceEditPage';
import { ServicesPage } from './pages/ServicesPage';
import { SettingsPage } from './pages/SettingsPage';
import { TaskChangeDetailPage } from './pages/TaskChangeDetailPage';
import { TaskDetailPage } from './features/task-record/pages/TaskDetailPage';
import { TasksSection } from './features/task-record/pages/TasksSection';
import { WorkspacesPage } from './pages/WorkspacesPage';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<AppLayout />}>
        <Route index element={<WorkspacesPage />} />
      </Route>
      <Route path="/workspaces/:workspaceId" element={<AppLayout />}>
        <Route index element={<Navigate to="tasks" replace />} />
        <Route path="overview" element={<Navigate to="../tasks" replace />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="tasks" element={<TasksSection />}>
          <Route path=":taskId/changes/:projectCode/:changeCode" element={<TaskChangeDetailPage />} />
          <Route path=":taskId" element={<TaskDetailPage />} />
        </Route>
        <Route path="projects" element={<ProjectsSection />}>
          <Route path=":projectCode/edit" element={<ProjectEditPage />} />
          <Route path=":projectCode" element={<ProjectDetailPage />} />
        </Route>
        <Route path="services" element={<ServicesPage />} />
        <Route path="services/:projectCode/:serviceCode" element={<ServiceDetailPage />} />
        <Route path="services/:projectCode/:serviceCode/edit" element={<ServiceEditPage />} />
        <Route path="articles" element={<ArticlesPage />} />
        <Route path="articles/:publicationId" element={<ArticleDetailPage />} />
        <Route path="*" element={<Navigate to="." replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
