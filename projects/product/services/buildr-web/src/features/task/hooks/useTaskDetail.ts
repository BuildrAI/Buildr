import { useCallback, useEffect, useRef, useState } from 'react';

import { api } from '../../../api';
import { taskApi } from '../api/task-api';
import type { TaskDetailResponse } from '../api/generated/task-dto';
import type { TaskReadLifecycle } from './useTaskRequestLifecycle';

export type WorkspacePayload = { rootPath: string; workspace: { name: string } };

type Input = {
  taskId: string;
  lifecycle: TaskReadLifecycle;
  onWorkspace(payload: WorkspacePayload): void;
  onBreadcrumb(workspaceName: string, taskTitle: string): void;
};

export function useTaskDetail({ taskId, lifecycle, onWorkspace, onBreadcrumb }: Input) {
  const [data, setData] = useState<TaskDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const taskIdRef = useRef(taskId);
  taskIdRef.current = taskId;

  const apply = useCallback((next: TaskDetailResponse, workspaceName: string) => {
    setData(next);
    onBreadcrumb(workspaceName, next.record.title);
  }, [onBreadcrumb]);

  const refresh = useCallback(async () => {
    const currentTaskId = taskId;
    const [workspace, detail] = await lifecycle.run(currentTaskId, 'detail', (signal) => Promise.all([
      api('/api/v1/workspace', { signal }) as Promise<WorkspacePayload>,
      taskApi.detail(currentTaskId, { signal }),
    ]));
    if (taskIdRef.current !== currentTaskId) return;
    onWorkspace(workspace);
    apply(detail, workspace.workspace.name);
  }, [taskId, lifecycle, onWorkspace, apply]);

  useEffect(() => {
    setData(null);
    setError(null);
    let cancelled = false;
    void refresh().catch((cause) => {
      if (!cancelled && taskIdRef.current === taskId) {
        setError(cause instanceof Error ? cause.message : '任务不可用');
      }
    });
    return () => {
      cancelled = true;
      lifecycle.abortTask(taskId);
    };
  }, [taskId, refresh, lifecycle]);

  return { data, error, refresh };
}
