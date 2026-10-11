import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { FileEditingProvider } from './FileEditingContext';
import { fileEditingOperations } from '../features/code/hooks/useEditableFile';
import { FileEditingSessionStore } from '../components/file-editing/file-editing-session';
import { WorkspaceFileEditingStores } from '../components/file-editing/file-editing-workspaces';

const unfinishedWorkspaces = new WorkspaceFileEditingStores();

/** The app shell stays mounted on global pages after a workspace provider leaves. */
export function useFileEditingDraftProtection() {
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (unfinishedWorkspaces.hasUnsaved()) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, []);
}

export function WorkspaceFileEditingProvider({ workspaceId, children }: { workspaceId: string; children: ReactNode }) {
  const operations = useMemo(() => fileEditingOperations(workspaceId), [workspaceId]);
  const [store] = useState(() => unfinishedWorkspaces.take(workspaceId) || new FileEditingSessionStore(operations));
  useEffect(() => () => { void unfinishedWorkspaces.suspend(workspaceId, store); }, [workspaceId, store]);
  return <FileEditingProvider operations={operations} store={store}>{children}</FileEditingProvider>;
}
