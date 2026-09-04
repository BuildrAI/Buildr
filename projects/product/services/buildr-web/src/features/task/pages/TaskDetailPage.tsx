import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Alert, Button } from 'antd';

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
import { TaskOverview } from '../components/TaskOverview';
import { TaskRelations } from '../components/TaskRelations';
import { Fact, lines, type TaskTab } from '../components/shared';
import { useTaskActions, type TaskAlert } from '../hooks/useTaskActions';
import { useTaskArtifacts } from '../hooks/useTaskArtifacts';
import { useTaskDetail, type WorkspacePayload } from '../hooks/useTaskDetail';
import { useTaskEvidence } from '../hooks/useTaskEvidence';
import { useTaskRequestLifecycle } from '../hooks/useTaskRequestLifecycle';

const TABS: Array<{ id: TaskTab; label: string }> = [
  { id: 'overview', label: '概览' },
  { id: 'prototype', label: '原型' },
  { id: 'evidence', label: '证据' },
];

export function TaskDetailPage() {
  const { taskId = '' } = useParams();
  const { workspaceId, setWorkspace, setBreadcrumbParts, openAgentAction } = useAppShell();
  const [activeTab, setActiveTab] = useState<TaskTab>('overview');
  const [alert, setAlert] = useState<TaskAlert>(null);
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;
  const lifecycle = useTaskRequestLifecycle();
  const href = (path: string) => workspaceHref(workspaceId, path);

  const onWorkspace = useCallback((workspace: WorkspacePayload) => setWorkspace(workspace), [setWorkspace]);
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
  const currentCoordination = evidence.coordinationData?.taskId === taskId ? evidence.coordinationData : null;

  return (
    <>
      <TaskOverview record={record} onRelativeLink={(linkHref) => { setAlert(null); void artifacts.openIntentDocument(linkHref); }} />
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
        <ParentCoordinationPanel
          data={currentCoordination}
          loading={evidence.coordinationLoading}
          onRefresh={() => { void evidence.refreshCoordination(); }}
          taskHref={(childTaskId) => href(`/tasks/${encodeURIComponent(childTaskId)}`)}
        />
        {!currentCoordination?.isParent && <TaskOutcomeSummary record={record} />}
        <RetrospectiveDocumentCard taskId={record.taskId} recordDigest={data.recordDigest} reference={data.retrospectiveDocument} onRecordUpdated={detail.refresh} />
        <details className={`task-technical-overview${currentCoordination?.mode === 'parent' ? ' parent-mode' : ' ordinary-mode'}`} open={!record.isParent}>
          <summary>技术事实、Change 与 Task Record</summary>
          <section id="task-change-briefs" className="task-change-briefs" aria-live="polite">
            {artifacts.briefs.map((item, index) => {
              if (item.kind === 'empty') return currentCoordination?.mode === 'parent' ? null : <section key="empty" className="panel">这个任务没有关联 Change，因此没有 Brief 可展示。</section>;
              if (item.kind === 'missing') return <section key={item.key} className="panel brief-missing">{item.message}</section>;
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
                            <Link key={key} className="task-change-link available" to={href(`/tasks/${encodeURIComponent(taskId)}/changes/${encodeURIComponent(reference.project)}/${encodeURIComponent(reference.change)}`)}>
                              <strong>{key}</strong><small>打开时检查当前状态</small>
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
      <TaskDocumentPreviewModal reference={artifacts.documentReference} onClose={artifacts.closeDocument} loadDocument={artifacts.loadProjectDocument} />
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
    </>
  );
}
