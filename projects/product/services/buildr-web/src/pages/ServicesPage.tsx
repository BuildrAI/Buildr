import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAppShell } from '../app/AppShellContext';
import { serviceTypeLabel, workspaceHref } from '../lib/labels';

type Project = { code: string; name: string };
type Service = {
  code: string;
  name: string;
  description: string;
  type: string;
  source: { type: string };
};

type WorkspacePayload = { rootPath: string; workspace: { name: string } };

export function ServicesPage() {
  const { workspaceId, setWorkspace, openAgentAction, setBreadcrumbParts } = useAppShell();
  const href = (path: string) => workspaceHref(workspaceId, path);
  const [searchParams, setSearchParams] = useSearchParams();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectCode, setProjectCode] = useState('');
  const [projectName, setProjectName] = useState('');
  const [services, setServices] = useState<Service[]>([]);
  const [count, setCount] = useState('正在读取');
  const [title, setTitle] = useState('请选择项目');
  const [copy, setCopy] = useState('选择项目后显示服务。');
  const [emptyText, setEmptyText] = useState('选择项目后显示服务。');
  const [migrationMessage, setMigrationMessage] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [workspace, data] = await Promise.all([
          api('/api/v1/workspace') as Promise<WorkspacePayload>,
          api('/api/v1/projects') as Promise<{ projects: Project[] }>,
        ]);
        if (cancelled) return;
        setWorkspace(workspace);
        setBreadcrumbParts([workspace.workspace.name, '服务']);
        setProjects(data.projects);
        const requested = searchParams.get('project');
        const selected = data.projects.find((project) => project.code === requested) || data.projects[0];
        if (selected) {
          setProjectCode(selected.code);
        } else {
          setTitle('尚无所属项目');
          setCount('0 个项目');
          setCopy('请先让 Agent 创建项目，再登记服务。');
          setEmptyText('请先让 Agent 创建项目，再登记服务。');
          setLoaded(true);
        }
      } catch (err) {
        if (!cancelled) {
          setTitle('读取失败');
          setCopy(err instanceof Error ? err.message : '读取失败');
          setLoaded(true);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [setWorkspace, setBreadcrumbParts]);

  useEffect(() => {
    if (!projectCode) return;
    let cancelled = false;
    void (async () => {
      try {
        const data = await api(`/api/v1/projects/${encodeURIComponent(projectCode)}/services`) as {
          project: { name: string };
          services: Service[];
          migrationRequired?: boolean;
          nextActions?: string[];
        };
        if (cancelled) return;
        setProjectName(data.project.name);
        setServices(data.services);
        setTitle(`${data.project.name}的服务`);
        setCopy('目录负责资源定位与关联跳转；稳定元数据使用独立编辑页修改。');
        setCount(`${data.services.length} 个服务`);
        setEmptyText(`项目“${data.project.name}”暂未登记服务。服务只在需要管理代码仓、应用、模块或可执行资产时添加；你也可以直接回到“开始”页推进项目范围工作。`);
        setMigrationMessage(data.migrationRequired ? (data.nextActions || []).join(' ') : '');
        setLoaded(true);
      } catch (err) {
        if (!cancelled) {
          setCount('读取失败');
          setTitle('无法读取服务');
          setCopy(err instanceof Error ? err.message : '读取失败');
          setServices([]);
          setLoaded(true);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [projectCode]);

  const onProjectChange = (code: string) => {
    setProjectCode(code);
    setSearchParams(code ? { project: code } : {});
  };

  return (
    <>
      <section className="resource-toolbar">
        <div>
          <p className="eyebrow">服务</p>
          <h1>服务目录</h1>
          <p className="page-copy">按项目查看已登记服务；详情与编辑使用独立页面。</p>
        </div>
        <div className="toolbar-actions">
          <span id="services-count" className="count-label">{count}</span>
          <button
            id="create-service-button"
            className="button primary"
            type="button"
            disabled={!projectCode}
            onClick={() => openAgentAction('service', { projectCode })}
          >
            让 Agent 创建服务
          </button>
        </div>
      </section>
      <div id="services-migration-alert" className={`alert${migrationMessage ? '' : ' hidden'}`} role="status">
        {migrationMessage}
      </div>
      <section className="list-controls">
        <label>
          所属项目
          <select
            id="service-project-select"
            disabled={projects.length === 0}
            value={projectCode}
            onChange={(event) => onProjectChange(event.target.value)}
          >
            {projects.length === 0 ? <option>正在读取项目…</option> : null}
            {projects.map((project) => (
              <option key={project.code} value={project.code}>{`${project.name}（${project.code}）`}</option>
            ))}
          </select>
        </label>
      </section>
      <section className="resource-list-section">
        <div className="section-heading">
          <div>
            <h2 id="services-title">{title}</h2>
            <p id="services-copy" className="section-copy">{copy}</p>
          </div>
        </div>
        <div id="service-empty" className={`empty-state${loaded && services.length === 0 ? '' : ' hidden'}`}>
          {emptyText}
        </div>
        <div id="service-table-wrap" className={`management-table-wrap${services.length === 0 ? ' hidden' : ''}`}>
          <table className="management-table">
            <thead>
              <tr>
                <th scope="col">名称</th>
                <th scope="col">代码</th>
                <th scope="col">类型</th>
                <th scope="col">来源</th>
                <th scope="col" className="operation-column">操作</th>
              </tr>
            </thead>
            <tbody id="service-table-body">
              {services.map((service) => (
                <tr key={service.code}>
                  <td>
                    <strong>{service.name}</strong>
                    <small>{service.description}</small>
                  </td>
                  <td className="code-cell">{service.code}</td>
                  <td>{serviceTypeLabel(service.type)}</td>
                  <td>{service.source.type === 'git' ? 'Git' : '本地路径'}</td>
                  <td className="table-operations">
                    <Link className="table-action" to={href(`/services/${encodeURIComponent(projectCode)}/${encodeURIComponent(service.code)}`)}>详情</Link>
                    <Link className="table-action" to={href(`/services/${encodeURIComponent(projectCode)}/${encodeURIComponent(service.code)}/edit`)}>编辑</Link>
                    <Link className="table-action" to={href(`/projects/${encodeURIComponent(projectCode)}`)}>项目</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <span className="hidden">{projectName}</span>
    </>
  );
}
