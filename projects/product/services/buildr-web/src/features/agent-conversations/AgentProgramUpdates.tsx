import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Alert, App, Button, Tag } from 'antd';
import { RobotOutlined, SyncOutlined } from '@ant-design/icons';
import { agentConversationsApi } from './api/agent-conversations-api';
import type { ConnectionView, ProgramUpdatesView } from './types';
import {agentProgramView,programUpgradeRunning} from './agent-program-view';
import './agent-program-updates.css';

type Program = ProgramUpdatesView['programs'][number];
type Props = {
  active: boolean; checkRequest?: number; scope?: 'global' | 'settings'; connections?: ConnectionView[];
  preparationId?: string | null; onPrepare?(id: string): void; onDetails?(id: string, open: boolean): void; renderPreparation?(id: string): ReactNode;
};
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
  const upgrading = snapshot?.programs.some(programUpgradeRunning) ?? false;
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
    <div className="ac-program-updates-heading"><div><h2>{scope==='settings'?'本机程序':'智能体'}</h2>{scope==='settings'&&<p className="ac-program-updates-note">管理程序与更新，供应商接入和可选模型在“模型”中维护。</p>}</div><Button icon={<SyncOutlined />} loading={busy === '*'} disabled={busy !== null} onClick={() => void check()}>检查更新</Button></div>
    {error && <Alert type="warning" showIcon message={error} />}
    {!snapshot && !error && <p role="status">正在读取程序信息…</p>}
    {snapshot?.programs.map(program => {
      const job=program.upgrade,{pending,completed,version,canUpdate,failure,prepared,updateLabel}=agentProgramView(program,connections?.find(connection=>connection.id===program.connectionId));
      return <article className="ac-program-update" key={program.connectionId} data-program={program.connectionId} data-update-status={program.status} data-upgrade-state={job?.state}>
        <div className="ac-program-update-row"><div className="ac-program-update-summary"><span className="ac-program-update-icon" aria-hidden="true"><RobotOutlined/></span><div className="ac-program-update-identity"><div className="ac-program-update-title"><strong>{program.label}</strong><span className="ac-program-update-version">{version??(program.executable?'版本待检查':'')}</span><Tag color={prepared?'success':'default'}>{prepared?'已就绪':'未接入'}</Tag></div><div className="ac-program-update-state" data-warning={failure||['unknown','stale'].includes(program.status)} role="status">{busy==='*'||busy===program.connectionId?'正在检查更新…':updateLabel}{program.status==='available'&&program.versionKind!=='package'&&version&&!completed&&<span> · {program.latestVersion}</span>}</div></div></div>
          <div className="ac-program-update-actions">{pending?<Button size="small" loading disabled>更新中</Button>:canUpdate?<Button size="small" type="primary" loading={busy===program.connectionId} disabled={busy!==null} aria-label={`更新 ${program.label}`} onClick={()=>update(program)}>{failure?'重试更新':program.status==='latest'&&!program.managed?'改用独立程序':'更新'}</Button>:!prepared&&onPrepare?<Button size="small" type="primary" disabled={busy!==null} onClick={()=>onPrepare(program.connectionId)}>接入</Button>:null}<Button type="text" size="small" icon={<SyncOutlined/>} disabled={!program.executable||pending||busy!==null} aria-label={`检查 ${program.label} 更新`} onClick={()=>void check(program.connectionId)}/></div>
        </div>
        <details className="ac-program-update-details" open={onDetails?preparationId===program.connectionId:undefined}><summary onClick={onDetails?event=>{event.preventDefault();onDetails(program.connectionId,preparationId!==program.connectionId);}:undefined}>程序详情</summary>
          <div className="ac-program-update-detail-body">
          {job&&(pending||failure)&&<p role="status">{job.message}</p>}{program.diagnostic&&<Alert type="warning" showIcon message={program.diagnostic}/>}
          <dl className="ac-program-update-facts">
            {program.executable&&<><dt>程序位置</dt><dd><code className="ac-program-update-path">{program.executable}</code></dd></>}
            {program.versionKind==='package'&&<><dt>配套包</dt><dd>{program.packageName}{program.currentReleaseVersion&&<> · {program.currentReleaseVersion}</>}{program.latestVersion&&program.latestVersion!==program.currentReleaseVersion&&<> → {program.latestVersion}</>}</dd></>}
            {program.checkedAt&&<><dt>检查时间</dt><dd>{new Date(program.checkedAt).toLocaleString()}</dd></>}
          </dl>
          {program.compatible===false&&<Alert type="warning" showIcon message="当前程序不在已声明的兼容范围内。"/>}
          {program.releaseSource&&<div className="ac-program-update-links"><a href={program.releaseSource} target="_blank" rel="noopener noreferrer">查看版本来源</a></div>}
          {renderPreparation?.(program.connectionId)}
          </div>
        </details>
      </article>;
    })}
  </section>;
}
