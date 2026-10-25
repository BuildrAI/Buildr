import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Input, Select, Spin } from 'antd';
import { useAgentConversations } from './AgentConversationsContext';
import type { ConnectionView, PreparationView } from './types';

const active = (attempt?: PreparationView) => Boolean(attempt && ['discovering','installing','connecting','waiting-login'].includes(attempt.state));
export function AgentProgramPreparation({connection,onPending,autoStart=false}:{connection:ConnectionView;onPending:(id:string,pending:boolean)=>void;autoStart?:boolean}) {
  const context = useAgentConversations();
  const [attempt,setAttempt] = useState<PreparationView>();
  const [path,setPath] = useState(''), [busy,setBusy] = useState(false), [error,setError] = useState('');
  const epoch = useRef(0), mounted = useRef(true);
  const pending = active(attempt), catalog = attempt?.catalog;
  const accept = (value:PreparationView) => {setAttempt(value);context.updateConnection(value.connection);};
  useEffect(() => {mounted.current=true; return () => {mounted.current=false;epoch.current++;};},[]);
  useEffect(() => {onPending(connection.id,pending);return () => onPending(connection.id,false);},[pending,connection.id,onPending]);
  useEffect(() => {
    if(!context.settings)return;
    const controller=new AbortController(),observedEpoch=epoch.current;
    void context.api.currentPreparation(connection.id,controller.signal).then(value=>{
      if(!controller.signal.aborted&&epoch.current===observedEpoch&&value.attempt){setAttempt(value.attempt);context.updateConnection(value.attempt.connection);}
    }).catch(failure=>{if(!controller.signal.aborted)setError(failure instanceof Error?failure.message:'读取准备状态失败。');});
    return()=>controller.abort();
  },[context.settings,connection.id,context.api,context.updateConnection]);
  useEffect(() => {
    if (!context.settings || !attempt || !active(attempt)) return;
    const controller = new AbortController(), observedEpoch=epoch.current; let reading=false;
    const timer=setInterval(() => {
      if(reading)return;reading=true;
      void context.api.preparation(connection.id,attempt.id,controller.signal).then(value => {
        if(!controller.signal.aborted&&observedEpoch===epoch.current){setAttempt(value);context.updateConnection(value.connection);}
      }).catch(failure => {if(!controller.signal.aborted){setError(failure instanceof Error?failure.message:'读取准备状态失败。');clearInterval(timer);}}).finally(()=>{reading=false;});
    },1200);
    return()=>{clearInterval(timer);controller.abort();};
  },[context.settings,attempt?.id,attempt?.state,connection.id,context.api,context.updateConnection]);
  const prepare=async(install=false)=>{
    if(busy)return;const requestEpoch=++epoch.current;setBusy(true);setError('');
    try{
      const value=await context.api.prepareConnection(connection,install?{install:true}:path?{executable:path}:{});
      if(mounted.current&&epoch.current===requestEpoch)accept(value);
    }catch(failure){if(mounted.current&&epoch.current===requestEpoch)setError(failure instanceof Error?failure.message:'准备未完成。');}
    finally{if(mounted.current)setBusy(false);}
  };
  const autoStarted=useRef(false);
  useEffect(()=>{if(autoStart&&!autoStarted.current){autoStarted.current=true;void prepare();}},[autoStart]);
  const cancel=async()=>{
    if(!attempt||busy)return;++epoch.current;setBusy(true);setError('');
    try{const value=await context.api.cancelPreparation(connection.id,attempt.id);if(mounted.current)accept(value);}
    catch(failure){if(mounted.current)setError(failure instanceof Error?failure.message:'取消未完成。');}
    finally{if(mounted.current)setBusy(false);}
  };
  return <div className="ac-program-preparation" data-testid="agent-program-preparation">
    <div className="ac-prepare-steps" aria-label="接入准备流程"><span>检查程序</span><span>准备连接</span><span>官方登录</span><span>验证可用</span></div>
    {error&&<Alert type="warning" showIcon message={error}/>}
    {attempt&&<div className="ac-preparation-status" role="status" data-state={attempt.state}>{pending&&<Spin size="small"/>}<span>{attempt.message}</span></div>}
    {catalog&&catalog.candidates.length>0&&<div className="ac-program-choices"><label htmlFor={`agent-program-selection-${connection.id}`}>程序来源</label><Select id={`agent-program-selection-${connection.id}`} aria-label="选择接入程序" value={path||undefined} placeholder={connection.executable||'选择发现的兼容程序'} disabled={pending||busy||Boolean(connection.executable)} onChange={setPath} options={catalog.candidates.map(item=>({value:item.executable,label:`${item.label}${item.version?' · '+item.version:''}${item.compatible?'':'（不可用）'}`,disabled:!item.compatible}))}/>{catalog.candidates.map(item=><div className="ac-program-detail" key={item.executable}><strong>{item.label}{item.version?' · '+item.version:''}</strong><code>{item.executable}</code>{item.diagnostic&&<p>{item.diagnostic}</p>}</div>)}</div>}
    {attempt?.state==='installation-required'&&catalog&&<div className="ac-install-guidance"><p>{connection.provider==='codex'?'可先安装官方 ChatGPT App，再回来检查其中的 Codex。也可以仅准备独立 Codex 程序。':connection.provider==='qoder'?'Buildr 会准备匹配的 Qoder 执行程序，无需手动安装开发工具包（SDK）或桌面应用。':'可以准备独立 DSH 程序，无需先安装桌面应用。'}</p><div className="ac-account-actions"><Button href={catalog.installation.url} target="_blank" rel="noopener noreferrer">{connection.provider==='codex'?'下载官方 ChatGPT App':'查看官方安装说明'}</Button>{catalog.installation.canInstall&&<Button disabled={busy} onClick={()=>void prepare(true)}>准备独立程序 · {catalog.installation.version}</Button>}</div>{catalog.installation.diagnostic&&<p>{catalog.installation.diagnostic}</p>}</div>}
    <div className="ac-account-actions"><Button type="primary" aria-label="准备并连接" loading={busy||pending} disabled={pending||(attempt?.state==='selection-required'&&!path)} onClick={()=>void prepare()}>{attempt?.state==='selection-required'?'使用所选程序并连接':attempt?.state==='installation-required'?'安装后重新检查':'准备并连接'}</Button>{pending&&<Button disabled={busy} onClick={()=>void cancel()}>取消准备</Button>}</div>
    {!connection.executable&&<details className="ac-account-details"><summary>指定已安装程序</summary><label htmlFor={`agent-program-path-${connection.id}`}>程序的准确绝对路径</label><Input id={`agent-program-path-${connection.id}`} aria-label="指定接入程序路径" value={path} disabled={pending||busy} onChange={event=>setPath(event.target.value)} placeholder="可留空，自动检查本机程序"/></details>}
  </div>;
}
