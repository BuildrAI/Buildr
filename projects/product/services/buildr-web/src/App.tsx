import { PrototypeReaderPage } from './features/task/pages/PrototypeReaderPage';
import type { ResourcePreview } from './app/resource-preview';
import { AssetHome } from './features/workspace/components/AssetHome';
import { Navigate, useRoutes, type RouteObject } from 'react-router-dom';
import { SkillsPage } from './features/agent-assets/pages/SkillsPage';
import { AppLayout } from './app/AppLayout';
import { CurrentWorkspaceRoute } from './app/workspace-routes';
import { ArticleDetailPage } from './features/publication/pages/ArticleDetailPage';
import { TaskLinkedDocument } from './features/task/components/TaskLinkedDocument';
import { TaskDetailPage } from './features/task/pages/TaskDetailPage';
import { WorkspacesPage } from './features/workspace/pages/WorkspacesPage';

function renderResource(item: ResourcePreview) {
  if (item.kind === 'task-document') return <TaskLinkedDocument item={item} />;
  if (item.kind === 'task' || item.kind === 'composite-task') return <TaskDetailPage taskId={item.id} />;
  if (item.kind === 'article') return <ArticleDetailPage preview={{ projectCode: item.projectCode, publicationId: item.publicationId }} initialView={item.view} initialEditing={item.edit} />;
  if (item.kind === 'skill') return <SkillsPage previewId={item.id} />;
  return <AssetHome kind={item.kind} previewId={item.id} knowledge={item.knowledge} initialEditing={item.edit} />;
}

const routes: RouteObject[] = [
  { path: '/workspaces/:workspaceId/tasks/:taskId/prototypes', element: <PrototypeReaderPage /> },
  {
    path: '/', element: <AppLayout renderResource={renderResource} />, children: [
      { index: true, element: <WorkspacesPage /> },
    ],
  },
  {
    path: '/workspaces/:workspaceId/*', element: <AppLayout renderResource={renderResource} />, children: [
      { path: '*', element: <CurrentWorkspaceRoute /> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
];

export function App() {
  return useRoutes(routes);
}
