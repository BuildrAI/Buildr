import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, type ApiError } from '../api';
import { useAppShell } from '../app/AppShellContext';
import { ChangeBriefPanel } from './TaskChangeDetailPage';
import { workspaceHref } from '../lib/labels';
import { formatDateTime, taskStatusLabel } from '../lib/taskLabels';
import { DevelopmentTab } from './task-detail/DevelopmentTab';
import { EnvironmentTab } from './task-detail/EnvironmentTab';
import { EvidenceTab } from './task-detail/EvidenceTab';
import { RetrospectiveTab } from './task-detail/RetrospectiveTab';
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
  | { kind: 'ready'; key: string; change: any };

const TABS: Array<{ id: TaskTab; label: string }> = [
  { id: 'overview', label: '概览' },
  { id: 'development', label: '研发' },
  { id: 'evidence', label: '证据' },
  { id: 'retrospective', label: '复盘' },
  { id: 'environment', label: '环境' },
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

  const [title, setTitle] = useState('');
  const [intent, setIntent] = useState('');
  const [projectsText, setProjectsText] = useState('');
  const [servicesText, setServicesText] = useState('');
  const [parentTaskId, setParentTaskId] = useState('');
  const [parentOptions, setParentOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [parentOptionsLoaded, setParentOptionsLoaded] = useState(false);
  const [parentOptionsLoading, setParentOptionsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [completeSummary, setCompleteSummary] = useState('');
  const [completeNoChange, setCompleteNoChange] = useState('');
  const [abandonReason, setAbandonReason] = useState('');

  const [developmentData, setDevelopmentData] = useState<any>(null);
  const [developmentLoading, setDevelopmentLoading] = useState(false);
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
  const [retrospectiveError, setRetrospectiveError] = useState<string | null>(null);

  const dataRef = useRef(data);
  dataRef.current = data;
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;
  const taskIdRef = useRef(taskId);
  taskIdRef.current = taskId;
  const developmentRequestRef = useRef(0);
  const environmentRequestRef = useRef(0);
  const reviewRequestRef = useRef(0);
  const verificationRequestRef = useRef(0);
  const retrospectiveRequestRef = useRef(0);

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
        const detail = await api(`/api/v1/tasks/${encodeURIComponent(taskId)}/changes/${encodeURIComponent(reference.project)}/${encodeURIComponent(reference.change)}`) as any;
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
    const [workspace, detail] = await Promise.all([
      api('/api/v1/workspace') as Promise<WorkspacePayload>,
      api(`/api/v1/tasks/${encodeURIComponent(taskId)}`) as Promise<TaskDetailData>,
    ]);
    if (taskIdRef.current !== taskId) return;
    setWorkspace(workspace);
    applyRecord(detail, workspace.workspace.name);
    void loadBriefs(detail.record.changes);
  }, [taskId, setWorkspace, applyRecord, loadBriefs]);

  const refreshDevelopment = useCallback(async () => {
    const requestId = ++developmentRequestRef.current;
    const currentTaskId = taskId;
    setDevelopmentLoading(true);
    try {
      const next = await api(`/api/v1/tasks/${encodeURIComponent(currentTaskId)}/development`);
      if (developmentRequestRef.current === requestId && taskIdRef.current === currentTaskId) {
        setDevelopmentData(next);
      }
    } catch (err) {
      if (developmentRequestRef.current === requestId && taskIdRef.current === currentTaskId) {
        setDevelopmentData({
          status: 'unavailable',
          development: null,
          diagnostic: { code: (err as ApiError).code || 'task_development_read_failed', message: err instanceof Error ? err.message : '读取失败' },
          nextActions: [],
        });
      }
    } finally {
      if (developmentRequestRef.current === requestId) setDevelopmentLoading(false);
    }
  }, [taskId]);

  const refreshEnvironment = useCallback(async () => {
    const requestId = ++environmentRequestRef.current;
    const currentTaskId = taskId;
    setEnvironmentLoading(true);
    try {
      const next = await api(`/api/v1/tasks/${encodeURIComponent(currentTaskId)}/environment`);
      if (environmentRequestRef.current === requestId && taskIdRef.current === currentTaskId) {
        setEnvironmentData(next);
      }
    } catch (err) {
      if (environmentRequestRef.current === requestId && taskIdRef.current === currentTaskId) {
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
      const next = await api(`/api/v1/tasks/${encodeURIComponent(currentTaskId)}/reviews`);
      if (reviewRequestRef.current === requestId && taskIdRef.current === currentTaskId) {
        setReviewData(next);
      }
    } catch (err) {
      if (reviewRequestRef.current === requestId && taskIdRef.current === currentTaskId) {
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
      const next = await api(`/api/v1/tasks/${encodeURIComponent(currentTaskId)}/verification`);
      if (verificationRequestRef.current === requestId && taskIdRef.current === currentTaskId) {
        setVerificationData(next);
      }
    } catch (err) {
      if (verificationRequestRef.current === requestId && taskIdRef.current === currentTaskId) {
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
      const next = await api(`/api/v1/tasks/${encodeURIComponent(currentTaskId)}/retrospective`);
      if (retrospectiveRequestRef.current === requestId && taskIdRef.current === currentTaskId) {
        setRetrospectiveData(next);
      }
    } catch (err) {
      if (retrospectiveRequestRef.current === requestId && taskIdRef.current === currentTaskId) {
        setRetrospectiveError(`${(err as ApiError).code || 'task_retrospective_read_failed'}：${err instanceof Error ? err.message : '读取失败'}`);
        setRetrospectiveData(null);
      }
    } finally {
      if (retrospectiveRequestRef.current === requestId) setRetrospectiveLoading(false);
    }
  }, [taskId]);

  const selectTab = useCallback((tab: TaskTab) => {
    setActiveTab(tab);
    if (tab === 'development') void refreshDevelopment();
    if (tab === 'environment') void refreshEnvironment();
    if (tab === 'evidence') {
      void refreshReview();
      void refreshVerification();
    }
    if (tab === 'retrospective') void refreshRetrospective();
  }, [refreshDevelopment, refreshEnvironment, refreshReview, refreshVerification, refreshRetrospective]);

  useEffect(() => {
    setPageError(null);
    setAlert(null);
    setActiveTab('overview');
    setDevelopmentData(null);
    setEnvironmentData(null);
    setReviewData(null);
    setVerificationData(null);
    setRetrospectiveData(null);
    setBriefs([]);
    setCompleteSummary('');
    setCompleteNoChange('');
    setAbandonReason('');
    setEditState('可以修改');
    developmentRequestRef.current += 1;
    environmentRequestRef.current += 1;
    reviewRequestRef.current += 1;
    verificationRequestRef.current += 1;
    retrospectiveRequestRef.current += 1;
    setDevelopmentLoading(false);
    setEnvironmentLoading(false);
    setReviewLoading(false);
    setVerificationLoading(false);
    setRetrospectiveLoading(false);

    let cancelled = false;
    void (async () => {
      try {
        await refresh();
      } catch (err) {
        if (!cancelled && taskIdRef.current === taskId) {
          setPageError(err instanceof Error ? err.message : '任务不可用');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [taskId, refresh]);

  useEffect(() => {
    const onFocus = () => {
      const tab = activeTabRef.current;
      if (tab === 'development') void refreshDevelopment();
      if (tab === 'environment') void refreshEnvironment();
      if (tab === 'evidence') {
        void refreshReview();
        void refreshVerification();
      }
      if (tab === 'retrospective') void refreshRetrospective();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refreshDevelopment, refreshEnvironment, refreshReview, refreshVerification, refreshRetrospective]);

  const loadParentOptions = async () => {
    const current = dataRef.current;
    if (!current || parentOptionsLoaded || parentOptionsLoading || current.record.status !== 'active') return;
    setParentOptionsLoading(true);
    try {
      const list = await api('/api/v1/tasks?status=active') as { tasks: Array<{ record: { taskId: string; title: string; status: string } }> };
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
      const updated = await api(`/api/v1/tasks/${encodeURIComponent(taskId)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          expectedRecordDigest: data.recordDigest,
          title,
          intent,
          ...(nextParentTaskId === record.parentTaskId ? {} : { parentTaskId: nextParentTaskId }),
          addProjects: projects.add,
          removeProjects: projects.remove,
          addServices: services.add,
          removeServices: services.remove,
        }),
      }) as TaskDetailData;
      applyRecord(updated);
      void loadBriefs(updated.record.changes);
      setEditState(updated.effects.length ? '保存成功' : '内容一致');
      setAlert(null);
    } catch (err) {
      showMutationError(err as ApiError);
    } finally {
      setSaving(false);
    }
  };

  const onComplete = async (event: FormEvent) => {
    event.preventDefault();
    if (!data || !completeNoChange) return;
    if (!window.confirm('确认只把顶层任务记录标记为完成？这不会执行任务收尾（Task Finish）、Git、任务验证或任务环境清理。')) return;
    try {
      await api(`/api/v1/tasks/${encodeURIComponent(taskId)}/complete`, {
        method: 'POST',
        body: JSON.stringify({
          expectedRecordDigest: data.recordDigest,
          summary: completeSummary,
          noChange: completeNoChange === 'true',
        }),
      });
      await refresh();
      selectTab('overview');
    } catch (err) {
      showMutationError(err as ApiError);
    }
  };

  const onAbandon = async (event: FormEvent) => {
    event.preventDefault();
    if (!data) return;
    if (!window.confirm('确认只把顶层任务记录标记为放弃？这不会清理任务环境、执行 Git 或其他专业动作。')) return;
    try {
      await api(`/api/v1/tasks/${encodeURIComponent(taskId)}/abandon`, {
        method: 'POST',
        body: JSON.stringify({
          expectedRecordDigest: data.recordDigest,
          reason: abandonReason,
        }),
      });
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
          <p className="eyebrow">任务</p>
          <h1>任务不可用</h1>
          <p className="page-copy">{pageError}</p>
        </section>
        <Link className="button secondary" to={href('/tasks')}>返回任务列表</Link>
      </>
    );
  }

  if (!data) {
    return (
      <section className="detail-page-header">
        <Link className="back-link" to={href('/tasks')}>← 返回任务列表</Link>
        <div className="detail-title-row">
          <div>
            <p className="eyebrow">任务</p>
            <h1 id="task-detail-title">正在读取…</h1>
            <p id="task-detail-intent" className="page-copy" />
          </div>
          <span id="task-detail-status" className="lifecycle-badge">—</span>
        </div>
      </section>
    );
  }

  const record = data.record;
  const terminal = record.status !== 'active';
  const resultText = record.result
    ? `${record.result.summary}${record.status === 'completed' ? `（${record.result.noChange ? '无需变更' : '有交付变更'}）` : ''}`
    : '进行中';

  return (
    <>
      <section className="detail-page-header">
        <Link className="back-link" to={href('/tasks')}>← 返回任务列表</Link>
        <div className="detail-title-row">
          <div>
            <p className="eyebrow">任务</p>
            <h1 id="task-detail-title">{record.title}</h1>
            <p id="task-detail-intent" className="page-copy">{record.intent}</p>
          </div>
          <span id="task-detail-status" className={`lifecycle-badge ${record.status}`}>{taskStatusLabel(record.status)}</span>
        </div>
      </section>
      <div id="task-detail-alert" className={`alert${alert ? '' : ' hidden'}${alert?.error ? ' error' : ''}`} role="status">
        {alert?.message || ''}
      </div>
      <nav className="detail-tabs" aria-label="任务详情">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`detail-tab${activeTab === tab.id ? ' active' : ''}`}
            type="button"
            data-task-tab={tab.id}
            aria-selected={activeTab === tab.id}
            onClick={() => selectTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div id="task-overview-panel" className={activeTab === 'overview' ? '' : 'hidden'} data-task-panel="overview">
        <section id="task-change-briefs" className="task-change-briefs" aria-live="polite">
          {briefs.map((item, index) => {
            if (item.kind === 'empty') {
              return <section key="empty" className="panel">这个任务没有关联 Change，因此没有 Brief 可展示。</section>;
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
              <Fact label="数据格式" value="buildr.task-record/v1" />
              <Fact label="存储范围" value="Workspace 本地数据" />
              <Fact label="记录摘要（recordDigest）" value={<span id="task-detail-digest">{data.recordDigest}</span>} />
            </dl>
          </aside>
        </section>
        <section id="task-active-actions" className={`task-actions${terminal ? ' hidden' : ''}`}>
          <article className="panel">
            <div className="panel-heading">
              <div>
                <h2>编辑进行中的任务</h2>
                <p className="section-copy">保存时只提交明确的设置与增删操作；Change 由 Agent 在任务过程中维护，页面只读展示。修改 Parent 不会自动处置任何关联 Task。</p>
              </div>
              <span id="task-edit-state" className="state">{editState}</span>
            </div>
            <form id="task-edit-form" className="prompt-grid" onSubmit={(event) => void onSave(event)}>
              <label>
                标题
                <input id="task-edit-title" required value={title} onChange={(event) => setTitle(event.target.value)} />
              </label>
              <label>
                Parent Task
                <select
                  id="task-edit-parent"
                  value={parentTaskId}
                  disabled={parentOptionsLoading}
                  onFocus={() => { void loadParentOptions(); }}
                  onChange={(event) => setParentTaskId(event.target.value)}
                >
                  {parentOptions.map((option) => (
                    <option key={option.value || 'none'} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label className="full">
                意图
                <textarea id="task-edit-intent" rows={3} required value={intent} onChange={(event) => setIntent(event.target.value)} />
              </label>
              <label>
                项目范围
                <textarea id="task-edit-projects" rows={3} value={projectsText} onChange={(event) => setProjectsText(event.target.value)} />
              </label>
              <label>
                服务范围（project/service）
                <textarea id="task-edit-services" rows={3} value={servicesText} onChange={(event) => setServicesText(event.target.value)} />
              </label>
              <div className="actions full">
                <button id="task-edit-button" className="button primary" type="submit" disabled={saving}>保存任务记录</button>
              </div>
            </form>
          </article>
          <article className="panel terminal-panel">
            <div className="panel-heading">
              <div>
                <h2>结束任务</h2>
                <p className="section-copy">只更新顶层状态；不会执行任务收尾（Task Finish）、Git、任务验证、任务环境清理或其他专业动作。</p>
              </div>
            </div>
            <div className="terminal-action-grid">
              <form id="task-complete-form" onSubmit={(event) => void onComplete(event)}>
                <h3>完成</h3>
                <label>
                  完成摘要
                  <textarea id="task-complete-summary" rows={3} required value={completeSummary} onChange={(event) => setCompleteSummary(event.target.value)} />
                </label>
                <label>
                  是否无需交付变更
                  <select id="task-complete-no-change" required value={completeNoChange} onChange={(event) => setCompleteNoChange(event.target.value)}>
                    <option value="">请选择</option>
                    <option value="false">有交付变更</option>
                    <option value="true">确认无需变更</option>
                  </select>
                </label>
                <button className="button secondary" type="submit">确认完成</button>
              </form>
              <form id="task-abandon-form" onSubmit={(event) => void onAbandon(event)}>
                <h3>放弃</h3>
                <label>
                  放弃原因
                  <textarea id="task-abandon-reason" rows={3} required value={abandonReason} onChange={(event) => setAbandonReason(event.target.value)} />
                </label>
                <button className="button danger" type="submit">确认放弃</button>
              </form>
            </div>
          </article>
        </section>
        <section id="task-terminal-note" className={`empty-state${terminal ? '' : ' hidden'}`}>
          <h2>这是终态任务记录</h2>
          <p>顶层事实与 Parent/Child 关系保持只读，不提供重开、重新挂接或自动处置关联 Task 的入口。专业模块仍由各自权威来源管理。</p>
        </section>
      </div>

      <DevelopmentTab
        taskId={taskId}
        active={activeTab === 'development'}
        data={developmentData}
        loading={developmentLoading}
        onRefresh={() => { void refreshDevelopment(); }}
        onSelectEvidence={() => selectTab('evidence')}
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
        loading={retrospectiveLoading}
        error={retrospectiveError}
        onRefresh={() => { void refreshRetrospective(); }}
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
