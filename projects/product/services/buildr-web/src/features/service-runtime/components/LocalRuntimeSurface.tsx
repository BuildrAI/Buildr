import type { ReactNode } from 'react';
import { Button, Collapse, Empty, Space } from 'antd';
import { LinkOutlined, PlayCircleOutlined } from '@ant-design/icons';
import { isActiveRun, runConnections, connectionAddress, visibleRunUrl } from '../model';
import type { ManagedRun, ServiceRuntimeSummary } from '../api/service-runtime-api';
import { LocalRunCard } from './LocalRunCard';

type Props = {
  taskScope?: boolean;
  services: ServiceRuntimeSummary[];
  runs: ManagedRun[];
  busyIds?: string[];
  startDisabled?: boolean;
  configuration?: ReactNode;
  taskHref?(id: string): string;
  serviceHref?(service: ServiceRuntimeSummary): string;
  onStart(run?: ManagedRun): void;
  onStop(run: ManagedRun): void;
  onStopAll?(): void;
  onLogs(run: ManagedRun): void;
  onConnection(run: ManagedRun): void;
};

/** 实例是共同事实；任务与服务只提供不同范围及启动默认值。 */
export function LocalRuntimeSurface(p: Props) {
  const current = p.runs.filter(run => isActiveRun(run) || run.status === 'failed');
  const history = p.runs.filter(run => !isActiveRun(run) && run.status !== 'failed');
  const active = current.filter(isActiveRun);
  const frontend = active.find(run => p.services.some(service => service.code === run.serviceCode && service.type === 'frontend') && runConnections(run).length && visibleRunUrl(run))
    ?? active.find(run => runConnections(run).length && visibleRunUrl(run));
  const address = frontend && visibleRunUrl(frontend);
  const frontendService = frontend ? p.services.find(item => item.code === frontend.serviceCode) : undefined;
  const card = (run: ManagedRun, historical = false) => {
    const service = p.services.find(item => item.code === run.serviceCode || item.id === run.serviceId);
    return <LocalRunCard key={run.id} run={run} service={service} taskScope={p.taskScope} history={historical} busy={p.busyIds?.includes(run.id)} taskHref={run.taskId ? p.taskHref?.(run.taskId) : undefined} serviceHref={service ? p.serviceHref?.(service) : undefined} onLogs={p.onLogs} onStop={p.onStop} onStart={p.onStart} onConnection={p.onConnection} />;
  };
  return <div className="local-runtime-surface">
    <div className="runtime-section-head">
      <div><h2>{p.taskScope ? '本任务的本地服务' : '本地运行'} <span className="local-runtime-count">{active.length} 个活跃实例</span></h2><p>{p.taskScope ? '使用本任务的代码目录，可选择单个或多个服务启动。' : '查看这个服务在主工作库和任务目录中的运行。'}</p></div>
      <Space wrap>{p.taskScope && active.length && p.onStopAll ? <Button disabled={Boolean(p.busyIds?.length)} onClick={p.onStopAll}>停止本任务服务</Button> : null}<Button type="primary" disabled={p.startDisabled} icon={<PlayCircleOutlined />} onClick={() => p.onStart()}>{p.taskScope ? '启动任务服务' : '启动本地'}</Button></Space>
    </div>
    {p.taskScope && frontend ? <div className="local-runtime-connection"><div><strong>{frontendService?.name || frontend.serviceCode} :{frontend.actualPort}</strong><span>→</span>{runConnections(frontend).map(connection => <span key={connection.serviceCode} className="local-runtime-connection-item"><span>{connection.serviceCode} · {connection.mode === 'local' ? '本地实例' : '远程测试环境'}</span><code>{connectionAddress(connection)}</code></span>)}</div><Space wrap><small>目标已配置，业务验证仍待执行</small>{address && frontendService?.type === 'frontend' ? <Button size="small" href={address} target="_blank" rel="noreferrer" icon={<LinkOutlined />}>打开前端</Button> : null}</Space></div> : null}
    {current.length ? <div className="runtime-run-list">{current.map(run => card(run))}</div> : <div className="runtime-empty local-runtime-empty"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前没有运行实例" /><p>{p.taskScope ? '点击上方“启动任务服务”，选择本任务服务后启动。' : '点击上方“启动本地”，选择代码来源和连接环境。'}</p></div>}
    {p.configuration}
    {history.length ? <Collapse className="local-runtime-history" ghost items={[{ key: 'history', label: `已结束的运行 · ${history.length} 次`, children: history.map(run => card(run, true)) }]} /> : null}
  </div>;
}
