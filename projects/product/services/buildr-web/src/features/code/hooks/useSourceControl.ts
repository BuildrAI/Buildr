import { useCallback, useEffect, useMemo, useRef } from 'react';
import { codeApi, type CodeSourceControlInput } from '../api/code-api';
import { sourceControlRepository, type SourceControlReader } from '../source-control-model';
import { useSourceControlRead } from './useSourceControlRead';
import { sourceControlAfterBranchSwitch } from '../source-control-branches';
import { subscribeSourceControlChanges } from '../source-control-events';

/** The live adapter owns HTTP access; the shared workbench receives observations and replaceable readers. */
export function useSourceControl(workspaceId: string, taskId?: string) {
  const currentWorkspace = useRef(workspaceId); currentWorkspace.current = workspaceId;
  const catalogLoader = useCallback((input: CodeSourceControlInput, signal: AbortSignal) => codeApi.sourceControl(workspaceId, input, signal), [workspaceId]);
  const catalog = useSourceControlRead(JSON.stringify([workspaceId, taskId]), {taskId}, catalogLoader, Boolean(workspaceId));
  useEffect(() => subscribeSourceControlChanges(notice => {
    if (notice.workspaceId !== workspaceId || currentWorkspace.current !== workspaceId) return;
    if (notice.result) catalog.update(previous => sourceControlAfterBranchSwitch(previous, notice.result!));
    void catalog.refresh();
  }), [workspaceId, catalog.update, catalog.refresh]);
  const reader = useMemo<SourceControlReader>(() => ({
    history: (input, signal) => codeApi.history(workspaceId, input, signal),
    commit: (input, signal) => codeApi.commit(workspaceId, input, signal),
    diff: (input, signal) => codeApi.diff(workspaceId, input, signal),
    sourceFile: (input, signal) => codeApi.sourceFile(workspaceId, input, signal),
  }), [workspaceId]);
  const repositories = useMemo(() => catalog.data?.repositories.map(sourceControlRepository) || [], [catalog.data]);
  return { repositories, reader, readKey: workspaceId, selection: catalog.data ? {repositoryIds: catalog.data.selectedRepositoryIds, worktrees: catalog.data.selectedWorktrees, reason: catalog.data.scopeReason} : undefined, refresh: catalog.refresh,
    observation: { loading: catalog.loading, error: catalog.error, readAt: catalog.data?.readAt || '',
      diagnostics: catalog.data?.diagnostics.map(item => item.message) || [], truncated: catalog.data?.coverage.truncated || false } };
}
