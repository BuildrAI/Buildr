import { useCallback, useEffect, useRef, useState } from 'react';

import { api } from '../../../api';
import { resolveTaskDocumentReference, type RegisteredProject, type TaskDocumentReference } from '../../../lib/taskDocumentLinks';
import { taskApi } from '../api/task-api';
import type { TaskDetailResponse } from '../api/generated/task-dto';
import type { ChangePayload } from '../../../components/ChangeBriefPanel';
import type { UiPrototypeData } from '../components/PrototypeTab';
import { isTaskReadCancelled, type TaskReadLifecycle } from './useTaskRequestLifecycle';

export type TaskBriefState =
  | { kind: 'empty' }
  | { kind: 'missing'; key: string; message: string }
  | { kind: 'ready'; key: string; change: ChangePayload };

export type ProjectDocument = {
  path?: string;
  name: string;
  exists: boolean;
  content: string | null;
};

type ApiFailure = Error & { code?: string };

export function useTaskArtifacts(taskId: string, data: TaskDetailResponse | null, lifecycle: TaskReadLifecycle) {
  const [briefs, setBriefs] = useState<TaskBriefState[]>([]);
  const [prototypeData, setPrototypeData] = useState<UiPrototypeData | null>(null);
  const [prototypeLoading, setPrototypeLoading] = useState(false);
  const [prototypeError, setPrototypeError] = useState<string | null>(null);
  const [documentReference, setDocumentReference] = useState<TaskDocumentReference | null>(null);
  const [documentError, setDocumentError] = useState<string | null>(null);
  const taskIdRef = useRef(taskId);
  const prototypeRequestRef = useRef(0);
  const projectRegistryRef = useRef<RegisteredProject[] | null>(null);
  taskIdRef.current = taskId;

  const loadBriefs = useCallback(async (references: TaskDetailResponse['record']['changes']) => {
    if (!references.length) {
      setBriefs([{ kind: 'empty' }]);
      return;
    }
    const currentTaskId = taskId;
    const results = await Promise.all(references.map(async (reference) => {
      const key = `${reference.project}/${reference.change}`;
      try {
        const detail = await lifecycle.run(currentTaskId, `change:${key}`, (signal) => (
          taskApi.change(currentTaskId, reference.project, reference.change, { signal })
        )) as { resolution: { workingCopy: { change: ChangePayload } } };
        return { kind: 'ready' as const, key, change: detail.resolution.workingCopy.change };
      } catch (cause) {
        return {
          kind: 'missing' as const,
          key,
          message: `${key} 当前不可读取：${cause instanceof Error ? cause.message : '读取失败'}`,
        };
      }
    }));
    if (taskIdRef.current === currentTaskId) setBriefs(results);
  }, [taskId, lifecycle]);

  useEffect(() => {
    setBriefs([]);
    if (data?.record.taskId === taskId) void loadBriefs(data.record.changes);
  }, [taskId, data?.record.taskId, data?.record.changes, loadBriefs]);

  useEffect(() => {
    setPrototypeData(null);
    setPrototypeError(null);
    setPrototypeLoading(false);
    setDocumentReference(null);
    setDocumentError(null);
    projectRegistryRef.current = null;
    prototypeRequestRef.current += 1;
  }, [taskId]);

  const refreshPrototype = useCallback(async () => {
    const requestId = ++prototypeRequestRef.current;
    const currentTaskId = taskId;
    setPrototypeLoading(true);
    setPrototypeError(null);
    try {
      const next = await lifecycle.run(currentTaskId, 'ui-prototypes', (signal) => (
        taskApi.prototypes(currentTaskId, { signal })
      )) as UiPrototypeData;
      if (prototypeRequestRef.current === requestId && taskIdRef.current === currentTaskId) setPrototypeData(next);
    } catch (cause) {
      if (!isTaskReadCancelled(cause) && prototypeRequestRef.current === requestId && taskIdRef.current === currentTaskId) {
        setPrototypeError(`${(cause as ApiFailure).code || 'task_ui_prototype_read_failed'}：${cause instanceof Error ? cause.message : '读取失败'}`);
        setPrototypeData(null);
      }
    } finally {
      if (prototypeRequestRef.current === requestId) setPrototypeLoading(false);
    }
  }, [taskId, lifecycle]);

  const openIntentDocument = useCallback(async (linkHref: string) => {
    if (!data) return;
    try {
      if (!projectRegistryRef.current) {
        const registry = await api('/api/v1/projects') as { projects?: RegisteredProject[] };
        projectRegistryRef.current = registry.projects || [];
      }
      const reference = resolveTaskDocumentReference(linkHref, data.record.scope, projectRegistryRef.current);
      if (!reference) {
        setDocumentError(`无法打开“${linkHref}”：仅支持当前任务范围内已登记项目的 Markdown 文档。`);
        return;
      }
      setDocumentError(null);
      setDocumentReference(reference);
    } catch (cause) {
      setDocumentError(cause instanceof Error ? cause.message : '读取项目文档入口失败。');
    }
  }, [data]);

  const loadProjectDocument = useCallback((reference: TaskDocumentReference, documentPath: string) => (
    api(`/api/v1/projects/${encodeURIComponent(reference.projectCode)}/documents/${documentPath}`) as Promise<ProjectDocument>
  ), []);

  return {
    briefs,
    prototypeData,
    prototypeLoading,
    prototypeError,
    refreshPrototype,
    documentReference,
    documentError,
    openIntentDocument,
    closeDocument: () => setDocumentReference(null),
    loadProjectDocument,
  };
}
