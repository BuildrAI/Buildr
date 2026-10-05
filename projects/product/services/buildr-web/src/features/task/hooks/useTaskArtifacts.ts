import { projectApi } from '../../project/api/project-api';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createTaskMaterialsLoader, type TaskMaterialsState } from '../task-materials';

import { type ApiError } from '../../../api';
import { resolveTaskDocumentReference, type RegisteredProject, type TaskDocumentReference } from '../../../lib/taskDocumentLinks';
import { taskApi } from '../api/task-api';
import type { TaskDetailResponse } from '../../../../build/generated/task-dto';
import type { ChangePayload } from '../../../components/ChangeBriefPanel';
import type { UiPrototypeData } from '../components/PrototypeTab';
import { isTaskReadCancelled, type TaskReadLifecycle } from './useTaskRequestLifecycle';

export type { TaskProjectDocument as WorkspaceDocument } from '../api/task-api';

export type TaskBriefState =
  | { kind: 'empty' }
  | { kind: 'missing'; key: string; message: string }
  | { kind: 'ready'; key: string; change: ChangePayload; provenance: string };

// Session-only, bounded by task count. Never share task content between workspaces.
const materialCache = new Map<string, { references: string; briefs: TaskBriefState[] }>();
const taskMaterialCache = new Map<string, { recordDigest: string; state: TaskMaterialsState }>();
const materialKey = (workspaceId: string | null, taskId: string) => JSON.stringify([workspaceId, taskId]);

export function useTaskArtifacts(taskId: string, data: TaskDetailResponse | null, lifecycle: TaskReadLifecycle, workspaceId: string | null = null) {
  const key = materialKey(workspaceId, taskId);
  const references = data?.record.taskId === taskId ? data.record.changes : null;
  const referenceIdentity = references === null ? null : JSON.stringify(references);
  const recordDigest = data?.record.taskId === taskId ? data.recordDigest : null;
  const cached = materialCache.get(key);
  const [briefState, setBriefState] = useState<{ key: string; references: string; briefs: TaskBriefState[]; loading: boolean } | null>(null);
  const visibleState = briefState?.key === key && briefState.references === referenceIdentity ? briefState : null;
  const briefs = visibleState?.briefs ?? (cached?.references === referenceIdentity ? cached.briefs : []);
  const briefsLoading = references === null || (references.length > 0 && (visibleState?.loading ?? true));
  const [materialsState, setMaterialsState] = useState<{ key: string; recordDigest: string | null; state: TaskMaterialsState } | null>(null);
  const cachedMaterials = taskMaterialCache.get(key);
  const materials = materialsState?.key === key && materialsState.recordDigest === recordDigest
    ? materialsState.state
    : cachedMaterials?.recordDigest === recordDigest ? cachedMaterials.state : { taskId, data: null, loading: true, error: null };
  const materialsLoaderRef = useRef<ReturnType<typeof createTaskMaterialsLoader> | null>(null);
  const materialsSequence = useRef(0);
  const recordDigestRef = useRef(recordDigest);
  recordDigestRef.current = recordDigest;
  const [prototypeData, setPrototypeData] = useState<UiPrototypeData | null>(null);
  const [prototypeLoading, setPrototypeLoading] = useState(false);
  const [prototypeError, setPrototypeError] = useState<string | null>(null);
  const [documentReference, setDocumentReference] = useState<TaskDocumentReference | null>(null);
  const [documentError, setDocumentError] = useState<string | null>(null);
  const taskIdRef = useRef(taskId);
  const prototypeRequestRef = useRef(0);
  const briefsRequestRef = useRef(0);
  const projectRegistryRef = useRef<RegisteredProject[] | null>(null);
  taskIdRef.current = taskId;
  const materialKeyRef = useRef(key);
  materialKeyRef.current = key;

  useEffect(() => {
    const cached = taskMaterialCache.get(key);
    const retained = cached?.recordDigest === recordDigest ? cached.state : null;
    setMaterialsState({ key, recordDigest, state: retained || { taskId, data: null, loading: true, error: null } });
    const loader = createTaskMaterialsLoader(taskId, signal => lifecycle.run(taskId, `materials:${key}:${++materialsSequence.current}`, lifecycleSignal => taskApi.materials(taskId, { signal: AbortSignal.any([signal, lifecycleSignal]) }, workspaceId)), state => {
      if (materialKeyRef.current !== key || recordDigestRef.current !== recordDigest) return;
      const previous = taskMaterialCache.get(key);
      // Already-read content stays visible while a real revalidation runs. A failed
      // read never labels the retained bytes as a successfully refreshed version.
      const retainedData = previous?.recordDigest === recordDigest ? previous.state.data : null;
      const next = state.data ? state : { ...state, data: retainedData };
      if (next.data && recordDigest !== null) {
        taskMaterialCache.delete(key);
        taskMaterialCache.set(key, { recordDigest, state: next });
        while (taskMaterialCache.size > 32) taskMaterialCache.delete(taskMaterialCache.keys().next().value!);
      }
      setMaterialsState({ key, recordDigest, state: next });
    });
    materialsLoaderRef.current = loader;
    return () => { loader.dispose(); if (materialsLoaderRef.current === loader) materialsLoaderRef.current = null; };
  }, [taskId, key, lifecycle, recordDigest]);
  useEffect(() => {
    if (data?.record.taskId === taskId) void materialsLoaderRef.current?.refresh();
  }, [taskId, key, data?.record.taskId, data?.recordDigest]);
  const refreshMaterials = useCallback(() => materialsLoaderRef.current?.refresh() || Promise.resolve(), []);

  // Reset task-local readers before starting Change reads for the new task.
  useEffect(() => {
    setPrototypeData(null);
    setPrototypeError(null);
    setPrototypeLoading(false);
    setDocumentReference(null);
    setDocumentError(null);
    projectRegistryRef.current = null;
    prototypeRequestRef.current += 1;
    briefsRequestRef.current += 1;
  }, [taskId, workspaceId]);

  const loadBriefs = useCallback(async (references: TaskDetailResponse['record']['changes'], replacePending = false) => {
    if (materialKeyRef.current !== key) return;
    const requestId = ++briefsRequestRef.current;
    const identity = JSON.stringify(references);
    const previous = materialCache.get(key);
    const retained = previous?.references === identity ? previous.briefs : [];
    setBriefState({ key, references: identity, briefs: retained, loading: references.length > 0 });
    const currentTaskId = taskId;
    if (!references.length) {
      setBriefState({ key, references: identity, briefs: [{ kind: 'empty' }], loading: false });
      return;
    }
    try {
      const results = await Promise.all(references.map(async (reference) => {
        const changeKey = `${reference.project}/${reference.change}`;
        try {
          const detail = await lifecycle.run(currentTaskId, `change:${key}:${changeKey}`, signal => (
            taskApi.change(currentTaskId, reference.project, reference.change, { signal })
          ), { replacePending }) as { resolution: { workingCopy: { change: ChangePayload; provenance: string } } };
          return { kind: 'ready' as const, key: changeKey, change: detail.resolution.workingCopy.change, provenance: detail.resolution.workingCopy.provenance };
        } catch (cause) {
          if (isTaskReadCancelled(cause)) throw cause;
          return { kind: 'missing' as const, key: changeKey, message: `${changeKey} 当前不可读取：${cause instanceof Error ? cause.message : '读取失败'}` };
        }
      }));
      if (taskIdRef.current !== currentTaskId || materialKeyRef.current !== key || briefsRequestRef.current !== requestId) return;
      if (results.every(item => item.kind === 'ready')) {
        materialCache.delete(key);
        materialCache.set(key, { references: identity, briefs: results });
        if (materialCache.size > 20) materialCache.delete(materialCache.keys().next().value!);
      }
      // A failed refresh retains readable content and adds the current local diagnostic.
      const next = results.flatMap((item): TaskBriefState[] => item.kind === 'missing'
        ? [...retained.filter(old => old.kind === 'ready' && old.key === item.key), item]
        : [item]);
      setBriefState({ key, references: identity, briefs: next, loading: false });
    } catch (cause) {
      if (!isTaskReadCancelled(cause)) throw cause;
    }
  }, [taskId, key, lifecycle]);

  useEffect(() => {
    if (referenceIdentity !== null) void loadBriefs(JSON.parse(referenceIdentity));
    return () => { briefsRequestRef.current += 1; };
  }, [referenceIdentity, loadBriefs]);

  const refreshBriefs = useCallback((next = data) => next?.record.taskId === taskId
    ? loadBriefs(next.record.changes, true) : Promise.resolve(), [data, taskId, loadBriefs]);

  const refreshPrototype = useCallback(async () => {
    const requestId = ++prototypeRequestRef.current;
    const currentTaskId = taskId;
    setPrototypeLoading(true);
    setPrototypeError(null);
    try {
      const next = await lifecycle.run(currentTaskId, `ui-prototypes:${key}`, (signal) => (
        taskApi.prototypes(currentTaskId, { signal })
      )) as UiPrototypeData;
      if (prototypeRequestRef.current === requestId && taskIdRef.current === currentTaskId && materialKeyRef.current === key) setPrototypeData(next);
    } catch (cause) {
      if (!isTaskReadCancelled(cause) && prototypeRequestRef.current === requestId && taskIdRef.current === currentTaskId && materialKeyRef.current === key) {
        setPrototypeError(`${(cause as ApiError).code || 'task_ui_prototype_read_failed'}：${cause instanceof Error ? cause.message : '读取失败'}`);
        setPrototypeData(null);
      }
    } finally {
      if (prototypeRequestRef.current === requestId) setPrototypeLoading(false);
    }
  }, [taskId, key, lifecycle]);

  const openIntentDocument = useCallback(async (linkHref: string) => {
    if (!data) return;
    const currentTaskId = taskId;
    try {
      if (!projectRegistryRef.current) {
        const registry = await projectApi.listProjects({}, workspaceId);
        if (materialKeyRef.current !== key) return;
        projectRegistryRef.current = registry.projects || [];
      }
      if (taskIdRef.current !== currentTaskId || materialKeyRef.current !== key) return;
      const reference = resolveTaskDocumentReference(linkHref, { ...data.record.scope, changes: data.record.changes }, projectRegistryRef.current);
      if (!reference) {
        setDocumentError(`无法打开“${linkHref}”：仅支持当前任务范围内已登记项目的 Markdown 文档。`);
        return;
      }
      setDocumentError(null);
      setDocumentReference(reference);
    } catch (cause) {
      if (taskIdRef.current !== currentTaskId || materialKeyRef.current !== key) return;
      setDocumentError(cause instanceof Error ? cause.message : '读取项目文档入口失败。');
    }
  }, [data, taskId, key]);

  const openProjectDocument = useCallback(async (projectCode: string, documentPath: string, allowWorkspacePrefix = false) => {
    const currentTaskId = taskId;
    try {
      if (!projectRegistryRef.current) {
        const registry = await projectApi.listProjects({}, workspaceId);
        if (materialKeyRef.current !== key) return;
        projectRegistryRef.current = registry.projects || [];
      }
      if (taskIdRef.current !== currentTaskId || materialKeyRef.current !== key) return;
      const project = projectRegistryRef.current.find(item => item.code === projectCode);
      if (!project) throw new Error('文档所属项目当前不可读取。');
      const prefix = project.source?.path === '.' ? '' : `${project.source?.path || ''}/`;
      const href = allowWorkspacePrefix && prefix && documentPath.startsWith(prefix) ? documentPath : `${prefix}${documentPath}`;
      const reference = resolveTaskDocumentReference(href, { projects: [projectCode], services: [] }, [project]);
      if (!reference) throw new Error('链接不在当前项目的可读文档范围内。');
      setDocumentError(null); setDocumentReference(reference);
    } catch (cause) { if (taskIdRef.current === currentTaskId && materialKeyRef.current === key) setDocumentError(cause instanceof Error ? cause.message : '文档当前不可读取。'); }
  }, [taskId, key]);

  const openChangeDocument = useCallback((changeKey: string, documentPath: string) => openProjectDocument(changeKey.split('/')[0], documentPath, true), [openProjectDocument]);

  const loadProjectDocument = useCallback((reference: TaskDocumentReference, documentPath: string, signal?: AbortSignal) => (
    taskApi.projectDocument(taskId, reference.projectCode, documentPath, { signal }, workspaceId)
  ), [taskId, workspaceId]);

  return {
    materials,
    refreshMaterials,
    briefs,
    briefsLoading,
    refreshBriefs,
    prototypeData,
    prototypeLoading,
    prototypeError,
    refreshPrototype,
    documentReference,
    documentError,
    openIntentDocument,
    openChangeDocument,
    openProjectDocument,
    closeDocument: () => setDocumentReference(null),
    loadProjectDocument,
  };
}
