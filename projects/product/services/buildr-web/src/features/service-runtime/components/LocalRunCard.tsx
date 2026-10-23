import { Button, Collapse, Space, Tag } from 'antd';
import { BranchesOutlined, FileTextOutlined, LinkOutlined, LoadingOutlined, StopOutlined, WarningOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { formatShortDateTime } from '../../../lib/taskLabels';
import { RUN_STATUS_COLOR, RUN_STATUS_LABEL, dirtyLabel, isActiveRun, runConnections, runFailure, shortCommit, sourceLabel, visibleRunUrl } from '../model';
import type { ManagedRun, ServiceRuntimeSummary } from '../api/service-runtime-api';

type Props = {
  run: ManagedRun;
  service?: ServiceRuntimeSummary;
  taskScope?: boolean;
  history?: boolean;
  busy?: boolean;
  taskHref?: string;
  serviceHref?: string;
  onLogs(run: ManagedRun): void;
  onStop(run: ManagedRun): void;
  onStart(run: ManagedRun): void;
  onConnection(run: ManagedRun): void;
};

/** 服务详情与任务共享同一实例展示；操作交由宿主，所有运行事实取自服务器。 */
export function LocalRunCard({ run, service, taskScope, history, busy, taskHref, serviceHref, onLogs, onStop, onStart, onConnection }: Props) {
  const address = visibleRunUrl(run);
  const launch = run.launch;
  const connections = runConnections(run);
  const declaredBackends = service?.definition?.local.backends?.length ?? 0;
  const hasBackend = Boolean(declaredBackends || connections.length);
  return <article className={`runtime-run-row local-run-card${history ? ' local-run-history' : ''}`} data-run-id={run.id} data-run-status={run.status}>
    <header className="local-run-head">
      <div className="runtime-run-main">
        <div className="runtime-run-title">
          {taskScope && serviceHref ? <Link to={serviceHref}><strong>{service?.name || run.serviceCode}</strong></Link> : <strong>{taskScope ? service?.name || run.serviceCode : sourceLabel(run)}</strong>}
          <Tag color={RUN_STATUS_COLOR[run.status]}>{RUN_STATUS_LABEL[run.status]}</Tag>
          {taskScope ? <Tag>{sourceLabel(run)}</Tag> : null}
          <span className="runtime-port">:{run.actualPort}</span>
        </div>
        <p className="local-run-meta">{run.origin === 'agent' ? '智能体（Agent）启动' : run.origin === 'human' ? '手动启动' : '启动者未记录'} · {formatShortDateTime(run.startedAt)} · {run.pid > 0 ? `进程 ${run.pid}` : '进程号未记录'}</p>
      </div>
      <Space className="runtime-run-actions" size={4} wrap>
        {address && service?.type === 'frontend' ? <Button size="small" icon={<LinkOutlined />} href={address} target="_blank" rel="noreferrer">打开</Button> : null}
        <Button size="small" icon={<FileTextOutlined />} onClick={() => onLogs(run)}>日志</Button>
        {isActiveRun(run) ? <Button size="small" icon={<StopOutlined />} loading={busy} disabled={busy} onClick={() => onStop(run)}>{run.status === 'starting' ? '取消启动' : '停止'}</Button> : <Button size="small" loading={busy} disabled={busy} onClick={() => onStart(run)}>{run.status === 'failed' ? '重试' : '再次启动'}</Button>}
      </Space>
    </header>
    <div className="runtime-run-sub local-run-source">
      <div><BranchesOutlined /><code>{run.branch || '分支未记录'}</code><code>{shortCommit(run.head)}</code><Tag color={run.dirty === true ? 'gold' : undefined}>{dirtyLabel(run.dirty)}</Tag></div>
      <code title={run.worktreePath}>{run.worktreePath}</code>
      {taskHref && run.taskId && !taskScope ? <Link to={taskHref}>查看关联任务</Link> : null}
    </div>
    {run.failure ? <div className="local-run-feedback is-error"><WarningOutlined />{runFailure(run)}</div> : null}
    {run.status === 'starting' ? <div className="local-run-feedback"><LoadingOutlined />正在启动并等待就绪，可查看日志。</div> : null}
    {!history ? <div className="local-run-facts">
      <div><span className="local-run-label">访问地址</span>{run.url ? <code>{run.url}</code> : <span>地址未记录</span>}<small>{run.status === 'running' ? '就绪检查通过，业务验证仍需执行' : RUN_STATUS_LABEL[run.status]}{run.portNote ? ` · ${run.portNote}` : ''}</small></div>
      {hasBackend ? <div><span className="local-run-label">后端目标</span>{connections.length ? connections.map(connection => <div key={connection.serviceCode} className="local-run-connection"><strong>{connection.serviceCode}</strong><span>{connection.mode === 'local' ? '本地实例' : '远程测试环境'}</span><code>{connection.url}</code><small>{connection.mode === 'local' && connection.runId ? `实例 ${connection.runId}` : connection.mode === 'local' ? '实例未记录' : '启动时已注入此目标，业务请求需实际验证'}</small></div>) : <span>原记录未保存连接目标</span>}{declaredBackends > 0 && isActiveRun(run) ? <Button size="small" type="link" onClick={() => onConnection(run)}>切换连接</Button> : null}</div> : null}
    </div> : null}
    <Collapse className="local-run-launch" ghost size="small" items={[{ key: 'launch', label: '目录与启动信息', children: launch ? <dl className="runtime-facts">
      <div><dt>启动命令</dt><dd><code>{launch.command.join(' ')}</code></dd></div>
      <div><dt>工作目录</dt><dd><code>{launch.cwd}</code>{launch.profile ? <Tag>{launch.profile}</Tag> : null}</dd></div>
      <div><dt>运行定义</dt><dd><code>{launch.definitionPath}</code></dd></div>
      <div><dt>就绪检查</dt><dd>{launch.readiness.kind === 'http' ? <>HTTP <code>{launch.readiness.path}</code> 返回成功</> : <>日志出现 <code>{launch.readiness.pattern}</code></>} · {launch.timeoutSeconds} 秒内</dd></div>
      <div><dt>启动时代码</dt><dd><code>{shortCommit(run.head)}</code> · {dirtyLabel(run.dirty)}</dd></div>
    </dl> : <p className="runtime-section-note">原记录未保存启动快照。当前运行配置可能已变化，不能用它替代当时事实。</p> }]} />
  </article>;
}
