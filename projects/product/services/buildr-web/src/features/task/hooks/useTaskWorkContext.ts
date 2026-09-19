import { useCallback, useEffect, useRef, useState } from 'react';
import type { TaskWorkContextResponse } from '../../../../build/generated/workbench-dto';
import { workbenchApi } from '../../workbench/api/workbench-api';

export function useTaskWorkContext(taskId: string) {
  const [data, setData] = useState<TaskWorkContextResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const taskIdRef = useRef(taskId);
  taskIdRef.current = taskId;
  const controller = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    if (taskIdRef.current !== taskId) return null;
    const current = ++generation.current;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setLoading(true); setError(null);
    try {
      const next = await workbenchApi.context(taskId, { signal: abort.signal });
      if (generation.current === current && taskIdRef.current === taskId) setData(next);
      return next;
    } catch (cause) {
      if (generation.current === current && !abort.signal.aborted) setError(cause instanceof Error ? cause.message : '工作摘要暂时不可读取');
      return null;
    } finally { if (generation.current === current) setLoading(false); }
  }, [taskId]);
  useEffect(() => {
    setData(null); void refresh();
    return () => { generation.current += 1; controller.current?.abort(); };
  }, [refresh]);
  return { data, loading, error, refresh };
}
