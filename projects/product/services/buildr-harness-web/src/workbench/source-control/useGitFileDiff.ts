import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangedFileEntry } from './read-contracts.ts';

export type GitFileDiffInput={repositoryId:string;filePath:string;commitHash:string;checkoutId?:string};
export type GitDiffLoader=(taskId:string,input:GitFileDiffInput,signal:AbortSignal)=>Promise<{files:ChangedFileEntry[]}>;

/** One selected source only; switching aborts it, refresh can await the same read. */
export function useGitFileDiff(taskId: string | undefined, input: GitFileDiffInput | null, version: string, scope = '', load?:GitDiffLoader) {
  const key = taskId && input && load ? JSON.stringify([scope, taskId, input]) : '';
  const current = useRef(key); current.current = key;
  const [state, setState] = useState<{ key: string; data: {files:ChangedFileEntry[]} | null; loading: boolean; error: string; errorCode?: string; errorStatus?: number } | null>(null);
  const pending = useRef<{ key: string; controller: AbortController; promise: Promise<void> } | null>(null);
  const read = useCallback((replacePending = false): Promise<void> => {
    if (!taskId || !input || !load) return Promise.resolve();
    if (!replacePending && pending.current?.key === key) return pending.current.promise;
    pending.current?.controller.abort();
    const controller = new AbortController();
    setState(previous => ({ key, data: previous?.key === key ? previous.data : null, loading: true, error: '' }));
    const entry = { key, controller, promise: Promise.resolve() };
    entry.promise = load(taskId,input,controller.signal).then(data => {
      if (!controller.signal.aborted && current.current === key) setState({ key, data, loading: false, error: '' });
    }).catch((error: {code?:string;status?:number}) => {
      if (!controller.signal.aborted && current.current === key) setState({ key, data: null, loading: false, error: error instanceof Error ? error.message : '完整差异读取失败', errorCode: error?.code, errorStatus: error?.status });
    }).finally(() => { if (pending.current === entry) pending.current = null; });
    pending.current = entry;
    return entry.promise;
  // The serialized key includes every source field; version explicitly revalidates it.
  }, [key]);
  const refresh = useCallback(() => read(true), [read]);
  useEffect(() => { void read(); }, [read, version]);
  useEffect(() => () => { pending.current?.controller.abort(); }, [key]);
  const visible = state?.key === key ? state : null;
  return { data: visible?.data ?? null, loading: Boolean(key) && (!visible || visible.loading), error: visible?.error ?? '', errorCode: visible?.errorCode, errorStatus: visible?.errorStatus, refresh };
}
