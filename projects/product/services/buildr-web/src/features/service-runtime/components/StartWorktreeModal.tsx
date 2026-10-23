import { useEffect, useMemo, useState } from 'react';
import { Alert, App, Button, Modal } from 'antd';
import { useAppShell } from '../../../app/AppShellContext';
import { api } from '../../../api';
import { useServiceRuntimeDetail } from '../hooks/useServiceRuntime';
import { startRunOptions, isActiveRun, expectedWorktree, runConnections } from '../model';
import { createServiceRuntimeClient, type BackendTarget, type ManagedRun } from '../api/service-runtime-api';
import { RuntimeStartOptions } from './RuntimeStartOptions';

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
  const worktrees = detail.data?.worktrees ?? [];
  const worktree = worktrees.find(item => item.id === worktreeId) ?? null;
  const service = detail.data?.service;
  const backends = service?.definition?.local.backends ?? [];
  const restart = Boolean(initialRun && isActiveRun(initialRun));
  const active = service?.runs.find(run => run.worktreeId === worktreeId && isActiveRun(run));
  const items = service ? [{ service, worktree, connectionTarget: detail.data?.connectionTargets?.[worktreeId] ?? null, ...(!restart ? { worktrees } : {}) }] : [];

  useEffect(() => { if (open) { setWorktreeId(initialRun?.worktreeId || ''); setError(''); } }, [open, serviceCode, initialRun?.id]);
  useEffect(() => { if (open && !worktreeId && worktrees.length) setWorktreeId((worktrees.find(item => item.main) || worktrees[0]).id); }, [open, worktrees, worktreeId]);
  /* 声明到达时补默认值；已有选择保留，不因服务器重新读取而覆盖。 */
  useEffect(() => {
    if (!open || !backends.length) return;
    setSelections(previous => {
      const next = { ...previous };
      for (const backend of backends) {
        if (next[backend.serviceCode]) continue;
        const connection = (initialRun ? runConnections(initialRun) : []).find(item => item.serviceCode === backend.serviceCode);
        next[backend.serviceCode] = connection?.mode === 'local' && connection.runId ? `run:${connection.runId}` : connection?.mode === 'remote' ? 'remote' : 'auto';
      }
      return next;
    });
  }, [open, backends, initialRun?.id]);
  useEffect(() => { if (!open) setSelections({}); }, [open]);

  const backendTargets = (definitions: typeof backends): BackendTarget[] => definitions.map(backend => {
    const value = selections[backend.serviceCode] ?? 'auto';
    return value === 'auto' ? { serviceCode: backend.serviceCode, target: 'auto' }
      : value === 'remote' ? { serviceCode: backend.serviceCode, target: 'remote' }
      : { serviceCode: backend.serviceCode, target: 'run', runId: value.slice(4) };
  });
  const start = async () => {
    if (!serviceCode || !worktree || !service?.definition) return;
    setStarting(true); setError('');
    try {
      const targets = backendTargets(backends);
      const run = restart && initialRun
        ? await client.restart(initialRun.id, { expectedWorktree: expectedWorktree(worktree), ...(targets.length ? { backendTargets: targets } : {}) })
        : await client.start(serviceCode, worktree.id, { ...startRunOptions(worktree, initialRun), ...(targets.length ? { backendTargets: targets } : {}) });
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
  return <Modal centered open={open} onCancel={starting ? undefined : onClose} closable={!starting} keyboard={!starting} maskClosable={!starting} title={<div className="start-worktree-heading"><span className="start-worktree-eyebrow">本地运行</span><span>{restart ? '切换连接并重启当前前端' : '启动本地服务'}</span><span className="start-worktree-sub">{subtitle}</span></div>} width={720} footer={<><Button disabled={starting} onClick={onClose}>取消</Button><Button type="primary" loading={starting} disabled={!worktree || !service?.definition || (!restart && Boolean(active))} onClick={() => void start()}>{restart ? '应用并重启当前前端' : '启动所选服务'}</Button></>}>
    <div id="service-runtime-start-drawer">
      {error ? <Alert type="error" showIcon message={error} /> : null}
      {detail.error ? <Alert type="warning" showIcon message={detail.error} action={<Button size="small" onClick={() => void detail.refresh()}>重新读取</Button>} /> : null}
      {detail.loading && !service ? <p className="start-worktree-note">正在读取当前代码目录…</p> : null}
      {!detail.loading && !worktrees.length ? <Alert type="info" showIcon message="没有可用代码目录" description="请先准备对应服务的代码目录。" /> : null}
      {!restart && active ? <Alert type="info" showIcon message={`所选目录已有${active.status === 'running' ? '就绪' : '启动中'}实例 :${active.actualPort}`} description="不会重复启动。可关闭面板查看对应运行，或选择其他代码目录。" /> : null}
      {service ? <RuntimeStartOptions items={items} selected={[service.code]} onWorktree={id => { setWorktreeId(id); setError(''); }} connection="remote" onConnection={() => undefined} backendSelections={selections} onBackendSelection={(backendCode, value) => { setSelections(previous => ({ ...previous, [backendCode]: value })); setError(''); }} disabled={starting} /> : null}
      {detail.data?.diagnostics.length ? <Alert type="warning" showIcon message="代码目录诊断" description={detail.data.diagnostics.join('；')} /> : null}
    </div>
  </Modal>;
}
