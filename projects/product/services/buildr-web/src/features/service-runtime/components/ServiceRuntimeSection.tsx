import { useEffect, useState } from 'react';
import { Alert, App, Button, Space, Tabs, Tag } from 'antd';
import { CloudUploadOutlined, FileTextOutlined, LinkOutlined, PlayCircleOutlined, SettingOutlined, StopOutlined } from '@ant-design/icons';
import { useAppShell } from '../../../app/AppShellContext';
import { confirmModal } from '../../../lib/confirm';
import { formatShortDateTime } from '../../../lib/taskLabels';
import { AgentDiscoveryDrawer } from './AgentDiscoveryDrawer';
import { LocalLogsDrawer } from './LocalLogsDrawer';
import { QaDeployDrawer } from './QaDeployDrawer';
import { StartWorktreeDrawer } from './StartWorktreeDrawer';
import { useServiceRuntimeDetail } from '../hooks/useServiceRuntime';
import {
  DEPLOYMENT_STATE_COLOR,
  DEPLOYMENT_STATE_LABEL,
  activeRuns,
  environmentEntries,
  isActiveRun,
  runFailure,
  shortCommit,
} from '../model';
import { serviceRuntimeApi, type ManagedRun } from '../api/service-runtime-api';

const VISIBLE_RUNS = 5;

type Props = {
  serviceCode: string;
  serviceName: string;
};

/** 服务详情中的运行与部署：本地受管运行、运行定义来源与各环境最近结果。 */
export function ServiceRuntimeSection({ serviceCode, serviceName }: Props) {
  const { workspaceId } = useAppShell();
  const { message } = App.useApp();
  const detail = useServiceRuntimeDetail(workspaceId, serviceCode);
  const [startOpen, setStartOpen] = useState(false);
  const [discoveryOpen, setDiscoveryOpen] = useState(false);
  const [qaOpen, setQaOpen] = useState(false);
  const [logRun, setLogRun] = useState<ManagedRun | null>(null);
  const [stopping, setStopping] = useState('');
  const [error, setError] = useState('');
  const [view, setView] = useState('local');

  useEffect(() => { setView('local'); }, [serviceCode]);

  const service = detail.data?.service;
  const definition = service?.definition ?? null;
  const environments = environmentEntries(service);
  const activeView = view === 'local' || environments.some(environment => environment.id === view) ? view : 'local';
  const runs = service?.runs ?? [];
  const ordered = [...runs.filter(isActiveRun), ...runs.filter(run => !isActiveRun(run))];
  const visible = ordered.slice(0, VISIBLE_RUNS);
  const stop = async (run: ManagedRun) => {
    const confirmed = await confirmModal({
      title: `停止 ${run.worktreeLabel} 的本地运行？`,
      content: `Buildr 会向托管进程发送终止信号，端口 :${run.actualPort} 随后释放。`,
      okText: '停止运行',
      cancelText: '取消',
    });
    if (!confirmed) return;
    setStopping(run.id);
    setError('');
    try {
      await serviceRuntimeApi.stop(run.id);
      message.success('已停止本地运行');
      await detail.refresh({ silent: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '停止失败');
    } finally {
      setStopping('');
    }
  };

  return <section className="resource-section runtime-section" id="service-runtime-section">
    <div className="runtime-section-head">
      <p className="runtime-section-note">运行定义按服务维护，一份配置服务所有工作树；每次启动是一个独立运行实例，端口由 Buildr 分配。</p>
      <Space wrap>
        {definition ? <Button type="primary" icon={<PlayCircleOutlined />} onClick={() => setStartOpen(true)}>启动本地</Button> : null}
        <Button icon={<SettingOutlined />} onClick={() => setDiscoveryOpen(true)}>{definition ? '重新配置' : '运行配置'}</Button>
      </Space>
    </div>

    {error ? <Alert type="error" showIcon message={error} closable onClose={() => setError('')} /> : null}
    {detail.error ? <Alert type="warning" showIcon message={detail.error} action={<Button size="small" onClick={() => void detail.refresh()}>重试</Button>} /> : null}
    {service?.definitionDiagnostic ? <Alert type="warning" showIcon message={service.definitionDiagnostic} description="运行定义不合法时本地启动不可用；让智能体重新配置并验证。" /> : null}
    {detail.data?.diagnostics.length ? <Alert type="info" showIcon message="检出目录诊断" description={<ul className="runtime-diagnostic-list">{detail.data.diagnostics.map(item => <li key={item}>{item}</li>)}</ul>} /> : null}

    <Tabs
      className="runtime-tabs"
      activeKey={activeView}
      onChange={setView}
      items={[{ key: 'local', label: '本地运行' }, ...environments.map(environment => ({ key: environment.id, label: `${environment.label} 部署` }))]}
    />

    {activeView === 'local' ? <article className="runtime-card runtime-local-card">
      <div className="runtime-card-head">
        <div className="runtime-card-title">
          <Tag>{definition ? '一份配置 · 所有工作树' : '尚未配置'}</Tag>
          {activeRuns(service).length ? <Tag color="success">{activeRuns(service).length} 个运行中</Tag> : null}
        </div>
        {definition ? <Button type="primary" icon={<PlayCircleOutlined />} onClick={() => setStartOpen(true)}>启动本地</Button> : null}
      </div>

      {definition ? <div className="runtime-source">
        <Tag color="green">智能体发现</Tag>
        <span>运行定义 <code title={definition.path}>services/{serviceCode}/runtime.yml</code> · 验证于 {formatShortDateTime(definition.verifiedAt)}</span>
        <Button size="small" icon={<SettingOutlined />} onClick={() => setDiscoveryOpen(true)}>重新配置</Button>
      </div> : null}

      {!definition ? <div className="runtime-unconfigured">
        <div>
          <strong>尚未配置启动方式</strong>
          <p>先让智能体读取仓库事实并实际启动验证，验证后才出现启动按钮。Buildr 不猜启动命令，首期不提供手动命令入口。</p>
        </div>
        <Button type="primary" icon={<SettingOutlined />} onClick={() => setDiscoveryOpen(true)}>运行配置</Button>
      </div> : visible.length ? <div className="runtime-run-list">
        {visible.map(run => <div key={run.id} className="runtime-run-row" data-run-id={run.id} data-run-status={run.status}>
          <div className="runtime-run-main">
            <div className="runtime-run-title">
              {isActiveRun(run) ? <span className="run-dot" aria-hidden="true" /> : null}
              <strong>{run.worktreeLabel}</strong>
              {run.branch ? <Tag>{run.branch}</Tag> : null}
              {run.head ? <Tag>{shortCommit(run.head)}</Tag> : null}
              <Tag color={run.status === 'running' ? 'success' : run.status === 'starting' ? 'processing' : run.status === 'failed' ? 'error' : undefined}>
                {run.status === 'running' ? '运行中' : run.status === 'starting' ? '启动中' : run.status === 'failed' ? '失败' : '已停止'}
              </Tag>
              <span className="runtime-port">:{run.actualPort}</span>
              <span className="runtime-started">{formatShortDateTime(run.startedAt)}</span>
            </div>
            <div className="runtime-run-sub">
              <code title={run.worktreePath}>{run.worktreePath}</code>
              <span>{run.portNote}</span>
              {run.failure ? <span className="runtime-run-failure">{runFailure(run)}</span> : null}
            </div>
          </div>
          <Space className="runtime-run-actions" size={4}>
            <Button size="small" icon={<FileTextOutlined />} onClick={() => setLogRun(run)}>日志</Button>
            {isActiveRun(run) ? <Button size="small" icon={<StopOutlined />} loading={stopping === run.id} onClick={() => void stop(run)}>停止</Button> : null}
          </Space>
        </div>)}
        {ordered.length > visible.length ? <p className="runtime-more">共 {ordered.length} 次运行记录，只显示最新 {visible.length} 次。</p> : null}
      </div> : <div className="runtime-empty">
        <p>当前没有运行实例。选择工作树后启动，Buildr 会为它分配端口。</p>
        <Button type="primary" icon={<PlayCircleOutlined />} onClick={() => setStartOpen(true)}>启动本地</Button>
      </div>}

      {definition ? <dl className="runtime-facts runtime-local-facts">
        <div><dt>启动命令</dt><dd><code>{definition.local.command.join(' ')}</code></dd></div>
        <div><dt>工作目录</dt><dd><code>{definition.local.cwd}</code>{definition.local.profile ? <Tag>{definition.local.profile}</Tag> : null}</dd></div>
        <div><dt>端口</dt><dd>首选 {definition.local.preferredPort}{definition.local.portOverride ? <span className="runtime-id">覆盖方式 <code>{definition.local.portOverride}</code></span> : null}</dd></div>
        <div><dt>就绪检查</dt><dd>{definition.local.readiness.kind === 'log' ? <>日志出现 <code>{definition.local.readiness.pattern}</code></> : <>HTTP <code>{definition.local.readiness.path}</code> 返回成功</>}<span className="runtime-id">{definition.local.timeoutSeconds}s 内</span></dd></div>
      </dl> : null}
      <p className="runtime-notes">Buildr 只托管进程并捕获标准输出与错误输出，不管理 Nacos 注册、流量或 MQ。</p>
    </article> : environments.filter(environment => environment.id === activeView).map(environment => <article className="runtime-card runtime-environment-card" key={environment.id} data-environment={environment.id}>
      <div className="runtime-card-head">
        <div className="runtime-card-title">
          <Tag color={environment.latest ? DEPLOYMENT_STATE_COLOR[environment.latest.state] : undefined}>
            {environment.defined ? environment.latest ? DEPLOYMENT_STATE_LABEL[environment.latest.state] : '未部署' : '未配置'}
          </Tag>
          {environment.defined && environment.latest ? <span className="runtime-id">最近 {formatShortDateTime(environment.latest.at ?? environment.latest.submittedAt)}</span> : null}
        </div>
        {environment.id === 'qa'
          ? <Button type="primary" icon={<CloudUploadOutlined />} disabled={!environment.defined} onClick={() => setQaOpen(true)}>部署到 QA</Button>
          : <span className="runtime-id">页面首期只提交 QA；其他环境用 <code>buildr service-runtime deploy --environment {environment.id}</code></span>}
      </div>
      {environment.defined ? <>
        <dl className="runtime-facts">
          <div><dt>服务目标</dt><dd>{environment.target}<code>{environment.targetRef}</code></dd></div>
          <div><dt>提供者</dt><dd>{environment.latest?.provider.connectionId ?? environment.connectionId}<span className="runtime-id">连接实例</span></dd></div>
          <div><dt>集成分支</dt><dd><code>{environment.integrationBranch}</code></dd></div>
          <div><dt>最近结果</dt><dd>{environment.latest ? `${DEPLOYMENT_STATE_LABEL[environment.latest.state]} · ${environment.latest.version ?? `${environment.latest.branch}@${shortCommit(environment.latest.commit)}`} · ${formatShortDateTime(environment.latest.at ?? environment.latest.submittedAt)}` : '还没有提交过部署'}</dd></div>
        </dl>
        {environment.latest?.state === 'submitted' ? <Alert
          className="runtime-submitted"
          type="info"
          showIcon
          message="已提交，构建和部署正在进行"
          description="Buildr 只记录最近一次提交结果，不复制外部系统的进度、历史和日志页面。"
          action={environment.latest.externalUrl ? <Button size="small" icon={<LinkOutlined />} href={environment.latest.externalUrl} target="_blank" rel="noreferrer">打开外部系统</Button> : undefined}
        /> : null}
        {environment.latest?.state === 'unknown' ? <Alert
          type="warning"
          showIcon
          message="最近一次提交结果未知"
          description={<>{environment.latest.diagnostics.join(' ') || '先到外部系统核对实际记录。'}{environment.latest.externalUrl ? <Button size="small" type="link" icon={<LinkOutlined />} href={environment.latest.externalUrl} target="_blank" rel="noreferrer">打开外部系统</Button> : null}</>}
        /> : null}
        {environment.latest?.diagnostics.length && environment.latest.state !== 'unknown' ? <p className="runtime-notes">{environment.latest.diagnostics.join(' ')}</p> : null}
        <p className="runtime-qa-note">Buildr 只发起部署并记录最近结果；构建、部署、当前版本和日志以外部系统为准。</p>
      </> : <div className="runtime-empty"><p>尚未配置 {environment.label} 部署目标。需要时由智能体完成运行配置，并在工作空间连接中登记目标。</p></div>}
    </article>)}

    <p className="runtime-scope-note">首期页面只提供本地运行与 QA 部署提交。生产、回归、Ops 等环境由用户在工作空间定义后显示最近结果，提交使用 <code>buildr service-runtime deploy --environment &lt;环境&gt;</code>。</p>

    <StartWorktreeDrawer open={startOpen} serviceCode={serviceCode} serviceName={serviceName} onClose={() => setStartOpen(false)} onStarted={() => void detail.refresh({ silent: true })} />
    <AgentDiscoveryDrawer open={discoveryOpen} serviceCode={serviceCode} serviceName={serviceName} onClose={() => setDiscoveryOpen(false)} />
    <LocalLogsDrawer open={Boolean(logRun)} run={logRun} serviceName={serviceName} onClose={() => setLogRun(null)} />
    <QaDeployDrawer open={qaOpen} serviceCode={serviceCode} serviceName={serviceName} onClose={() => setQaOpen(false)} onSubmitted={() => void detail.refresh({ silent: true })} />
  </section>;
}
