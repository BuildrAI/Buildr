import { useEffect, useMemo, useState } from 'react';
import { Button } from 'antd';

import { releaseAwarenessApi, type ReleaseAwareness } from '../api/release-awareness-api';

type ReleaseTrack = ReleaseAwareness['tracks']['stable'];

type Props = {
  openAgentAction(action?: string, context?: Record<string, unknown>): void;
};

export function ReleaseAwarenessBanner({ openAgentAction }: Props) {
  const [awareness, setAwareness] = useState<Awaited<ReturnType<typeof releaseAwarenessApi.inspect>> | null>(null);
  const [copyState, setCopyState] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    void releaseAwarenessApi.inspect(controller.signal)
      .then((value) => { if (!controller.signal.aborted) setAwareness(value); })
      .catch(() => { if (!controller.signal.aborted) setAwareness(null); });
    return () => controller.abort();
  }, []);

  const updates = useMemo(() => {
    if (awareness?.freshness.status !== 'fresh') return [];
    return [awareness.tracks.stable, awareness.tracks.candidate]
      .filter((track) => track.available && track.installable && track.version && track.shouldNotify !== false);
  }, [awareness]);

  if (!updates.length) return null;

  const command = (track: ReleaseTrack) => `buildr update --track ${track.track}`;
  const copy = async (track: ReleaseTrack) => {
    const value = command(track);
    try {
      await navigator.clipboard.writeText(value);
      setCopyState(`${track.label}更新命令已复制。`);
    } catch {
      setCopyState(`请手动复制：${value}`);
    }
  };
  const handToAgent = (track: ReleaseTrack) => {
    const value = command(track);
    const prompt = `用户已选择把本机 Buildr 更新到${track.label} ${track.version}。请先读取 buildr update check --json 确认当前双轨道结果，再运行 ${value}；不要切换到其他轨道，不要降级，也不要修改 Workspace 数据或 Agent runtime。完成后说明本机 Buildr 的实际版本。`;
    openAgentAction('release-update', { prompt, track: track.track, command: value, version: track.version });
  };

  return (
    <section id="release-awareness-banner" className="release-awareness-banner" aria-label="Buildr 版本更新">
      <div className="release-awareness-copy">
        <strong>Buildr 有新版本</strong>
        <span>当前安装 {awareness?.current.version || '未知'}，请选择要更新的版本。</span>
      </div>
      <div className="release-awareness-actions">
        {updates.map((track) => (
          <div className="release-update-item" data-release-track={track.track} key={track.track}>
            <span><strong>{track.label}</strong> {track.version}</span>
            <Button size="small" onClick={() => void copy(track)}>复制命令</Button>
            <Button size="small" type="primary" onClick={() => handToAgent(track)}>交给 Agent</Button>
          </div>
        ))}
        <span id="release-copy-state" role="status">{copyState}</span>
      </div>
    </section>
  );
}
