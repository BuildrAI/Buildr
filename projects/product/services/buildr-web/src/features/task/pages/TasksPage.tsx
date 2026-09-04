import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Alert, Button, Empty, Form, Input, Select, Typography } from 'antd';
import type { TaskListRequest } from '../api/generated/task-dto';
import { useTaskList, type TaskListItem } from '../hooks/useTaskList';
import { useAppShell } from '../../../app/AppShellContext';
import { workspaceHref } from '../../../lib/labels';
import { TaskTable } from '../components/TaskTable';
import { TaskFilters } from '../components/TaskFilters';

type TaskStatusFilter = NonNullable<TaskListRequest['status']>;
type BooleanFilter = NonNullable<TaskListRequest['hasChildren']>;
type RetrospectiveFilter = NonNullable<TaskListRequest['retrospectiveState']>;

function projectOptionLabel(code: string, names: Record<string, string>): string {
  return names[code] || code;
}

function serviceOptionLabel(key: string, serviceNames: Record<string, string>): string {
  if (serviceNames[key]) return serviceNames[key];
  const slash = key.indexOf('/');
  return slash >= 0 ? key.slice(slash + 1) : key;
}

function matchesTaskQuery(item: TaskListItem, raw: string): boolean {
  const text = raw.trim().replace(/^#/, '');
  if (!text) return true;
  const lowered = text.toLowerCase();
  const tokens = [...new Set(lowered.split(/[^0-9a-z\u0080-\uffff]+/).filter(Boolean))];
  const needles = tokens.length ? tokens : [lowered];
  const compactId = item.record.taskId.toLowerCase().replace(/[-_.]/g, '');
  const fields = [
    item.record.title,
    item.record.intent,
    item.record.taskId,
    compactId,
  ].map((value) => value.toLowerCase());
  return needles.every((needle) => {
    const compact = needle.replace(/[-_.]/g, '');
    return fields.some((field) => field.includes(needle) || (compact.length > 0 && field.includes(compact)));
  });
}

export function TasksPage() {
  const { workspaceId, setWorkspace, setBreadcrumbParts } = useAppShell();
  const { taskId: selectedTaskId } = useParams();
  const navigate = useNavigate();
  const href = (path: string) => workspaceHref(workspaceId, path);

  const [q, setQ] = useState('');
  const [status, setStatus] = useState<TaskStatusFilter>('open');
  const [project, setProject] = useState('');
  const [service, setService] = useState('');
  const [hasChildren, setHasChildren] = useState<BooleanFilter>('all');
  const [retrospectiveState, setRetrospectiveState] = useState<RetrospectiveFilter>('all');
  const [filterOpen, setFilterOpen] = useState(false);
  const [draftStatus, setDraftStatus] = useState<TaskStatusFilter>('open');
  const [draftProject, setDraftProject] = useState('');
  const [draftService, setDraftService] = useState('');
  const [draftHasChildren, setDraftHasChildren] = useState<BooleanFilter>('all');
  const [draftRetrospectiveState, setDraftRetrospectiveState] = useState<RetrospectiveFilter>('all');

  const filters: TaskListRequest = {
    ...(project ? { project } : {}), ...(service ? { service } : {}),
    ...(status !== 'all' ? { status } : {}), ...(hasChildren !== 'all' ? { hasChildren } : {}),
    ...(retrospectiveState !== 'all' ? { retrospectiveState } : {}),
  };
  const onWorkspace = useCallback((workspace: { rootPath: string; workspace: { name: string } }) => {
    setWorkspace(workspace);
    setBreadcrumbParts([workspace.workspace.name, '任务']);
  }, [setWorkspace, setBreadcrumbParts]);
  const { tasks, diagnostics, totalTaskCount, filterProjects, filterServices, projectNames, serviceNames, loading, errorMessage } = useTaskList({ workspaceId, filters, onWorkspace });

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
    setStatus(draftStatus);
    setProject(draftProject);
    setService(draftService);
    setHasChildren(draftHasChildren);
    setRetrospectiveState(draftRetrospectiveState);
    setFilterOpen(false);
  };

  const visibleTasks = useMemo(
    () => tasks.filter((item) => matchesTaskQuery(item, q)),
    [tasks, q],
  );

  useEffect(() => {
    setBreadcrumbParts([(document.getElementById('shell-workspace-name')?.textContent || '工作空间'), '任务']);
  }, [setBreadcrumbParts]);

  useEffect(() => {
    if (selectedTaskId || loading || errorMessage || visibleTasks.length === 0) return;
    if (window.matchMedia('(max-width: 899px)').matches) return;
    navigate(href(`/tasks/${encodeURIComponent(visibleTasks[0].record.taskId)}`), { replace: true });
  }, [selectedTaskId, loading, errorMessage, visibleTasks, href, navigate]);

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
              { value: 'open', label: '未结束（待办 + 进行中）' },
              { value: 'todo', label: '待办' },
              { value: 'active', label: '进行中' },
              { value: 'completed', label: '已完成' },
              { value: 'abandoned', label: '已放弃' },
              { value: 'all', label: '全部' },
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
        <Form.Item label="子任务">
          <Select
            id="task-filter-children"
            popupMatchSelectWidth
            getPopupContainer={() => document.getElementById('task-filter-popover') || document.body}
            value={draftHasChildren}
            onChange={setDraftHasChildren}
            options={[
              { value: 'all', label: '不限' },
              { value: 'yes', label: '有直接 Child' },
              { value: 'no', label: '无直接 Child' },
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
              if (['pending-decision', 'decided'].includes(next) && ['open', 'todo', 'active'].includes(draftStatus)) {
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

  const showTable = visibleTasks.length > 0 && !errorMessage;
  const showEmpty = !loading && (Boolean(errorMessage) || (visibleTasks.length === 0 && diagnostics.length === 0));

  return (
    <>
      <section className="resource-toolbar">
        <div className="task-toolbar-main">
          <Typography.Title level={2} style={{ margin: 0 }}>任务</Typography.Title>
          <p className="page-copy">查看正式任务的顶层事实并进行有限维护。正式任务由 Agent 创建，Buildr Web 不提供创建入口。</p>
        </div>
        <div className="task-toolbar-meta">
          <span id="tasks-state" className="count-label">
            {loading ? '正在读取…' : (errorMessage ? '读取失败' : `${visibleTasks.length} 个任务`)}
          </span>
          <div className="task-list-tools">
            <TaskFilters open={filterOpen} active={filtersActive} content={filterPopup} onOpenChange={(open) => {
                if (open) syncFilterDraft();
                setFilterOpen(open);
              }} />
          </div>
        </div>
        <Input
          id="task-filter-q"
          className="task-search-slot"
          type="search"
          allowClear
          autoComplete="off"
          placeholder="搜索标题、意图或编号"
          value={q}
          onChange={(event) => setQ(event.target.value)}
        />
      </section>
      <section className="resource-list-section">
        <div id="task-diagnostics" className={diagnostics.length ? '' : 'hidden'} role="status">
          {diagnostics.length ? (
            <Alert
              type="error"
              showIcon
              style={{ marginBottom: 12 }}
              message={`有 ${diagnostics.length} 条诊断：${diagnostics.map((item) => item.message).join('；')}`}
            />
          ) : null}
        </div>
        <div id="task-table-wrap" className={`management-table-wrap${showTable ? '' : ' hidden'}`}>
          <TaskTable tasks={visibleTasks} selectedTaskId={selectedTaskId} taskHref={(id) => href(`/tasks/${encodeURIComponent(id)}`)} onOpen={(id) => navigate(href(`/tasks/${encodeURIComponent(id)}`))} />
        </div>
        <div id="task-empty" className={`empty-state${showEmpty ? '' : ' hidden'}`}>
          {showEmpty ? (
            <Empty
              description={errorMessage
                || (totalTaskCount === 0
                  ? '当前工作空间还没有正式任务记录。正式任务由 Agent 创建。'
                  : '当前筛选没有匹配任务。')}
            />
          ) : null}
        </div>
      </section>
    </>
  );
}
