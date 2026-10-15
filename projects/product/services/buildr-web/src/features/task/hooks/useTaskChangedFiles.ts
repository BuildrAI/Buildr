import { useCallback, useEffect, useRef, useState } from 'react';
import type { TaskChangedFilesResult } from '../../../../build/generated/task-dto';
import { taskApi } from '../api/task-api';
import { isTaskReadCancelled } from './useTaskRequestLifecycle';

const fileCache = new Map<string, TaskChangedFilesResult>();
const cacheLimit = 8;

/** Refresh completes after the current task's files and commits have been read. */
export function useTaskChangedFiles(taskId: string, enabled = true, workspaceId = '') {
  const cacheKey = JSON.stringify([workspaceId, taskId]);
  const currentKey = useRef(cacheKey);
  currentKey.current = cacheKey;
  const [data, setData] = useState<{ key: string; result: TaskChangedFilesResult } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const fullRefresh = useRef<(() => Promise<void>) | null>(null);
  const registerFullRefresh = useCallback((read: (() => Promise<void>) | null) => { fullRefresh.current = read; }, []);
  const controller = useRef<AbortController | null>(null);
  const refresh = useCallback(async (includeSelectedDiff = true) => {
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setLoading(true);
    setError('');
    try {
      const result = await taskApi.changedFiles(taskId, { signal: request.signal });
      if (!request.signal.aborted && currentKey.current === cacheKey) {
        fileCache.delete(cacheKey);
        fileCache.set(cacheKey, result);
        while (fileCache.size > cacheLimit) fileCache.delete(fileCache.keys().next().value!);
        setData({ key: cacheKey, result });
        if (includeSelectedDiff) await fullRefresh.current?.();
      }
    } catch (cause) {
      if (!request.signal.aborted && currentKey.current === cacheKey && !isTaskReadCancelled(cause)) {
        setError(cause instanceof Error ? cause.message : '未能读取变更文件，请重试。');
      }
    } finally {
      if (!request.signal.aborted && currentKey.current === cacheKey) setLoading(false);
    }
  }, [taskId, cacheKey]);
  const requested = useRef(false);
  useEffect(() => {
    const cached = fileCache.get(cacheKey);
    setData(cached ? { key: cacheKey, result: cached } : null); setError(''); setLoading(false);
    requested.current = false;
    return () => controller.current?.abort();
  }, [taskId, cacheKey]);
  useEffect(() => {
    if (enabled && !requested.current) { requested.current = true; void refresh(false); }
  }, [enabled, refresh]);
  return { scopeKey: cacheKey, data: data?.key === cacheKey ? data.result : fileCache.get(cacheKey) ?? null, loading, error, retry: refresh, refresh, registerFullRefresh };
}
