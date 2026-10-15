import { Navigate, useRoutes, type Location, type RouteObject } from 'react-router-dom';
import { CodexEntryNotice } from '../features/agents/components/CodexEntryNotice';
import { SkillsPage } from '../features/agent-assets/pages/SkillsPage';
import { CodeExplorerPage, CodeSourceControlPage } from '../features/code/pages/CodeExplorerPage';
import { ConnectionSkillsPage } from '../features/connection-skills/pages/ConnectionSkillsPage';
import { KnowledgePage } from '../features/knowledge/pages/KnowledgePage';
import { ProjectCreatePage } from '../features/project/pages/ProjectCreatePage';
import { ProjectDetailPage } from '../features/project/pages/ProjectDetailPage';
import { ProjectEditPage } from '../features/project/pages/ProjectEditPage';
import { ProjectsSection } from '../features/project/pages/ProjectsSection';
import { ArticleDetailPage } from '../features/publication/pages/ArticleDetailPage';
import { ArticleEditPage } from '../features/publication/pages/ArticleEditPage';
import { ArticlesPage } from '../features/publication/pages/ArticlesPage';
import { RepositoriesPage } from '../features/repository/pages/RepositoriesPage';
import { ServiceDetailPage } from '../features/service/pages/ServiceDetailPage';
import { ServiceEditPage } from '../features/service/pages/ServiceEditPage';
import { ServicesPage } from '../features/service/pages/ServicesPage';
import { TaskChangeDetailPage } from '../features/task/pages/TaskChangeDetailPage';
import { TaskDetailPage } from '../features/task/pages/TaskDetailPage';
import { TasksSection } from '../features/task/pages/TasksSection';
import { WorkbenchActivityPage } from '../features/workbench/pages/WorkbenchActivityPage';
import { WorkbenchPage } from '../features/workbench/pages/WorkbenchPage';
import { AssetHome } from '../features/workspace/components/AssetHome';
import { SettingsPage } from '../features/workspace/pages/SettingsPage';
import { WorkspaceOverviewPage } from '../features/workspace/pages/WorkspaceOverviewPage';

/** Current and retained workspace pages share the same relative route definitions. */
export const workspaceRoutes: RouteObject[] = [
  { index: true, element: <Navigate to="overview" replace /> },
  { path: 'workspace-overview', element: <WorkspaceOverviewPage /> },
  { path: 'overview', element: <WorkbenchPage /> },
  { path: 'codex', element: <CodexEntryNotice /> },
  { path: 'activity', element: <WorkbenchActivityPage /> },
  { path: 'settings', element: <SettingsPage /> },
  { path: 'code', element: <Navigate to="source-control" replace /> },
  { path: 'code/explorer', element: <CodeExplorerPage /> },
  { path: 'code/source-control', element: <CodeSourceControlPage /> },
  { path: 'knowledge/:scopeKind/:scopeId', element: <KnowledgePage /> },
  { path: 'skills', element: <SkillsPage /> },
  { path: 'skills/:skillId', element: <SkillsPage /> },
  { path: 'repositories', element: <RepositoriesPage /> },
  { path: 'connections', element: <Navigate to="../connection-skills" replace /> },
  { path: 'connection-skills', element: <ConnectionSkillsPage /> },
  { path: 'repositories/:assetId', element: <AssetHome kind="repository" /> },
  {
    path: 'tasks', element: <TasksSection />, children: [
      { path: ':taskId/changes/:projectCode/:changeCode', element: <TaskChangeDetailPage /> },
      { path: ':taskId', element: <TaskDetailPage /> },
    ],
  },
  {
    path: 'projects', element: <ProjectsSection />, children: [
      { path: 'new', element: <ProjectCreatePage /> },
      { path: ':projectCode/edit', element: <ProjectEditPage /> },
      { path: ':projectCode', element: <ProjectDetailPage /> },
    ],
  },
  { path: 'services', element: <ServicesPage /> },
  { path: 'services/:assetId', element: <AssetHome kind="service" /> },
  { path: 'services/:projectCode/:serviceCode', element: <ServiceDetailPage /> },
  { path: 'services/:projectCode/:serviceCode/edit', element: <ServiceEditPage /> },
  { path: 'articles', element: <ArticlesPage /> },
  { path: 'articles/:projectCode/:publicationId/edit', element: <ArticleEditPage /> },
  { path: 'articles/:projectCode/:publicationId', element: <ArticleDetailPage /> },
  { path: 'articles/:publicationId', element: <ArticleDetailPage /> },
  { path: '*', element: <Navigate to="." replace /> },
];

/** Call inside AppLayout's workspace route context, using the page's own location. */
export function RetainedWorkspaceRoute({ location }: { location: Location }) {
  return useRoutes(workspaceRoutes, location);
}

export function CurrentWorkspaceRoute() {
  return useRoutes(workspaceRoutes);
}
