import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App, Badge, Button, Modal, Spin, Tag, Typography } from 'antd';
import { CloudDownloadOutlined, SyncOutlined } from '@ant-design/icons';

import type { ReleaseAwareness } from '../api/release-awareness-api';
import { useUpdateFlow } from '../hooks/useUpdateFlow';
import { simulatedTargetVersion } from '../lib/simulated-update';

type ReleaseTrack = ReleaseAwareness['tracks']['stable'];

type Props = {
  enabled: boolean;
  openAgentAction(action?: string, context?: Record<string, unknown>): void;
  onRestarting(): void;
  onCompleted?(): void;
};

function trackStatus(track: ReleaseTrack): string {
  if (!track.version) return '未发布';
  if (track.installable) return '可更新';
  return track.status === 'current' ? '已是最新' : track.status;
}

export function UpdateEntry({ enabled, openAgentAction, onRestarting, onCompleted }: Props) {
  const { notification, message } = App.useApp();
  const { awareness, job, check, prepare, apply } = useUpdateFlow({ enabled, onRestarting, onCompleted });
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const previousStatus = useRef<string | null>(null);

  const updates = useMemo(() => {
    if (awareness?.mode !== 'npm' || awareness.freshness.status !== 'fresh') return [];
    return [awareness.tracks.stable, awareness.tracks.candidate]
      .filter((track) => track.available && track.installable && Boolean(track.version));
  }, [awareness]);

  const active = job?.status === 'preparing' || job?.status === 'ready' || job?.status === 'applying';
  const showBadge = updates.length > 0 || Boolean(active && job) || job?.status === 'failed';

  // 就绪通知：一次状态迁移只提醒一次。
  useEffect(() => {
    const previous = previousStatus.current;
    previousStatus.current = job?.status ?? null;
    if (job?.status === 'ready' && previous === 'preparing') {
      notification.info({
        message: '更新包已就绪',
        description: `Buildr ${job.version} 已下载完成，可随时安装并重启。`,
        onClick: () => setOpen(true),
      });
    }
  }, [job?.status, job?.version, notification]);

  const runAction = useCallback(async (action: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    setActionError('');
    try {
      await action();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '操作失败，请重试。');
    } finally {
      setBusy(false);
    }
  }, [busy]);

  const copy = useCallback(async (track: ReleaseTrack) => {
    const value = `buildr update --track ${track.track}`;
    try {
      await navigator.clipboard.writeText(value);
      void message.success('更新命令已复制。');
    } catch {
      void message.warning(`请手动复制：${value}`);
    }
  }, [message]);

  const handToAgent = useCallback((track: ReleaseTrack) => {
    const value = `buildr update --track ${track.track}`;
    const prompt = `用户已选择把本机 Buildr 更新到${track.label} ${track.version}。请先读取 buildr update check --json 确认当前双轨道结果，再运行 ${value}；不要切换到其他轨道，不要降级，也不要修改 Workspace 数据或 Agent runtime。完成后说明本机 Buildr 的实际版本。`;
    openAgentAction('release-update', { prompt, track: track.track, command: value, version: track.version });
    setOpen(false);
  }, [openAgentAction]);

  if (!enabled || !awareness || (awareness.mode !== 'npm' && awareness.mode !== 'development')) return null;
  const devMode = awareness.mode === 'development';
  const simulatedTarget = devMode ? simulatedTargetVersion(awareness.current.version) : null;

  const icon = job?.status === 'preparing' || job?.status === 'applying' ? <SyncOutlined spin /> : <CloudDownloadOutlined />;
  return (
    <>
      <Badge dot={showBadge} status={job?.status === 'ready' ? 'processing' : undefined}>
        <Button
          id="update-entry"
          aria-label="检查更新"
          type="text"
          icon={icon}
          onClick={() => { setOpen(true); check(); }}
        />
      </Badge>
      <Modal
        open={open}
        title="Buildr 更新"
        footer={null}
        onCancel={() => setOpen(false)}
      >
        <div id="update-details-modal" className="update-details">
          <div className="update-current">
            当前版本 <strong>{awareness.current.version}</strong>
            {devMode ? <Tag>开发模式</Tag> : null}
            {!devMode && awareness.freshness.status !== 'fresh' ? <Tag>版本检查暂不可用</Tag> : null}
          </div>
          {devMode ? (
            <div className="update-tracks">
              <div className="update-track" data-update-track="simulated">
                <div className="update-track-info">
                  <strong>开发模拟更新</strong>
                  <span>{simulatedTarget || '不可用'}</span>
                  <Tag className="update-track-status">模拟</Tag>
                </div>
                {simulatedTarget ? (
                  <div className="update-track-actions">
                    <Button
                      size="small"
                      id="update-prepare-simulated"
                      data-update-prepare="simulated"
                      loading={busy && job?.status === 'preparing'}
                      disabled={busy || Boolean(active && job?.version !== simulatedTarget)}
                      onClick={() => void runAction(() => prepare('stable', simulatedTarget))}
                    >下载更新包</Button>
                  </div>
                ) : null}
              </div>
              <Typography.Text type="secondary" className="update-simulated-hint">
                开发版仅模拟下载与安装，不访问 npm registry、不改动真实安装；确认安装后本实例将真实重启。
              </Typography.Text>
            </div>
          ) : (
            <div className="update-tracks">
              {[awareness.tracks.stable, awareness.tracks.candidate].map((track) => (
                <div className="update-track" data-update-track={track.track} key={track.track}>
                  <div className="update-track-info">
                    <strong>{track.label}</strong>
                    <span>{track.version || '未发布'}</span>
                    <Tag className="update-track-status">{trackStatus(track)}</Tag>
                  </div>
                  {track.available && track.installable && track.version ? (
                    <div className="update-track-actions">
                      <code className="update-track-command">{`buildr update --track ${track.track}`}</code>
                      <Button
                        size="small"
                        id={`update-prepare-${track.track}`}
                        data-update-prepare={track.track}
                        loading={busy && job?.track === track.track && job.status === 'preparing'}
                        disabled={busy || Boolean(active && job?.version !== track.version)}
                        onClick={() => void runAction(() => prepare(track.track, track.version!))}
                      >下载更新包</Button>
                      <Button size="small" onClick={() => void copy(track)}>复制命令</Button>
                      <Button size="small" onClick={() => handToAgent(track)}>交给 Agent</Button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
          {job && job.status !== 'idle' ? (
            <div className="update-job" data-update-status={job.status}>
              {job.status === 'preparing' ? (
                <><Spin size="small" /> 正在{devMode ? '模拟下载' : '后台下载'} {job.version} 更新包，页面可以继续使用。</>
              ) : null}
              {job.status === 'ready' ? (
                <div id="update-ready" className="update-job-ready">
                  <span>版本 <strong>{job.version}</strong> 已下载完成。</span>
                  <Button
                    type="primary"
                    id="update-apply"
                    loading={busy}
                    onClick={() => void runAction(() => apply(job.version!))}
                  >{devMode ? '模拟安装并重启' : '安装并重启'}</Button>
                </div>
              ) : null}
              {job.status === 'applying' ? (
                <><Spin size="small" /> 正在{devMode ? '模拟安装' : '安装'} {job.version} 并重启 Buildr Web，页面将短暂中断后自动恢复。</>
              ) : null}
              {job.status === 'failed' ? (
                <div id="update-failed" className="update-job-failed">
                  <Typography.Text type="danger">{typeof job.error?.message === 'string' ? job.error.message : '更新失败。'}</Typography.Text>
                  {job.version && job.track ? (
                    <Button
                      size="small"
                      id="update-retry"
                      loading={busy}
                      onClick={() => void runAction(() => prepare(job.track!, job.version!))}
                    >重新下载</Button>
                  ) : null}
                </div>
              ) : null}
              {job.status === 'completed' ? <Typography.Text type="success">更新已完成。</Typography.Text> : null}
            </div>
          ) : null}
          {actionError ? <Typography.Text id="update-action-error" type="danger">{actionError}</Typography.Text> : null}
          <div className="update-footer">
            <Button size="small" id="update-check-now" loading={busy} onClick={() => void runAction(async () => { check(); })}>立即检查</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
