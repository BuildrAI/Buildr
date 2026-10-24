import { useEffect, useMemo, useState } from 'react';
import { Alert, App, Button, Modal, Select } from 'antd';
import { useAppShell } from '../../../app/AppShellContext';
import { api } from '../../../api';
import { useServiceRuntimeDetail } from '../hooks/useServiceRuntime';
import { startRunOptions, isActiveRun, expectedWorktree, runConnections, backendSelectionTargets, routingScopeError } from '../model';
import { createServiceRuntimeClient, type ManagedRun } from '../api/service-runtime-api';
import { RuntimeStartOptions } from './RuntimeStartOptions';
import { ServiceSourcePicker } from './ServiceSourcePicker';

type Props = { open: boolean; serviceCode: string | null; serviceName?: string; initialRun?: ManagedRun | null; onClose(): void; onStarted?(): void | Promise<void> };

/** 服务入口默认主工作库和远程；重新启动前展示当前来源并校验服务器观察。 */
export function StartWorktreeModal({ open, serviceCode, serviceName, initialRun, onClose, onStarted }: Props) {
  const { workspaceId } = useAppShell();
  const { message } = App.useApp();
  const detail = useServiceRuntimeDetail(workspaceId, open ? serviceCode : null, initialRun?.taskId || undefined);
  const client = useMemo(() => createServiceRuntimeClient(api, workspaceId || undefined), [workspaceId]);
  const [worktreeId, setWorktreeId] = useState('');
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const [sourceBusy, setSourceBusy] = useState(false);
  const [environment, setEnvironment] = useState('');
  const worktrees = detail.data?.worktrees ?? [];
  const worktree = worktrees.find(item => item.id === worktreeId) ?? null;
  const service = detail.data?.service;
  const backends = service?.definition?.local.backends ?? [];
  const taskConnection = Boolean(initialRun?.taskId);
  const scopeError = taskConnection && service?.definition?.local.routing ? routingScopeError(worktree) : null;
  const preserveTaskConnections = Boolean(initialRun?.routing && initialRun.taskId && worktree && !worktree.main && worktree.taskId === initialRun.taskId);
  const ordinaryBackend = !taskConnection;
  const restart = Boolean(initialRun && isActiveRun(initialRun));
  const active = service?.runs.find(run => run.worktreeId === worktreeId && isActiveRun(run));
  const items = service ? [{ service, worktree, connectionTarget: detail.data?.connectionTargets?.[worktreeId] ?? null, ...(!restart ? { worktrees } : {}) }] : [];
  const selectedTargetMissing = !ordinaryBackend && backends.some(backend => {
    const selected = selections[backend.serviceCode];
    if (!selected?.startsWith('run:')) return false;
    const available = detail.data?.connectionTargets?.[worktreeId]?.find(item => item.serviceCode === backend.serviceCode);
    const runId = selected.slice(4);
    return available?.target?.runId !== runId && !available?.candidates.some(candidate => candidate.runId === runId);
  });

  useEffect(() => { if (open) { setWorktreeId(initialRun?.worktreeId || ''); setError(''); } }, [open, serviceCode, initialRun?.id]);
  useEffect(() => { if (open) { setEnvironment(initialRun?.environment?.code || ''); setSourceBusy(false); } }, [open, serviceCode, initialRun?.id]);
  useEffect(() => { if (open && !worktreeId && worktrees.length) setWorktreeId((worktrees.find(item => item.main && item.taskId === null) || worktrees[0]).id); }, [open, worktrees, worktreeId]);
  /* 声明到达时补默认值；已有选择保留，不因服务器重新读取而覆盖。 */
  useEffect(() => {
    if (!open || !backends.length) return;
    setSelections(previous => {
      const next = { ...previous };
      for (const backend of backends) {
        if (next[backend.serviceCode]) continue;
        const connection = (initialRun ? runConnections(initialRun) : []).find(item => item.serviceCode === backend.serviceCode);
        next[backend.serviceCode] = connection?.mode === 'local' && connection.runId ? `run:${connection.runId}` : connection?.mode === 'remote' || service?.type === 'frontend' ? 'remote' : 'auto';
      }
      return next;
    });
  }, [open, backends, initialRun?.id, service?.type]);
  useEffect(() => { if (!open) setSelections({}); }, [open]);

  const start = async () => {
    if (!serviceCode || !worktree || !service?.definition || scopeError || selectedTargetMissing) return;
    setStarting(true); setError('');
    try {
      const source = worktree;
      const selectedEnvironment = environment || service.definition.local.remoteEnvironments?.[0]?.code;
      const targets = ordinaryBackend ? [] : backendSelectionTargets(backends, selections, detail.data?.connectionTargets?.[source.id] ?? []);
      const run = restart && initialRun
        ? await client.restart(initialRun.id, { expectedWorktree: expectedWorktree(source), ...(selectedEnvironment ? { environment: selectedEnvironment } : {}), ...(initialRun.routing ? { expectedRoutingDigest: initialRun.routing.contextDigest } : {}), ...(targets.length ? { backendTargets: targets } : {}) })
        : await client.start(serviceCode, source.id, ordinaryBackend ? { standalone: true, origin: 'human', expectedWorktree: expectedWorktree(source), ...(selectedEnvironment ? { environment: selectedEnvironment } : {}) } : { ...startRunOptions(source, initialRun), ...(targets.length ? { backendTargets: targets } : {}) });
      if (run.status !== 'running' && run.status !== 'starting') throw new Error(run.failure || (run.status === 'stopped' ? '实例已停止，未完成启动。' : '服务启动失败，请查看日志。'));
      await onStarted?.();
      message.success(run.status === 'running' ? `服务已就绪，端口 :${run.actualPort}` : `已发起启动，端口 :${run.actualPort}，正在等待就绪`);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '启动失败');
      await detail.refresh({ silent: true });
      await onStarted?.();
    } finally { setStarting(false); }
  };
  const subtitle = restart ? `${serviceName || serviceCode} · 影响实例 ${initialRun?.id}，端口 :${initialRun?.actualPort}；校验未通过时保留当前运行` : serviceName || serviceCode;
  return <Modal centered open={open && Boolean(service || detail.error)} onCancel={starting || sourceBusy ? undefined : onClose} closable={!starting && !sourceBusy} keyboard={!starting && !sourceBusy} maskClosable={!starting && !sourceBusy} title={<div className="start-worktree-heading"><span className="start-worktree-eyebrow">本地运行</span><span>{restart ? '切换连接并重启当前实例' : '启动本地服务'}</span><span className="start-worktree-sub">{subtitle}</span></div>} width={720} footer={<><Button disabled={starting || sourceBusy} onClick={onClose}>取消</Button><Button type="primary" loading={starting} disabled={sourceBusy || !worktree || !service?.definition || (!restart && Boolean(active)) || Boolean(scopeError) || selectedTargetMissing} onClick={() => void start()}>{restart ? '应用并重启当前实例' : '启动所选服务'}</Button></>}>
    <div id="service-runtime-start-drawer">
      {error ? <Alert type="error" showIcon message={error} /> : null}
      {detail.error ? <Alert type="warning" showIcon message={detail.error} action={<Button size="small" onClick={() => void detail.refresh()}>重新读取</Button>} /> : null}
      {!detail.loading && !worktrees.length ? <Alert type="info" showIcon message="没有可用代码目录" description="请先准备对应服务的代码目录。" /> : null}
      {!restart && active ? <Alert type="info" showIcon message={`所选目录已有${active.status === 'running' ? '就绪' : '启动中'}实例 :${active.actualPort}`} description="不会重复启动。可关闭面板查看对应运行，或选择其他代码目录。" /> : null}
      {selectedTargetMissing ? <Alert type="warning" showIcon message="所选目标已不再就绪，请重新选择连接" /> : null}
      {scopeError ? <Alert type="info" showIcon message="代码目录身份需要确认" description={scopeError} /> : null}
      {service && !taskConnection ? <>
        <p className="start-worktree-note">仅启动当前服务。选择远程连接环境；本地前后端联调请从开发任务一键启动。</p>
        <ServiceSourcePicker workspaceId={workspaceId || ''} repositoryId={service.repositoryId} worktrees={worktrees} worktree={worktree}
          onWorktree={id => { setWorktreeId(id); setError(''); }} onBusy={setSourceBusy}
          onSwitched={async () => { if (!await detail.refresh({ silent: true, invalidate: true })) throw new Error('分支已切换，目录重新读取失败，请重试。'); }}
          onIndependent={async (entry, snapshot) => {
            if (!worktree || !serviceCode) return;
            const result = await client.prepareWorktree(serviceCode, { worktreeId: worktree.id, targetRef: entry.ref, expectedTargetHash: entry.hash, expectedRevision: snapshot.observedRevision });
            if (!await detail.refresh({ silent: true, invalidate: true })) throw new Error('独立工作树已准备，目录重新读取失败，请重试。');
            setWorktreeId(result.worktree.id);
          }} disabled={starting || restart} />
        <div className="runtime-backend-group"><label>连接环境</label><Select aria-label="连接环境" value={environment || service.definition?.local.remoteEnvironments?.[0]?.code || 'existing'} disabled={starting} onChange={value => setEnvironment(value === 'existing' ? '' : value)} options={service.definition?.local.remoteEnvironments?.map(item => ({ value: item.code, label: `${item.name}${item.url ? ' · ' + item.url : ''}` })) ?? [{ value: 'existing', label: '远程测试环境 · 沿现有配置' }]} /></div>
      </> : service ? <RuntimeStartOptions items={items} selected={[service.code]} connection="remote" onConnection={() => undefined} backendSelections={selections} onBackendSelection={(backendCode, value) => { setSelections(previous => ({ ...previous, [backendCode]: value })); setError(''); }} preserveTaskConnections={preserveTaskConnections} disabled={starting} /> : null}
      {detail.data?.diagnostics.length ? <Alert type="warning" showIcon message="代码目录诊断" description={detail.data.diagnostics.join('；')} /> : null}
    </div>
  </Modal>;
}
