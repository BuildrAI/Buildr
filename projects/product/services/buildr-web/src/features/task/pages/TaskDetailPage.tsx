import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Alert, Button, Dropdown, Spin } from 'antd';
import { MoreOutlined } from '@ant-design/icons';
import { useAppShell } from '../../../app/AppShellContext';
import { InsideResourcePreview } from '../../../app/resource-preview';
import { DrawerShell } from '../../../components/DrawerShell';
import { RefreshButton } from '../../../components/RefreshButton';
import { workspaceHref } from '../../../lib/labels';
import { TaskOverview } from '../components/TaskOverview';
import { TaskChecklist } from '../components/TaskChecklist';
import { TaskSummary } from '../components/TaskSummary';
import { useTaskVisit } from '../hooks/useTaskVisit';
import { useWorkbenchPreferences } from '../../workbench/hooks/useWorkbenchPreferences';
import { TaskContextDrawer } from '../components/TaskWorkContextCard';
import { TaskWorkPath } from '../components/TaskWorkPath';
import { TaskNodeContent } from '../components/TaskNodeContent';
import { TaskReadingPane } from '../components/TaskReadingPane';
import { taskDocuments, type TaskReadTarget } from '../components/taskWorkContent';
import { TaskAbandonModal } from '../components/TaskAbandonModal';
import { TaskCompleteModal } from '../components/TaskCompleteModal';
import { TaskEditModal } from '../components/TaskEditModal';
import { useTaskActions, type TaskAlert } from '../hooks/useTaskActions';
import { useTaskArtifacts } from '../hooks/useTaskArtifacts';
import { useTaskDetail, type WorkspaceResponse } from '../hooks/useTaskDetail';
import { useTaskEvidence } from '../hooks/useTaskEvidence';
import { useTaskWorkContext } from '../hooks/useTaskWorkContext';
import { isTaskReadCancelled, useTaskRequestLifecycle } from '../hooks/useTaskRequestLifecycle';
import { useTaskContextEditor } from '../hooks/useTaskContextEditor';
import { useTaskReadingState } from '../hooks/useTaskReadingState';
import '../task-detail.css';

export function TaskDetailPage({ taskId: providedTaskId }: { taskId?: string } = {}) {
  const params = useParams();
  const taskId = providedTaskId || params.taskId || '';
  const insidePreview = useContext(InsideResourcePreview);
  const { workspaceId, setWorkspace, setBreadcrumbParts, openAgentAction, resetTaskList } = useAppShell();
  const workContext = useTaskWorkContext(taskId);
  const preferences = useWorkbenchPreferences(workspaceId);
  const refreshContextAndList = useCallback(() => { resetTaskList(); return workContext.refresh(); }, [resetTaskList, workContext.refresh]);
  const editor = useTaskContextEditor(taskId, workContext.data, refreshContextAndList);
  const reading = useTaskReadingState(taskId);
  const { selected, extraContent, selectNode } = reading;
  const currentTask = useRef(taskId);
  currentTask.current = taskId;
  const [alert, setAlert] = useState<TaskAlert>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [readerRefreshToken, setReaderRefreshToken] = useState(0);
  const lifecycle = useTaskRequestLifecycle();
  const href = (path: string) => workspaceHref(workspaceId, path);
  const onWorkspace = useCallback((workspace: WorkspaceResponse) => setWorkspace(workspace), [setWorkspace]);
  const onBreadcrumb = useCallback((workspaceName: string, title: string) => { if (!insidePreview) setBreadcrumbParts([workspaceName, '任务', title]); }, [insidePreview, setBreadcrumbParts]);
  const detail = useTaskDetail({ taskId, lifecycle, onWorkspace, onBreadcrumb });
  const refreshTaskAndList = useCallback(async () => { resetTaskList(); await detail.refresh(); }, [resetTaskList, detail.refresh]);
  const evidence = useTaskEvidence(taskId, lifecycle);
  const artifacts = useTaskArtifacts(taskId, detail.data, lifecycle);
  const preserveReading = useCallback(() => {}, []);
  const visitError = useTaskVisit(workspaceId, detail.data?.record);
  const actions = useTaskActions({ taskId, data: detail.data, refresh: refreshTaskAndList, refreshCoordination: evidence.refreshCoordination, showOverview: preserveReading, onAlert: setAlert });
  useEffect(() => { setAlert(null); }, [taskId]);
  useEffect(() => { if (artifacts.documentError) setAlert({ message: artifacts.documentError, error: true }); }, [artifacts.documentError]);
  useEffect(() => {
    if (artifacts.documentReference) reading.openExtra({ kind: 'document', title: artifacts.documentReference.documentPath.split('/').at(-1) || '相关文档', reference: artifacts.documentReference });
  }, [artifacts.documentReference]);
  const changeKeys = detail.data?.record.changes.map(change => `${change.project}/${change.change}`).join('|') || '';
  useEffect(() => { if (selected === 'design' && changeKeys && !artifacts.prototypeData && !artifacts.prototypeError) void artifacts.refreshPrototype(); }, [taskId, selected, changeKeys, artifacts.refreshPrototype]);
  const refresh = useCallback(async (includePrototype = selected === 'design') => {
    setRefreshing(true);
    try {
      const results = await Promise.allSettled([detail.refresh(), workContext.refresh(), evidence.refreshReview(), evidence.refreshVerification(), evidence.refreshCoordination(), ...(includePrototype ? [artifacts.refreshPrototype()] : [])]);
      const taskRead = results[0];
      if (currentTask.current === taskId && taskRead.status === 'rejected' && !isTaskReadCancelled(taskRead.reason)) setAlert({ message: '任务信息刷新失败，当前仍显示上次读取的内容。请重试。', error: true });
    } finally {
      if (currentTask.current === taskId) {
        setRefreshing(false);
        setReaderRefreshToken(value => value + 1);
      }
    }
  }, [taskId, selected, detail.refresh, workContext.refresh, evidence.refreshReview, evidence.refreshVerification, evidence.refreshCoordination, artifacts.refreshPrototype]);
  const closeExtraContent = () => { reading.closeExtra(); artifacts.closeDocument(); };
  const closeReadingDrawer = () => { reading.clearExtra(); artifacts.closeDocument(); };
  if (detail.error) return <Alert type="warning" message="任务不可用" description={detail.error} />;
  if (!detail.data || detail.data.record.taskId !== taskId) return <div className="task-content-loading"><Spin size="small" /> 正在读取任务…</div>;
  const data = detail.data, record = data.record;
  const terminal = !['todo', 'active'].includes(record.status);
  const documents = taskDocuments(artifacts.briefs);
  const continueWork = () => openAgentAction('task-continue', { taskId, title: record.title, intent: record.intent, status: record.status, projects: record.scope.projects, services: record.scope.services, result: record.result?.summary, progress: workContext.data?.context?.progress, nextStep: workContext.data?.context?.nextStep });
  const readContent = (target: TaskReadTarget, inDrawer = false) => <TaskReadingPane embedded inDrawer={inDrawer} refreshToken={readerRefreshToken} target={target} task={data} context={workContext.data?.context} artifacts={artifacts} evidence={evidence} workspaceId={workspaceId} href={href} onRead={reading.openExtra} onClose={closeExtraContent} onRespond={() => editor.open('respond')} onRelativeLink={link => void artifacts.openIntentDocument(link)} refreshTask={refreshTaskAndList} />;
  const headerActions = <>
    <RefreshButton id="task-detail-refresh" label="刷新任务" size="small" loading={refreshing} onClick={() => void refresh()} />
    <Dropdown menu={{ items: [
      { key: 'continue', label: <span id="task-continue">{terminal ? '基于成果生成新任务指令' : '生成接续指令'}</span> },
      ...(record.status === 'todo' ? [{key:'plan', label:<span id="task-plan-next">{preferences.has('planned-task', taskId) ? '移出接下来' : '加入接下来'}</span>}] : []),
      ...(!terminal ? [{ key: 'edit', label: <span id="task-edit-action">编辑任务</span> }, {key:'complete',label:<span id="task-complete-action">登记完成</span>}, {type:'divider' as const}, { key: 'abandon', label: <span id="task-abandon-action">放弃任务</span>, danger: true }] : []),
    ], onClick: ({ key }) => {
      if (key === 'continue') continueWork();
      else if (key === 'plan') void (preferences.has('planned-task', taskId) ? preferences.remove('planned-task', taskId) : preferences.set('planned-task', taskId)).catch(cause => setAlert({message:cause instanceof Error ? cause.message : '安排未能保存', error:true}));
      else if (key === 'complete') void actions.completion.open();
      else actions.setActionModal(key as 'edit' | 'abandon');
    } }} trigger={['click']}><Button id="task-more-actions" size="small" type="text" icon={<MoreOutlined />} aria-label="更多任务操作" /></Dropdown>
  </>;
  return <article ref={reading.rootRef} className="task-detail-page" id="task-detail-main" data-task-id={taskId}>
    <TaskOverview actions={headerActions} record={record} onRelativeLink={link => void artifacts.openIntentDocument(link)} onReadIntent={() => reading.openExtra({ kind: 'intent', title: '目标与说明' })} />
    {visitError && <Alert type="warning" message={visitError} />}
    {alert && <Alert id="task-detail-alert" type={alert.error ? 'error' : 'success'} message={alert.message} closable onClose={() => setAlert(null)} />}
    {data.referenceDiagnostics.length > 0 && <Alert id="task-reference-diagnostics" type="warning" message={`部分引用不可用：${data.referenceDiagnostics.map(item => item.message).join('；')}`} />}
    <TaskSummary briefs={artifacts.briefs} task={data} context={workContext.data} error={workContext.error} href={href} onRespond={() => editor.open('respond')} onOpen={(node, content) => { selectNode(node); if (content) reading.choose(node, content); if (content === 'review') reading.choose(`${node}:review`, ''); }} />
    <div className="task-detail-layout">
      <div className="task-detail-reading">
    <TaskWorkPath record={record} context={workContext.data?.context} selected={selected} onSelect={selectNode} />
    <TaskNodeContent choices={reading.choices} onChoose={reading.choose} selected={selected} record={record} documents={documents} briefs={artifacts.briefs} reviews={evidence.reviewData} verification={evidence.verificationData} reviewError={evidence.reviewError} verificationError={evidence.verificationError} reviewLoading={evidence.reviewLoading} verificationLoading={evidence.verificationLoading} prototypeCount={artifacts.prototypeData?.prototypes.length || 0} prototypeError={artifacts.prototypeError} hasRetrospective={Boolean(data.retrospectiveDocument.registered)} hasCoordination={data.taskRelations.children.length > 0} renderContent={readContent} />

      </div>
    <TaskChecklist briefs={artifacts.briefs} documents={documents} renderContent={readContent} />
    </div>
    <DrawerShell open={Boolean(extraContent)} title={extraContent?.kind === 'document' ? '引用文档' : extraContent?.title || '查看内容'} sub={record.title} width={720} rootClassName="task-reading-drawer" onClose={closeReadingDrawer} closeAriaLabel="关闭内容阅读" extra={<RefreshButton id="task-reading-refresh" label="刷新内容" size="small" loading={refreshing} onClick={() => void refresh(false)} />}>
      {extraContent && readContent(extraContent, true)}
    </DrawerShell>
    <TaskContextDrawer editor={editor} title={record.title} />
    <TaskEditModal message={alert?.error ? alert.message : undefined} onReread={() => void actions.edit.reread()} latest={actions.edit.latest} open={actions.actionModal === 'edit'} todo={record.status === 'todo'} editState={actions.edit.editState} title={actions.edit.title} intent={actions.edit.intent} projects={actions.edit.projectsText} services={actions.edit.servicesText} parentTaskId={actions.edit.parentTaskId} parentOptions={actions.edit.parentOptions} parentOptionsLoading={actions.edit.parentOptionsLoading} saving={actions.edit.saving} onClose={() => actions.setActionModal(null)} onSubmit={event => { void actions.edit.save(event); }} onOpenParents={() => { void actions.edit.loadParentOptions(); }} setTitle={actions.edit.setTitle} setIntent={actions.edit.setIntent} setProjects={actions.edit.setProjectsText} setServices={actions.edit.setServicesText} setParentTaskId={actions.edit.setParentTaskId} />
    <TaskCompleteModal open={actions.actionModal === 'complete'} snapshot={actions.completion.snapshot} draft={actions.completion.draft} summary={actions.completion.summary} onClose={() => actions.setActionModal(null)} onSubmit={event => { void actions.completion.submit(event); }} setDraft={actions.completion.setDraft} setSummary={actions.completion.setSummary} />
    <TaskAbandonModal open={actions.actionModal === 'abandon'} reason={actions.abandonment.reason} onClose={() => actions.setActionModal(null)} onSubmit={event => { void actions.abandonment.submit(event); }} setReason={actions.abandonment.setReason} />
  </article>;
}
