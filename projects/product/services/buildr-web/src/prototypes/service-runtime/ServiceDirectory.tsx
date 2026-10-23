import { useState } from 'react';
import { App, Button, Popover, Segmented, Space, Table, Tag, type TableColumnsType } from 'antd';
import { PlayCircleOutlined, PlusOutlined, RightOutlined, ScanOutlined } from '@ant-design/icons';
import type { Service } from './model';
import { worktreeOf } from './model';

type Props = {
  services: Service[];
  onOpen(serviceId: string): void;
  onStart(serviceId: string): void;
  onDiscover(serviceId: string): void;
};

function localLine(service: Service) {
  if (!service.runtime) return { tag: <Tag>本地</Tag>, text: <span className="directory-muted">未配置运行定义</span> };
  if (!service.runs.length) return { tag: <Tag>本地</Tag>, text: <span className="directory-muted">未运行</span> };
  return {
    tag: <Tag color="success">本地</Tag>,
    text: <span className="directory-env-text">
      <span className="run-dot" aria-hidden="true" />
      <strong>{service.runs.length} 个运行中</strong>
      <span className="directory-run-ports">
        {service.runs.map(run => <span key={run.id}>{worktreeOf(service, run).label} <code>:{run.actualPort}</code></span>)}
      </span>
    </span>,
  };
}

function qaLine(service: Service) {
  const deploy = service.runtime?.qa?.lastDeploy;
  if (!service.runtime?.qa) return { tag: <Tag>QA</Tag>, text: <span className="directory-muted">未配置</span> };
  if (!deploy) return { tag: <Tag>QA</Tag>, text: <span className="directory-muted">未部署</span> };
  const color = deploy.state === 'submitted' ? 'processing' : deploy.state === 'success' ? 'success' : 'warning';
  const label = deploy.state === 'submitted' ? '构建中' : deploy.state === 'success' ? '成功' : '未知';
  return { tag: <Tag color={color}>QA</Tag>, text: <span className="directory-env-text">{label} · {deploy.version} · {deploy.at}</span> };
}

function statusPopover(service: Service, onOpenDetail: () => void) {
  const qa = service.runtime?.qa;
  const deploy = qa?.lastDeploy;
  return <div className="directory-popover">
    <div className="directory-popover-section">
      <h4>本地运行</h4>
      {!service.runtime ? <p>未配置运行定义；运行配置由智能体读取仓库事实并实际验证后生成。</p>
        : service.runs.length ? <ul>
          {service.runs.map(run => {
            const worktree = worktreeOf(service, run);
            return <li key={run.id}>
              <strong>{worktree.label}</strong>
              <code>:{run.actualPort}</code>
              <span>{worktree.branch} · {run.startedAt}</span>
              <span className="directory-muted">{run.portNote}</span>
            </li>;
          })}
        </ul>
        : <p>当前没有运行实例。</p>}
    </div>
    <div className="directory-popover-section">
      <h4>QA 部署</h4>
      {qa ? <>
        <p><span>{qa.target}</span><code>{qa.targetRef}</code></p>
        <p>{deploy ? `${deploy.state === 'submitted' ? '构建中' : deploy.state === 'success' ? '成功' : '未知'} · ${deploy.version} · ${deploy.at}` : '还没有提交过部署'}</p>
      </> : <p>尚未配置 QA 部署目标。</p>}
    </div>
    <Button size="small" type="link" style={{ padding: 0, height: 'auto' }} onClick={onOpenDetail}>查看服务详情 <RightOutlined /></Button>
  </div>;
}

export function ServiceDirectory({ services, onOpen, onStart, onDiscover }: Props) {
  const { message } = App.useApp();
  const [filter, setFilter] = useState<'all' | 'running'>('all');
  const [popoverId, setPopoverId] = useState<string | null>(null);
  const columns: TableColumnsType<Service> = [
    {
      title: '服务',
      dataIndex: 'name',
      width: 230,
      render: (_, service) => <div className="directory-service"><strong>{service.name}</strong><small>{service.code}</small></div>,
    },
    {
      title: '关联项目',
      dataIndex: 'projects',
      width: 190,
      responsive: ['md'],
      render: projects => {
        const shown = (projects as string[]).slice(0, 2);
        const rest = (projects as string[]).length - shown.length;
        return <div className="directory-projects">
          {shown.map(project => <Tag key={project}>{project}</Tag>)}
          {rest > 0 && <Tag>+{rest}</Tag>}
        </div>;
      },
    },
    {
      title: '运行与部署',
      key: 'status',
      render: (_, service) => {
        const local = localLine(service);
        const qa = qaLine(service);
        return <Popover
          open={popoverId === service.id}
          onOpenChange={open => setPopoverId(open ? service.id : null)}
          trigger={['hover', 'click']}
          placement="bottomLeft"
          content={statusPopover(service, () => { setPopoverId(null); onOpen(service.id); })}
        >
          <div className="directory-status" onClick={event => event.stopPropagation()}>
            <span className="directory-env">{local.tag}{local.text}</span>
            <span className="directory-env" data-prototype-position={service.id === 'freshx-pigs' ? 'directory-qa' : undefined}>{qa.tag}{qa.text}</span>
          </div>
        </Popover>;
      },
    },
    {
      title: '操作',
      key: 'actions',
      width: 190,
      align: 'right',
      render: (_, service) => <div className="directory-actions" data-prototype-position={service.id === 'freshx-pigs' ? 'directory-actions' : undefined} onClick={event => event.stopPropagation()}>
        {!service.runtime
          ? <Button size="small" icon={<ScanOutlined />} onClick={() => onDiscover(service.id)}>运行配置</Button>
          : <Space size={4} wrap>
            {service.worktrees.some(worktree => !service.runs.some(run => run.worktreeId === worktree.id)) && <Button size="small" type={service.runs.length ? 'default' : 'primary'} icon={service.runs.length ? undefined : <PlayCircleOutlined />} onClick={() => onStart(service.id)}>启动</Button>}
            {service.runs.length > 0 && <Button size="small" onClick={() => onOpen(service.id)}>查看 <RightOutlined /></Button>}
          </Space>}
      </div>,
    },
  ];

  const rows = filter === 'all' ? services : services.filter(service => service.runs.length > 0);

  return <div className="resource-home asset-home service-directory-home" data-prototype-position="directory">
    <header className="resource-home-head">
      <div className="asset-home-summary">
        <p className="resource-eyebrow">工作空间 <span>/ 服务</span></p>
        <h1>服务目录</h1>
        <p>了解服务实现职责，集中查看运行状态。状态列合并本地运行与各环境最近结果；显示不完整时悬停或点击状态列查看浮窗。</p>
      </div>
      <Space wrap>
        <div data-prototype-position="directory-filter">
          <Segmented
            value={filter}
            options={[{ label: '全部服务', value: 'all' }, { label: '只看运行中', value: 'running' }]}
            onChange={value => setFilter(value as 'all' | 'running')}
          />
        </div>
        <Button icon={<PlusOutlined />} onClick={() => message.info('沿用现有服务创建表单。')}>新增服务</Button>
      </Space>
    </header>

    <section className="resource-section service-directory-section">
      <div className="service-directory-note"><ScanOutlined /> 未配置的服务先由智能体完成运行配置；已配置的服务由你选择工作树启动。</div>
      <Table<Service>
        className="service-directory-table"
        rowKey="id"
        columns={columns}
        dataSource={rows}
        pagination={false}
        onRow={service => ({
          onClick: () => onOpen(service.id),
          className: 'service-directory-row',
        })}
      />
    </section>
  </div>;
}
