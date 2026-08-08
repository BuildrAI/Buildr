import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAppShell } from '../app/AppShellContext';
import { projectListSourceLabel, workspaceHref } from '../lib/labels';

type Project = {
  code: string;
  name: string;
  description: string;
  source: { type: string; path: string };
};

type WorkspacePayload = {
  rootPath: string;
  workspace: { name: string };
};

export function ProjectsPage() {
  const { workspaceId, setWorkspace, openAgentAction, setBreadcrumbParts } = useAppShell();
  const href = (path: string) => workspaceHref(workspaceId, path);
  const [projects, setProjects] = useState<Project[]>([]);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [state, setState] = useState('正在读取');
  const [migrationMessage, setMigrationMessage] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [workspace, data] = await Promise.all([
          api('/api/v1/workspace') as Promise<WorkspacePayload>,
          api('/api/v1/projects') as Promise<{
            projects: Project[];
            migrationRequired?: boolean;
            nextActions?: string[];
          }>,
        ]);
        if (cancelled) return;
        setWorkspace(workspace);
        setBreadcrumbParts([workspace.workspace.name, '项目']);
        setProjects(data.projects);
        setState(`${data.projects.length} 个项目`);
        setMigrationMessage(data.migrationRequired ? (data.nextActions || []).join(' ') : '');
        const serviceCounts = await Promise.all(data.projects.map(async (project) => {
          try {
            const services = await api(`/api/v1/projects/${encodeURIComponent(project.code)}/services`) as { services: unknown[] };
            return [project.code, String(services.services.length)] as const;
          } catch {
            return [project.code, '读取失败'] as const;
          }
        }));
        if (cancelled) return;
        setCounts(Object.fromEntries(serviceCounts));
      } catch (err) {
        if (!cancelled) {
          setState('读取失败');
          setError(err instanceof Error ? err.message : '读取失败');
          setProjects([]);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [setWorkspace, setBreadcrumbParts]);

  return (
    <>
      <section className="resource-toolbar">
        <div>
          <p className="eyebrow">项目</p>
          <h1>项目目录</h1>
          <p className="page-copy">查看当前工作空间的项目，并从独立详情页编辑稳定元数据。</p>
        </div>
        <div className="toolbar-actions">
          <span id="projects-state" className="count-label">{state}</span>
          <button id="create-project-button" className="button primary" type="button" onClick={() => openAgentAction('project')}>
            让 Agent 创建项目
          </button>
        </div>
      </section>
      <div id="projects-migration-alert" className={`alert${migrationMessage ? '' : ' hidden'}`} role="status">
        {migrationMessage}
      </div>
      <section className="resource-list-section">
        <div className="section-heading">
          <div>
            <h2>全部项目</h2>
            <p className="section-copy">选择详情可查看来源、观察状态、关联服务与变更。</p>
          </div>
        </div>
        <div id="project-table-wrap" className={`management-table-wrap${projects.length === 0 ? ' hidden' : ''}`}>
          <table className="management-table">
            <thead>
              <tr>
                <th scope="col">名称</th>
                <th scope="col">代码</th>
                <th scope="col">来源</th>
                <th scope="col">服务数</th>
                <th scope="col" className="operation-column">操作</th>
              </tr>
            </thead>
            <tbody id="project-table-body">
              {projects.map((project) => (
                <tr key={project.code}>
                  <td>
                    <strong>{project.name}</strong>
                    <small>{project.description}</small>
                  </td>
                  <td className="code-cell">{project.code}</td>
                  <td>
                    <span>{projectListSourceLabel(project.source.type)}</span>
                    <small>{project.source.path}</small>
                  </td>
                  <td>{counts[project.code] || '0'}</td>
                  <td className="table-operations">
                    <Link className="table-action" to={href(`/projects/${encodeURIComponent(project.code)}`)}>详情</Link>
                    <Link className="table-action" to={href(`/projects/${encodeURIComponent(project.code)}/edit`)}>编辑</Link>
                    <Link className="table-action" to={href(`/services?project=${encodeURIComponent(project.code)}`)}>服务</Link>
                    <Link className="table-action" to={href(`/changes?project=${encodeURIComponent(project.code)}`)}>变更</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div id="project-empty" className={`empty-state${projects.length > 0 ? ' hidden' : ''}`}>
          {error || '当前工作空间还没有项目。先告诉 Agent 你要长期管理的业务、产品、系统或已有资产。'}
        </div>
      </section>
    </>
  );
}
