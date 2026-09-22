import { WorkbenchPage } from './features/workbench/pages/WorkbenchPage';
import { WorkbenchActivityPage } from './features/workbench/pages/WorkbenchActivityPage';
import { KnowledgePage } from './features/knowledge/pages/KnowledgePage';
import type { ResourcePreview } from './app/resource-preview';
import { ProjectCreatePage } from './features/project/pages/ProjectCreatePage';
import { RepositoriesPage } from './features/repository/pages/RepositoriesPage';
import { AssetHome } from './features/workspace/components/AssetHome';
import { Navigate, Route, Routes } from 'react-router-dom';
import { SkillsPage } from './features/agent-assets/pages/SkillsPage';
import { AppLayout } from './app/AppLayout';
import { ArticleDetailPage } from './features/publication/pages/ArticleDetailPage';
import { ArticleEditPage } from './features/publication/pages/ArticleEditPage';
import { ArticlesPage } from './features/publication/pages/ArticlesPage';
import { ProjectDetailPage } from './features/project/pages/ProjectDetailPage';
import { ProjectEditPage } from './features/project/pages/ProjectEditPage';
import { ProjectsSection } from './features/project/pages/ProjectsSection';
import { ServiceDetailPage } from './features/service/pages/ServiceDetailPage';
import { ServiceEditPage } from './features/service/pages/ServiceEditPage';
import { ServicesPage } from './features/service/pages/ServicesPage';
import { SettingsPage } from './features/workspace/pages/SettingsPage';
import { TaskChangeDetailPage } from './features/task/pages/TaskChangeDetailPage';
import { TaskLinkedDocument } from './features/task/components/TaskLinkedDocument';
import { TaskDetailPage } from './features/task/pages/TaskDetailPage';
import { TasksSection } from './features/task/pages/TasksSection';
import { WorkspacesPage } from './features/workspace/pages/WorkspacesPage';

function renderResource(item: ResourcePreview) {
  if (item.kind === 'task-document') return <TaskLinkedDocument item={item} />;
  if (item.kind === 'task' || item.kind === 'composite-task') return <TaskDetailPage taskId={item.id} />;
  if (item.kind === 'article') return <ArticleDetailPage preview={{ projectCode: item.projectCode, publicationId: item.publicationId }} initialView={item.view} initialEditing={item.edit} />;
  if (item.kind === 'skill') return <SkillsPage previewId={item.id} />;
  return <AssetHome kind={item.kind} previewId={item.id} knowledge={item.knowledge} initialEditing={item.edit} />;
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<AppLayout renderResource={renderResource} />}>
        <Route index element={<WorkspacesPage />} />
      </Route>
      <Route path="/workspaces/:workspaceId" element={<AppLayout renderResource={renderResource} />}>
        <Route index element={<Navigate to="overview" replace />} />
        <Route path="overview" element={<WorkbenchPage />} />
        <Route path="activity" element={<WorkbenchActivityPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="knowledge/:scopeKind/:scopeId" element={<KnowledgePage />} />
        <Route path="skills" element={<SkillsPage />} />
        <Route path="skills/:skillId" element={<SkillsPage />} />
        <Route path="repositories" element={<RepositoriesPage />} />
        <Route path="repositories/:assetId" element={<AssetHome kind="repository" />} />
        <Route path="tasks" element={<TasksSection />}>
          <Route path=":taskId/changes/:projectCode/:changeCode" element={<TaskChangeDetailPage />} />
          <Route path=":taskId" element={<TaskDetailPage />} />
        </Route>
        <Route path="projects" element={<ProjectsSection />}>
          <Route path="new" element={<ProjectCreatePage />} />
          <Route path=":projectCode/edit" element={<ProjectEditPage />} />
          <Route path=":projectCode" element={<ProjectDetailPage />} />
        </Route>
        <Route path="services" element={<ServicesPage />} />
        <Route path="services/:assetId" element={<AssetHome kind="service" />} />
        <Route path="services/:projectCode/:serviceCode" element={<ServiceDetailPage />} />
        <Route path="services/:projectCode/:serviceCode/edit" element={<ServiceEditPage />} />
        <Route path="articles" element={<ArticlesPage />} />
        <Route path="articles/:projectCode/:publicationId/edit" element={<ArticleEditPage />} />
        <Route path="articles/:projectCode/:publicationId" element={<ArticleDetailPage />} />
        <Route path="articles/:publicationId" element={<ArticleDetailPage />} />
        <Route path="*" element={<Navigate to="." replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
