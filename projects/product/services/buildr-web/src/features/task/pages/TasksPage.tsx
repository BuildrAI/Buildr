import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, Button, Empty, Form, Input, Select, Typography } from 'antd';
import { RefreshButton } from '../../../components/RefreshButton';
import type { TaskListRequest } from '../../../../build/generated/task-dto';
import { useTaskList, type WorkspaceResponse } from '../hooks/useTaskList';
import { useAppShell } from '../../../app/AppShellContext';
import { useResourcePreview } from '../../../app/resource-preview';
import { workspaceHref } from '../../../lib/labels';
import { TaskTable, taskProjectGroup } from '../components/TaskTable';
import { isIndexedTaskQuery } from '../task-search';
import { useTaskListContexts } from '../hooks/useTaskListContexts';
import { TaskFilters } from '../components/TaskFilters';
import { useWorkbenchPreferences } from '../../workbench/hooks/useWorkbenchPreferences';
import { captureTaskListPosition, loadTaskListPosition, taskListScrollHost } from '../taskNavigation';

type TaskStatusFilter = NonNullable<TaskListRequest['status']>;
type BooleanFilter = NonNullable<TaskListRequest['taskType']>;
type RetrospectiveFilter = NonNullable<TaskListRequest['retrospectiveState']>;

function projectOptionLabel(code: string, names: Record<string, string>): string {
  return names[code] || code;
}

function serviceOptionLabel(key: string, serviceNames: Record<string, string>): string {
  if (serviceNames[key]) return serviceNames[key];
  const slash = key.indexOf('/');
  return slash >= 0 ? key.slice(slash + 1) : key;
}

export function TasksPage() {
  const { workspaceId, setWorkspace, setBreadcrumbParts, taskListResetToken } = useAppShell();
  const location = useLocation();
  const previews = useResourcePreview();
  const previewState = previews?.states[location.pathname];
  const activePreview = previewState?.items.find(item => item.kind === previewState.active);
  const activeTaskId = activePreview?.kind === 'task-document' ? activePreview.taskId : activePreview && ['task', 'composite-task'].includes(activePreview.kind) ? activePreview.id : undefined;
  const [searchParams, setSearchParams] = useSearchParams();
  const preferences = useWorkbenchPreferences(workspaceId);
  const [preferenceError, setPreferenceError] = useState<string | null>(null);
  const [pendingPin, setPendingPin] = useState<string>();
  const restorePosition = useRef(loadTaskListPosition(location.pathname + location.search));
  const navigate = useNavigate();
  const href = (path: string) => workspaceHref(workspaceId, path);

  const [q, setQ] = useState(searchParams.get('q') || '');
  const query = searchParams.get('q') || '';
  const updateFilters = useCallback((values: Record<string, string>) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(values).forEach(([key, value]) => value ? next.set(key, value) : next.delete(key));
    restorePosition.current = null;
    setSearchParams(next, { replace: true, state: location.state });
  }, [searchParams, setSearchParams, location.state]);
  const [queryMessage, setQueryMessage] = useState('');
  const rawStatus = searchParams.get('status') || 'open';
  const status: TaskStatusFilter = ['all', 'open', 'todo', 'active', 'completed', 'abandoned'].includes(rawStatus) ? rawStatus as TaskStatusFilter : 'open';
  const project = searchParams.get('project') || '';
  const service = searchParams.get('service') || '';
  const hasChildren = (['ordinary', 'composite'].includes(searchParams.get('type') || '') ? searchParams.get('type') : 'all') as BooleanFilter;
  const retrospectiveState = (['missing', 'pending-decision', 'decided'].includes(searchParams.get('retrospective') || '') ? searchParams.get('retrospective') : 'all') as RetrospectiveFilter;
  const grouped = searchParams.get('group') === 'project';
  const [filterOpen, setFilterOpen] = useState(false);
  const [draftStatus, setDraftStatus] = useState<TaskStatusFilter>('open');
  const [draftProject, setDraftProject] = useState('');
  const [draftService, setDraftService] = useState('');
  const [draftHasChildren, setDraftHasChildren] = useState<BooleanFilter>('all');
  const [draftRetrospectiveState, setDraftRetrospectiveState] = useState<RetrospectiveFilter>('all');

  const filters: TaskListRequest = {
    ...(query ? { q: query } : {}),
    ...(project ? { project } : {}), ...(service ? { service } : {}),
    status, ...(hasChildren !== 'all' ? { taskType: hasChildren } : {}),
    ...(retrospectiveState !== 'all' ? { retrospectiveState } : {}),
  };
  const onWorkspace = useCallback((workspace: WorkspaceResponse) => {
    setWorkspace(workspace);
    setBreadcrumbParts([workspace.workspace.name, '任务']);
  }, [setWorkspace, setBreadcrumbParts]);
  const { tasks, totalTaskCount, matchingTaskCount, filterProjects, filterServices, projectNames, serviceNames, loading, loadingMore, errorMessage, loadMoreError, hasMore, loadMore, retryLoadMore, reload, revision } = useTaskList({ workspaceId, filters, onWorkspace });
  const observedResetToken = useRef(taskListResetToken);
  useEffect(() => {
    if (observedResetToken.current === taskListResetToken) return;
    observedResetToken.current = taskListResetToken;
    void reload();
  }, [taskListResetToken, reload]);

  const listContexts = useTaskListContexts(workspaceId, tasks, revision);

  const draftServiceOptions = draftProject
    ? filterServices.filter((item) => item.startsWith(`${draftProject}/`))
    : filterServices;

  const filtersActive = status !== 'open' || Boolean(project) || Boolean(service)
    || hasChildren !== 'all' || retrospectiveState !== 'all';

  const syncFilterDraft = () => {
    setDraftStatus(status);
    setDraftProject(project);
    setDraftService(service);
    setDraftHasChildren(hasChildren);
    setDraftRetrospectiveState(retrospectiveState);
  };

  const resetFilterDraft = () => {
    setDraftStatus('open');
    setDraftProject('');
    setDraftService('');
    setDraftHasChildren('all');
    setDraftRetrospectiveState('all');
  };

  const applyFilterDraft = () => {
    updateFilters({ status: draftStatus, project: draftProject, service: draftService, type: draftHasChildren, retrospective: draftRetrospectiveState });
    setFilterOpen(false);
  };

  const visibleTasks = grouped ? [...tasks].sort((left, right) => taskProjectGroup(left, projectNames).localeCompare(taskProjectGroup(right, projectNames), 'zh-CN')) : tasks;
  const openTask = (taskId: string) => {
    const from = location.pathname + location.search;
    const position = captureTaskListPosition(from, tasks.length);
    if (previews?.open(location.pathname, href(`/tasks/${encodeURIComponent(taskId)}${tasks.find(item => item.record.taskId === taskId)?.record.isParent ? '?taskType=composite' : ''}`))) return;
    navigate(href(`/tasks/${encodeURIComponent(taskId)}${tasks.find(item => item.record.taskId === taskId)?.record.isParent ? '?taskType=composite' : ''}`), { state: { from, taskListPosition: position } });
  };
  const togglePin = async (taskId: string) => {
    setPendingPin(taskId); setPreferenceError(null);
    try {
      if (preferences.has('pinned-task', taskId)) await preferences.remove('pinned-task', taskId);
      else await preferences.set('pinned-task', taskId);
    } catch (cause) { setPreferenceError(cause instanceof Error ? cause.message : '置顶未能保存'); }
    finally { setPendingPin(undefined); }
  };
  useEffect(() => {
    const position = restorePosition.current;
    if (!position || loading || tasks.length === 0) return;
    if (tasks.length < position.count && hasMore && !loadingMore && !loadMoreError) { loadMore(); return; }
    if (loadingMore) return;
    const host = taskListScrollHost();
    host.scrollTo({ top: position.top });
    restorePosition.current = null;
  }, [tasks.length, loading, hasMore, loadingMore, loadMoreError, loadMore]);
  useEffect(() => setQ(query), [query]);
  const prefetchTaskId = hasMore && visibleTasks.length >= 40
    ? visibleTasks[Math.max(0, visibleTasks.length - 11)]?.record.taskId
    : undefined;

  useEffect(() => {
    const value = q.trim();
    const searchable = isIndexedTaskQuery(value);
    setQueryMessage(searchable ? '' : '每个关键词至少输入3个字符；完整任务编号可使用 #task-id。');
    if (!searchable) return;
    const timeout = window.setTimeout(() => { if (value !== query) updateFilters({ q: value }); }, 200);
    return () => window.clearTimeout(timeout);
  }, [q, query, updateFilters]);

  useEffect(() => {
    if (!prefetchTaskId || loadingMore || loadMoreError || typeof IntersectionObserver === 'undefined') return;
    const row = document.querySelector<HTMLElement>('#task-table-body [data-task-prefetch="true"]');
    const root = (taskListScrollHost() instanceof HTMLElement ? taskListScrollHost() as HTMLElement : null);
    if (!row) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) loadMore();
    }, { root, threshold: 0.1 });
    observer.observe(row);
    return () => observer.disconnect();
  }, [prefetchTaskId, loadingMore, loadMoreError, loadMore]);

  useEffect(() => {
    setBreadcrumbParts([(document.getElementById('shell-workspace-name')?.textContent || '工作空间'), '任务']);
  }, [setBreadcrumbParts]);

  const filterPopup = (
    <div id="task-filter-popover" className="task-filter-popover">
      <Form
        id="task-filter-form"
        className={`task-filter-grid${loading ? ' is-loading' : ''}`}
        layout="vertical"
        onSubmitCapture={(event: FormEvent) => event.preventDefault()}
      >
        <Form.Item label="状态">
          <Select
            id="task-filter-status"
            popupMatchSelectWidth
            getPopupContainer={() => document.getElementById('task-filter-popover') || document.body}
            value={draftStatus}
            onChange={(next) => {
              setDraftStatus(next);
              if (['open', 'todo', 'active'].includes(next) && ['pending-decision', 'decided'].includes(draftRetrospectiveState)) {
                setDraftRetrospectiveState('all');
              }
            }}
            options={[
              { value: 'all', label: '全部' },
              { value: 'active', label: '进行中' },
              { value: 'todo', label: '待办' },
              { value: 'completed', label: '已完成' },
              { value: 'abandoned', label: '已放弃' },
              { value: 'open', label: '未结束（进行中 + 待办）' },
            ]}
          />
        </Form.Item>
        <Form.Item label="项目">
          <Select
            id="task-filter-project"
            popupMatchSelectWidth
            getPopupContainer={() => document.getElementById('task-filter-popover') || document.body}
            value={draftProject || 'all'}
            onChange={(next) => {
              setDraftProject(next === 'all' ? '' : next);
              setDraftService('');
            }}
            options={[
              { value: 'all', label: '全部项目' },
              ...filterProjects.map((item) => ({
                value: item,
                label: projectOptionLabel(item, projectNames),
              })),
            ]}
          />
        </Form.Item>
        <Form.Item label="服务">
          <Select
            id="task-filter-service"
            popupMatchSelectWidth
            getPopupContainer={() => document.getElementById('task-filter-popover') || document.body}
            value={draftService || 'all'}
            onChange={(next) => setDraftService(next === 'all' ? '' : next)}
            options={[
              { value: 'all', label: '全部服务' },
              ...draftServiceOptions.map((item) => ({
                value: item,
                label: serviceOptionLabel(item, serviceNames),
              })),
            ]}
          />
        </Form.Item>
        <Form.Item label="任务类型">
          <Select
            id="task-filter-children"
            popupMatchSelectWidth
            getPopupContainer={() => document.getElementById('task-filter-popover') || document.body}
            value={draftHasChildren}
            onChange={setDraftHasChildren}
            options={[
              { value: 'all', label: '不限' },
              { value: 'composite', label: '组合任务' },
              { value: 'ordinary', label: '普通任务' },
            ]}
          />
        </Form.Item>
        <Form.Item className="task-filter-span" label="复盘文档">
          <Select
            id="task-filter-retrospective"
            popupMatchSelectWidth
            getPopupContainer={() => document.getElementById('task-filter-popover') || document.body}
            value={draftRetrospectiveState}
            onChange={(next) => {
              setDraftRetrospectiveState(next);
              if (next !== 'all') {
                setDraftStatus('all');
              }
            }}
            options={[
              { value: 'all', label: '不限' },
              { value: 'missing', label: '无复盘文档' },
              { value: 'pending-decision', label: '等待决定' },
              { value: 'decided', label: '已经决定' },
            ]}
          />
        </Form.Item>
      </Form>
      <div className="task-filter-popover-actions">
        <Button id="task-filter-clear" onClick={resetFilterDraft}>
          重置
        </Button>
        <Button id="task-filter-apply" type="primary" onClick={applyFilterDraft}>
          确认
        </Button>
      </div>
    </div>
  );

  const showTable = visibleTasks.length > 0;
  const showEmpty = !loading && visibleTasks.length === 0;

  return (
    <>
      <section className="resource-toolbar task-workbench-toolbar">
        <div className="task-toolbar-main">
          <Typography.Title level={2} style={{ margin: 0 }}>任务</Typography.Title>

        </div>
        <div className="task-toolbar-meta">
          <span id="tasks-state" className="count-label">
            {loading ? '正在读取…' : (errorMessage ? '读取失败' : (visibleTasks.length < matchingTaskCount ? `已加载 ${visibleTasks.length} / 共 ${matchingTaskCount} 个任务` : `${matchingTaskCount} 个任务`))}
          </span>
          <div className="task-list-tools">
            <RefreshButton id="task-list-refresh" label="刷新任务列表" loading={loading} onClick={() => void reload()} />
            <TaskFilters open={filterOpen} active={filtersActive} content={filterPopup} onOpenChange={(open) => {
                if (open) syncFilterDraft();
                setFilterOpen(open);
              }} />
          </div>
        </div>
        <div className="task-state-tabs" role="tablist" aria-label="任务状态">
          {([['open', '未结束'], ['active', '进行中'], ['todo', '待办'], ['completed', '已完成'], ['all', '全部']] as const).map(([value, label]) => <Button key={value} role="tab" aria-selected={status === value} type="text" className={status === value ? 'active' : ''} data-task-status={value} onClick={() => updateFilters({ status: value })}>{label}</Button>)}
        </div>
        <div className="task-workbench-filterline">
        <Input
          id="task-filter-q"
          className="task-search-slot"
          type="search"
          allowClear
          autoComplete="off"
          placeholder="搜索标题、目标或编号"
          value={q}
          onChange={(event) => setQ(event.target.value)}
        />
        <Select id="task-project-quick-filter" aria-label="筛选项目" value={project || 'all'} onChange={(value) => updateFilters({ project: value === 'all' ? '' : value, service: '' })} options={[{ value: 'all', label: '全部项目' }, ...filterProjects.map((value) => ({ value, label: projectOptionLabel(value, projectNames) }))]} />
        <Button id="task-group-toggle" onClick={() => updateFilters({ group: grouped ? '' : 'project' })}>{grouped ? '按项目分组' : '不分组'}</Button>
        </div>
        <span id="task-search-hint" className={`task-search-hint${queryMessage ? ' visible' : ''}`} role="status">{queryMessage}</span>
      </section>
      {errorMessage && <Alert type="error" showIcon message="任务列表刷新失败" description={errorMessage} action={<Button onClick={() => void reload()}>重试</Button>} />}
      {listContexts.error && <Alert type="warning" message="最近进展暂时不可读取，任务目标和已有结果仍可查看。" />}
      {preferenceError && <Alert type="warning" message={preferenceError} closable onClose={() => setPreferenceError(null)} />}
      <section className="resource-list-section task-workbench-list">
        <div id="task-table-wrap" className={showTable ? undefined : 'hidden'}>
          <TaskTable activeTaskId={activeTaskId} tasks={visibleTasks} prefetchTaskId={prefetchTaskId} projectNames={projectNames} contexts={listContexts.contexts} grouped={grouped} taskHref={(id) => href(`/tasks/${encodeURIComponent(id)}${tasks.find(item => item.record.taskId === id)?.record.isParent ? '?taskType=composite' : ''}`)} onOpen={openTask} isPinned={(id) => preferences.has('pinned-task', id)} onPin={(id) => { void togglePin(id); }} pending={pendingPin} />
          {(loadingMore || hasMore || loadMoreError) && <div id="task-load-more-state" className="task-load-more-state" aria-live="polite">
            {loadingMore ? '正在继续读取…' : null}
            {hasMore && !loadingMore && !loadMoreError ? <Button onClick={loadMore}>查看更多任务</Button> : null}
            {loadMoreError ? <Button size="small" onClick={retryLoadMore}>继续读取失败，重试</Button> : null}
          </div>}
        </div>
        <div id="task-empty" className={`empty-state${showEmpty ? '' : ' hidden'}`}>
          {showEmpty ? (
            <Empty
              description={errorMessage
                || (totalTaskCount === 0
                  ? '当前工作空间还没有正式任务记录。可以提出一个目标，交给智能体（Agent）开始。'
                  : '当前筛选没有匹配任务。')}
            />
          ) : null}
        </div>
      </section>
    </>
  );
}
