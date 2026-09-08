import { workspaceApi } from '../../workspace/api/workspace-api';
import { useEffect, useState } from 'react';


import { useAppShell } from '../../../app/AppShellContext';
import type { ChangePayload } from '../../../components/ChangeBriefPanel';
import { taskApi } from '../api/task-api';

type ChangeDetailResponse = {
  resolution: {
    workingCopy: { provenance: string; root: string; change: ChangePayload };
    retainedBaseline: { provenance: string; root: string } | null;
  };
};

export function useTaskChangeDetail(taskId: string, projectCode: string, changeCode: string) {
  const { setWorkspace, setBreadcrumbParts } = useAppShell();
  const [change, setChange] = useState<ChangePayload | null>(null);
  const [provenance, setProvenance] = useState<Array<[string, string]>>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const [workspace, data] = await Promise.all([
          workspaceApi.read({ signal: controller.signal }),
          taskApi.change(taskId, projectCode, changeCode, { signal: controller.signal }) as Promise<ChangeDetailResponse>,
        ]);
        if (controller.signal.aborted) return;
        const next = data.resolution.workingCopy.change;
        setWorkspace(workspace);
        setChange(next);
        setProvenance([
          ['工作副本', `${data.resolution.workingCopy.provenance} · ${data.resolution.workingCopy.root}`],
          ['保留基线', data.resolution.retainedBaseline
            ? `${data.resolution.retainedBaseline.provenance} · ${data.resolution.retainedBaseline.root}`
            : '无独立保留基线'],
        ]);
        setBreadcrumbParts([workspace.workspace.name, '任务', taskId, '变更', next.name]);
      } catch (reason) {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : '变更不可用');
      }
    })();
    return () => controller.abort();
  }, [taskId, projectCode, changeCode, setWorkspace, setBreadcrumbParts]);

  return { change, provenance, error };
}
