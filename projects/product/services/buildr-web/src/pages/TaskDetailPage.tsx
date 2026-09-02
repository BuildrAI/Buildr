import { ParentCompletionFields } from './task-detail/ParentCompletionFields';
import { emptyParentCompletionDraft, parentCompletionInput } from './task-detail/parentCoordination';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button, Input, Modal, Select } from 'antd';
import { api, taskProfessionalApi, tasksApi, type ApiError } from '../api';
import { createTaskReadLifecycle, isTaskReadCancelled } from '../api/taskReadLifecycle';
import { useAppShell } from '../app/AppShellContext';
import { MarkdownHost } from '../components/MarkdownHost';
import { confirmModal } from '../lib/confirm';
import { resolveTaskDocumentReference, type RegisteredProject, type TaskDocumentReference } from '../lib/taskDocumentLinks';
import { ChangeBriefPanel, type ChangePayload } from './TaskChangeDetailPage';
import { workspaceHref } from '../lib/labels';
import { formatDateTime, taskStatusLabel } from '../lib/taskLabels';
import { EnvironmentTab } from './task-detail/EnvironmentTab';
import { EvidenceTab } from './task-detail/EvidenceTab';
import { RetrospectiveTab } from './task-detail/RetrospectiveTab';
import { ParentCoordinationPanel } from './task-detail/ParentCoordinationPanel';
import { TaskDocumentPreviewModal } from './task-detail/TaskDocumentPreviewModal';
import { TaskOutcomeSummary } from './task-detail/TaskOutcomeSummary';
import type { ParentCoordinationResult } from './task-detail/parentCoordination';
import { PrototypeTab, type UiPrototypeData } from './task-detail/PrototypeTab';
import {
  diff,
  Fact,
  lines,
  parseLines,
  qualified,
  type TaskDetailData,
  type TaskTab,
} from './task-detail/shared';

type WorkspacePayload = { rootPath: string; workspace: { name: string } };

type BriefState =
  | { kind: 'empty' }
  | { kind: 'missing'; key: string; message: string }
  | { kind: 'ready'; key: string; change: ChangePayload };

const TABS: Array<{ id: TaskTab; label: string }> = [
  { id: 'overview', label: '概览' },
  { id: 'prototype', label: '原型' },
  { id: 'evidence', label: '证据' },
  { id: 'retrospective', label: '复盘' },
  { id: 'environment', label: '环境' },
];

export function TaskDetailPage() {
  const { taskId = '' } = useParams();
  const { workspaceId, setWorkspace, setBreadcrumbParts, openAgentAction } = useAppShell();
  const href = (path: string) => workspaceHref(workspaceId, path);

  const [data, setData] = useState<TaskDetailData | null>(null);
  const [overviewData, setOverviewData] = useState<any>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [coordinationData, setCoordinationData] = useState<ParentCoordinationResult | null>(null);
  const [coordinationLoading, setCoordinationLoading] = useState(false);
  const currentCoordination = coordinationData?.taskId === taskId ? coordinationData : null;
  const [pageError, setPageError] = useState<string | null>(null);
  const [alert, setAlert] = useState<{ message: string; error: boolean } | null>(null);
  const [editState, setEditState] = useState('可以修改');
  const [activeTab, setActiveTab] = useState<TaskTab>('overview');
  const [briefs, setBriefs] = useState<BriefState[]>([]);
  const [prototypeData, setPrototypeData] = useState<UiPrototypeData | null>(null);
  const [prototypeLoading, setPrototypeLoading] = useState(false);
  const [prototypeError, setPrototypeError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [intent, setIntent] = useState('');
  const [projectsText, setProjectsText] = useState('');
  const [servicesText, setServicesText] = useState('');
  const [parentTaskId, setParentTaskId] = useState('');
  const [parentOptions, setParentOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [parentOptionsLoaded, setParentOptionsLoaded] = useState(false);
  const [parentOptionsLoading, setParentOptionsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [completionSnapshot, setCompletionSnapshot] = useState<ParentCoordinationResult | null>(null);
  const [completionRecordDigest, setCompletionRecordDigest] = useState('');
  const [completionDraft, setCompletionDraft] = useState(emptyParentCompletionDraft);
  const [completeSummary, setCompleteSummary] = useState('');
  const [completeNoChange, setCompleteNoChange] = useState('');
  const [abandonReason, setAbandonReason] = useState('');
  const [actionModal, setActionModal] = useState<null | 'edit' | 'complete' | 'abandon'>(null);
  const [documentReference, setDocumentReference] = useState<TaskDocumentReference | null>(null);

  const [environmentData, setEnvironmentData] = useState<any>(null);
  const [environmentLoading, setEnvironmentLoading] = useState(false);
  const [reviewData, setReviewData] = useState<any>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [verificationData, setVerificationData] = useState<any>(null);
  const [verificationLoading, setVerificationLoading] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [retrospectiveData, setRetrospectiveData] = useState<any>(null);
  const [retrospectiveLoading, setRetrospectiveLoading] = useState(false);
  const [retrospectiveMutating, setRetrospectiveMutating] = useState(false);
  const [retrospectiveError, setRetrospectiveError] = useState<string | null>(null);

  const dataRef = useRef(data);
  dataRef.current = data;
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;
  const taskIdRef = useRef(taskId);
  taskIdRef.current = taskId;
  const prototypeRequestRef = useRef(0);
  const overviewRequestRef = useRef(0);
  const coordinationRequestRef = useRef(0);
  const environmentRequestRef = useRef(0);
  const reviewRequestRef = useRef(0);
  const verificationRequestRef = useRef(0);
  const retrospectiveRequestRef = useRef(0);
  const retrospectiveMutationRef = useRef(0);
  const projectRegistryRef = useRef<RegisteredProject[] | null>(null);
  const taskReadLifecycleRef = useRef(createTaskReadLifecycle());
  const focusRefreshRef = useRef<() => void>(() => {});

  const applyRecord = useCallback((next: TaskDetailData, workspaceName?: string) => {
    setData(next);
    const record = next.record;
    setBreadcrumbParts([workspaceName || document.getElementById('shell-workspace-name')?.textContent || '工作空间', '任务', record.title]);
    setTitle(record.title);
    setIntent(record.intent);
    setProjectsText(lines(record.scope.projects));
    setServicesText(lines(record.scope.services, 'service'));
    setParentTaskId(record.parentTaskId || '');
    const options: Array<{ value: string; label: string }> = [{ value: '', label: '无 Parent（独立 Task）' }];
    if (record.parentTaskId && next.taskRelations.parent) {
      const parent = next.taskRelations.parent;
      options.push({
        value: parent.taskId,
        label: `${parent.title} · ${parent.taskId} · ${taskStatusLabel(parent.status)}`,
      });
    }
    setParentOptions(options);
    setParentOptionsLoaded(false);
    setCompleteNoChange(record.status === 'todo' ? 'true' : '');
  }, [setBreadcrumbParts]);

  const loadBriefs = useCallback(async (references: TaskDetailData['record']['changes']) => {
    if (!references.length) {
      setBriefs([{ kind: 'empty' }]);
      return;
    }
    const results = await Promise.all(references.map(async (reference) => {
      const key = `${reference.project}/${reference.change}`;
      try {
        const detail = await taskReadLifecycleRef.current.run(taskId, `change:${key}`, (signal) => (
          api(`/api/v1/tasks/${encodeURIComponent(taskId)}/changes/${encodeURIComponent(reference.project)}/${encodeURIComponent(reference.change)}`, { signal })
        )) as { resolution: { workingCopy: { change: ChangePayload } } };
        return { kind: 'ready' as const, key, change: detail.resolution.workingCopy.change };
      } catch (err) {
        return {
          kind: 'missing' as const,
          key,
          message: `${key} 当前不可读取：${err instanceof Error ? err.message : '读取失败'}`,
        };
      }
    }));
    if (taskIdRef.current === taskId) setBriefs(results);
  }, [taskId]);

  const refresh = useCallback(async () => {
    const [workspace, detail] = await taskReadLifecycleRef.current.run(taskId, 'detail', (signal) => Promise.all([
      api('/api/v1/workspace', { signal }) as Promise<WorkspacePayload>,
      tasksApi.detail(taskId, { signal }),
    ]));
    if (taskIdRef.current !== taskId) return;
    setWorkspace(workspace);
    applyRecord(detail, workspace.workspace.name);
    void loadBriefs(detail.record.changes);
  }, [taskId, setWorkspace, applyRecord, loadBriefs]);

  const refreshOverview = useCallback(async () => {
    const requestId = ++overviewRequestRef.current;
    const currentTaskId = taskId;
    setOverviewLoading(true);
    try {
      const next = await taskReadLifecycleRef.current.run(currentTaskId, 'overview', (signal) => (
        taskProfessionalApi.overview(currentTaskId, { signal })
      ));
      if (overviewRequestRef.current === requestId && taskIdRef.current === currentTaskId) setOverviewData(next);
    } catch (err) {
      if (!isTaskReadCancelled(err) && overviewRequestRef.current === requestId && taskIdRef.current === currentTaskId) {
        setOverviewData({ error: `${(err as ApiError).code || 'task_overview_read_failed'}：${err instanceof Error ? err.message : '读取失败'}` });
      }
    } finally {
      if (overviewRequestRef.current === requestId) setOverviewLoading(false);
    }
  }, [taskId]);

  const refreshCoordination = useCallback(async () => {
    const requestId = ++coordinationRequestRef.current;
    const currentTaskId = taskId;
    setCoordinationLoading(true);
    try {
      const next = await taskReadLifecycleRef.current.run(currentTaskId, 'coordination', (signal) => (
        taskProfessionalApi.coordination(currentTaskId, { signal })
      )) as ParentCoordinationResult;
      if (coordinationRequestRef.current === requestId && taskIdRef.current === currentTaskId) setCoordinationData(next);
    } catch (err) {
      if (!isTaskReadCancelled(err) && coordinationRequestRef.current === requestId && taskIdRef.current === currentTaskId) {
        setCoordinationData({ diagnostic: { code: (err as ApiError).code || 'parent_coordination_read_failed', message: err instanceof Error ? err.message : '读取失败' } });
      }
    } finally {
      if (coordinationRequestRef.current === requestId) setCoordinationLoading(false);
    }
  }, [taskId]);

  const refreshPrototype = useCallback(async () => {
    const requestId = ++prototypeRequestRef.current;
    const currentTaskId = taskId;
    setPrototypeLoading(true);
    setPrototypeError(null);
    try {
      const next = await taskReadLifecycleRef.current.run(currentTaskId, 'ui-prototypes', (signal) => (
        api(`/api/v1/tasks/${encodeURIComponent(currentTaskId)}/ui-prototypes`, { signal })
      )) as UiPrototypeData;
      if (prototypeRequestRef.current === requestId && taskIdRef.current === currentTaskId) setPrototypeData(next);
    } catch (err) {
      if (!isTaskReadCancelled(err) && prototypeRequestRef.current === requestId && taskIdRef.current === currentTaskId) {
        setPrototypeError(`${(err as ApiError).code || 'task_ui_prototype_read_failed'}：${err instanceof Error ? err.message : '读取失败'}`);
        setPrototypeData(null);
      }
    } finally {
      if (prototypeRequestRef.current === requestId) setPrototypeLoading(false);
    }
  }, [taskId]);

  const refreshEnvironment = useCallback(async () => {
    const requestId = ++environmentRequestRef.current;
    const currentTaskId = taskId;
    setEnvironmentLoading(true);
    try {
      const next = await taskReadLifecycleRef.current.run(currentTaskId, 'environment', (signal) => (
        taskProfessionalApi.environment(currentTaskId, { signal })
      ));
      if (environmentRequestRef.current === requestId && taskIdRef.current === currentTaskId) {
        setEnvironmentData(next);
      }
    } catch (err) {
      if (!isTaskReadCancelled(err) && environmentRequestRef.current === requestId && taskIdRef.current === currentTaskId) {
        setEnvironmentData({
          status: 'blocked',
          source: 'current-machine',
          observedAt: new Date().toISOString(),
          receipt: { available: false, path: '—' },
          environment: null,
          diagnostic: { code: (err as ApiError).code || 'environment_read_failed', message: err instanceof Error ? err.message : '读取失败' },
          nextActions: ['确认任务与当前工作空间后重试。'],
        });
      }
    } finally {
      if (environmentRequestRef.current === requestId) setEnvironmentLoading(false);
    }
  }, [taskId]);

  const refreshReview = useCallback(async () => {
    const requestId = ++reviewRequestRef.current;
    const currentTaskId = taskId;
    setReviewLoading(true);
    setReviewError(null);
    try {
      const next = await taskReadLifecycleRef.current.run(currentTaskId, 'reviews', (signal) => (
        taskProfessionalApi.reviews(currentTaskId, { signal })
      ));
      if (reviewRequestRef.current === requestId && taskIdRef.current === currentTaskId) {
        setReviewData(next);
      }
    } catch (err) {
      if (!isTaskReadCancelled(err) && reviewRequestRef.current === requestId && taskIdRef.current === currentTaskId) {
        setReviewError(`${(err as ApiError).code || 'task_review_read_failed'}：${err instanceof Error ? err.message : '读取失败'}`);
      }
    } finally {
      if (reviewRequestRef.current === requestId) setReviewLoading(false);
    }
  }, [taskId]);

  const refreshVerification = useCallback(async () => {
    const requestId = ++verificationRequestRef.current;
    const currentTaskId = taskId;
    setVerificationLoading(true);
    setVerificationError(null);
    try {
      const next = await taskReadLifecycleRef.current.run(currentTaskId, 'verification', (signal) => (
        taskProfessionalApi.verification(currentTaskId, { signal })
      ));
      if (verificationRequestRef.current === requestId && taskIdRef.current === currentTaskId) {
        setVerificationData(next);
      }
    } catch (err) {
      if (!isTaskReadCancelled(err) && verificationRequestRef.current === requestId && taskIdRef.current === currentTaskId) {
        setVerificationError(`${(err as ApiError).code || 'task_verification_read_failed'}：${err instanceof Error ? err.message : '读取失败'}`);
      }
    } finally {
      if (verificationRequestRef.current === requestId) setVerificationLoading(false);
    }
  }, [taskId]);

  const refreshRetrospective = useCallback(async () => {
    const requestId = ++retrospectiveRequestRef.current;
    const currentTaskId = taskId;
    setRetrospectiveLoading(true);
    setRetrospectiveError(null);
    try {
      const next = await taskReadLifecycleRef.current.run(currentTaskId, 'retrospective', (signal) => (
        taskProfessionalApi.retrospective(currentTaskId, { signal })
      ));
      if (retrospectiveRequestRef.current === requestId && taskIdRef.current === currentTaskId) {
        setRetrospectiveData(next);
      }
    } catch (err) {
      if (!isTaskReadCancelled(err) && retrospectiveRequestRef.current === requestId && taskIdRef.current === currentTaskId) {
        setRetrospectiveError(`${(err as ApiError).code || 'task_retrospective_read_failed'}：${err instanceof Error ? err.message : '读取失败'}`);
        setRetrospectiveData(null);
      }
    } finally {
      if (retrospectiveRequestRef.current === requestId) setRetrospectiveLoading(false);
    }
  }, [taskId]);

  const handleRetrospective = useCallback(async (status: 'pending' | 'handled' | 'no-action', note?: string) => {
    const currentTaskId = taskId;
    const currentDigest = retrospectiveData?.slot?.currentDigest;
    if (!currentDigest) return;
    const mutationId = ++retrospectiveMutationRef.current;
    setRetrospectiveMutating(true);
    setRetrospectiveError(null);
    try {
      const next = await taskProfessionalApi.updateRetrospective(currentTaskId, { status, note, expectedCurrentDigest: currentDigest });
      if (retrospectiveMutationRef.current === mutationId && taskIdRef.current === currentTaskId) setRetrospectiveData(next);
    } catch (err) {
      const apiError = err as ApiError;
      if (retrospectiveMutationRef.current !== mutationId || taskIdRef.current !== currentTaskId) return;
      if (apiError.code === 'task_retrospective_conflict') {
        await refreshRetrospective();
        if (retrospectiveMutationRef.current === mutationId && taskIdRef.current === currentTaskId) {
          setRetrospectiveError('复盘处置已被其他操作更新，已刷新为最新状态，请重新判断。');
        }
      } else {
        setRetrospectiveError(`${apiError.code || 'task_retrospective_handle_failed'}：${err instanceof Error ? err.message : '处置失败'}`);
      }
    } finally {
      if (retrospectiveMutationRef.current === mutationId) setRetrospectiveMutating(false);
    }
  }, [retrospectiveData?.slot?.currentDigest, refreshRetrospective, taskId]);

  const selectTab = useCallback((tab: TaskTab) => {
    setActiveTab(tab);
    if (tab === 'overview') {
      void refreshOverview();
      void refreshCoordination();
    }
    if (tab === 'prototype') void refreshPrototype();
    if (tab === 'environment') void refreshEnvironment();
    if (tab === 'evidence') {
      void refreshReview();
      void refreshVerification();
    }
    if (tab === 'retrospective') void refreshRetrospective();
  }, [refreshOverview, refreshCoordination, refreshPrototype, refreshEnvironment, refreshReview, refreshVerification, refreshRetrospective]);

  useEffect(() => {
    setPageError(null);
    setAlert(null);
    setData(null);
    setActiveTab('overview');
    setOverviewData(null);
    setCoordinationData(null);
    setPrototypeData(null);
    setPrototypeError(null);
    setEnvironmentData(null);
    setReviewData(null);
    setVerificationData(null);
    setRetrospectiveData(null);
    setBriefs([]);
    setCompleteSummary('');
    setCompleteNoChange('');
    setAbandonReason('');
    setActionModal(null);
    setDocumentReference(null);
    projectRegistryRef.current = null;
    setEditState('可以修改');
    prototypeRequestRef.current += 1;
    overviewRequestRef.current += 1;
    coordinationRequestRef.current += 1;
    environmentRequestRef.current += 1;
    reviewRequestRef.current += 1;
    verificationRequestRef.current += 1;
    retrospectiveRequestRef.current += 1;
    retrospectiveMutationRef.current += 1;
    setPrototypeLoading(false);
    setOverviewLoading(false);
    setCoordinationLoading(false);
    setEnvironmentLoading(false);
    setReviewLoading(false);
    setVerificationLoading(false);
    setRetrospectiveLoading(false);
    setRetrospectiveMutating(false);

    let cancelled = false;
    void (async () => {
      try {
        await Promise.all([refresh(), refreshOverview(), refreshCoordination()]);
      } catch (err) {
        if (!cancelled && taskIdRef.current === taskId) {
          setPageError(err instanceof Error ? err.message : '任务不可用');
        }
      }
    })();
    return () => {
      cancelled = true;
      taskReadLifecycleRef.current.abortTask(taskId);
    };
  }, [taskId, refresh, refreshOverview, refreshCoordination]);

  focusRefreshRef.current = () => {
    const tab = activeTabRef.current;
    if (tab === 'overview') {
      void refreshOverview();
      void refreshCoordination();
    }
    if (tab === 'environment') void refreshEnvironment();
    if (tab === 'evidence') {
      void refreshReview();
      void refreshVerification();
    }
    if (tab === 'retrospective') void refreshRetrospective();
  };

  useEffect(() => {
    const onFocus = () => focusRefreshRef.current();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  const loadParentOptions = async () => {
    const current = dataRef.current;
    if (!current || parentOptionsLoaded || parentOptionsLoading || !['todo', 'active'].includes(current.record.status)) return;
    setParentOptionsLoading(true);
    try {
      const list = await tasksApi.list({ status: 'active' });
      const record = current.record;
      const options: Array<{ value: string; label: string }> = [{ value: '', label: '无 Parent（独立 Task）' }];
      if (record.parentTaskId && current.taskRelations.parent) {
        const parent = current.taskRelations.parent;
        options.push({
          value: parent.taskId,
          label: `${parent.title} · ${parent.taskId} · ${taskStatusLabel(parent.status)}`,
        });
      }
      for (const item of list.tasks.filter((entry) => entry.record.taskId !== record.taskId && entry.record.taskId !== record.parentTaskId)) {
        options.push({
          value: item.record.taskId,
          label: `${item.record.title} · ${item.record.taskId} · ${taskStatusLabel(item.record.status)}`,
        });
      }
      setParentOptions(options);
      setParentTaskId(record.parentTaskId || '');
      setParentOptionsLoaded(true);
    } catch (err) {
      const error = err as ApiError;
      setAlert({
        message: error.code === 'task_record_conflict' ? `${error.message} 请刷新本页。` : (error.message || '读取失败'),
        error: error.code !== 'task_record_conflict',
      });
      setEditState(error.code === 'task_record_conflict' ? '记录已变化' : '保存失败');
    } finally {
      setParentOptionsLoading(false);
    }
  };

  const showMutationError = (error: ApiError) => {
    setAlert({
      message: error.code === 'task_record_conflict' ? `${error.message} 请刷新本页。` : (error.message || '操作失败'),
      error: error.code !== 'task_record_conflict',
    });
    setEditState(error.code === 'task_record_conflict' ? '记录已变化' : '保存失败');
  };

  const openIntentDocument = async (linkHref: string) => {
    const current = dataRef.current;
    if (!current) return;
    try {
      if (!projectRegistryRef.current) {
        const registry = await api('/api/v1/projects') as { projects?: RegisteredProject[] };
        projectRegistryRef.current = registry.projects || [];
      }
      const reference = resolveTaskDocumentReference(linkHref, current.record.scope, projectRegistryRef.current);
      if (!reference) {
        setAlert({
          message: `无法打开“${linkHref}”：仅支持当前任务范围内已登记项目的 Markdown 文档。`,
          error: true,
        });
        return;
      }
      setAlert(null);
      setDocumentReference(reference);
    } catch (error) {
      setAlert({ message: error instanceof Error ? error.message : '读取项目文档入口失败。', error: true });
    }
  };

  const onSave = async (event: FormEvent) => {
    event.preventDefault();
    if (!data) return;
    setSaving(true);
    setEditState('正在保存…');
    const record = data.record;
    const nextProjects = parseLines(projectsText);
    const nextServices = parseLines(servicesText).map((item) => qualified(item, 'service'));
    const projects = diff(record.scope.projects, nextProjects);
    const services = diff(record.scope.services, nextServices as Array<{ project: string; service: string }>, (item) => (
      typeof item === 'string' ? item : `${item.project}/${item.service}`
    ));
    const nextParentTaskId = parentTaskId || null;
    try {
      const updated = await tasksApi.update(taskId, {
        expectedRecordDigest: data.recordDigest,
        title,
        intent,
        ...(nextParentTaskId === record.parentTaskId ? {} : { parentTaskId: nextParentTaskId }),
        addProjects: projects.add,
        removeProjects: projects.remove,
        addServices: services.add,
        removeServices: services.remove,
      });
      await refresh();
      setEditState(updated.effects.length ? '保存成功' : '内容一致');
      setAlert(null);
      setActionModal(null);
    } catch (err) {
      showMutationError(err as ApiError);
    } finally {
      setSaving(false);
    }
  };

  const openComplete = async () => {
    if (!data) return;
    try {
      const snapshot = await taskProfessionalApi.coordination(taskId) as ParentCoordinationResult;
      setCompletionSnapshot(snapshot);
      setCompletionRecordDigest(snapshot.recordDigest || data.recordDigest);
      setCompletionDraft(emptyParentCompletionDraft());
      setActionModal('complete');
    } catch (error) { showMutationError(error as ApiError); }
  };

  const onComplete = async (event: FormEvent) => {
    event.preventDefault();
    if (!data || !completeNoChange || !completionSnapshot) return;
    try {
      const parentCompletion = completionSnapshot.isParent ? parentCompletionInput(completionSnapshot, completionDraft, taskId) : undefined;
      const ok = await confirmModal({
        title: parentCompletion ? '明确授权完成整个父任务？' : '确认完成？',
        content: parentCompletion ? '确认上述整体目标已完成，并授权更新这个父任务的状态。子任务状态保持不变。' : '只更新任务记录，不执行 Git、验证或环境清理。',
        okText: parentCompletion ? '授权并完成父任务' : '确认完成',
      });
      if (!ok) return;
      await tasksApi.complete(taskId, {
        expectedRecordDigest: completionRecordDigest,
        summary: completeSummary,
        noChange: completeNoChange === 'true',
        ...(parentCompletion ? { parentCompletion } : {}),
      });
      setActionModal(null);
      await refresh();
      await refreshCoordination();
      selectTab('overview');
    } catch (err) {
      showMutationError(err as ApiError);
      if (['parent_completion_conflict', 'task_record_conflict'].includes((err as ApiError).code || '')) {
        setCompletionDraft(emptyParentCompletionDraft());
        setActionModal(null);
        await refresh();
        await refreshCoordination();
      }
    }
  };

  const onAbandon = async (event: FormEvent) => {
    event.preventDefault();
    if (!data) return;
    const ok = await confirmModal({
      title: '确认放弃？',
      content: '确认只把顶层任务记录标记为放弃？这不会清理任务环境、执行 Git 或其他专业动作。',
      okText: '确认放弃',
      okButtonProps: { danger: true },
    });
    if (!ok) return;
    try {
      await tasksApi.abandon(taskId, {
        expectedRecordDigest: data.recordDigest,
        reason: abandonReason,
      });
      setActionModal(null);
      await refresh();
      selectTab('overview');
    } catch (err) {
      showMutationError(err as ApiError);
    }
  };

  if (pageError) {
    return (
      <>
        <section className="page-header">
          <h1>任务不可用</h1>
          <p className="page-copy">{pageError}</p>
        </section>
      </>
    );
  }

  if (!data) {
    return (
      <section className="detail-page-header">
        <div className="detail-title-row">
          <div className="detail-title-copy">
            <h1 id="task-detail-title">正在读取…</h1>
            <p id="task-detail-id" className="task-detail-id" />
            <p id="task-detail-intent" className="page-copy" />
          </div>
          <span id="task-detail-status" className="lifecycle-badge">—</span>
        </div>
      </section>
    );
  }

  const record = data.record;
  const terminal = !['todo', 'active'].includes(record.status);
  const resultText = record.result
    ? `${record.result.summary}${record.status === 'completed' ? `（${record.result.noChange ? '无需变更' : '有交付变更'}）` : ''}`
    : record.status === 'todo' ? '待办，尚未启动' : '进行中';

  return (
    <>
      <section className="detail-page-header">
        <div className="detail-title-row">
          <div className="detail-title-copy">
            <h1 id="task-detail-title">{record.title}</h1>
            <p id="task-detail-id" className="task-detail-id">{record.taskId}</p>
            <div id="task-detail-intent" className="page-copy task-intent-markdown">
              <MarkdownHost
                markdown={record.intent}
                options={{ allowRelativeLinks: true, onRelativeLinkClick: (linkHref) => { void openIntentDocument(linkHref); } }}
              />
            </div>
          </div>
          <span id="task-detail-status" className={`lifecycle-badge ${record.status}`}>{taskStatusLabel(record.status)}</span>
        </div>
      </section>
      <div id="task-detail-alert" className={`alert${alert ? '' : ' hidden'}${alert?.error ? ' error' : ''}`} role="status">
        {alert?.message || ''}
      </div>
      <nav className="detail-tabs" aria-label="任务详情">
        <div className="detail-tabs-list">
          {TABS.map((tab) => (
            <Button
              key={tab.id}
              className={`detail-tab${activeTab === tab.id ? ' active' : ''}`}
              type="text"
              data-task-tab={tab.id}
              aria-selected={activeTab === tab.id}
              onClick={() => selectTab(tab.id)}
            >
              {tab.label}
            </Button>
          ))}
        </div>
        <div id="task-active-actions" className={`detail-tab-actions${terminal ? ' hidden' : ''}`}>
          <Button id="task-edit-action" size="small" onClick={() => setActionModal('edit')}>
            {record.status === 'todo' ? '编辑待办意向' : '编辑进行中的任务'}
          </Button>
          <Button id="task-complete-action" size="small" onClick={() => void openComplete()}>
            {record.isParent ? '完成父任务' : '结束任务'}
          </Button>
          <Button id="task-abandon-action" size="small" danger onClick={() => setActionModal('abandon')}>
            放弃任务
          </Button>
        </div>
      </nav>

      <div id="task-overview-panel" className={activeTab === 'overview' ? '' : 'hidden'} data-task-panel="overview">
        <ParentCoordinationPanel
          data={currentCoordination}
          loading={coordinationLoading}
          onRefresh={() => { void refreshCoordination(); }}
          taskHref={(childTaskId) => href(`/tasks/${encodeURIComponent(childTaskId)}`)}
        />
        {!currentCoordination?.isParent && (
        <TaskOutcomeSummary
          summary={overviewData?.userSummary}
          loading={overviewLoading}
          onRefresh={() => { void refreshOverview(); }}
        />
        )}
        <details className={`task-technical-overview${currentCoordination?.mode === 'parent' ? ' parent-mode' : ' ordinary-mode'}`} open={!record.isParent}>
          <summary>技术事实、Change 与 Task Record</summary>
        <section className="panel" id="task-professional-overview" aria-live="polite">
          <div className="panel-heading">
            <div>
              <h2>专业进展摘要</h2>
              <p className="section-copy">一次只读查询组合各专业最近保存事实；顶层状态仍由 Task Record 管理。</p>
            </div>
            <Button onClick={() => { void refreshOverview(); }} disabled={overviewLoading}>{overviewLoading ? '读取中…' : '刷新摘要'}</Button>
          </div>
          {overviewData?.error ? <p className="alert error">{overviewData.error}</p> : (
            <dl className="read-facts detail-facts">
              <Fact label="规划审查" value={overviewData?.reviews?.planning?.present ? `${overviewData.reviews.planning.outcome} · ${formatDateTime(overviewData.reviews.planning.updatedAt)}` : '尚未记录'} />
              <Fact label="完成审查" value={overviewData?.reviews?.completion?.present ? `${overviewData.reviews.completion.outcome} · ${formatDateTime(overviewData.reviews.completion.updatedAt)}` : '尚未记录'} />
              <Fact label="正式验证" value={overviewData?.verification?.present ? `${overviewData.verification.outcome} · ${formatDateTime(overviewData.verification.updatedAt)}` : '尚未记录'} />
            </dl>
          )}
        </section>
        <section id="task-change-briefs" className="task-change-briefs" aria-live="polite">
          {briefs.map((item, index) => {
            if (item.kind === 'empty') {
              return currentCoordination?.mode === 'parent' ? null : <section key="empty" className="panel">这个任务没有关联 Change，因此没有 Brief 可展示。</section>;
            }
            if (item.kind === 'missing') {
              return <section key={item.key} className="panel brief-missing">{item.message}</section>;
            }
            return <ChangeBriefPanel key={item.key || index} change={item.change} />;
          })}
        </section>
        <section className="detail-layout">
          <article className="panel">
            <div className="panel-heading">
              <div>
                <h2>任务记录（Task Record）</h2>
                <p className="section-copy">只展示顶层任务事实；Parent/Child 表达管理层级，不自动推断状态或专业结果。</p>
              </div>
            </div>
            <dl className="read-facts detail-facts">
              <Fact label="任务 ID" value={<span id="task-detail-id">{record.taskId}</span>} />
              <div>
                <dt>Parent Task</dt>
                <dd id="task-detail-parent">
                  {data.taskRelations.parent ? (
                    <Link to={href(`/tasks/${encodeURIComponent(data.taskRelations.parent.taskId)}`)}>
                      {`${data.taskRelations.parent.title} · ${data.taskRelations.parent.taskId} · ${taskStatusLabel(data.taskRelations.parent.status)}`}
                    </Link>
                  ) : '无（独立 Task）'}
                </dd>
              </div>
              <div>
                <dt>直接 Child Tasks</dt>
                <dd id="task-detail-children">
                  {!data.taskRelations.children.length ? '无' : (
                    <span className="task-change-links">
                      {data.taskRelations.children.map((child) => (
                        <Link
                          key={child.taskId}
                          className={`task-change-link ${child.status}`}
                          to={href(`/tasks/${encodeURIComponent(child.taskId)}`)}
                        >
                          {`${child.title} · ${child.taskId} · ${taskStatusLabel(child.status)}`}
                        </Link>
                      ))}
                    </span>
                  )}
                </dd>
              </div>
              <div>
                <dt>复盘来源</dt>
                <dd id="task-detail-retrospective-sources">
                  {!data.retrospectiveRelations.sources.length ? '无' : (
                    <span className="task-change-links">
                      {data.retrospectiveRelations.sources.map((source) => (
                        <Link
                          key={source.taskId}
                          className={`task-change-link ${source.status}`}
                          to={href(`/tasks/${encodeURIComponent(source.taskId)}`)}
                        >
                          {`${source.title} · ${source.taskId} · ${taskStatusLabel(source.status)}`}
                        </Link>
                      ))}
                    </span>
                  )}
                </dd>
              </div>
              <Fact label="项目范围" value={<span id="task-detail-projects">{record.scope.projects.join('、') || '无'}</span>} />
              <Fact label="服务范围" value={<span id="task-detail-services">{lines(record.scope.services, 'service').replaceAll('\n', '、') || '无'}</span>} />
              <div>
                <dt>OpenSpec 变更</dt>
                <dd id="task-detail-changes">
                  {!record.changes.length ? '无' : (
                    <span className="task-change-links">
                      {record.changes.map((reference) => {
                        const key = `${reference.project}/${reference.change}`;
                        return (
                          <Link
                            key={key}
                            className="task-change-link available"
                            to={href(`/tasks/${encodeURIComponent(taskId)}/changes/${encodeURIComponent(reference.project)}/${encodeURIComponent(reference.change)}`)}
                          >
                            <strong>{key}</strong>
                            <small>打开时检查当前状态</small>
                          </Link>
                        );
                      })}
                    </span>
                  )}
                </dd>
              </div>
              <Fact label="结果" value={<span id="task-detail-result">{resultText}</span>} />
              <Fact label="创建时间" value={<span id="task-detail-created">{formatDateTime(record.createdAt)}</span>} />
              <Fact label="更新时间" value={<span id="task-detail-updated">{formatDateTime(record.updatedAt)}</span>} />
            </dl>
          </article>
          <aside className="panel facts-panel">
            <p className="eyebrow">技术事实</p>
            <h2>读取证据</h2>
            <dl className="fact-list">
              <Fact label="数据格式" value="buildr.task-record/v2" />
              <Fact label="存储范围" value="Workspace 本地数据" />
              <Fact label="记录摘要（recordDigest）" value={<span id="task-detail-digest">{data.recordDigest}</span>} />
            </dl>
          </aside>
        </section>
        </details>
        <section id="task-terminal-note" className={`empty-state${terminal ? '' : ' hidden'}`}>
          <h2>这是终态任务记录</h2>
          <p>顶层事实与 Parent/Child 关系保持只读，不提供重开、重新挂接或自动处置关联 Task 的入口。专业模块仍由各自权威来源管理。</p>
        </section>
      </div>

      <Modal
        title={record.status === 'todo' ? '编辑待办意向' : '编辑进行中的任务'}
        open={actionModal === 'edit'}
        onCancel={() => setActionModal(null)}
        footer={null}
        destroyOnClose
        width={720}
        className="task-action-modal"
      >
        <p className="section-copy">保存时只提交明确的设置与增删操作；Change 由 Agent 在任务过程中维护，页面只读展示。修改 Parent 不会自动处置任何关联 Task。</p>
        <span id="task-edit-state" className="state">{editState}</span>
        <form id="task-edit-form" className="prompt-grid" onSubmit={(event) => void onSave(event)}>
          <label>
            标题
            <Input id="task-edit-title" required value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <label>
            Parent Task
            <Select
              id="task-edit-parent"
              style={{ width: '100%' }}
              value={parentTaskId}
              loading={parentOptionsLoading}
              onDropdownVisibleChange={(open) => { if (open) void loadParentOptions(); }}
              onChange={(value) => setParentTaskId(value ?? '')}
              options={parentOptions}
            />
          </label>
          <label className="full">
            意图
            <Input.TextArea id="task-edit-intent" rows={3} required value={intent} onChange={(event) => setIntent(event.target.value)} />
            <small className="context-help">支持 Markdown 链接；Workspace 内文档请使用相对路径，例如 projects/product/docs/example.md。</small>
          </label>
          <label>
            项目范围
            <Input.TextArea id="task-edit-projects" rows={3} value={projectsText} onChange={(event) => setProjectsText(event.target.value)} />
          </label>
          <label>
            服务范围（project/service）
            <Input.TextArea id="task-edit-services" rows={3} value={servicesText} onChange={(event) => setServicesText(event.target.value)} />
          </label>
          <div className="actions full">
            <Button id="task-edit-button" type="primary" htmlType="submit" loading={saving}>保存任务记录</Button>
          </div>
        </form>
      </Modal>
      <TaskDocumentPreviewModal reference={documentReference} onClose={() => setDocumentReference(null)} />
      <Modal
        title={completionSnapshot?.isParent ? "完成父任务" : "结束任务"}
        open={actionModal === 'complete'}
        onCancel={() => setActionModal(null)}
        footer={null}
        destroyOnClose
        width={520}
        className="task-action-modal"
      >
        <p className="section-copy">只更新顶层状态；不会执行任务收尾（Task Finish）、Git、任务验证、任务环境清理或其他专业动作。</p>
        <form id="task-complete-form" onSubmit={(event) => void onComplete(event)}>
          <label>
            完成摘要
            <Input.TextArea id="task-complete-summary" rows={3} required value={completeSummary} onChange={(event) => setCompleteSummary(event.target.value)} />
          </label>
          <label>
            是否无需交付变更
            <Select
              id="task-complete-no-change"
              style={{ width: '100%' }}
              placeholder="请选择"
              value={completeNoChange || undefined}
              onChange={(value) => setCompleteNoChange(value || '')}
              options={record.status === 'todo'
                ? [{ value: 'true', label: '确认无需变更' }]
                : [
                    { value: 'false', label: '有交付变更' },
                    { value: 'true', label: '确认无需变更' },
                  ]}
            />
          </label>
          {completionSnapshot?.isParent && <ParentCompletionFields snapshot={completionSnapshot} value={completionDraft} onChange={setCompletionDraft} />}
          <div className="actions">
            <Button type="default" htmlType="submit" disabled={Boolean(completionSnapshot?.isParent && (!completionDraft.confirmed || completionSnapshot.completion?.openChildTaskIds.length))}>确认完成</Button>
          </div>
        </form>
      </Modal>
      <Modal
        title="放弃任务"
        open={actionModal === 'abandon'}
        onCancel={() => setActionModal(null)}
        footer={null}
        destroyOnClose
        width={520}
        className="task-action-modal"
      >
        <p className="section-copy">只更新顶层状态；不会清理任务环境、执行 Git 或其他专业动作。</p>
        <form id="task-abandon-form" onSubmit={(event) => void onAbandon(event)}>
          <label>
            放弃原因
            <Input.TextArea id="task-abandon-reason" rows={3} required value={abandonReason} onChange={(event) => setAbandonReason(event.target.value)} />
          </label>
          <div className="actions">
            <Button danger htmlType="submit">确认放弃</Button>
          </div>
        </form>
      </Modal>

      <PrototypeTab
        active={activeTab === 'prototype'}
        workspaceId={workspaceId}
        data={prototypeData}
        loading={prototypeLoading}
        error={prototypeError}
        onRefresh={() => { void refreshPrototype(); }}
      />
      <EvidenceTab
        active={activeTab === 'evidence'}
        taskId={taskId}
        taskActive={record.status === 'active'}
        reviewData={reviewData}
        verificationData={verificationData}
        reviewLoading={reviewLoading}
        verificationLoading={verificationLoading}
        reviewError={reviewError}
        verificationError={verificationError}
        onRefreshReview={() => { void refreshReview(); }}
        onRefreshVerification={() => { void refreshVerification(); }}
        openAgentAction={openAgentAction}
      />
      <RetrospectiveTab
        active={activeTab === 'retrospective'}
        data={retrospectiveData}
        loading={retrospectiveLoading || retrospectiveMutating}
        error={retrospectiveError}
        onRefresh={() => { void refreshRetrospective(); }}
        onHandle={(status, note) => { void handleRetrospective(status, note); }}
        taskHref={(relatedTaskId) => href(`/tasks/${encodeURIComponent(relatedTaskId)}`)}
      />
      <EnvironmentTab
        active={activeTab === 'environment'}
        data={environmentData}
        loading={environmentLoading}
        onRefresh={() => { void refreshEnvironment(); }}
      />
    </>
  );
}
