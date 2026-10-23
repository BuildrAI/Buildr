import { useState } from 'react';
import { Alert, App, Button, Space, Tabs, Tag } from 'antd';
import {
  CloudUploadOutlined,
  FileTextOutlined,
  LinkOutlined,
  PlayCircleOutlined,
  ScanOutlined,
  StopOutlined,
} from '@ant-design/icons';
import type { Service } from './model';
import { worktreeOf } from './model';

type Props = {
  service: Service;
  onStart(): void;
  onStop(runId: string): void;
  onLogs(runId: string): void;
  onDiscover(): void;
  onQaDeploy(): void;
  onOpenYunque(): void;
};

function qaStatus(service: Service) {
  const qa = service.runtime?.qa;
  if (!qa) return { color: undefined, label: '未配置' };
  if (!qa.lastDeploy) return { color: 'default', label: '未部署' };
  if (qa.lastDeploy.state === 'submitted') return { color: 'processing', label: '构建中' };
  if (qa.lastDeploy.state === 'success') return { color: 'success', label: '成功' };
  return { color: 'warning', label: '未知' };
}

export function ServiceDetail({ service, onStart, onStop, onLogs, onDiscover, onQaDeploy, onOpenYunque }: Props) {
  const { message } = App.useApp();
  const [pageView, setPageView] = useState('runtime');
  const [view, setView] = useState('local');
  const qa = service.runtime?.qa;
  const deploy = qa?.lastDeploy;
  const status = qaStatus(service);

  return <div className="resource-home asset-home service-runtime-home" data-prototype-position="service-runtime">
    <header className="resource-home-head">
      <div className="asset-home-summary">
        <p className="resource-eyebrow">服务 <span>/ {service.code}</span></p>
        <h1>{service.name}</h1>
        <p>{service.description}</p>
      </div>
      <Space wrap>
        <Button onClick={() => message.info('沿用现有服务编辑表单。')}>编辑服务</Button>
        <Button onClick={() => message.info('本次原型不移除服务。')}>移除</Button>
      </Space>
    </header>

    <Tabs
      className="asset-home-tabs"
      activeKey={pageView}
      onChange={setPageView}
      items={[
        { key: 'detail', label: <span data-prototype-position="detail-tab">详情</span> },
        { key: 'runtime', label: <span data-prototype-position="runtime-tab">运行与部署</span> },
      ]}
    />

    {pageView === 'runtime' ? <section className="runtime-section" data-prototype-position="runs">
      <div className="runtime-section-head">
        <p className="runtime-section-note">运行定义按服务维护，一份配置服务所有工作树；每次启动是一个独立运行实例，端口由 Buildr 分配。</p>
      </div>

      <Tabs
        className="runtime-tabs"
        activeKey={view}
        onChange={setView}
        items={[{ key: 'local', label: '本地运行' }, { key: 'qa', label: <span data-prototype-position="qa-tab">QA 部署</span> }]}
      />

      {view === 'local' ? <article className="runtime-card" data-prototype-position="local-card">
        <div className="runtime-card-head">
          <div className="runtime-card-title">
            <Tag>一份配置 · 所有工作树</Tag>
          </div>
          {service.runtime && <Button type="primary" icon={<PlayCircleOutlined />} onClick={onStart} data-prototype-position="start-action">启动本地</Button>}
        </div>

        {service.runtime && <div className="runtime-source" data-prototype-position="config-action">
          <Tag color="green">智能体发现</Tag>
          <span>运行定义 <code>services/{service.code}/runtime.yml</code> · 验证于 {service.runtime.verifiedAt}</span>
          <Button size="small" icon={<ScanOutlined />} onClick={onDiscover}>重新配置</Button>
        </div>}

        {!service.runtime ? <div className="runtime-unconfigured" data-prototype-position="unconfigured">
          <div>
            <strong>尚未配置启动方式</strong>
            <p>先让智能体读取仓库事实并实际启动验证，验证后才出现启动按钮。Buildr 不猜启动命令，首期不提供手动命令入口。</p>
          </div>
          <Button type="primary" icon={<ScanOutlined />} onClick={onDiscover}>运行配置</Button>
        </div> : service.runs.length ? <div className="runtime-run-list">
          {service.runs.map(run => {
            const worktree = worktreeOf(service, run);
            return <div key={run.id} className="runtime-run-row" data-prototype-position="run-row">
              <div className="runtime-run-main">
                <div className="runtime-run-title">
                  <span className="run-dot" aria-hidden="true" />
                  <strong>{worktree.label}</strong>
                  <Tag>{worktree.branch}</Tag>
                  <Tag>{worktree.head}</Tag>
                  {worktree.dirty && <Tag color="gold">未提交改动</Tag>}
                  <span className="run-status-text">运行中</span>
                  <span className="runtime-port">:{run.actualPort}</span>
                  <span className="runtime-started">{run.startedAt}</span>
                </div>
                <div className="runtime-run-sub"><code>{worktree.path}</code><span>{run.portNote}</span></div>
              </div>
              <Space className="runtime-run-actions" size={4}>
                <Button size="small" icon={<FileTextOutlined />} onClick={() => onLogs(run.id)}>日志</Button>
                <Button size="small" icon={<StopOutlined />} onClick={() => onStop(run.id)}>停止</Button>
              </Space>
            </div>;
          })}
        </div> : <div className="runtime-empty">
          <p>当前没有运行实例。选择工作树后启动，Buildr 会为它分配端口。</p>
          <Button type="primary" icon={<PlayCircleOutlined />} onClick={onStart}>启动本地</Button>
        </div>}

        {service.runtime && <div className="runtime-notes">
          {service.runtime.local.notes.map(note => <span key={note}>{note}</span>)}
          <span>Buildr 只托管进程，不管理 Nacos 注册、流量或 MQ。</span>
        </div>}
      </article> : <article className="runtime-card runtime-qa-card" data-prototype-position="qa-card">
        <div className="runtime-card-head">
          <div className="runtime-card-title">
            <Tag color={status.color}>{status.label}</Tag>
          </div>
          <Button
            type="primary"
            icon={<CloudUploadOutlined />}
            disabled={!qa}
            onClick={onQaDeploy}
          >部署到 QA</Button>
        </div>

        {qa ? <>
          <dl className="runtime-facts">
            <div><dt>服务目标</dt><dd>{qa.target}<code>{qa.targetRef}</code></dd></div>
            <div><dt>提供者</dt><dd>{qa.connection}</dd></div>
            <div><dt>最近结果</dt><dd>{deploy ? `${deploy.state === 'submitted' ? '已提交' : deploy.state === 'success' ? '成功' : '未知'} · ${deploy.version} · ${deploy.at}` : '还没有提交过部署'}</dd></div>
          </dl>
          {deploy?.state === 'submitted' && <div data-prototype-position="qa-status">
            <Alert
              className="runtime-submitted"
              type="info"
              showIcon
              message="已提交到云雀，构建和部署正在进行"
              description="Buildr 只记录最近一次提交结果，不复制云雀的进度、历史和日志页面。"
              action={<Button size="small" icon={<LinkOutlined />} onClick={onOpenYunque}>打开云雀</Button>}
            />
          </div>}
          <p className="runtime-qa-note">Buildr 只发起部署并记录最近结果；构建、部署、当前版本和日志以云雀为准。</p>
        </> : <div className="runtime-empty"><p>尚未配置 QA 部署目标。需要时由智能体完成运行配置，并在工作空间连接中登记目标。</p></div>}
      </article>}

      <p className="runtime-scope-note">首期页面只提供本地运行与 QA 部署提交。生产、回归、Ops 等环境由用户在工作空间定义后显示最近结果，提交使用 <code>buildr service-runtime deploy --environment &lt;环境&gt;</code>。</p>
    </section> : <section className="resource-section runtime-context-section" data-prototype-position="detail-content">
      <div className="resource-section-head"><h2>服务上下文</h2></div>
      <dl className="asset-facts">
        <div><dt>关联项目</dt><dd><Space size={4} wrap>{service.projects.map(project => <Tag key={project}>{project}</Tag>)}</Space></dd></div>
        <div><dt>代码库</dt><dd><code>repositories/{service.repository}</code></dd></div>
        <div><dt>工作树</dt><dd>{service.worktrees.length} 个 · {service.worktrees.map(worktree => worktree.label).join('、')}</dd></div>
        <div><dt>运行定义</dt><dd>{service.runtime ? <code>services/{service.code}/runtime.yml</code> : '尚未生成'}</dd></div>
      </dl>
    </section>}
  </div>;
}
