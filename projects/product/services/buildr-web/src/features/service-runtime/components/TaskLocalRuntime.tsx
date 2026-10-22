import { useMemo, useState } from 'react';
import { Alert, App, Button, Modal, Tag } from 'antd';
import { useAppShell } from '../../../app/AppShellContext';
import { api } from '../../../api';
import { workspaceHref } from '../../../lib/labels';
import { confirmModal } from '../../../lib/confirm';
import { createServiceRuntimeClient, type BackendMode, type ManagedRun, type ServiceRuntimeSummary, type TaskStartResult } from '../api/service-runtime-api';
import { useTaskRuntime } from '../hooks/useServiceRuntime';
import { availableTaskServices, canUseLocalConnection, isActiveRun, sourceLabel, taskSelections } from '../model';
import { LocalRuntimeSurface } from './LocalRuntimeSurface';
import { LocalLogsDrawer } from './LocalLogsDrawer';
import { RuntimeStartOptions } from './RuntimeStartOptions';
import { StartWorktreeModal } from './StartWorktreeModal';
import { AgentDiscoveryDrawer } from './AgentDiscoveryDrawer';

/** 任务只选择与组合单项能力；每项成功保留，不引入独立运行组状态。 */
export function TaskLocalRuntime({ taskId }: { taskId: string }) {
  const { workspaceId } = useAppShell();
  const { message } = App.useApp();
  const runtime = useTaskRuntime(workspaceId, taskId);
  const client = useMemo(() => createServiceRuntimeClient(api, workspaceId || undefined), [workspaceId]);
  const [startOpen, setStartOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [connection, setConnection] = useState<BackendMode>('local');
  const [starting, setStarting] = useState(false);
  const [startResult, setStartResult] = useState<TaskStartResult | null>(null);
  const [error, setError] = useState('');
  const [busyIds, setBusyIds] = useState<string[]>([]);
  const [logRun, setLogRun] = useState<ManagedRun | null>(null);
  const [switchRun, setSwitchRun] = useState<ManagedRun | null>(null);
  const [discovery, setDiscovery] = useState<ServiceRuntimeSummary | null>(null);
  const services = runtime.data?.services || [];
  const runs = runtime.data?.runs.filter(run => run.taskId === taskId) || [];
  const connectionBlocked = connection === 'local' && !canUseLocalConnection(services, selected, true);
  const openStart = (run?: ManagedRun) => { if (starting) { setStartOpen(true); return; } setSelected(run ? [run.serviceCode] : availableTaskServices(services).map(item => item.service.code)); setConnection(run?.connection?.mode || 'local'); setStartResult(null); setError(''); setStartOpen(true); };
  const start = async () => {
    const choices = taskSelections(services, selected, connection);
    if (!choices.length || connectionBlocked) return;
    setStarting(true); setError(''); setStartResult(null);
    try {
      const result = await client.startTask(taskId, { selected: choices, connection, origin: 'human' });
      setStartResult(result);
      await runtime.refresh({ silent: true });
      const failures = result.results.filter(item => item.error);
      if (failures.length) { setSelected(failures.map(item => item.serviceCode)); setError(failures.map(item => `${item.serviceCode}：${item.error!.message}`).join('；')); message.warning('部分服务未启动，其他已成功实例保留。'); }
      else { message.success('所选服务已启动或复用，状态在运行卡中更新。'); setStartOpen(false); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : '任务服务启动失败'); await runtime.refresh({ silent: true }); }
    finally { setStarting(false); }
  };
  const stop = async (targets: ManagedRun[]) => {
    const ids = new Set(targets.map(run => run.id));
    const affected = runs.some(run => isActiveRun(run) && run.connection?.runId && ids.has(run.connection.runId) && !ids.has(run.id));
    if (!await confirmModal({ centered: true, title: targets.length > 1 ? '停止本任务服务？' : `停止 ${sourceLabel(targets[0])} 的本地运行？`, content: <><p>仅停止以下实例，主工作库和其他任务保持运行。</p><ul>{targets.map(run => <li key={run.id}>{services.find(item => item.service.code === run.serviceCode)?.service.name || run.serviceCode} · :{run.actualPort} · {run.id}</li>)}</ul>{affected ? <p>仍有前端连接所选后端，停止后需要重新启动后端或切换前端连接。</p> : null}</>, okText: '停止运行', cancelText: '取消' })) return;
    setBusyIds([...ids]); setError('');
    const results = await Promise.allSettled(targets.map(run => client.stop(run.id)));
    const failures = results.flatMap((item, index) => item.status === 'rejected' ? [`${targets[index].serviceCode}：${item.reason instanceof Error ? item.reason.message : '停止失败'}`] : []);
    if (failures.length) setError(failures.join('；'));
    else message.success('所选本地运行已停止');
    setBusyIds([]); await runtime.refresh({ silent: true });
  };
  const selectedService = switchRun && services.find(item => item.service.code === switchRun.serviceCode)?.service;
  return <section className="task-local-runtime" id="task-local-runtime" data-task-runtime-id={taskId}>
    <p className="runtime-section-note">开发验证使用本任务代码目录。服务就绪与后端目标可在这里查看，业务验证仍需在授权后执行。</p>
    {runtime.error ? <Alert type="warning" showIcon message={runtime.error} action={<Button onClick={() => void runtime.refresh()}>重试</Button>} /> : null}
    {error && !startOpen ? <Alert type="error" showIcon message={error} closable onClose={() => setError('')} /> : null}
    {runtime.data?.diagnostics.length ? <Alert type="warning" showIcon message="任务服务诊断" description={runtime.data.diagnostics.join('；')} /> : null}
    {runtime.loading && !runtime.data ? <p className="runtime-section-note">正在读取任务服务与代码目录…</p> : null}
    {services.filter(item => !item.service.definition || !item.worktree || item.diagnostics.length).map(item => <Alert key={item.service.code} type="warning" showIcon message={item.service.name} description={[...item.diagnostics, ...(!item.worktree ? ['没有唯一匹配的本任务代码目录，不会回落主工作库。'] : []), ...(!item.service.definition ? [item.service.definitionDiagnostic || '尚未配置启动方式。'] : [])].join('；')} action={!item.service.definition ? <Button size="small" onClick={() => setDiscovery(item.service)}>运行配置</Button> : undefined} />)}
    <LocalRuntimeSurface taskScope services={services.map(item => item.service)} runs={runs} busyIds={busyIds} startDisabled={!availableTaskServices(services).length || starting} onStart={openStart} onStop={run => void stop([run])} onStopAll={() => void stop(runs.filter(isActiveRun))} onLogs={setLogRun} onConnection={setSwitchRun} serviceHref={service => workspaceHref(workspaceId, `/services/${encodeURIComponent(service.id)}?view=runtime`)} />
    <Modal centered open={startOpen} onCancel={starting ? undefined : () => setStartOpen(false)} closable={!starting} keyboard={!starting} maskClosable={!starting} title="启动本任务服务" width={760} footer={<>{starting ? <Button onClick={() => setStartOpen(false)}>后台查看运行状态</Button> : <Button onClick={() => setStartOpen(false)}>取消</Button>}<Button type="primary" loading={starting} disabled={!taskSelections(services, selected).length || connectionBlocked} onClick={() => void start()}>启动所选服务</Button></>}>
      <div id="task-runtime-start-modal">
        {error ? <Alert type="error" showIcon message={error} /> : null}
        {startResult?.results.map(result => <Alert key={result.serviceCode} type={result.error ? 'error' : 'success'} showIcon message={`${services.find(item => item.service.code === result.serviceCode)?.service.name || result.serviceCode}：${result.error?.message || (result.reused ? '复用已有实例' : result.run?.status === 'running' ? '服务已就绪' : '已发起启动')}`} description={result.run ? `实例 ${result.run.id} · :${result.run.actualPort}` : undefined} />)}
        <RuntimeStartOptions items={services} selected={selected} onSelected={codes => { setSelected(codes); setStartResult(null); }} connection={connection} onConnection={mode => { setConnection(mode); setStartResult(null); }} taskScope disabled={starting} />
        <p className="start-worktree-note"><Tag>按项返回结果</Tag>已有实例先核对连接后复用。前端失败时保留已就绪后端；等待较久时可“后台查看运行状态”并打开运行卡日志；关闭面板不会取消已发起的启动。</p>
      </div>
    </Modal>
    <StartWorktreeModal open={Boolean(switchRun)} serviceCode={switchRun?.serviceCode || null} serviceName={selectedService?.name} initialRun={switchRun} onClose={() => setSwitchRun(null)} onStarted={() => runtime.refresh({ silent: true })} />
    <LocalLogsDrawer open={Boolean(logRun)} run={runs.find(run => run.id === logRun?.id) || logRun} serviceName={services.find(item => item.service.code === logRun?.serviceCode)?.service.name} onClose={() => setLogRun(null)} />
    <AgentDiscoveryDrawer open={Boolean(discovery)} serviceCode={discovery?.code || null} serviceName={discovery?.name} onClose={() => setDiscovery(null)} />
  </section>;
}
