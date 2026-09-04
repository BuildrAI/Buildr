import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Alert, Button, Empty, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { workspaceApi, type ProjectResponse } from '../../../api';
import { useAppShell } from '../../../app/AppShellContext';
import { workspaceHref } from '../../../lib/labels';

type Project = NonNullable<ProjectResponse['projects']>[number];

const TableBody = (props: React.HTMLAttributes<HTMLTableSectionElement>) => (
  <tbody id="project-table-body" {...props} />
);

export function ProjectsPage() {
  const { workspaceId, setWorkspace, openAgentAction, setBreadcrumbParts } = useAppShell();
  const { projectCode: selectedProjectCode } = useParams();
  const navigate = useNavigate();
  const href = (path: string) => workspaceHref(workspaceId, path);
  const [projects, setProjects] = useState<Project[]>([]);
  const [state, setState] = useState('正在读取');
  const [migrationMessage, setMigrationMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [workspace, data] = await Promise.all([
          workspaceApi.read(),
          workspaceApi.listProjects(),
        ]);
        if (cancelled) return;
        setWorkspace(workspace);
        setBreadcrumbParts([workspace.workspace.name, '项目']);
        const nextProjects = data.projects ?? [];
        setProjects(nextProjects);
        setState(`${nextProjects.length} 个项目`);
        setMigrationMessage(data.migrationRequired ? (data.nextActions || []).join(' ') : '');
      } catch (err) {
        if (!cancelled) {
          setState('读取失败');
          setError(err instanceof Error ? err.message : '读取失败');
          setProjects([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [setWorkspace, setBreadcrumbParts]);

  useEffect(() => {
    if (selectedProjectCode || loading || error || projects.length === 0) return;
    if (window.matchMedia('(max-width: 899px)').matches) return;
    navigate(href(`/projects/${encodeURIComponent(projects[0].code)}`), { replace: true });
  }, [selectedProjectCode, loading, error, projects, href, navigate]);

  const columns: ColumnsType<Project> = [
    {
      title: '项目',
      ellipsis: true,
      render: (_value, project) => (
        <Link className="task-row-main project-row-main" to={href(`/projects/${encodeURIComponent(project.code)}`)}>
          <strong>{project.name}</strong>
          {project.description ? <small>{project.description}</small> : null}
        </Link>
      ),
    },
  ];

  return (
    <>
      <section className="resource-toolbar">
        <div className="task-toolbar-main">
          <Typography.Title level={2} style={{ margin: 0 }}>项目</Typography.Title>
          <p className="page-copy">选择左侧项目查看文档与关联服务；编辑在详情右上角完成。</p>
        </div>
        <div className="task-toolbar-meta">
          <span id="projects-state" className="count-label">{state}</span>
          <Button id="create-project-button" className="project-create-action" type="primary" size="small" onClick={() => openAgentAction('project')}>
            让 Agent 创建项目
          </Button>
        </div>
      </section>
      <div id="projects-migration-alert" className={migrationMessage ? '' : 'hidden'} role="status">
        {migrationMessage ? <Alert type="warning" showIcon message={migrationMessage} style={{ marginBottom: 16 }} /> : null}
      </div>
      <section className="resource-list-section project-list-section">
        <div id="project-table-wrap" className={`management-table-wrap${projects.length === 0 ? ' hidden' : ''}`}>
          <Table
            rowKey="code"
            pagination={false}
            showHeader={false}
            tableLayout="fixed"
            dataSource={projects}
            columns={columns}
            rowClassName={(project) => (project.code === selectedProjectCode ? 'project-row-active' : '')}
            onRow={(project) => ({
              onClick: () => navigate(href(`/projects/${encodeURIComponent(project.code)}`)),
            })}
            components={{ body: { wrapper: TableBody } }}
          />
        </div>
        <div id="project-empty" className={`empty-state${projects.length > 0 ? ' hidden' : ''}`}>
          {projects.length === 0 ? (
            <Empty description={error || '当前工作空间还没有项目。先告诉 Agent 你要长期管理的业务、产品、系统或已有资产。'} />
          ) : null}
        </div>
      </section>
    </>
  );
}
