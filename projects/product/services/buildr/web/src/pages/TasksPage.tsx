import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
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

function scopeText(record: TaskListItem['record']): string {
  const projects = record.scope.projects.join('、') || '无项目';
  const services = record.scope.services.map((item) => `${item.project}/${item.service}`).join('、');
  return services ? `${projects}；${services}` : projects;
}

export function TasksPage() {
  const { workspaceId, setWorkspace, setBreadcrumbParts } = useAppShell();
  const href = (path: string) => workspaceHref(workspaceId, path);

  const [state, setState] = useState('正在读取');
  const [tasks, setTasks] = useState<TaskListItem[]>([]);
  const [diagnostics, setDiagnostics] = useState<Array<{ message: string }>>([]);
  const [totalTaskCount, setTotalTaskCount] = useState(0);
  const [filterProjects, setFilterProjects] = useState<string[]>([]);
  const [filterServices, setFilterServices] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [q, setQ] = useState('');
  const [status, setStatus] = useState('active');
  const [project, setProject] = useState('');
  const [service, setService] = useState('');
  const [hasChildren, setHasChildren] = useState('all');
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
      const [data, workspace] = await Promise.all(requests) as [TasksResponse, WorkspacePayload | undefined];
      if (generation !== requestGeneration.current) return;
      if (workspace) {
        setWorkspace(workspace);
        setBreadcrumbParts([workspace.workspace.name, '任务']);
        workspaceLoaded.current = true;
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
  }, [workspaceId, project, service, status, hasChildren, setWorkspace, setBreadcrumbParts]);

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
    setStatus('active');
    setHasChildren('all');
    setReloadToken((value) => value + 1);
  };

  const showTable = tasks.length > 0 && !errorMessage;
  const showEmpty = Boolean(errorMessage) || (tasks.length === 0 && diagnostics.length === 0);

  return (
    <>
      <section className="resource-toolbar">
        <div>
          <p className="eyebrow">任务</p>
          <h1>任务记录</h1>
          <p className="page-copy">查看正式任务的顶层事实并进行有限维护。正式任务由 Agent 创建，Local App 不提供创建入口。</p>
        </div>
        <span id="tasks-state" className="count-label">{state}</span>
      </section>
      <section className="panel task-filter-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">筛选</p>
            <h2>缩小任务范围</h2>
          </div>
          <button id="task-filter-clear" className="button secondary" type="button" onClick={clearFilters}>
            清除筛选
          </button>
        </div>
        <form
          id="task-filter-form"
          className={`task-filter-grid${loading ? ' is-loading' : ''}`}
          onSubmit={(event: FormEvent) => event.preventDefault()}
        >
          <label className="task-filter-query">
            标题或意图
            <input
              id="task-filter-q"
              type="search"
              autoComplete="off"
              placeholder="输入关键词"
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
          </label>
          <label>
            状态
            <select id="task-filter-status" value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="active">进行中</option>
              <option value="completed">已完成</option>
              <option value="abandoned">已放弃</option>
              <option value="all">全部</option>
            </select>
          </label>
          <label>
            项目
            <select
              id="task-filter-project"
              value={project}
              onChange={(event) => {
                setProject(event.target.value);
                setService('');
              }}
            >
              <option value="">全部项目</option>
              {filterProjects.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </label>
          <label>
            服务
            <select id="task-filter-service" value={service} onChange={(event) => setService(event.target.value)}>
              <option value="">全部服务</option>
              {serviceOptions.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </label>
          <label>
            Child Task
            <select id="task-filter-children" value={hasChildren} onChange={(event) => setHasChildren(event.target.value)}>
              <option value="all">不限</option>
              <option value="yes">有直接 Child</option>
              <option value="no">无直接 Child</option>
            </select>
          </label>
        </form>
      </section>
      <section className="resource-list-section">
        <div className="section-heading">
          <div>
            <h2>任务</h2>
            <p className="section-copy">默认只显示进行中的任务，按最近更新时间排列。</p>
          </div>
        </div>
        <div id="task-diagnostics" className={`alert error${diagnostics.length ? '' : ' hidden'}`} role="status">
          {diagnostics.length
            ? `有 ${diagnostics.length} 条诊断：${diagnostics.map((item) => item.message).join('；')}`
            : ''}
        </div>
        <div id="task-table-wrap" className={`management-table-wrap${showTable ? '' : ' hidden'}`}>
          <table className="management-table">
            <thead>
              <tr>
                <th>任务</th>
                <th>意图</th>
                <th>层级</th>
                <th>范围</th>
                <th>状态</th>
                <th>更新时间</th>
                <th className="operation-column">操作</th>
              </tr>
            </thead>
            <tbody id="task-table-body">
              {tasks.map((item) => {
                const record = item.record;
                return (
                  <tr key={record.taskId}>
                    <td>
                      <strong>{record.title}</strong>
                      <small>{record.taskId}</small>
                    </td>
                    <td>{record.intent}</td>
                    <td>
                      <div>{item.taskRelations.parent ? `Parent：${item.taskRelations.parent.taskId}` : 'Parent：无'}</div>
                      <small>{`直接 Child：${item.childTaskCount}`}</small>
                    </td>
                    <td>{scopeText(record)}</td>
                    <td>
                      <span className={`lifecycle-badge ${record.status}`}>{taskStatusLabel(record.status)}</span>
                    </td>
                    <td>{formatShortDateTime(record.updatedAt)}</td>
                    <td className="table-operations">
                      <Link className="table-action" to={href(`/tasks/${encodeURIComponent(record.taskId)}`)}>
                        详情
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div id="task-empty" className={`empty-state${showEmpty ? '' : ' hidden'}`}>
          {errorMessage
            || (totalTaskCount === 0
              ? '当前工作空间还没有正式任务记录。正式任务由 Agent 创建。'
              : '没有符合当前筛选条件的任务。')}
        </div>
      </section>
    </>
  );
}
