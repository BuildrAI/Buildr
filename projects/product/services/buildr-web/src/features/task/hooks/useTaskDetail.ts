import { workspaceApi, type WorkspaceResponse } from '../../workspace/api/workspace-api';
import { useCallback, useEffect, useRef, useState } from 'react';


import { taskApi } from '../api/task-api';
import type { TaskDetailResponse } from '../../../../build/generated/task-dto';
import type { TaskReadLifecycle } from './useTaskRequestLifecycle';

export type { WorkspaceResponse } from '../../workspace/api/workspace-api';

type Input = {
  taskId: string;
  workspaceName?: string;
  lifecycle: TaskReadLifecycle;
  onWorkspace(payload: WorkspaceResponse): void;
  onBreadcrumb(workspaceName: string, taskTitle: string): void;
};

export function useTaskDetail({ taskId, lifecycle, onWorkspace, onBreadcrumb, workspaceName }: Input) {
  const [data, setData] = useState<TaskDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const workspaceNameRef = useRef(workspaceName);
  workspaceNameRef.current = workspaceName;
  const taskIdRef = useRef(taskId);
  taskIdRef.current = taskId;

  const apply = useCallback((next: TaskDetailResponse, workspaceName: string) => {
    setData(next);
    onBreadcrumb(workspaceName, next.record.title);
  }, [onBreadcrumb]);

  const refresh = useCallback(async () => {
    const currentTaskId = taskId;
    const detail = await lifecycle.run(currentTaskId, 'detail', (signal) => taskApi.detail(currentTaskId, { signal }));
    if (taskIdRef.current !== currentTaskId) return;
    apply(detail, workspaceNameRef.current || '工作空间');
  }, [taskId, lifecycle, apply]);

  useEffect(() => {
    if (workspaceName) return;
    let cancelled = false;
    void lifecycle.run(taskId, 'workspace', signal => workspaceApi.read({ signal }))
      .then(workspace => { if (!cancelled) onWorkspace(workspace); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [taskId, workspaceName, lifecycle, onWorkspace]);

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
