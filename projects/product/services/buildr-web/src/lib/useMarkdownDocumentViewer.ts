import { useCallback, useEffect, useRef, useState, type SetStateAction } from 'react';

export type MarkdownDocument = {
  path?: string;
  name: string;
  exists: boolean;
  content: string | null;
};

type OpenOptions = { pushHistory?: boolean; replaceHistory?: boolean };
type DocumentReader = (path: string, signal?: AbortSignal) => Promise<MarkdownDocument>;
type ViewerState = {
  reader: DocumentReader;
  path: string;
  history: string[];
  document: MarkdownDocument | null;
  loading: boolean;
  message: string | null;
};

const emptyState = (reader: DocumentReader): ViewerState => ({
  reader, path: 'README.md', history: ['README.md'], document: null, loading: false, message: null,
});

export function useMarkdownDocumentViewer(
  fetchDocument: DocumentReader,
  missingMessage: (path: string) => string,
) {
  const [state, setState] = useState(() => emptyState(fetchDocument));
  const current = useRef(state);
  const reader = useRef(fetchDocument);
  const generation = useRef(0);
  const pending = useRef<AbortController | null>(null);

  if (reader.current !== fetchDocument) {
    reader.current = fetchDocument;
    generation.current += 1;
    current.current = emptyState(fetchDocument);
  }
  const visible = state.reader === fetchDocument ? state : current.current;
  const commit = useCallback((next: ViewerState) => {
    current.current = next;
    setState(next);
  }, []);
  const invalidate = useCallback(() => {
    generation.current += 1;
    pending.current?.abort();
    pending.current = null;
  }, []);

  useEffect(() => {
    commit(emptyState(fetchDocument));
    return invalidate;
  }, [fetchDocument, commit, invalidate]);

  const reset = useCallback((next: MarkdownDocument, fallbackPath = 'README.md') => {
    invalidate();
    const nextPath = next.path || fallbackPath;
    commit({ reader: reader.current, path: nextPath, history: [nextPath], document: next, loading: false, message: null });
  }, [commit, invalidate]);

  const open = useCallback(async (nextPath: string, options: OpenOptions = {}) => {
    if (reader.current !== fetchDocument) return;
    invalidate();
    const version = generation.current;
    const controller = new AbortController();
    pending.current = controller;
    const previous = current.current;
    commit({ ...previous, ...(options.replaceHistory ? { path: nextPath, history: [nextPath], document: null } : {}), loading: true, message: null });
    try {
      const next = await fetchDocument(nextPath, controller.signal);
      if (version !== generation.current) return;
      const resolvedPath = next.path || nextPath;
      const history = current.current.history;
      const nextHistory = options.replaceHistory ? [resolvedPath]
        : options.pushHistory === false || history[history.length - 1] === resolvedPath ? history : [...history, resolvedPath];
      commit({ ...current.current, path: resolvedPath, history: nextHistory, document: next,
        message: !next.exists || next.content == null ? missingMessage(resolvedPath) : null });
    } catch (error) {
      if (version === generation.current) commit({ ...current.current, document: null,
        message: error instanceof Error ? error.message : `无法打开 ${nextPath}` });
    } finally {
      if (version === generation.current) {
        pending.current = null;
        commit({ ...current.current, loading: false });
      }
    }
  }, [fetchDocument, missingMessage, commit, invalidate]);

  const back = useCallback(() => {
    const history = current.current.history;
    if (history.length <= 1) return;
    const nextHistory = history.slice(0, -1);
    const previous = nextHistory[nextHistory.length - 1];
    commit({ ...current.current, history: nextHistory });
    void open(previous, { pushHistory: false });
  }, [open, commit]);

  const setMessage = useCallback((value: SetStateAction<string | null>) => {
    commit({ ...current.current, message: typeof value === 'function' ? value(current.current.message) : value });
  }, [commit]);

  return {
    path: visible.path,
    history: visible.history,
    document: visible.document,
    loading: visible.loading,
    message: visible.message,
    setMessage,
    reset,
    open,
    back,
  };
}
