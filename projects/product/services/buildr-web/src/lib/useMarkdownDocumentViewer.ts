import { useCallback, useState } from 'react';

export type MarkdownDocument = {
  path?: string;
  name: string;
  exists: boolean;
  content: string | null;
};

type OpenOptions = { pushHistory?: boolean; replaceHistory?: boolean };

export function useMarkdownDocumentViewer(
  fetchDocument: (path: string) => Promise<MarkdownDocument>,
  missingMessage: (path: string) => string,
) {
  const [path, setPath] = useState('README.md');
  const [history, setHistory] = useState<string[]>(['README.md']);
  const [document, setDocument] = useState<MarkdownDocument | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const reset = useCallback((next: MarkdownDocument, fallbackPath = 'README.md') => {
    const nextPath = next.path || fallbackPath;
    setDocument(next);
    setPath(nextPath);
    setHistory([nextPath]);
    setMessage(null);
  }, []);

  const open = useCallback(async (nextPath: string, options: OpenOptions = {}) => {
    setLoading(true);
    setMessage(null);
    try {
      const next = await fetchDocument(nextPath);
      const resolvedPath = next.path || nextPath;
      setDocument(next);
      setPath(resolvedPath);
      if (options.replaceHistory) setHistory([resolvedPath]);
      else if (options.pushHistory !== false) {
        setHistory((current) => current[current.length - 1] === resolvedPath ? current : [...current, resolvedPath]);
      }
      if (!next.exists || next.content == null) setMessage(missingMessage(resolvedPath));
    } catch (error) {
      setDocument(null);
      setMessage(error instanceof Error ? error.message : `无法打开 ${nextPath}`);
    } finally {
      setLoading(false);
    }
  }, [fetchDocument, missingMessage]);

  const back = useCallback(() => {
    if (history.length <= 1) return;
    const nextHistory = history.slice(0, -1);
    const previous = nextHistory[nextHistory.length - 1];
    setHistory(nextHistory);
    void open(previous, { pushHistory: false });
  }, [history, open]);

  return {
    path,
    history,
    document,
    loading,
    message,
    setMessage,
    reset,
    open,
    back,
  };
}
