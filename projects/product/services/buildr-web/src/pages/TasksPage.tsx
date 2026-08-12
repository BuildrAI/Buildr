import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Button, Empty, Form, Input, Select, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { api } from '../api';
import { useAppShell } from '../app/AppShellContext';
import { workspaceHref } from '../lib/labels';
import { formatShortDateTime, taskStatusLabel } from '../lib/taskLabels';

type WorkspacePayload = { rootPath: string; workspace: { name: string } };

type TaskListItem = {
  childTaskCount: number;
  taskRelations: { parent: { taskId: string } | null };
  record: {
    taskId: string;
    title: string;
    intent: string;
    status: string;
    updatedAt: string;
    scope: {
      projects: string[];
      services: Array<{ project: string; service: string }>;
    };
  };
};

type TasksResponse = {
  tasks: TaskListItem[];
  diagnostics: Array<{ message: string }>;
  totalTaskCount: number;
  filterOptions: {
    projects: string[];
    services: string[];
  };
};

type ProjectInfo = { code: string; name: string };
type ServiceInfo = { code: string; name: string; projectCode: string };

function scopeText(record: TaskListItem['record']): string {
  const projects = record.scope.projects.join('、') || '无项目';
  const services = record.scope.services.map((item) => `${item.project}/${item.service}`).join('、');
  return services ? `${projects}；${services}` : projects;
}

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

export function TasksPage() {
  const { workspaceId, setWorkspace, setBreadcrumbParts } = useAppShell();
  const href = (path: string) => workspaceHref(workspaceId, path);

  const [state, setState] = useState('正在读取');
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
  const [status, setStatus] = useState('open');
  const [project, setProject] = useState('');
  const [service, setService] = useState('');
  const [hasChildren, setHasChildren] = useState('all');
  const [retrospectiveState, setRetrospectiveState] = useState('all');
  const [reloadToken, setReloadToken] = useState(0);

  const workspaceLoaded = useRef(false);
  const requestGeneration = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const qRef = useRef(q);
  qRef.current = q;

  const serviceOptions = project
    ? filterServices.filter((item) => item.startsWith(`${project}/`))
    : filterServices;

  const load = useCallback(async (queryOverride?: string) => {
    if (!workspaceId) return;
    const generation = ++requestGeneration.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setState('正在读取…');
    setErrorMessage(null);

    const query = new URLSearchParams();
    const values = {
      q: (queryOverride ?? qRef.current).trim(),
      project,
      service,
      status,
      hasChildren,
      retrospectiveState,
    };
    for (const [key, value] of Object.entries(values)) {
      if (value && value !== 'all') query.set(key, value);
    }
    const suffix = query.toString() ? `?${query.toString()}` : '';

    try {
      const requests: Array<Promise<unknown>> = [
        api(`/api/v1/tasks${suffix}`, { signal: controller.signal }),
      ];
      if (!workspaceLoaded.current) {
        requests.push(api('/api/v1/workspace', { signal: controller.signal }));
      }
      if (!catalogsLoaded.current) {
        requests.push(api('/api/v1/projects', { signal: controller.signal }));
      }
      const settled = await Promise.all(requests);
      if (generation !== requestGeneration.current) return;
      const data = settled[0] as TasksResponse;
      let offset = 1;
      if (!workspaceLoaded.current) {
        const workspace = settled[offset++] as WorkspacePayload | undefined;
        if (workspace) {
          setWorkspace(workspace);
          setBreadcrumbParts([workspace.workspace.name, '任务']);
          workspaceLoaded.current = true;
        }
      }
      if (!catalogsLoaded.current) {
        const projectsPayload = settled[offset] as { projects: ProjectInfo[] } | undefined;
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
      setTasks(data.tasks);
      setDiagnostics(data.diagnostics);
      setTotalTaskCount(data.totalTaskCount);
      setFilterProjects(data.filterOptions.projects);
      setFilterServices(data.filterOptions.services);
      setState(`${data.tasks.length} 个任务`);
    } catch (err) {
      if ((err as Error).name === 'AbortError' || generation !== requestGeneration.current) return;
      setState('读取失败');
      setTasks([]);
      setDiagnostics([]);
      setErrorMessage(err instanceof Error ? err.message : '读取失败');
    } finally {
      if (generation === requestGeneration.current) setLoading(false);
    }
  }, [workspaceId, project, service, status, hasChildren, retrospectiveState, setWorkspace, setBreadcrumbParts]);

  useEffect(() => {
    setBreadcrumbParts([(document.getElementById('shell-workspace-name')?.textContent || '工作空间'), '任务']);
    void load();
    return () => {
      abortRef.current?.abort();
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [load, reloadToken, setBreadcrumbParts]);

  const clearFilters = () => {
    setQ('');
    setProject('');
    setService('');
    setStatus('open');
    setHasChildren('all');
    setRetrospectiveState('all');
    setReloadToken((value) => value + 1);
  };

  const showTable = tasks.length > 0 && !errorMessage;
  const showEmpty = Boolean(errorMessage) || (tasks.length === 0 && diagnostics.length === 0);

  const columns: ColumnsType<TaskListItem> = [
    {
      title: '任务',
      width: 220,
      ellipsis: true,
      render: (_value, item) => (
        <>
          <strong>{item.record.title}</strong>
          <small>{item.record.taskId}</small>
        </>
      ),
    },
    { title: '意图', ellipsis: true, render: (_value, item) => item.record.intent },
    {
      title: '层级',
      width: 160,
      render: (_value, item) => (
        <>
          <div>{item.taskRelations.parent ? `Parent：${item.taskRelations.parent.taskId}` : 'Parent：无'}</div>
          <small>{`直接 Child：${item.childTaskCount}`}</small>
        </>
      ),
    },
    { title: '范围', ellipsis: true, render: (_value, item) => scopeText(item.record) },
    {
      title: '状态',
      width: 96,
      render: (_value, item) => (
        <span className={`lifecycle-badge ${item.record.status}`}>{taskStatusLabel(item.record.status)}</span>
      ),
    },
    {
      title: '更新时间',
      width: 168,
      render: (_value, item) => formatShortDateTime(item.record.updatedAt),
    },
    {
      title: '操作',
      width: 88,
      fixed: 'right',
      className: 'operation-column',
      render: (_value, item) => (
        <div className="table-operations">
          <Link className="table-action" to={href(`/tasks/${encodeURIComponent(item.record.taskId)}`)}>
            详情
          </Link>
        </div>
      ),
    },
  ];

  return (
    <>
      <section className="resource-toolbar">
        <div>
          <Typography.Title level={2} style={{ margin: 0 }}>任务记录</Typography.Title>
          <p className="page-copy">查看正式任务的顶层事实并进行有限维护。正式任务由 Agent 创建，Buildr Web 不提供创建入口。</p>
        </div>
        <span id="tasks-state" className="count-label">{state}</span>
      </section>
      <section className="panel task-filter-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">筛选</p>
          </div>
          <Button id="task-filter-clear" onClick={clearFilters}>
            清除筛选
          </Button>
        </div>
        <Form
          id="task-filter-form"
          className={`task-filter-grid${loading ? ' is-loading' : ''}`}
          layout="vertical"
          onSubmitCapture={(event: FormEvent) => event.preventDefault()}
        >
          <Form.Item className="task-filter-query" label="标题或意图">
            <Input
              id="task-filter-q"
              type="search"
              allowClear
              autoComplete="off"
              placeholder="输入关键词"
              style={{ width: 280 }}
              value={q}
              onChange={(event) => {
                const value = event.target.value;
                setQ(value);
                if (searchTimer.current) clearTimeout(searchTimer.current);
                searchTimer.current = setTimeout(() => {
                  void load(value);
                }, 200);
              }}
            />
          </Form.Item>
          <Form.Item label="状态">
            <Select
              id="task-filter-status"
              style={{ width: '100%' }}
              value={status}
              onChange={(next) => {
                setStatus(next);
                if (['open', 'todo', 'active'].includes(next) && ['pending', 'handled', 'no-action'].includes(retrospectiveState)) setRetrospectiveState('all');
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
              style={{ width: '100%' }}
              value={project || 'all'}
              onChange={(next) => {
                setProject(next === 'all' ? '' : next);
                setService('');
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
              style={{ width: '100%' }}
              value={service || 'all'}
              onChange={(next) => setService(next === 'all' ? '' : next)}
              options={[
                { value: 'all', label: '全部服务' },
                ...serviceOptions.map((item) => ({
                  value: item,
                  label: serviceOptionLabel(item, serviceNames),
                })),
              ]}
            />
          </Form.Item>
          <Form.Item label="Child Task">
            <Select
              id="task-filter-children"
              style={{ width: '100%' }}
              value={hasChildren}
              onChange={setHasChildren}
              options={[
                { value: 'all', label: '不限' },
                { value: 'yes', label: '有直接 Child' },
                { value: 'no', label: '无直接 Child' },
              ]}
            />
          </Form.Item>
          <Form.Item label="复盘处置">
            <Select
              id="task-filter-retrospective"
              style={{ width: '100%' }}
              value={retrospectiveState}
              onChange={(next) => {
                setRetrospectiveState(next);
                if (['pending', 'handled', 'no-action'].includes(next) && ['open', 'todo', 'active'].includes(status)) setStatus('all');
              }}
              options={[
                { value: 'all', label: '不限' },
                { value: 'missing', label: '未复盘' },
                { value: 'pending', label: '未处理' },
                { value: 'handled', label: '已处理' },
                { value: 'no-action', label: '无需处理' },
              ]}
            />
          </Form.Item>
        </Form>
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
            tableLayout="fixed"
            scroll={{ x: 980 }}
            dataSource={tasks}
            columns={columns}
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
