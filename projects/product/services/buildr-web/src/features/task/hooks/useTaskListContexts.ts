import { useEffect, useRef, useState } from 'react';
import type { TaskWorkContextResponse } from '../../../../build/generated/workbench-dto';
import type { TaskListItem } from './useTaskList';
import { readTaskWorkContexts } from '../api/task-work-context-api';

/** Batch current facts for visible records without one request per row. */
export function useTaskListContexts(workspaceId: string | null, tasks: TaskListItem[], revision: number) {
  const [contexts, setContexts] = useState<Record<string, TaskWorkContextResponse>>({});
  const cache = useRef<Record<string, TaskWorkContextResponse>>({});
  const [error, setError] = useState(false);
  const cachedWorkspace = useRef(workspaceId);
  const cachedRevision = useRef(revision);
  const ids = tasks.map(item => item.record.taskId);
  const identity = ids.join(',');
  useEffect(() => {
    setError(false);
    if (cachedWorkspace.current !== workspaceId) { cachedWorkspace.current = workspaceId; cache.current = {}; setContexts({}); }
    if (cachedRevision.current !== revision) { cachedRevision.current = revision; cache.current = {}; }
    if (!workspaceId || !identity) { cache.current = {}; setContexts({}); return; }
    const missing = ids.filter(id => !cache.current[id]);
    const controller = new AbortController();
    void (async () => {
      try {
        for (let offset = 0; offset < missing.length; offset += 100) {
          const response = await readTaskWorkContexts(missing.slice(offset, offset + 100), controller.signal);
          if (controller.signal.aborted) return;
          cache.current = { ...cache.current, ...Object.fromEntries(response.items.map(item => [item.taskId, item])) };
          setContexts(cache.current);
        }
      } catch { if (!controller.signal.aborted) setError(true); }
    })();
    return () => controller.abort();
  }, [workspaceId, identity, revision]);
  return { contexts, error };
}
