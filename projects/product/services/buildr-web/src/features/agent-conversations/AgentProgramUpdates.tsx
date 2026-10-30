import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Space, Tag } from 'antd';
import { SyncOutlined } from '@ant-design/icons';
import { agentConversationsApi } from './api/agent-conversations-api';
import type { ProgramUpdatesView } from './types';
import './agent-program-updates.css';

type Props = { active: boolean; checkRequest?: number; scope?: 'global' | 'settings' };
const labels = { unchecked: '尚未检查', 'not-connected': '未接入程序', available: '有新版本', latest: '已是官方发布版本', ahead: '高于官方发布版本', unknown: '暂时无法确认', stale: '绑定已变化' };
/** Shared by global software updates and the independent Agent settings surface. */
export function AgentProgramUpdates({ active, checkRequest = 0, scope = 'settings' }: Props) {
  const [snapshot, setSnapshot] = useState<ProgramUpdatesView>();
  const [busy, setBusy] = useState<string | null>(null), [error, setError] = useState('');
  const generation = useRef(0), gate = useRef(false), mounted = useRef(true);
  const check = useCallback(async (connectionId?: string) => {
    if (gate.current) return;
    gate.current = true; const observed = ++generation.current;
    setBusy(connectionId ?? '*'); setError('');
    try {
      const result = await agentConversationsApi.checkProgramUpdates(connectionId);
      if (observed === generation.current) setSnapshot(result);
    } catch (failure) {
      if (observed === generation.current) setError(failure instanceof Error ? failure.message : '检查未完成，请重试。');
    } finally { gate.current = false; if (mounted.current) setBusy(null); }
  }, []);
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    const read = async () => {
      if (gate.current) return;
      const observed = ++generation.current;
      try {
        const result = await agentConversationsApi.programUpdates(controller.signal);
        if (!controller.signal.aborted && observed === generation.current) setSnapshot(result);
      } catch (failure) {
        if (!controller.signal.aborted && observed === generation.current) setError(failure instanceof Error ? failure.message : '读取检查结果失败。');
      }
    };
    void read();
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void read(); }, 5000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [active]);
  useEffect(() => { if (active && checkRequest > 0) void check(); }, [active, checkRequest, check]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current++; }; }, []);
  return <section className="ac-program-updates" id={`agent-program-updates-${scope}`} aria-label="智能体程序更新">
    <div className="ac-program-updates-heading"><h2>智能体程序</h2><Button size="small" icon={<SyncOutlined />} loading={busy === '*'} disabled={busy !== null} onClick={() => void check()}>检查更新</Button></div>
    <p className="ac-program-updates-note">仅检查版本，不安装、不重启，也不会中断当前对话。</p>
    {error && <Alert type="warning" showIcon message={error} description="下方如有结果，为此前观察；本次检查未确认最新状态。" />}
    {!snapshot && !error && <p role="status">正在读取程序信息…</p>}
    {snapshot?.programs.map(program => <article className="ac-program-update" key={program.connectionId} data-program={program.connectionId} data-update-status={program.status}>
      <div className="ac-program-updates-heading"><Space wrap><strong>{program.label}</strong><Tag color={program.status === 'available' ? 'processing' : program.status === 'latest' ? 'success' : ['unknown', 'stale'].includes(program.status) ? 'warning' : 'default'}>{busy === '*' || busy === program.connectionId ? '正在检查…' : labels[program.status]}</Tag></Space><Button size="small" disabled={!program.executable || busy !== null} loading={busy === program.connectionId} onClick={() => void check(program.connectionId)} aria-label={`检查 ${program.label} 更新`}>重新检查</Button></div>
      {program.executable && <div className="ac-program-update-path">{program.executable}</div>}
      {program.currentVersion && <p>当前程序：{program.currentVersion}{program.provider === 'codex' ? ' · 命令行程序（CLI）与应用服务端（App Server）共用' : ''}</p>}
      {(program.currentReleaseVersion || program.latestVersion) && <p>{program.versionKind === 'package' ? '配套软件包' : '程序发布版'}：{program.currentReleaseVersion ?? '当前未知'} → {program.latestVersion ?? '最新未知'}</p>}
      {program.versionKind === 'package' && <p className="ac-program-updates-note">比较 {program.packageName}，不与程序版本混比。</p>}
      {program.compatible === false && <p>当前程序不在 Buildr 已声明的兼容范围内。</p>}
      {program.diagnostic && <p role="status">{program.diagnostic}</p>}
      {program.checkedAt && <small>检查于 {new Date(program.checkedAt).toLocaleString()}</small>}
      {program.executable && program.updateUrl && <div className="ac-program-update-links"><a href={program.updateUrl} target="_blank" rel="noopener noreferrer">查看官方更新方式</a>{program.releaseSource && <a href={program.releaseSource} target="_blank" rel="noopener noreferrer">官方版本来源</a>}</div>}
    </article>)}
    <p className="ac-program-updates-note">官方默认发布版本不等于 Buildr 已验证可安装版本。应用内程序请通过原应用更新；检查不会替换程序来源。</p>
  </section>;
}
