import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Alert, App, Button, Space, Tag } from 'antd';
import { SyncOutlined } from '@ant-design/icons';
import { agentConversationsApi } from './api/agent-conversations-api';
import type { ConnectionView, ProgramUpdatesView } from './types';
import './agent-program-updates.css';

type Program = ProgramUpdatesView['programs'][number];
type Props = {
  active: boolean; checkRequest?: number; scope?: 'global' | 'settings'; connections?: ConnectionView[];
  preparationId?: string | null; onPrepare?(id: string): void; onDetails?(id: string, open: boolean): void; renderPreparation?(id: string): ReactNode;
};
const labels = { unchecked: '尚未检查', 'not-connected': '未接入', available: '有新版本', latest: '已是最新', ahead: '无需更新', unknown: '检查失败', stale: '请重新检查' };
const running = (program: Program) => Boolean(program.upgrade && ['downloading','waiting','restarting'].includes(program.upgrade.state));
/** Shared current facts and explicit upgrade actions; preparation stays with its owner. */
export function AgentProgramUpdates({ active, checkRequest = 0, scope = 'settings', connections, preparationId, onPrepare, onDetails, renderPreparation }: Props) {
  const {modal} = App.useApp();
  const [snapshot, setSnapshot] = useState<ProgramUpdatesView>();
  const [busy, setBusy] = useState<string | null>(null), [error, setError] = useState('');
  const generation = useRef(0), gate = useRef(false), mounted = useRef(true);
  const check = useCallback(async (connectionId?: string) => {
    if (gate.current) return;
    gate.current = true; const observed = ++generation.current;
    setBusy(connectionId ?? '*'); setError('');
    try { const result = await agentConversationsApi.checkProgramUpdates(connectionId); if (mounted.current && observed === generation.current) setSnapshot(result); }
    catch (failure) { if (mounted.current && observed === generation.current) setError(failure instanceof Error ? failure.message : '检查未完成，请重试。'); }
    finally { gate.current = false; if (mounted.current) setBusy(null); }
  }, []);
  const upgrading = snapshot?.programs.some(running) ?? false;
  const revisions = connections?.map(item=>item.id+':'+item.revision).join(',');
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    const read = async () => {
      if (gate.current) return;
      const observed = ++generation.current;
      try { const result = await agentConversationsApi.programUpdates(controller.signal); if (!controller.signal.aborted && observed === generation.current) setSnapshot(result); }
      catch (failure) { if (!controller.signal.aborted && observed === generation.current) setError(failure instanceof Error ? failure.message : '读取更新状态失败。'); }
    };
    void read(); const timer = setInterval(() => { if (document.visibilityState === 'visible') void read(); }, upgrading ? 1000 : 5000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [active, upgrading, revisions]);
  useEffect(() => { if (active && checkRequest > 0) void check(); }, [active, checkRequest, check]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const install = async (program: Program) => {
    if (gate.current || !program.latestVersion) return;
    gate.current = true; const observed = ++generation.current; setBusy(program.connectionId);setError('');
    try {
      const job = await agentConversationsApi.upgradeProgram(program.connectionId,{expectedRevision:program.revision,expectedVersion:program.latestVersion});
      if (mounted.current && observed === generation.current) setSnapshot(previous=>previous&&({...previous,programs:previous.programs.map(item=>item.connectionId===program.connectionId?{...item,upgrade:job}:item)}));
    } catch(failure) { if(mounted.current)setError(failure instanceof Error?failure.message:'更新未开始，请重新检查。'); }
    finally { gate.current=false;if(mounted.current)setBusy(null); }
  };
  const update = (program: Program) => {
    if (!program.managed) modal.confirm({title:`更新 ${program.label}`,content:'将安装 Buildr 独立程序，并在当前工作结束后切换和重启。原桌面应用不变，已有配置和对话记录保留。',okText:'更新并切换',cancelText:'取消',onOk:()=>install(program)});
    else void install(program);
  };
  return <section className="ac-program-updates" id={`agent-program-updates-${scope}`} aria-label="智能体程序更新">
    <div className="ac-program-updates-heading"><h2>智能体</h2><Button size="small" icon={<SyncOutlined />} loading={busy === '*'} disabled={busy !== null} onClick={() => void check()}>检查更新</Button></div>
    {error && <Alert type="warning" showIcon message={error} />}
    {!snapshot && !error && <p role="status">正在读取程序信息…</p>}
    {snapshot?.programs.map(program => {
      const job=program.upgrade,pending=running(program),completed=job?.state==='completed'&&job.installedExecutable===program.executable&&(!program.latestVersion||program.latestVersion===job.expectedVersion);
      const version=program.currentVersion??(completed?job.currentVersion:undefined);
      const canUpdate=Boolean(program.latestVersion&&program.executable&&(program.status==='available'||program.status==='latest'&&!program.managed));
      const failure=job&&['failed','interrupted'].includes(job.state);
      const status=pending?job!.state==='waiting'?'等待工作结束':job!.state==='restarting'?'正在重启':'正在下载':completed?'更新完成':failure?'更新未完成':labels[program.status];
      return <article className="ac-program-update" key={program.connectionId} data-program={program.connectionId} data-update-status={program.status} data-upgrade-state={job?.state}>
        <div className="ac-program-update-row"><div className="ac-program-update-summary"><Space wrap><strong>{program.label}</strong><span className="ac-program-update-version">{version??(program.executable?'版本待检查':'')}{program.status==='available'&&version&&!completed&&<> → {program.versionKind==='package'?'新版':program.latestVersion}</>}</span><Tag color={pending||program.status==='available'?'processing':completed||program.status==='latest'?'success':failure||['unknown','stale'].includes(program.status)?'warning':'default'}>{busy==='*'||busy===program.connectionId?'正在处理…':status}</Tag></Space></div>
          {pending?<Button size="small" loading disabled>更新中</Button>:canUpdate?<Button size="small" type="primary" loading={busy===program.connectionId} disabled={busy!==null} aria-label={`更新 ${program.label}`} onClick={()=>update(program)}>{failure?'重试更新':program.status==='latest'&&!program.managed?'改用独立程序':'更新'}</Button>:!program.executable&&onPrepare?<Button size="small" type="primary" onClick={()=>onPrepare(program.connectionId)}>接入</Button>:null}
        </div>
        <details className="ac-program-update-details" open={onDetails?preparationId===program.connectionId:undefined}><summary onClick={onDetails?event=>{event.preventDefault();onDetails(program.connectionId,preparationId!==program.connectionId);}:undefined}>详情</summary>
          {job&&<p role="status">{job.message}</p>}{program.diagnostic&&<p>{program.diagnostic}</p>}
          {program.executable&&<div className="ac-program-update-path">{program.executable}</div>}
          {program.versionKind==='package'&&<p>配套包 {program.packageName}：{program.currentReleaseVersion??'当前未知'} → {program.latestVersion??'最新未知'}；程序版本 {version??'未知'}。</p>}
          {program.compatible===false&&<p>当前程序不在已声明的兼容范围内。</p>}
          {program.checkedAt&&<small>检查于 {new Date(program.checkedAt).toLocaleString()}</small>}
          <div className="ac-program-update-links"><Button size="small" disabled={!program.executable||pending||busy!==null} aria-label={`检查 ${program.label} 更新`} onClick={()=>void check(program.connectionId)}>重新检查</Button>{program.releaseSource&&<a href={program.releaseSource} target="_blank" rel="noopener noreferrer">版本来源</a>}</div>
          {renderPreparation?.(program.connectionId)}
        </details>
      </article>;
    })}
  </section>;
}
