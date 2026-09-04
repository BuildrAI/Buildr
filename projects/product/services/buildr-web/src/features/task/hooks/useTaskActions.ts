import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';

import { taskProfessionalApi } from '../../../api';
import { confirmModal } from '../../../lib/confirm';
import { taskStatusLabel } from '../../../lib/taskLabels';
import { taskApi } from '../api/task-api';
import type { TaskDetailResponse } from '../api/generated/task-dto';
import { diff, lines, parseLines, qualified } from '../components/shared';
import {
  emptyParentCompletionDraft,
  parentCompletionInput,
  type ParentCompletionDraft,
  type ParentCoordinationResult,
} from '../components/parentCoordination';

type ApiFailure = Error & { code?: string };
export type TaskAlert = { message: string; error: boolean } | null;
export type TaskActionModal = null | 'edit' | 'complete' | 'abandon';

type Input = {
  taskId: string;
  data: TaskDetailResponse | null;
  refresh(): Promise<void>;
  refreshCoordination(): Promise<void>;
  showOverview(): void;
  onAlert(alert: TaskAlert): void;
};

export function useTaskActions({ taskId, data, refresh, refreshCoordination, showOverview, onAlert }: Input) {
  const [editState, setEditState] = useState('可以修改');
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
  const [completionDraft, setCompletionDraft] = useState<ParentCompletionDraft>(emptyParentCompletionDraft);
  const [completeSummary, setCompleteSummary] = useState('');
  const [abandonReason, setAbandonReason] = useState('');
  const [actionModal, setActionModal] = useState<TaskActionModal>(null);
  const dataRef = useRef(data);
  dataRef.current = data;

  useEffect(() => {
    setActionModal(null);
    setEditState('可以修改');
    setCompleteSummary('');
    setAbandonReason('');
    setCompletionSnapshot(null);
    setCompletionRecordDigest('');
    setCompletionDraft(emptyParentCompletionDraft());
    if (!data) return;
    const record = data.record;
    setTitle(record.title);
    setIntent(record.intent);
    setProjectsText(lines(record.scope.projects));
    setServicesText(lines(record.scope.services, 'service'));
    setParentTaskId(record.parentTaskId || '');
    const options: Array<{ value: string; label: string }> = [{ value: '', label: '无 Parent（独立 Task）' }];
    if (record.parentTaskId && data.taskRelations.parent) {
      const parent = data.taskRelations.parent;
      options.push({ value: parent.taskId, label: `${parent.title} · ${parent.taskId} · ${taskStatusLabel(parent.status)}` });
    }
    setParentOptions(options);
    setParentOptionsLoaded(false);
  }, [taskId, data]);

  const showMutationError = useCallback((error: ApiFailure) => {
    onAlert({
      message: error.code === 'task_record_conflict' ? `${error.message} 请刷新本页。` : (error.message || '操作失败'),
      error: error.code !== 'task_record_conflict',
    });
    setEditState(error.code === 'task_record_conflict' ? '记录已变化' : '保存失败');
  }, [onAlert]);

  const loadParentOptions = useCallback(async () => {
    const current = dataRef.current;
    if (!current || parentOptionsLoaded || parentOptionsLoading || !['todo', 'active'].includes(current.record.status)) return;
    setParentOptionsLoading(true);
    try {
      const list = await taskApi.list({ status: 'active' });
      const record = current.record;
      const options: Array<{ value: string; label: string }> = [{ value: '', label: '无 Parent（独立 Task）' }];
      if (record.parentTaskId && current.taskRelations.parent) {
        const parent = current.taskRelations.parent;
        options.push({ value: parent.taskId, label: `${parent.title} · ${parent.taskId} · ${taskStatusLabel(parent.status)}` });
      }
      for (const item of list.tasks.filter((entry) => entry.record.taskId !== record.taskId && entry.record.taskId !== record.parentTaskId)) {
        options.push({ value: item.record.taskId, label: `${item.record.title} · ${item.record.taskId} · ${taskStatusLabel(item.record.status)}` });
      }
      setParentOptions(options);
      setParentTaskId(record.parentTaskId || '');
      setParentOptionsLoaded(true);
    } catch (cause) {
      showMutationError(cause as ApiFailure);
    } finally {
      setParentOptionsLoading(false);
    }
  }, [parentOptionsLoaded, parentOptionsLoading, showMutationError]);

  const save = useCallback(async (event: FormEvent) => {
    event.preventDefault();
    const current = dataRef.current;
    if (!current) return;
    setSaving(true);
    setEditState('正在保存…');
    const record = current.record;
    const nextProjects = parseLines(projectsText);
    const nextServices = parseLines(servicesText).map((item) => qualified(item, 'service'));
    const projectChanges = diff(record.scope.projects, nextProjects);
    const serviceChanges = diff(record.scope.services, nextServices as Array<{ project: string; service: string }>, (item) => (
      typeof item === 'string' ? item : `${item.project}/${item.service}`
    ));
    const nextParentTaskId = parentTaskId || null;
    try {
      const updated = await taskApi.update(taskId, {
        expectedRecordDigest: current.recordDigest,
        title,
        intent,
        ...(nextParentTaskId === record.parentTaskId ? {} : { parentTaskId: nextParentTaskId }),
        addProjects: projectChanges.add,
        removeProjects: projectChanges.remove,
        addServices: serviceChanges.add,
        removeServices: serviceChanges.remove,
      });
      await refresh();
      setEditState(updated.effects.length ? '保存成功' : '内容一致');
      onAlert(null);
      setActionModal(null);
    } catch (cause) {
      showMutationError(cause as ApiFailure);
    } finally {
      setSaving(false);
    }
  }, [taskId, projectsText, servicesText, parentTaskId, title, intent, refresh, onAlert, showMutationError]);

  const openComplete = useCallback(async () => {
    const current = dataRef.current;
    if (!current) return;
    try {
      const snapshot = await taskProfessionalApi.coordination(taskId);
      setCompletionSnapshot(snapshot);
      setCompletionRecordDigest(snapshot.recordDigest || current.recordDigest);
      setCompletionDraft(emptyParentCompletionDraft());
      setActionModal('complete');
    } catch (cause) {
      showMutationError(cause as ApiFailure);
    }
  }, [taskId, showMutationError]);

  const complete = useCallback(async (event: FormEvent) => {
    event.preventDefault();
    const current = dataRef.current;
    if (!current || !completionSnapshot) return;
    try {
      const parentCompletion = completionSnapshot.isParent ? parentCompletionInput(completionSnapshot, completionDraft, taskId) : undefined;
      const ok = await confirmModal({
        title: parentCompletion ? '明确授权完成整个父任务？' : '确认完成？',
        content: parentCompletion ? '确认上述整体目标已完成，并授权更新这个父任务的状态。子任务状态保持不变。' : '只更新任务记录，不执行 Git、验证或环境清理。',
        okText: parentCompletion ? '授权并完成父任务' : '确认完成',
      });
      if (!ok) return;
      await taskApi.complete(taskId, {
        expectedRecordDigest: completionRecordDigest,
        summary: completeSummary,
        ...(parentCompletion ? { parentCompletion } : {}),
      });
      setActionModal(null);
      await refresh();
      await refreshCoordination();
      showOverview();
    } catch (cause) {
      const failure = cause as ApiFailure;
      showMutationError(failure);
      if (['parent_completion_conflict', 'task_record_conflict'].includes(failure.code || '')) {
        setCompletionDraft(emptyParentCompletionDraft());
        setActionModal(null);
        await refresh();
        await refreshCoordination();
      }
    }
  }, [taskId, completionSnapshot, completionDraft, completionRecordDigest, completeSummary, refresh, refreshCoordination, showOverview, showMutationError]);

  const abandon = useCallback(async (event: FormEvent) => {
    event.preventDefault();
    const current = dataRef.current;
    if (!current) return;
    const ok = await confirmModal({
      title: '确认放弃？',
      content: '确认只把顶层任务记录标记为放弃？这不会清理任务环境、执行 Git 或其他专业动作。',
      okText: '确认放弃',
      okButtonProps: { danger: true },
    });
    if (!ok) return;
    try {
      await taskApi.abandon(taskId, { expectedRecordDigest: current.recordDigest, reason: abandonReason });
      setActionModal(null);
      await refresh();
      showOverview();
    } catch (cause) {
      showMutationError(cause as ApiFailure);
    }
  }, [taskId, abandonReason, refresh, showOverview, showMutationError]);

  return {
    actionModal,
    setActionModal,
    edit: {
      editState, title, intent, projectsText, servicesText, parentTaskId,
      parentOptions, parentOptionsLoading, saving,
      setTitle, setIntent, setProjectsText, setServicesText, setParentTaskId,
      loadParentOptions, save,
    },
    completion: {
      snapshot: completionSnapshot, draft: completionDraft, summary: completeSummary,
      setDraft: setCompletionDraft, setSummary: setCompleteSummary, open: openComplete, submit: complete,
    },
    abandonment: { reason: abandonReason, setReason: setAbandonReason, submit: abandon },
  };
}
