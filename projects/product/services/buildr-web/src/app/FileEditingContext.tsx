import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { FileEditingSessionStore } from '../components/file-editing/file-editing-session';
import type { FileEditingController, FileEditingDocument, FileEditingOperations } from '../components/file-editing/file-editing-types';

const FileEditingContext = createContext<FileEditingController | null>(null);

export function useFileEditingController(operations: FileEditingOperations, files: FileEditingDocument[] = [], retainedStore?: FileEditingSessionStore) {
  const [store] = useState(() => {
    if (retainedStore) return retainedStore;
    const next = new FileEditingSessionStore(operations);
    for (const file of files) next.ensure(file);
    return next;
  });
  store.setOperations(operations);
  const sessions = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const controller = useMemo<FileEditingController>(() => ({ sessions, ensure: store.ensure, watch: store.watch, setMode: store.setMode, applyTransactions: store.applyTransactions, setLanguage: store.setLanguage, setComposing: store.setComposing, change: store.change, undo: store.undo, redo: store.redo, saveNow: store.saveNow, retry: store.saveNow, refresh: store.refresh, reviewSource: store.reviewSource, applyMergeTransactions: store.applyMergeTransactions, resolveConflict: store.resolveConflict, acceptDisk: store.acceptDisk }), [sessions, store]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (store.hasUnsaved()) { event.preventDefault(); event.returnValue = ''; } };
    const flush = () => { void store.flush(); };
    const focus = () => { void store.refreshActive(); };
    const visibility = () => { if (document.visibilityState === 'hidden') flush(); else focus(); };
    const interval = window.setInterval(() => { if (document.visibilityState === 'visible') focus(); }, 5000);
    window.addEventListener('beforeunload', beforeUnload);
    window.addEventListener('focus', focus);
    document.addEventListener('visibilitychange', visibility);
    return () => { void store.flush(); store.clearTimers(); window.clearInterval(interval); window.removeEventListener('beforeunload', beforeUnload); window.removeEventListener('focus', focus); document.removeEventListener('visibilitychange', visibility); };
  }, [store]);
  return { controller, store };
}

export function FileEditingProvider({ operations, children, store }: { operations: FileEditingOperations; children: ReactNode; store?: FileEditingSessionStore }) {
  const { controller } = useFileEditingController(operations, [], store);
  return <FileEditingContext.Provider value={controller}>{children}</FileEditingContext.Provider>;
}

export function useFileEditingContext(): FileEditingController {
  const controller = useContext(FileEditingContext);
  if (!controller) throw new Error('FileEditingProvider 未提供。');
  return controller;
}
