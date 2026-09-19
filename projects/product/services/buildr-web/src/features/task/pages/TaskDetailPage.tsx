import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { Alert, Button } from 'antd';

import { PushpinFilled, PushpinOutlined } from '@ant-design/icons';
import { useWorkbenchPreferences } from '../../workbench/hooks/useWorkbenchPreferences';
import { ResourceActions } from '../../workbench/components/ResourceActions';
import { taskReturnPath } from '../taskNavigation';
import { TaskWorkContextCard } from '../components/TaskWorkContextCard';
import { useTaskWorkContext } from '../hooks/useTaskWorkContext';
import { useAppShell } from '../../../app/AppShellContext';
import { ChangeBriefPanel } from '../../../components/ChangeBriefPanel';
import { workspaceHref } from '../../../lib/labels';
import { formatDateTime } from '../../../lib/taskLabels';
import { EvidenceTab } from '../components/EvidenceTab';
import { ParentCoordinationPanel } from '../components/ParentCoordinationPanel';
import { PrototypeTab } from '../components/PrototypeTab';
import { RetrospectiveDocumentCard } from '../components/RetrospectiveDocumentCard';
import { TaskAbandonModal } from '../components/TaskAbandonModal';
import { TaskCompleteModal } from '../components/TaskCompleteModal';
import { TaskDocumentPreviewModal } from '../components/TaskDocumentPreviewModal';
import { TaskEditModal } from '../components/TaskEditModal';
import { TaskOutcomeSummary } from '../components/TaskOutcomeSummary';
import { TaskArtifactReader, taskChangeArtifacts } from '../components/TaskArtifactReader';
import { TaskOverview } from '../components/TaskOverview';
import { TaskRelations } from '../components/TaskRelations';
import { Fact, lines, type TaskTab } from '../components/shared';
import { useTaskActions, type TaskAlert } from '../hooks/useTaskActions';
import { useTaskArtifacts } from '../hooks/useTaskArtifacts';
import { useTaskDetail, type WorkspaceResponse } from '../hooks/useTaskDetail';
import { useTaskEvidence } from '../hooks/useTaskEvidence';
import { useTaskRequestLifecycle } from '../hooks/useTaskRequestLifecycle';

const TABS: Array<{ id: TaskTab; label: string }> = [
  { id: 'overview', label: '概览' },
  { id: 'prototype', label: '原型' },
  { id: 'evidence', label: '证据' },
];

export function TaskDetailPage() {
  const { taskId = '' } = useParams();
  const location = useLocation();
  const { workspaceId, setWorkspace, setBreadcrumbParts, openAgentAction } = useAppShell();
  const preferences = useWorkbenchPreferences(workspaceId);
  const workContext = useTaskWorkContext(taskId);
  const [preferencePending, setPreferencePending] = useState(false);
  const [selectedArtifact, setSelectedArtifact] = useState<{ key: string; path: string } | null>(null);
  const closeArtifact = useCallback(() => setSelectedArtifact(null), []);
  const [activeTab, setActiveTab] = useState<TaskTab>('overview');
  const [alert, setAlert] = useState<TaskAlert>(null);
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;
  const lifecycle = useTaskRequestLifecycle();
  const href = (path: string) => workspaceHref(workspaceId, path);

  const onWorkspace = useCallback((workspace: WorkspaceResponse) => setWorkspace(workspace), [setWorkspace]);
  const onBreadcrumb = useCallback((workspaceName: string, taskTitle: string) => {
    setBreadcrumbParts([workspaceName, '任务', taskTitle]);
  }, [setBreadcrumbParts]);
  const detail = useTaskDetail({ taskId, lifecycle, onWorkspace, onBreadcrumb });
  const evidence = useTaskEvidence(taskId, lifecycle);
  const artifacts = useTaskArtifacts(taskId, detail.data, lifecycle);
  const showOverview = useCallback(() => setActiveTab('overview'), []);
  const actions = useTaskActions({
    taskId,
    data: detail.data,
    refresh: detail.refresh,
    refreshCoordination: evidence.refreshCoordination,
    showOverview,
    onAlert: setAlert,
  });

  const selectTab = useCallback((tab: TaskTab) => {
    setActiveTab(tab);
    if (tab === 'overview') void evidence.refreshCoordination();
    if (tab === 'prototype') void artifacts.refreshPrototype();
    if (tab === 'evidence') {
      void evidence.refreshReview();
      void evidence.refreshVerification();
    }
  }, [evidence.refreshCoordination, evidence.refreshReview, evidence.refreshVerification, artifacts.refreshPrototype]);

  useEffect(() => {
    setActiveTab('overview');
    setSelectedArtifact(null);
    setAlert(null);
  }, [taskId]);

  useEffect(() => {
    if (artifacts.documentError) setAlert({ message: artifacts.documentError, error: true });
  }, [artifacts.documentError]);

  useEffect(() => {
    const onFocus = () => {
      if (activeTabRef.current === 'overview') void evidence.refreshCoordination();
      if (activeTabRef.current === 'evidence') {
        void evidence.refreshReview();
        void evidence.refreshVerification();
      }
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [evidence.refreshCoordination, evidence.refreshReview, evidence.refreshVerification]);

  if (detail.error) {
    return (
      <section className="page-header">
        <h1>任务不可用</h1>
        <p className="page-copy">{detail.error}</p>
      </section>
    );
  }

  if (!detail.data) {
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

  const data = detail.data;
  const record = data.record;
  const terminal = !['todo', 'active'].includes(record.status);
  const resultText = record.result ? record.result.summary : record.status === 'todo' ? '待办，尚未启动' : '进行中';
  const returnTo = taskReturnPath(location.state, href(''));
  const togglePreference = async (kind: 'pinned-task' | 'planned-task') => {
    setPreferencePending(true);
    try {
      if (preferences.has(kind, taskId)) await preferences.remove(kind, taskId);
      else await preferences.set(kind, taskId);
    } catch (cause) { setAlert({ message: cause instanceof Error ? cause.message : '偏好未能保存', error: true }); }
    finally { setPreferencePending(false); }
  };
  const continueWork = () => openAgentAction('task-continue', { taskId, title: record.title, intent: record.intent, status: record.status, projects: record.scope.projects, services: record.scope.services, result: record.result?.summary, progress: workContext.data?.context?.progress, nextStep: workContext.data?.context?.nextStep });
  const artifactSource = selectedArtifact ? artifacts.briefs.find(item => item.kind === 'ready' && item.key === selectedArtifact.key) : null;
  const artifactChange = artifactSource?.kind === 'ready' ? artifactSource.change : null;
  const currentCoordination = evidence.coordinationData?.taskId === taskId ? evidence.coordinationData : null;

  return (
    <div className={`task-reading-layout${artifacts.documentReference || artifactChange ? ' has-reader' : ''}`}>
    <div id="task-detail-main" className="task-detail-main">
      <div className="task-detail-entry"><Link id="task-return" className="back-link" to={returnTo}>← {returnTo.includes('/overview') ? '返回工作概览' : returnTo.includes('/activity') ? '返回动态' : returnTo.includes('/projects') ? '返回项目' : '返回任务列表'}</Link><div className="task-detail-entry-actions">
        <Button id="task-pin" type="text" aria-label={preferences.has('pinned-task', taskId) ? '取消置顶任务' : '置顶任务'} icon={preferences.has('pinned-task', taskId) ? <PushpinFilled /> : <PushpinOutlined />} loading={preferencePending} onClick={() => void togglePreference('pinned-task')} />
        {record.status === 'todo' && <Button id="task-plan-next" loading={preferencePending} onClick={() => void togglePreference('planned-task')}>{preferences.has('planned-task', taskId) ? '移出接下来' : '加入接下来'}</Button>}
        <Button id="task-continue" onClick={continueWork}>{terminal ? '基于成果开展新工作' : record.status === 'todo' ? '开始这项工作' : '继续这项工作'}</Button>
        <ResourceActions resource={{ kind: 'task', key: `task:${taskId}`, label: record.title, href: href(`/tasks/${encodeURIComponent(taskId)}`) }} />
      </div></div>
      <TaskOverview record={record} onRelativeLink={(linkHref) => { setSelectedArtifact(null); setAlert(null); void artifacts.openIntentDocument(linkHref); }} />
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
            <Button key={tab.id} className={`detail-tab${activeTab === tab.id ? ' active' : ''}`} type="text" data-task-tab={tab.id} aria-selected={activeTab === tab.id} onClick={() => selectTab(tab.id)}>
              {tab.label}
            </Button>
          ))}
        </div>
        <div id="task-active-actions" className={`detail-tab-actions${terminal ? ' hidden' : ''}`}>
          <Button id="task-edit-action" size="small" onClick={() => actions.setActionModal('edit')}>
            {record.status === 'todo' ? '编辑待办意向' : '编辑进行中的任务'}
          </Button>
          <Button id="task-complete-action" size="small" onClick={() => { void actions.completion.open(); }}>
            {record.isParent ? '完成父任务' : '结束任务'}
          </Button>
          <Button id="task-abandon-action" size="small" danger onClick={() => actions.setActionModal('abandon')}>放弃任务</Button>
        </div>
      </nav>

      <div id="task-overview-panel" className={activeTab === 'overview' ? '' : 'hidden'} data-task-panel="overview">
        <div className="task-overview-columns"><div className="task-overview-content">
        <TaskWorkContextCard taskId={taskId} data={workContext.data} loading={workContext.loading} error={workContext.error} refresh={workContext.refresh} />
        <ParentCoordinationPanel
          data={currentCoordination}
          loading={evidence.coordinationLoading}
          onRefresh={() => { void evidence.refreshCoordination(); }}
          taskHref={(childTaskId) => href(`/tasks/${encodeURIComponent(childTaskId)}`)}
        />
        {terminal && !currentCoordination?.isParent && <TaskOutcomeSummary record={record} />}
        {data.retrospectiveDocument.registered && <RetrospectiveDocumentCard taskId={record.taskId} recordDigest={data.recordDigest} reference={data.retrospectiveDocument} onRecordUpdated={detail.refresh} />}
        <section className="task-existing-artifacts"><h2>已有成果与依据</h2><p className="section-copy">从关联方案、原型和专业结果继续了解当前工作。</p><div className="task-artifact-shortcuts"><Button onClick={() => selectTab('prototype')}>查看页面原型</Button><Button onClick={() => selectTab('evidence')}>查看审查与验证</Button></div>                <section className="task-change-links-overview">
                  <h3>关联方案</h3>
                  <div id="task-detail-changes">
                    {!record.changes.length ? '尚未关联方案'  : (
                      <span className="task-change-links">
                        {record.changes.map((reference) => {
                          const key = `${reference.project}/${reference.change}`;
                          return (
                            <Link state={location.state} key={key} className="task-change-link available" to={href(`/tasks/${encodeURIComponent(taskId)}/changes/${encodeURIComponent(reference.project)}/${encodeURIComponent(reference.change)}`)}>
                              <strong>{key}</strong><small>打开时检查当前状态</small>
                            </Link>
                          );
                        })}
                      </span>
                    )}
                  </div>
                </section>
          <section id="task-change-briefs" className="task-change-briefs" aria-live="polite">
            {artifacts.briefs.map((item, index) => {
              if (item.kind === 'empty') return currentCoordination?.mode === 'parent' ? null : <section key="empty" className="panel">尚未关联方案。可以先查看任务目标与当前工作摘要。</section>;
              if (item.kind === 'missing') return <section key={item.key} className="panel brief-missing">{item.message}</section>;
              return <div key={item.key || index} className="task-change-artifacts"><div className="task-artifact-shortcuts">{taskChangeArtifacts(item.change).filter(entry => entry.artifact.exists && entry.artifact.content != null).map(entry => <Button key={entry.artifact.path} data-task-artifact={entry.artifact.path} onClick={() => { artifacts.closeDocument(); setSelectedArtifact({ key: item.key, path: entry.artifact.path }); }}>阅读{entry.label}</Button>)}</div><ChangeBriefPanel change={item.change} /></div>;
            })}
          </section>
</section>
        </div><aside className="task-context-sidebar"><h3>所属范围</h3><dl>
          <dt>项目</dt><dd>{record.scope.projects.length ? record.scope.projects.map((project) => <Link key={project} to={href(`/projects/${encodeURIComponent(project)}`)}>{project}</Link>) : '工作空间'}</dd>
          <dt>服务</dt><dd>{record.scope.services.length ? record.scope.services.map((service) => <Link key={`${service.project}/${service.service}`} to={href(`/services/${encodeURIComponent(service.project)}/${encodeURIComponent(service.service)}`)}>{service.service}</Link>) : '未限定服务'}</dd>
          <dt>最近更新</dt><dd>{formatDateTime(record.updatedAt)}</dd>
          <TaskRelations data={data} taskHref={(id) => href(`/tasks/${encodeURIComponent(id)}`)} />
        </dl></aside></div>
        <details className={`task-technical-overview${currentCoordination?.mode === 'parent' ? ' parent-mode' : ' ordinary-mode'}`}>
          <summary>任务记录与技术事实</summary>
          {!data.retrospectiveDocument.registered && <RetrospectiveDocumentCard taskId={record.taskId} recordDigest={data.recordDigest} reference={data.retrospectiveDocument} onRecordUpdated={detail.refresh} />}
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
                <Fact label="项目范围" value={<span id="task-detail-projects">{record.scope.projects.join('、') || '无'}</span>} />
                <Fact label="服务范围" value={<span id="task-detail-services">{lines(record.scope.services, 'service').replaceAll('\n', '、') || '无'}</span>} />
                <Fact label="结果" value={<span id="task-detail-result">{resultText}</span>} />
                <Fact label="创建时间" value={<span id="task-detail-created">{formatDateTime(record.createdAt)}</span>} />
                <Fact label="更新时间" value={<span id="task-detail-updated">{formatDateTime(record.updatedAt)}</span>} />
              </dl>
            </article>
            <aside className="panel facts-panel">
              <p className="eyebrow">技术事实</p><h2>读取证据</h2>
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

      <TaskEditModal
        open={actions.actionModal === 'edit'} todo={record.status === 'todo'} editState={actions.edit.editState}
        title={actions.edit.title} intent={actions.edit.intent} projects={actions.edit.projectsText} services={actions.edit.servicesText}
        parentTaskId={actions.edit.parentTaskId} parentOptions={actions.edit.parentOptions} parentOptionsLoading={actions.edit.parentOptionsLoading}
        saving={actions.edit.saving} onClose={() => actions.setActionModal(null)} onSubmit={(event) => { void actions.edit.save(event); }}
        onOpenParents={() => { void actions.edit.loadParentOptions(); }} setTitle={actions.edit.setTitle} setIntent={actions.edit.setIntent}
        setProjects={actions.edit.setProjectsText} setServices={actions.edit.setServicesText} setParentTaskId={actions.edit.setParentTaskId}
      />
      <TaskCompleteModal
        open={actions.actionModal === 'complete'} snapshot={actions.completion.snapshot} draft={actions.completion.draft} summary={actions.completion.summary}
        onClose={() => actions.setActionModal(null)} onSubmit={(event) => { void actions.completion.submit(event); }}
        setDraft={actions.completion.setDraft} setSummary={actions.completion.setSummary}
      />
      <TaskAbandonModal
        open={actions.actionModal === 'abandon'} reason={actions.abandonment.reason} onClose={() => actions.setActionModal(null)}
        onSubmit={(event) => { void actions.abandonment.submit(event); }} setReason={actions.abandonment.setReason}
      />

      <PrototypeTab active={activeTab === 'prototype'} workspaceId={workspaceId} data={artifacts.prototypeData} loading={artifacts.prototypeLoading} error={artifacts.prototypeError} onRefresh={() => { void artifacts.refreshPrototype(); }} />
      <EvidenceTab
        active={activeTab === 'evidence'} taskId={taskId} taskActive={record.status === 'active'}
        reviewData={evidence.reviewData} verificationData={evidence.verificationData}
        reviewLoading={evidence.reviewLoading} verificationLoading={evidence.verificationLoading}
        reviewError={evidence.reviewError} verificationError={evidence.verificationError}
        onRefreshReview={() => { void evidence.refreshReview(); }} onRefreshVerification={() => { void evidence.refreshVerification(); }}
        openAgentAction={openAgentAction}
      />
    </div>
    {artifactChange && selectedArtifact ? <TaskArtifactReader change={artifactChange} artifactPath={selectedArtifact.path} sourceHref={href(`/tasks/${encodeURIComponent(taskId)}/changes/${selectedArtifact.key.split('/').map(encodeURIComponent).join('/')}`)} onClose={closeArtifact} onSelect={(path) => setSelectedArtifact({ ...selectedArtifact, path })} /> : <TaskDocumentPreviewModal reference={artifacts.documentReference} onClose={artifacts.closeDocument} loadDocument={artifacts.loadProjectDocument} />}
    </div>
  );
}
