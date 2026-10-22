import { useEffect, useMemo, useState } from 'react';
import { Alert, App, Button, Modal } from 'antd';
import { useAppShell } from '../../../app/AppShellContext';
import { api } from '../../../api';
import { useServiceRuntimeDetail } from '../hooks/useServiceRuntime';
import { startRunOptions, isActiveRun, canUseLocalConnection, expectedWorktree } from '../model';
import { createServiceRuntimeClient, type BackendMode, type ManagedRun } from '../api/service-runtime-api';
import { RuntimeStartOptions } from './RuntimeStartOptions';

type Props = { open: boolean; serviceCode: string | null; serviceName?: string; initialRun?: ManagedRun | null; onClose(): void; onStarted?(): void | Promise<void> };

/** 服务入口默认主工作库和远程；重新启动前展示当前来源并校验服务器观察。 */
export function StartWorktreeModal({ open, serviceCode, serviceName, initialRun, onClose, onStarted }: Props) {
  const { workspaceId } = useAppShell();
  const { message } = App.useApp();
  const detail = useServiceRuntimeDetail(workspaceId, open ? serviceCode : null, initialRun?.taskId || undefined);
  const client = useMemo(() => createServiceRuntimeClient(api, workspaceId || undefined), [workspaceId]);
  const [worktreeId, setWorktreeId] = useState('');
  const [connection, setConnection] = useState<BackendMode>('remote');
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const worktrees = detail.data?.worktrees ?? [];
  const worktree = worktrees.find(item => item.id === worktreeId) ?? null;
  const service = detail.data?.service;
  const restart = Boolean(initialRun && isActiveRun(initialRun));
  const active = service?.runs.find(run => run.worktreeId === worktreeId && isActiveRun(run));
  const items = service ? [{ service, worktree, connectionTarget: detail.data?.connectionTargets?.[worktreeId] ?? null, ...(!restart ? { worktrees } : {}) }] : [];
  const localAvailable = service ? canUseLocalConnection(items, [service.code]) : false;
  const connectionBlocked = connection === 'local' && !localAvailable;

  useEffect(() => { if (open) { setWorktreeId(initialRun?.worktreeId || ''); setConnection(initialRun?.connection?.mode || 'remote'); setError(''); } }, [open, serviceCode, initialRun?.id]);
  useEffect(() => { if (open && !worktreeId && worktrees.length) setWorktreeId((worktrees.find(item => item.main) || worktrees[0]).id); }, [open, worktrees, worktreeId]);
  const start = async () => {
    if (!serviceCode || !worktree || !service?.definition || connectionBlocked) return;
    setStarting(true); setError('');
    try {
      const selectedConnection = service.definition.local.backend ? connection : undefined;
      const backendRunId = selectedConnection === 'local' ? items[0]?.connectionTarget?.target?.runId : undefined;
      const backendObservation = backendRunId ? { expectedBackendRunId: backendRunId } : {};
      const run = restart && initialRun
        ? await client.restart(initialRun.id, { expectedWorktree: expectedWorktree(worktree), ...(selectedConnection ? { connection: selectedConnection } : {}), ...backendObservation })
        : await client.start(serviceCode, worktree.id, { ...startRunOptions(worktree, initialRun, selectedConnection), ...backendObservation });
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
  return <Modal centered open={open} onCancel={starting ? undefined : onClose} closable={!starting} keyboard={!starting} maskClosable={!starting} title={<div className="start-worktree-heading"><span className="start-worktree-eyebrow">本地运行</span><span>{restart ? '切换连接并重启当前前端' : '启动本地服务'}</span><span className="start-worktree-sub">{serviceName || serviceCode}</span></div>} width={720} footer={<><Button disabled={starting} onClick={onClose}>取消</Button><Button type="primary" loading={starting} disabled={!worktree || !service?.definition || connectionBlocked || (!restart && Boolean(active))} onClick={() => void start()}>{restart ? '应用并重启当前前端' : '启动所选服务'}</Button></>}>
    <div id="service-runtime-start-drawer">
      {error ? <Alert type="error" showIcon message={error} /> : null}
      {detail.error ? <Alert type="warning" showIcon message={detail.error} action={<Button size="small" onClick={() => void detail.refresh()}>重新读取</Button>} /> : null}
      {detail.loading && !service ? <p className="start-worktree-note">正在读取当前代码目录…</p> : null}
      {!detail.loading && !worktrees.length ? <Alert type="info" showIcon message="没有可用代码目录" description="请先准备对应服务的代码目录。" /> : null}
      {restart ? <Alert type="info" showIcon message="先校验连接，再重启当前前端" description={`影响实例 ${initialRun?.id}，端口 :${initialRun?.actualPort}。校验未通过时保留当前运行；代码目录和其他实例保持不变。`} /> : active ? <Alert type="info" showIcon message={`所选目录已有${active.status === 'running' ? '就绪' : '启动中'}实例 :${active.actualPort}`} description="不会重复启动。可关闭面板查看对应运行，或选择其他代码目录。" /> : null}
      {service ? <RuntimeStartOptions items={items} selected={[service.code]} onWorktree={id => { setWorktreeId(id); setError(''); }} connection={connection} onConnection={mode => { setConnection(mode); setError(''); }} disabled={starting} /> : null}
      {detail.data?.diagnostics.length ? <Alert type="warning" showIcon message="代码目录诊断" description={detail.data.diagnostics.join('；')} /> : null}
    </div>
  </Modal>;
}
