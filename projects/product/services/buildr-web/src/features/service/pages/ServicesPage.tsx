import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Button, Empty, Form, Select, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useAppShell } from '../../../app/AppShellContext';
import { serviceTypeLabel, workspaceHref } from '../../../lib/labels';
import { ServiceEditDrawer } from '../components/ServiceEditDrawer';
import { useServiceCatalog, type Service } from '../hooks/useServiceCatalog';
import { useWorkspacePageTabs } from '../../../app/pageTabs';
import { WorkspaceStage } from '../../../components/WorkspaceStage';

const TableBody = (props: React.HTMLAttributes<HTMLTableSectionElement>) => (
  <tbody id="service-table-body" {...props} />
);

export function ServicesPage() {
  const { workspaceId, openAgentAction } = useAppShell();
  const href = (path: string) => workspaceHref(workspaceId, path);
  const [editServiceCode, setEditServiceCode] = useState<string | null>(null);
  const catalog = useServiceCatalog();
  const { projects, projectCode, projectName, services, count, title, copy, emptyText, migrationMessage, loaded } = catalog;
  const pageTabs = useWorkspacePageTabs(workspaceId);

  useEffect(() => {
    pageTabs.register({ key: 'dir:services', kind: 'dir', title: '服务目录', path: href('/services') });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

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
          <button
            type="button"
            className="table-action"
            id={`service-edit-action-${service.code}`}
            onClick={() => setEditServiceCode(service.code)}
          >
            编辑
          </button>
          <Link className="table-action" to={href(`/projects/${encodeURIComponent(projectCode)}`)}>项目</Link>
        </div>
      ),
    },
  ];

  return (
    <WorkspaceStage pageTabs={pageTabs.tabs} onClosePageTab={pageTabs.close}>
      <div className="ws-dir-shell">
      <section className="resource-toolbar">
        <div>
          <Typography.Title level={2} style={{ margin: 0 }}>服务目录</Typography.Title>
          <p className="page-copy">按项目查看已登记服务；编辑在抽屉中完成。</p>
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
        <Form layout="inline">
          <Form.Item label="所属项目">
            <Select
              id="service-project-select"
              style={{ minWidth: 240 }}
              disabled={projects.length === 0}
              loading={projects.length === 0 && !loaded}
              placeholder={projects.length === 0 ? '正在读取项目…' : undefined}
              value={projectCode || undefined}
              onChange={catalog.selectProject}
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
      <ServiceEditDrawer
        open={Boolean(editServiceCode)}
        projectCode={projectCode || null}
        serviceCode={editServiceCode}
        onClose={() => setEditServiceCode(null)}
        onSaved={(saved) => {
          catalog.updateService(saved);
        }}
      />
      </div>
    </WorkspaceStage>
  );
}
