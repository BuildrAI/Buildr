import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { codeApi } from '../api/code-api';
import { sourceControlRepository, type SourceControlReader } from '../source-control-model';
import { subscribeSourceControlChanges } from '../source-control-events';
import { createSourceControlCatalog } from '../source-control-catalog';

/** The live adapter owns HTTP access; the shared workbench receives observations and replaceable readers. */
export function useSourceControl(workspaceId: string, taskId?: string) {
  const catalog = useMemo(() => createSourceControlCatalog((repositoryId, signal) => codeApi.sourceControl(workspaceId, {taskId, repositoryId}, signal)), [workspaceId, taskId]);
  const state = useSyncExternalStore(catalog.subscribe, catalog.snapshot);
  useEffect(() => { if (workspaceId) void catalog.refresh(); return () => catalog.dispose(); }, [workspaceId, catalog]);
  useEffect(() => subscribeSourceControlChanges(notice => {
    if (notice.workspaceId !== workspaceId) return;
    if (notice.repositoryIds && notice.repositoryIds.length > 1) catalog.changedMany(notice.repositoryIds);
    else catalog.changed(notice.repositoryId, notice.result?.source.repositoryId === notice.repositoryId && notice.result.source.worktreeId === notice.worktreeId ? notice.result : undefined);
  }), [workspaceId, catalog]);
  const reader = useMemo<SourceControlReader>(() => ({
    history: (input, signal) => codeApi.history(workspaceId, input, signal),
    commit: (input, signal) => codeApi.commit(workspaceId, input, signal),
    diff: (input, signal) => codeApi.diff(workspaceId, input, signal),
    sourceFile: (input, signal) => codeApi.sourceFile(workspaceId, input, signal),
  }), [workspaceId]);
  const repositories = useMemo(() => state.data?.repositories.map(repository => ({...sourceControlRepository(repository), readVersion:String(state.versions[repository.id] || ''),
    diagnostics:[...repository.diagnostics.map(item => item.message), ...(state.repositoryErrors[repository.id] ? [state.repositoryErrors[repository.id]] : [])]})) || [], [state]);
  return { repositories, reader, readKey: workspaceId, selection: state.data ? {repositoryIds: state.data.selectedRepositoryIds, worktrees: state.data.selectedWorktrees, reason: state.data.scopeReason} : undefined, refresh: catalog.refresh,
    observation: { loading: state.loading, error: state.error, readAt: state.data?.readAt || '',
      diagnostics: [...(state.data?.diagnostics.map(item => item.message) || []), ...Object.entries(state.repositoryErrors).filter(([, error]) => error).map(([id, error]) => (state.data?.repositories.find(item => item.id === id)?.name || id) + '：' + error)], truncated: state.data?.coverage.truncated || false } };
}
