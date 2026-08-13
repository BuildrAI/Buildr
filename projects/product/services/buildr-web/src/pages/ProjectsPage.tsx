import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Button, Empty, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { api } from '../api';
import { useAppShell } from '../app/AppShellContext';
import { ProjectEditModal } from '../components/ProjectEditModal';
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

const TableBody = (props: React.HTMLAttributes<HTMLTableSectionElement>) => (
  <tbody id="project-table-body" {...props} />
);

export function ProjectsPage() {
  const { workspaceId, setWorkspace, openAgentAction, setBreadcrumbParts } = useAppShell();
  const href = (path: string) => workspaceHref(workspaceId, path);
  const [projects, setProjects] = useState<Project[]>([]);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [state, setState] = useState('正在读取');
  const [migrationMessage, setMigrationMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [editCode, setEditCode] = useState<string | null>(null);

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

  const columns: ColumnsType<Project> = [
    {
      title: '名称',
      dataIndex: 'name',
      render: (_value, project) => (
        <>
          <strong>{project.name}</strong>
          <small>{project.description}</small>
        </>
      ),
    },
    {
      title: '代码',
      dataIndex: 'code',
      className: 'code-cell',
    },
    {
      title: '来源',
      render: (_value, project) => (
        <>
          <span>{projectListSourceLabel(project.source.type)}</span>
          <small>{project.source.path}</small>
        </>
      ),
    },
    {
      title: '服务数',
      render: (_value, project) => counts[project.code] || '0',
    },
    {
      title: '操作',
      className: 'operation-column',
      render: (_value, project) => (
        <div className="table-operations">
          <Link className="table-action" to={href(`/projects/${encodeURIComponent(project.code)}`)}>详情</Link>
          <button
            type="button"
            className="table-action"
            id={`project-edit-action-${project.code}`}
            onClick={() => setEditCode(project.code)}
          >
            编辑
          </button>
          <Link className="table-action" to={href(`/services?project=${encodeURIComponent(project.code)}`)}>服务</Link>
          <Link className="table-action" to={href(`/changes?project=${encodeURIComponent(project.code)}`)}>变更</Link>
        </div>
      ),
    },
  ];

  return (
    <>
      <section className="resource-toolbar">
        <div className="toolbar-actions">
          <span id="projects-state" className="count-label">{state}</span>
          <Button id="create-project-button" type="primary" onClick={() => openAgentAction('project')}>
            让 Agent 创建项目
          </Button>
        </div>
      </section>
      <div id="projects-migration-alert" className={migrationMessage ? '' : 'hidden'} role="status">
        {migrationMessage ? <Alert type="warning" showIcon message={migrationMessage} style={{ marginBottom: 16 }} /> : null}
      </div>
      <section className="resource-list-section">
        <div className="section-heading">
          <div>
            <Typography.Title level={4} style={{ margin: 0 }}>全部项目</Typography.Title>
            <p className="section-copy">选择详情可查看文档与关联服务；编辑在弹框中完成。</p>
          </div>
        </div>
        <div id="project-table-wrap" className={`management-table-wrap${projects.length === 0 ? ' hidden' : ''}`}>
          <Table
            rowKey="code"
            pagination={false}
            dataSource={projects}
            columns={columns}
            components={{ body: { wrapper: TableBody } }}
          />
        </div>
        <div id="project-empty" className={`empty-state${projects.length > 0 ? ' hidden' : ''}`}>
          {projects.length === 0 ? (
            <Empty description={error || '当前工作空间还没有项目。先告诉 Agent 你要长期管理的业务、产品、系统或已有资产。'} />
          ) : null}
        </div>
      </section>
      <ProjectEditModal
        open={Boolean(editCode)}
        projectCode={editCode}
        onClose={() => setEditCode(null)}
        onSaved={(saved) => {
          setProjects((items) => items.map((item) => (
            item.code === saved.code
              ? { ...item, name: saved.name, description: saved.description }
              : item
          )));
        }}
      />
    </>
  );
}
