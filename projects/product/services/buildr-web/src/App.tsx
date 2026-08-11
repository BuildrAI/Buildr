import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './app/AppLayout';
import { ArticleDetailPage } from './pages/ArticleDetailPage';
import { ArticlesPage } from './pages/ArticlesPage';
import { OverviewPage } from './pages/OverviewPage';
import { ProjectDetailPage } from './pages/ProjectDetailPage';
import { ProjectEditPage } from './pages/ProjectEditPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { ServiceDetailPage } from './pages/ServiceDetailPage';
import { ServiceEditPage } from './pages/ServiceEditPage';
import { ServicesPage } from './pages/ServicesPage';
import { SettingsPage } from './pages/SettingsPage';
import { TaskChangeDetailPage } from './pages/TaskChangeDetailPage';
import { TaskDetailPage } from './pages/TaskDetailPage';
import { TasksSection } from './pages/TasksSection';
import { WorkspacesPage } from './pages/WorkspacesPage';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<AppLayout />}>
        <Route index element={<WorkspacesPage />} />
      </Route>
      <Route path="/workspaces/:workspaceId" element={<AppLayout />}>
        <Route index element={<OverviewPage />} />
        <Route path="overview" element={<OverviewPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="tasks" element={<TasksSection />}>
          <Route path=":taskId/changes/:projectCode/:changeCode" element={<TaskChangeDetailPage />} />
          <Route path=":taskId" element={<TaskDetailPage />} />
        </Route>
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="projects/:projectCode" element={<ProjectDetailPage />} />
        <Route path="projects/:projectCode/edit" element={<ProjectEditPage />} />
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
