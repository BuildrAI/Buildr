import { matchRoutes } from 'react-router-dom';

// These are App's two workspace boundaries: the prototype reader lives outside
// AppLayout, while every other workspace path retains ArticleEditorProvider.
const workspaceBoundaries = [
  { id: 'prototype', path: '/workspaces/:workspaceId/tasks/:taskId/prototypes' },
  { id: 'workspace', path: '/workspaces/:workspaceId/*' },
];

export function articleEditorRemains(workspaceId: string, pathname: string): boolean {
  const match = matchRoutes(workspaceBoundaries, pathname)?.at(-1);
  return match?.route.id === 'workspace' && match.params.workspaceId === workspaceId;
}

export function shouldBlockArticleNavigation(
  workspaceId: string,
  pathname: string,
  state: { dirty: boolean; busy: boolean },
): boolean {
  return (state.dirty || state.busy) && !articleEditorRemains(workspaceId, pathname);
}
