import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Alert, Button, Empty, Form, Select, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
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

const TableBody = (props: React.HTMLAttributes<HTMLTableSectionElement>) => (
  <tbody id="service-table-body" {...props} />
);

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

  const columns: ColumnsType<Service> = [
    {
      title: '名称',
      render: (_value, service) => (
        <>
          <strong>{service.name}</strong>
          <small>{service.description}</small>
        </>
      ),
    },
    { title: '代码', dataIndex: 'code', className: 'code-cell' },
    { title: '类型', render: (_value, service) => serviceTypeLabel(service.type) },
    { title: '来源', render: (_value, service) => (service.source.type === 'git' ? 'Git' : '本地路径') },
    {
      title: '操作',
      className: 'operation-column',
      render: (_value, service) => (
        <div className="table-operations">
          <Link className="table-action" to={href(`/services/${encodeURIComponent(projectCode)}/${encodeURIComponent(service.code)}`)}>详情</Link>
          <Link className="table-action" to={href(`/services/${encodeURIComponent(projectCode)}/${encodeURIComponent(service.code)}/edit`)}>编辑</Link>
          <Link className="table-action" to={href(`/projects/${encodeURIComponent(projectCode)}`)}>项目</Link>
        </div>
      ),
    },
  ];

  return (
    <>
      <section className="resource-toolbar">
        <div>
          <p className="eyebrow">服务</p>
          <Typography.Title level={2} style={{ margin: 0 }}>服务目录</Typography.Title>
          <p className="page-copy">按项目查看已登记服务；详情与编辑使用独立页面。</p>
        </div>
        <div className="toolbar-actions">
          <span id="services-count" className="count-label">{count}</span>
          <Button
            id="create-service-button"
            type="primary"
            disabled={!projectCode}
            onClick={() => openAgentAction('service', { projectCode })}
          >
            让 Agent 创建服务
          </Button>
        </div>
      </section>
      <div id="services-migration-alert" className={migrationMessage ? '' : 'hidden'} role="status">
        {migrationMessage ? <Alert type="warning" showIcon message={migrationMessage} style={{ marginBottom: 16 }} /> : null}
      </div>
      <section className="list-controls">
        <Form layout="vertical" style={{ maxWidth: 360 }}>
          <Form.Item label="所属项目">
            <Select
              id="service-project-select"
              style={{ width: '100%' }}
              disabled={projects.length === 0}
              loading={projects.length === 0 && !loaded}
              placeholder={projects.length === 0 ? '正在读取项目…' : undefined}
              value={projectCode || undefined}
              onChange={onProjectChange}
              options={projects.map((project) => ({
                value: project.code,
                label: `${project.name}（${project.code}）`,
              }))}
            />
          </Form.Item>
        </Form>
      </section>
      <section className="resource-list-section">
        <div className="section-heading">
          <div>
            <Typography.Title id="services-title" level={4} style={{ margin: 0 }}>{title}</Typography.Title>
            <p id="services-copy" className="section-copy">{copy}</p>
          </div>
        </div>
        <div id="service-empty" className={`empty-state${loaded && services.length === 0 ? '' : ' hidden'}`}>
          {loaded && services.length === 0 ? <Empty description={emptyText} /> : null}
        </div>
        <div id="service-table-wrap" className={`management-table-wrap${services.length === 0 ? ' hidden' : ''}`}>
          <Table
            rowKey="code"
            pagination={false}
            dataSource={services}
            columns={columns}
            components={{ body: { wrapper: TableBody } }}
          />
        </div>
      </section>
      <span className="hidden">{projectName}</span>
    </>
  );
}
