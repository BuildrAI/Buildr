import { createContext, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { createCodeSourceSelectionStore, type CodeSourceSelectionStore } from '../features/code/code-source-selection';
import { codeApi } from '../features/code/api/code-api';
import { createSourceControlObserver, type SourceControlObserver } from '../features/code/source-control-observer';
import { createSourceControlRefreshLoader } from '../features/code/source-control-refresh';
import { createSourceControlCache } from '../features/code/source-control-cache';

export const WorkspaceSourceControlContext = createContext<{workspaceId: string; observer: SourceControlObserver; sourceSelection: CodeSourceSelectionStore} | null>(null);

/** The shell composes code observation once so navigation and retained pages see the same facts. */
export function WorkspaceSourceControlProvider({workspaceId, active = true, children}: {workspaceId?: string | null; active?: boolean; children: ReactNode}) {
  const initialActive = useRef(active);
  initialActive.current = active;
  const value = useMemo(() => workspaceId ? {workspaceId, sourceSelection:createCodeSourceSelectionStore(), observer: createSourceControlObserver({
    workspaceId,
    active: initialActive.current,
    cache: createSourceControlCache(workspaceId),
    initialDelayMs: 750,
    load: (taskId, repositoryId, signal, onProgress, shared) => createSourceControlRefreshLoader({
      inventory:readSignal => codeApi.sourceControlInventory(workspaceId, {taskId}, readSignal),
      repository:(id, readSignal, useShared) => codeApi.sourceControl(workspaceId, {taskId, repositoryId:id, ...(useShared ? {observation:'shared' as const} : {})}, readSignal),
    })(repositoryId, signal, onProgress, shared),
    watch: (cursor, signal) => codeApi.watchSourceControl(workspaceId, cursor, signal),
  })} : null, [workspaceId]);
  useEffect(() => {
    if (!value) return;
    const {observer} = value;
    const focus = () => { if (document.visibilityState === 'visible') observer.reconcile(); };
    const visibility = () => observer.setVisible(document.visibilityState !== 'hidden');
    observer.start(document.visibilityState !== 'hidden');
    window.addEventListener('focus', focus); document.addEventListener('visibilitychange', visibility);
    return () => { window.removeEventListener('focus', focus); document.removeEventListener('visibilitychange', visibility); observer.dispose(); };
  }, [value]);
  useEffect(() => {
    value?.observer.setActive(active);
  }, [value, active]);
  return <WorkspaceSourceControlContext.Provider value={value}>{children}</WorkspaceSourceControlContext.Provider>;
}
