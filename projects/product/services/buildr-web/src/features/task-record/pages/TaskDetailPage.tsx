import { emptyParentCompletionDraft, parentCompletionInput } from '../components/parentCoordination';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Alert, Button } from 'antd';
import { isTaskReadCancelled, useTaskRequestLifecycle } from '../hooks/useTaskRequestLifecycle';
import { useTaskDetail } from '../hooks/useTaskDetail';
import { useTaskMutations } from '../hooks/useTaskMutations';
import { useTaskEvidence } from '../hooks/useTaskEvidence';
import { useAppShell } from '../../../app/AppShellContext';
import { confirmModal } from '../../../lib/confirm';
import { resolveTaskDocumentReference, type RegisteredProject, type TaskDocumentReference } from '../../../lib/taskDocumentLinks';
import { ChangeBriefPanel, type ChangePayload } from '../../../components/ChangeBriefPanel';
import { workspaceHref } from '../../../lib/labels';
import { formatDateTime, taskStatusLabel } from '../../../lib/taskLabels';
import { EvidenceTab } from '../components/EvidenceTab';
import { RetrospectiveDocumentCard } from '../components/RetrospectiveDocumentCard';
import { ParentCoordinationPanel } from '../components/ParentCoordinationPanel';
import { TaskDocumentPreviewModal } from '../components/TaskDocumentPreviewModal';
import { TaskOutcomeSummary } from '../components/TaskOutcomeSummary';
import { TaskOverview } from '../components/TaskOverview';
import { TaskRelations } from '../components/TaskRelations';
import { TaskEditModal } from '../components/TaskEditModal';
import { TaskCompleteModal } from '../components/TaskCompleteModal';
import { TaskAbandonModal } from '../components/TaskAbandonModal';
import type { ParentCoordinationResult } from '../components/parentCoordination';
import { PrototypeTab, type UiPrototypeData } from '../components/PrototypeTab';
import {
  diff,
  Fact,
  lines,
  parseLines,
  qualified,
  type TaskDetailData,
  type TaskTab,
} from '../components/shared';

type WorkspacePayload = { rootPath: string; workspace: { name: string } };
type ApiFailure = Error & { code?: string };

type BriefState =
  | { kind: 'empty' }
  | { kind: 'missing'; key: string; message: string }
  | { kind: 'ready'; key: string; change: ChangePayload };

const TABS: Array<{ id: TaskTab; label: string }> = [
  { id: 'overview', label: '概览' },
  { id: 'prototype', label: '原型' },
  { id: 'evidence', label: '证据' },
];

export function TaskDetailPage() {
  const { taskId = '' } = useParams();
  const { workspaceId, setWorkspace, setBreadcrumbParts, openAgentAction } = useAppShell();
  const href = (path: string) => workspaceHref(workspaceId, path);

  const [data, setData] = useState<TaskDetailData | null>(null);
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
  const [abandonReason, setAbandonReason] = useState('');
  const [actionModal, setActionModal] = useState<null | 'edit' | 'complete' | 'abandon'>(null);
  const [documentReference, setDocumentReference] = useState<TaskDocumentReference | null>(null);

  const dataRef = useRef(data);
  dataRef.current = data;
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;
  const taskIdRef = useRef(taskId);
  taskIdRef.current = taskId;
  const prototypeRequestRef = useRef(0);
  const projectRegistryRef = useRef<RegisteredProject[] | null>(null);
  const taskReadLifecycle = useTaskRequestLifecycle();
  const taskDetailApi = useTaskDetail();
  const taskMutations = useTaskMutations();
  const { coordinationData, coordinationLoading, reviewData, reviewLoading, reviewError, verificationData, verificationLoading, verificationError, refreshCoordination, refreshReview, refreshVerification, resetEvidence } = useTaskEvidence(taskId, taskReadLifecycle);
  const currentCoordination = coordinationData?.taskId === taskId ? coordinationData : null;
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
  }, [setBreadcrumbParts]);

  const loadBriefs = useCallback(async (references: TaskDetailData['record']['changes']) => {
    if (!references.length) {
      setBriefs([{ kind: 'empty' }]);
      return;
    }
    const results = await Promise.all(references.map(async (reference) => {
      const key = `${reference.project}/${reference.change}`;
      try {
        const detail = await taskReadLifecycle.run(taskId, `change:${key}`, (signal) => (
          taskDetailApi.change(taskId, reference.project, reference.change, signal)
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
    const [workspace, detail] = await taskReadLifecycle.run(taskId, 'detail', (signal) => Promise.all([
      taskDetailApi.workspace(signal) as Promise<WorkspacePayload>,
      taskDetailApi.detail(taskId, { signal }),
    ]));
    if (taskIdRef.current !== taskId) return;
    setWorkspace(workspace);
    applyRecord(detail, workspace.workspace.name);
    void loadBriefs(detail.record.changes);
  }, [taskId, setWorkspace, applyRecord, loadBriefs]);

  const refreshPrototype = useCallback(async () => {
    const requestId = ++prototypeRequestRef.current;
    const currentTaskId = taskId;
    setPrototypeLoading(true);
    setPrototypeError(null);
    try {
      const next = await taskReadLifecycle.run(currentTaskId, 'ui-prototypes', (signal) => (
        taskDetailApi.prototypes(currentTaskId, signal)
      )) as UiPrototypeData;
      if (prototypeRequestRef.current === requestId && taskIdRef.current === currentTaskId) setPrototypeData(next);
    } catch (err) {
      if (!isTaskReadCancelled(err) && prototypeRequestRef.current === requestId && taskIdRef.current === currentTaskId) {
        setPrototypeError(`${(err as ApiFailure).code || 'task_ui_prototype_read_failed'}：${err instanceof Error ? err.message : '读取失败'}`);
        setPrototypeData(null);
      }
    } finally {
      if (prototypeRequestRef.current === requestId) setPrototypeLoading(false);
    }
  }, [taskId]);

  const selectTab = useCallback((tab: TaskTab) => {
    setActiveTab(tab);
    if (tab === 'overview') {
      void refreshCoordination();
    }
    if (tab === 'prototype') void refreshPrototype();
    if (tab === 'evidence') {
      void refreshReview();
      void refreshVerification();
    }
  }, [refreshCoordination, refreshPrototype, refreshReview, refreshVerification]);

  useEffect(() => {
    setPageError(null);
    setAlert(null);
    setData(null);
    setActiveTab('overview');
    resetEvidence();
    setPrototypeData(null);
    setPrototypeError(null);
    setBriefs([]);
    setCompleteSummary('');
    setAbandonReason('');
    setActionModal(null);
    setDocumentReference(null);
    projectRegistryRef.current = null;
    setEditState('可以修改');
    prototypeRequestRef.current += 1;
    setPrototypeLoading(false);

    let cancelled = false;
    void (async () => {
      try {
        await Promise.all([refresh(), refreshCoordination()]);
      } catch (err) {
        if (!cancelled && taskIdRef.current === taskId) {
          setPageError(err instanceof Error ? err.message : '任务不可用');
        }
      }
    })();
    return () => {
      cancelled = true;
      taskReadLifecycle.abortTask(taskId);
    };
  }, [taskId, refresh, refreshCoordination]);

  focusRefreshRef.current = () => {
    const tab = activeTabRef.current;
    if (tab === 'overview') {
      void refreshCoordination();
    }
    if (tab === 'evidence') {
      void refreshReview();
      void refreshVerification();
    }
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
      const list = await taskDetailApi.list({ status: 'active' });
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
      const error = err as ApiFailure;
      setAlert({
        message: error.code === 'task_record_conflict' ? `${error.message} 请刷新本页。` : (error.message || '读取失败'),
        error: error.code !== 'task_record_conflict',
      });
      setEditState(error.code === 'task_record_conflict' ? '记录已变化' : '保存失败');
    } finally {
      setParentOptionsLoading(false);
    }
  };

  const showMutationError = (error: ApiFailure) => {
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
        const registry = await taskDetailApi.projects() as { projects?: RegisteredProject[] };
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
      const updated = await taskMutations.update(taskId, {
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
      showMutationError(err as ApiFailure);
    } finally {
      setSaving(false);
    }
  };

  const openComplete = async () => {
    if (!data) return;
    try {
      const snapshot = await taskMutations.coordination(taskId);
      setCompletionSnapshot(snapshot);
      setCompletionRecordDigest(snapshot.recordDigest || data.recordDigest);
      setCompletionDraft(emptyParentCompletionDraft());
      setActionModal('complete');
    } catch (error) { showMutationError(error as ApiFailure); }
  };

  const onComplete = async (event: FormEvent) => {
    event.preventDefault();
    if (!data || !completionSnapshot) return;
    try {
      const parentCompletion = completionSnapshot.isParent ? parentCompletionInput(completionSnapshot, completionDraft, taskId) : undefined;
      const ok = await confirmModal({
        title: parentCompletion ? '明确授权完成整个父任务？' : '确认完成？',
        content: parentCompletion ? '确认上述整体目标已完成，并授权更新这个父任务的状态。子任务状态保持不变。' : '只更新任务记录，不执行 Git、验证或环境清理。',
        okText: parentCompletion ? '授权并完成父任务' : '确认完成',
      });
      if (!ok) return;
      await taskMutations.complete(taskId, {
        expectedRecordDigest: completionRecordDigest,
        summary: completeSummary,
        ...(parentCompletion ? { parentCompletion } : {}),
      });
      setActionModal(null);
      await refresh();
      await refreshCoordination();
      selectTab('overview');
    } catch (err) {
      showMutationError(err as ApiFailure);
      if (['parent_completion_conflict', 'task_record_conflict'].includes((err as ApiFailure).code || '')) {
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
      await taskMutations.abandon(taskId, {
        expectedRecordDigest: data.recordDigest,
        reason: abandonReason,
      });
      setActionModal(null);
      await refresh();
      selectTab('overview');
    } catch (err) {
      showMutationError(err as ApiFailure);
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
    ? record.result.summary
    : record.status === 'todo' ? '待办，尚未启动' : '进行中';

  return (
    <>
      <TaskOverview record={record} onRelativeLink={(linkHref) => { void openIntentDocument(linkHref); }} />
      <div id="task-detail-alert" className={`alert${alert ? '' : ' hidden'}${alert?.error ? ' error' : ''}`} role="status">
        {alert?.message || ''}
      </div>
      {data.referenceDiagnostics.length ? (
        <Alert
          id="task-reference-diagnostics"
          type="warning"
          showIcon
          message={`部分历史引用当前不可用：${data.referenceDiagnostics.map((item) => `${item.reference}（${item.message}）`).join('；')}`}
        />
      ) : null}
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
          record={record}
        />
        )}
        <RetrospectiveDocumentCard
          taskId={record.taskId}
          recordDigest={data.recordDigest}
          reference={data.retrospectiveDocument}
          onRecordUpdated={refresh}
        />
        <details className={`task-technical-overview${currentCoordination?.mode === 'parent' ? ' parent-mode' : ' ordinary-mode'}`} open={!record.isParent}>
          <summary>技术事实、Change 与 Task Record</summary>
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
                <p className="section-copy">只展示顶层任务事实；父任务/子任务（Parent/Child Task）表达协调层级，不自动推断状态或专业结果。</p>
              </div>
            </div>
            <dl className="read-facts detail-facts">
              <Fact label="任务 ID" value={<span id="task-record-id">{record.taskId}</span>} />
              <TaskRelations data={data} taskHref={(id) => href(`/tasks/${encodeURIComponent(id)}`)} />
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
              <Fact label="数据格式" value="buildr.task-record/v3" />
              <Fact label="存储范围" value="Workspace 本地数据" />
              <Fact label="记录摘要（recordDigest）" value={<span id="task-detail-digest">{data.recordDigest}</span>} />
            </dl>
          </aside>
        </section>
        </details>
        <section id="task-terminal-note" className={`empty-state${terminal ? '' : ' hidden'}`}>
          <h2>这是终态任务记录</h2>
          <p>顶层事实与父任务/子任务关系保持只读，不提供重开、重新挂接或自动处置关联Task的入口。专业模块仍由各自权威来源管理。</p>
        </section>
      </div>

      <TaskEditModal open={actionModal === 'edit'} todo={record.status === 'todo'} editState={editState} title={title} intent={intent} projects={projectsText} services={servicesText} parentTaskId={parentTaskId} parentOptions={parentOptions} parentOptionsLoading={parentOptionsLoading} saving={saving} onClose={() => setActionModal(null)} onSubmit={(event) => { void onSave(event); }} onOpenParents={() => { void loadParentOptions(); }} setTitle={setTitle} setIntent={setIntent} setProjects={setProjectsText} setServices={setServicesText} setParentTaskId={setParentTaskId} />
      <TaskDocumentPreviewModal reference={documentReference} onClose={() => setDocumentReference(null)} />
      <TaskCompleteModal open={actionModal === 'complete'} snapshot={completionSnapshot} draft={completionDraft} summary={completeSummary} onClose={() => setActionModal(null)} onSubmit={(event) => { void onComplete(event); }} setDraft={setCompletionDraft} setSummary={setCompleteSummary} />
      <TaskAbandonModal open={actionModal === 'abandon'} reason={abandonReason} onClose={() => setActionModal(null)} onSubmit={(event) => { void onAbandon(event); }} setReason={setAbandonReason} />

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
    </>
  );
}
