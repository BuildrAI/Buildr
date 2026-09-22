import { useContext, useEffect, useState } from 'react';
import { WorkspaceViewActiveContext } from '../../../app/pageTabs';
import { useWorkbenchPreferences } from '../../workbench/hooks/useWorkbenchPreferences';
import type { TaskRecord } from '../../../../build/generated/task-dto';

/** Recent task visits are useful independently of whether a collection button is shown. */
export function useTaskVisit(workspaceId: string | null, record?: TaskRecord) {
  const active = useContext(WorkspaceViewActiveContext);
  const { recordVisit } = useWorkbenchPreferences(workspaceId);
  const [error, setError] = useState<string | null>(null);
  const taskId = record?.taskId, title = record?.title;
  useEffect(() => {
    if (!active || !workspaceId || !taskId || !title) return;
    let cancelled = false;
    setError(null);
    void recordVisit({ kind: 'task', key: `task:${taskId}`, label: title, href: `/workspaces/${workspaceId}/tasks/${encodeURIComponent(taskId)}` }).catch(cause => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : '最近访问记录未保存');
    });
    return () => { cancelled = true; };
  }, [active, workspaceId, taskId, title, recordVisit]);
  return error;
}
