import { useMemo, useState } from 'react';
import { Alert, App, Button } from 'antd';
import { SettingOutlined } from '@ant-design/icons';
import { useAppShell } from '../../../app/AppShellContext';
import { api } from '../../../api';
import { workspaceHref } from '../../../lib/labels';
import { confirmModal } from '../../../lib/confirm';
import { RuntimeConfigurationDrawer } from './RuntimeConfigurationDrawer';
import { LocalLogsDrawer } from './LocalLogsDrawer';
import { StartWorktreeModal } from './StartWorktreeModal';
import { LocalRuntimeSurface } from './LocalRuntimeSurface';
import { RuntimeDefinitionDrawer } from './RuntimeDefinitionDrawer';
import { RuntimeConfigurationSummary } from './RuntimeConfigurationSummary';
import { useServiceRuntimeDetail } from '../hooks/useServiceRuntime';
import { useRuntimeConfiguration } from '../hooks/useRuntimeConfiguration';
import { createServiceRuntimeClient, type ManagedRun } from '../api/service-runtime-api';
import { sourceLabel } from '../model';

type Props = { serviceCode: string; serviceName: string };

/** 服务入口查看全部来源；与任务共用运行卡和日志，不承担部署。 */
export function ServiceRuntimeSection({ serviceCode, serviceName }: Props) {
  const { workspaceId } = useAppShell();
  const { message } = App.useApp();
  const client = useMemo(() => createServiceRuntimeClient(api, workspaceId || undefined), [workspaceId]);
  const detail = useServiceRuntimeDetail(workspaceId, serviceCode);
  const [startOpen, setStartOpen] = useState(false);
  const [initialRun, setInitialRun] = useState<ManagedRun | null>(null);
  const [definitionOpen, setDefinitionOpen] = useState(false);
  const [logRun, setLogRun] = useState<ManagedRun | null>(null);
  const [stopping, setStopping] = useState('');
  const [error, setError] = useState('');
  const service = detail.data?.service;
  const configuration = useRuntimeConfiguration();
  const definition = service?.definition;
  const configuring = configuration.pending?.code === serviceCode || (configuration.submitting && configuration.target?.code === serviceCode);
  const start = (run?: ManagedRun) => { setInitialRun(run || null); setStartOpen(true); };
  const stop = async (run: ManagedRun) => {
    if (!await confirmModal({ centered: true, title: `停止 ${sourceLabel(run)} 的本地运行？`, content: `仅停止实例 ${run.id}，端口 :${run.actualPort}。其他来源的运行保持不变。`, okText: '停止运行', cancelText: '取消' })) return;
    setStopping(run.id); setError('');
    try { await client.stop(run.id); message.success('已停止本地运行'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '停止失败'); }
    finally { setStopping(''); await detail.refresh({ silent: true }); }
  };
  return <section className="resource-section runtime-section" id="service-runtime-section">
    {error ? <Alert type="error" showIcon message={error} closable onClose={() => setError('')} /> : null}
    {detail.error ? <Alert type="warning" showIcon message={detail.error} action={<Button size="small" onClick={() => void detail.refresh()}>重试</Button>} /> : null}
    {detail.data?.diagnostics.length ? <Alert type="warning" showIcon message="代码目录诊断" description={detail.data.diagnostics.join('；')} /> : null}
    {!definition && !detail.loading ? <div className="runtime-unconfigured"><div><strong>尚未配置启动方式</strong><p>{service?.definitionDiagnostic || '由智能体（Agent）核对仓库并实际验证后保存运行定义。已有运行仍可查看。'}</p></div><Button icon={<SettingOutlined />} loading={configuration.pending?.code === serviceCode} disabled={configuration.pending?.code === serviceCode} aria-label={configuration.pending?.code === serviceCode ? '配置中' : undefined} onClick={() => configuration.open({ code: serviceCode, name: serviceName, definition: definition ?? null })}>{configuration.pending?.code === serviceCode ? '配置中' : '开始配置'}</Button></div> : null}
    {detail.loading && !service ? <p className="runtime-section-note">正在读取运行状态…</p> : null}
    <LocalRuntimeSurface services={service ? [service] : []} runs={service?.runs || []} busyIds={stopping ? [stopping] : []} startDisabled={!definition} onStart={start} onStop={run => void stop(run)} onLogs={setLogRun} onConnection={start} taskHref={id => workspaceHref(workspaceId, `/tasks/${encodeURIComponent(id)}`)} configuration={definition ? <RuntimeConfigurationSummary definition={definition} configuring={configuring} onView={() => setDefinitionOpen(true)} onConfigure={() => configuration.open({ code: serviceCode, name: serviceName, definition })} /> : null} />
    <p className="runtime-scope-note">本地运行托管进程和日志，不管理共享环境的注册、流量或消息队列。就绪不代表业务验证完成。</p>
    <StartWorktreeModal open={startOpen} serviceCode={serviceCode} serviceName={serviceName} initialRun={initialRun} onClose={() => setStartOpen(false)} onStarted={async () => { await detail.refresh({ silent: true }); }} />
    <RuntimeDefinitionDrawer service={definitionOpen && service ? service : null} onClose={() => setDefinitionOpen(false)} onConfigure={() => { setDefinitionOpen(false); configuration.open({ code: serviceCode, name: serviceName, definition }); }} />
    <RuntimeConfigurationDrawer target={configuration.target} submitting={configuration.submitting} feedback={configuration.feedback} pending={configuration.pending} onSubmit={() => void configuration.submit()} onClose={configuration.close} onResolved={configuration.resolve} />
    <LocalLogsDrawer open={Boolean(logRun)} run={service?.runs.find(run => run.id === logRun?.id) || logRun} serviceName={serviceName} onClose={() => setLogRun(null)} />
  </section>;
}
