import { useEffect, useState } from 'react';
import type { TaskChangedFilesResult } from '../../../../build/generated/task-dto';
import { taskApi } from '../api/task-api';
import { isTaskReadCancelled } from './useTaskRequestLifecycle';

/** This pane reads on entry and refresh; changing tasks cancels its previous read. */
export function useTaskChangedFiles(taskId: string, refreshToken: number) {
  const [data, setData] = useState<TaskChangedFilesResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retryToken, setRetryToken] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setData(previous => previous?.taskId === taskId ? previous : null);
    void taskApi.changedFiles(taskId, { signal: controller.signal }).then(result => {
      if (!controller.signal.aborted) setData(result);
    }).catch(cause => {
      if (!controller.signal.aborted && !isTaskReadCancelled(cause)) setError(cause instanceof Error ? cause.message : '未能读取变更文件，请重试。');
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [taskId, refreshToken, retryToken]);
  return { data: data?.taskId === taskId ? data : null, loading, error, retry: () => setRetryToken(value => value + 1) };
}
