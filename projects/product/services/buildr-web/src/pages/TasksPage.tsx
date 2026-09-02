import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Alert, Button, Empty, Form, Input, Popover, Select, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { FilterOutlined } from '@ant-design/icons';
import { api, tasksApi } from '../api';
import type { TaskListRequest, TaskListResponse } from '../api/generated/task-record-http-dto';
import { useAppShell } from '../app/AppShellContext';
import { workspaceHref } from '../lib/labels';
import { taskStatusLabel } from '../lib/taskLabels';

type WorkspacePayload = { rootPath: string; workspace: { name: string } };

type TaskListItem = TaskListResponse['tasks'][number];
type TaskStatusFilter = NonNullable<TaskListRequest['status']>;
type BooleanFilter = NonNullable<TaskListRequest['hasChildren']>;
type RetrospectiveFilter = NonNullable<TaskListRequest['retrospectiveState']>;

type ProjectInfo = { code: string; name: string };
type ServiceInfo = { code: string; name: string; projectCode: string };

function projectOptionLabel(code: string, names: Record<string, string>): string {
  return names[code] || code;
}

function serviceOptionLabel(key: string, serviceNames: Record<string, string>): string {
  if (serviceNames[key]) return serviceNames[key];
  const slash = key.indexOf('/');
  return slash >= 0 ? key.slice(slash + 1) : key;
}

const TableBody = (props: React.HTMLAttributes<HTMLTableSectionElement>) => (
  <tbody id="task-table-body" {...props} />
);

function taskStatusRank(status: string): number {
  if (status === 'todo') return 0;
  if (status === 'active') return 1;
  return 2;
}

function sortTaskList(tasks: TaskListItem[]): TaskListItem[] {
  return [...tasks].sort((left, right) => {
    const byStatus = taskStatusRank(left.record.status) - taskStatusRank(right.record.status);
    if (byStatus !== 0) return byStatus;
    return right.record.updatedAt.localeCompare(left.record.updatedAt);
  });
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

  const [tasks, setTasks] = useState<TaskListItem[]>([]);
  const [diagnostics, setDiagnostics] = useState<Array<{ message: string }>>([]);
  const [totalTaskCount, setTotalTaskCount] = useState(0);
  const [filterProjects, setFilterProjects] = useState<string[]>([]);
  const [filterServices, setFilterServices] = useState<string[]>([]);
  const [projectNames, setProjectNames] = useState<Record<string, string>>({});
  const [serviceNames, setServiceNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const catalogsLoaded = useRef(false);

  const [q, setQ] = useState('');
  const [status, setStatus] = useState<TaskStatusFilter>('all');
  const [project, setProject] = useState('');
  const [service, setService] = useState('');
  const [hasChildren, setHasChildren] = useState<BooleanFilter>('all');
  const [retrospectiveState, setRetrospectiveState] = useState<RetrospectiveFilter>('all');
  const [filterOpen, setFilterOpen] = useState(false);
  const [draftStatus, setDraftStatus] = useState<TaskStatusFilter>('all');
  const [draftProject, setDraftProject] = useState('');
  const [draftService, setDraftService] = useState('');
  const [draftHasChildren, setDraftHasChildren] = useState<BooleanFilter>('all');
  const [draftRetrospectiveState, setDraftRetrospectiveState] = useState<RetrospectiveFilter>('all');

  const workspaceLoaded = useRef(false);
  const requestGeneration = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const draftServiceOptions = draftProject
    ? filterServices.filter((item) => item.startsWith(`${draftProject}/`))
    : filterServices;

  const filtersActive = status !== 'all' || Boolean(project) || Boolean(service)
    || hasChildren !== 'all' || retrospectiveState !== 'all';

  const syncFilterDraft = () => {
    setDraftStatus(status);
    setDraftProject(project);
    setDraftService(service);
    setDraftHasChildren(hasChildren);
    setDraftRetrospectiveState(retrospectiveState);
  };

  const resetFilterDraft = () => {
    setDraftStatus('all');
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

  const load = useCallback(async () => {
    if (!workspaceId) return;
    const generation = ++requestGeneration.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setErrorMessage(null);

    const input: TaskListRequest = {
      ...(project ? { project } : {}),
      ...(service ? { service } : {}),
      ...(status !== 'all' ? { status } : {}),
      ...(hasChildren !== 'all' ? { hasChildren } : {}),
      ...(retrospectiveState !== 'all' ? { retrospectiveState } : {}),
    };

    try {
      const [data, workspace, projectsPayload] = await Promise.all([
        tasksApi.list(input, { signal: controller.signal }),
        workspaceLoaded.current
          ? Promise.resolve(undefined)
          : api('/api/v1/workspace', { signal: controller.signal }) as Promise<WorkspacePayload>,
        catalogsLoaded.current
          ? Promise.resolve(undefined)
          : api('/api/v1/projects', { signal: controller.signal }) as Promise<{ projects: ProjectInfo[] }>,
      ]);
      if (generation !== requestGeneration.current) return;
      if (!workspaceLoaded.current) {
        if (workspace) {
          setWorkspace(workspace);
          setBreadcrumbParts([workspace.workspace.name, '任务']);
          workspaceLoaded.current = true;
        }
      }
      if (!catalogsLoaded.current) {
        if (projectsPayload?.projects) {
          const nextProjectNames = Object.fromEntries(
            projectsPayload.projects.map((item) => [item.code, item.name || item.code]),
          );
          setProjectNames(nextProjectNames);
          const serviceEntries = await Promise.all(projectsPayload.projects.map(async (project) => {
            try {
              const payload = await api(
                `/api/v1/projects/${encodeURIComponent(project.code)}/services`,
                { signal: controller.signal },
              ) as { services: ServiceInfo[] };
              return payload.services.map((service) => [
                `${project.code}/${service.code}`,
                service.name || service.code,
              ] as const);
            } catch {
              return [] as Array<readonly [string, string]>;
            }
          }));
          if (generation !== requestGeneration.current) return;
          setServiceNames(Object.fromEntries(serviceEntries.flat()));
          catalogsLoaded.current = true;
        }
      }
      setTasks(sortTaskList(data.tasks));
      setDiagnostics(data.diagnostics);
      setTotalTaskCount(data.totalTaskCount);
      setFilterProjects(data.filterOptions.projects);
      setFilterServices(data.filterOptions.services);
    } catch (err) {
      if ((err as Error).name === 'AbortError' || generation !== requestGeneration.current) return;
      setTasks([]);
      setDiagnostics([]);
      setErrorMessage(err instanceof Error ? err.message : '读取失败');
    } finally {
      if (generation === requestGeneration.current) setLoading(false);
    }
  }, [workspaceId, project, service, status, hasChildren, retrospectiveState, setWorkspace, setBreadcrumbParts]);

  const visibleTasks = useMemo(
    () => tasks.filter((item) => matchesTaskQuery(item, q)),
    [tasks, q],
  );

  useEffect(() => {
    setBreadcrumbParts([(document.getElementById('shell-workspace-name')?.textContent || '工作空间'), '任务']);
    void load();
    return () => {
      abortRef.current?.abort();
    };
  }, [load, setBreadcrumbParts]);

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

  const columns: ColumnsType<TaskListItem> = [
    {
      title: '任务',
      ellipsis: true,
      render: (_value, item) => (
        <Link className="task-row-main" to={href(`/tasks/${encodeURIComponent(item.record.taskId)}`)}>
          <strong>{item.record.title}</strong>
          <small className="task-row-id">{item.record.taskId}</small>
        </Link>
      ),
    },
    {
      title: '状态',
      width: 88,
      render: (_value, item) => (
        <span className={`lifecycle-badge ${item.record.status}`}>{taskStatusLabel(item.record.status)}</span>
      ),
    },
  ];

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
            <Popover
              trigger="click"
              placement="bottomRight"
              arrow={false}
              destroyOnHidden
              overlayClassName="task-filter-overlay"
              open={filterOpen}
              onOpenChange={(open) => {
                if (open) syncFilterDraft();
                setFilterOpen(open);
              }}
              content={filterPopup}
            >
              <Button
                id="task-filter-panel-toggle"
                type="text"
                aria-label="筛选任务"
                aria-expanded={filterOpen}
                className={filterOpen || filtersActive ? 'is-active' : ''}
                icon={<FilterOutlined />}
              />
            </Popover>
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
          <Table
            rowKey={(item) => item.record.taskId}
            pagination={false}
            showHeader={false}
            tableLayout="fixed"
            dataSource={visibleTasks}
            columns={columns}
            rowClassName={(item) => (item.record.taskId === selectedTaskId ? 'task-row-active' : '')}
            onRow={(item) => ({
              onClick: () => navigate(href(`/tasks/${encodeURIComponent(item.record.taskId)}`)),
            })}
            components={{ body: { wrapper: TableBody } }}
          />
        </div>
        <div id="task-empty" className={`empty-state${showEmpty ? '' : ' hidden'}`}>
          {showEmpty ? (
            <Empty
              description={errorMessage
                || (totalTaskCount === 0
                  ? '当前工作空间还没有正式任务记录。正式任务由 Agent 创建。'
                  : '没有符合当前筛选条件的任务。')}
            />
          ) : null}
        </div>
      </section>
    </>
  );
}
