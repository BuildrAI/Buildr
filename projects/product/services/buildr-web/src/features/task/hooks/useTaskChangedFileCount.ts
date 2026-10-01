import { useCallback, useEffect, useRef, useState } from 'react';
import type { TaskChangedFileCountResponse } from '../../../../build/generated/task-dto';
import { taskApi } from '../api/task-api';
import { isTaskReadCancelled } from './useTaskRequestLifecycle';

const cache = new Map<string, TaskChangedFileCountResponse>();

/** The tab badge reads only file status; opening the workbench loads its full data. */
export function useTaskChangedFileCount(taskId: string, enabled: boolean, workspaceId = '') {
  const key = JSON.stringify([workspaceId, taskId]);
  const currentKey = useRef(key);
  currentKey.current = key;
  const controller = useRef<AbortController | null>(null);
  const [data, setData] = useState<{ key: string; result: TaskChangedFileCountResponse } | null>(null);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setError('');
    try {
      const result = await taskApi.changedFileCount(taskId, { signal: request.signal });
      if (!request.signal.aborted && currentKey.current === key) {
        cache.delete(key); cache.set(key, result);
        while (cache.size > 8) cache.delete(cache.keys().next().value!);
        setData({ key, result });
      }
    } catch (cause) {
      if (!request.signal.aborted && currentKey.current === key && !isTaskReadCancelled(cause)) setError(cause instanceof Error ? cause.message : '未能读取改动数量。');
    }
  }, [key, taskId]);
  useEffect(() => {
    setError('');
    if (enabled) void refresh();
    return () => controller.current?.abort();
  }, [enabled, refresh]);
  return { data: data?.key === key ? data.result : cache.get(key) ?? null, error, refresh };
}
