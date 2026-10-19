import { createContext, useEffect, useMemo, type ReactNode } from 'react';
import { createCodeSourceSelectionStore, type CodeSourceSelectionStore } from '../features/code/code-source-selection';
import { codeApi } from '../features/code/api/code-api';
import { createSourceControlObserver, type SourceControlObserver } from '../features/code/source-control-observer';
import { createSourceControlRefreshLoader } from '../features/code/source-control-refresh';

export const WorkspaceSourceControlContext = createContext<{workspaceId: string; observer: SourceControlObserver; sourceSelection: CodeSourceSelectionStore} | null>(null);

/** The shell composes code observation once so navigation and retained pages see the same facts. */
export function WorkspaceSourceControlProvider({workspaceId, children}: {workspaceId?: string | null; children: ReactNode}) {
  const value = useMemo(() => workspaceId ? {workspaceId, sourceSelection:createCodeSourceSelectionStore(), observer: createSourceControlObserver({
    workspaceId,
    initialDelayMs: 750,
    load: (taskId, repositoryId, signal, onProgress) => createSourceControlRefreshLoader({
      inventory:readSignal => codeApi.sourceControlInventory(workspaceId, {taskId}, readSignal),
      repository:(id, readSignal) => codeApi.sourceControl(workspaceId, {taskId, repositoryId:id}, readSignal),
    })(repositoryId, signal, onProgress),
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
  return <WorkspaceSourceControlContext.Provider value={value}>{children}</WorkspaceSourceControlContext.Provider>;
}
