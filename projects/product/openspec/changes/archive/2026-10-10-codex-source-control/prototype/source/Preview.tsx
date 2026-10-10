import {useEffect,useMemo,useRef,useState} from 'react';
import {App,Button,Result,Spin,Tag,Tooltip} from 'antd';
import {BranchesOutlined,FolderOpenOutlined,PlusOutlined,RobotOutlined,SearchOutlined} from '@ant-design/icons';
import {AppShellHeader,AppShellFrame} from 'buildr-web-source/src/app/AppShellView';
import {AppShellContext,type AppShellContextValue} from 'buildr-web-source/src/app/AppShellContext';
import {AppNavigationItem} from 'buildr-web-source/src/app/AppNavigationItem';
import {ObjectTabStrip} from 'buildr-web-source/src/components/ObjectTabStrip';
import {MockSourceControlWorkbench} from 'buildr-web-source/src/prototypes/source-control/MockSourceControlWorkbench';
import type {SourceControlRepository,SourceControlScene} from 'buildr-web-source/src/features/code/source-control-model';
import {usePrototypeBridge} from 'buildr-web-source/src/prototypes/prototype-bridge';
import {useMockCommit} from './useMockCommit';
import {GlobalAgentsPanel} from './GlobalAgentsPanel';
import {PrototypeContext,sampleMessage,agentNames,type Connection,type Service,type Draft,type AgentId} from './state';
import scenes from './scenes.json';
const mainKey='buildr:mock-buildr-main';
export function Preview({repository}:{repository:SourceControlRepository}){
 const {message}=App.useApp();
 const [connection,setConnection]=useState<Connection>('connected');
 const [services,storeServices]=useState<Record<AgentId,Service>>({codex:'dormant',dsh:'dormant'});const servicesRef=useRef(services);const service=services.codex;
 const [agentsOpen,setAgentsOpen]=useState(false),[noChanges,setNoChanges]=useState(false);
 const [multiAgent,setMultiAgent]=useState(false),[defaultAgent,setDefaultAgent]=useState<AgentId>('codex');
 const [drafts,setDrafts]=useState<Record<string,Draft>>({});const draftsRef=useRef(drafts);
 const [activeKey,setActiveKey]=useState(mainKey);const [scenario,setScenario]=useState('');
 const executionRepository=useMemo(()=>scenario==='upstream-missing'?{...repository,worktrees:repository.worktrees.map(tree=>tree.isMain?{...tree,upstream:null}:tree)}:repository,[scenario,repository]);
 const commitMock=useMockCommit(executionRepository,key=>{const old=draftsRef.current[key]||{text:'',generated:false};setDraft(key,{...old,text:'',generated:false,generatedBy:undefined,error:false,stale:false});});
 const shownRepository=useMemo(()=>{const trees=executionRepository.worktrees.map(tree=>{const op=commitMock.records[repository.id+':'+tree.worktreeId];if(!op?.completed)return tree;const value={repositoryId:repository.id,worktreeId:tree.worktreeId,hash:op.hash,shortHash:op.hash.slice(0,8),subject:op.message.split('\n')[0],message:op.message,authorName:'陈俊',authorEmail:'chenjun@example.com',authoredAt:'2026-10-09T20:00:00+08:00',committedAt:'2026-10-09T20:00:00+08:00',files:tree.changes,branches:tree.branch?[tree.branch]:[],tags:[]};return {...tree,status:'clean' as const,changes:[],fileCount:0,ahead:op.pushed?0:(tree.ahead||0)+1,commits:[value,...tree.commits],observedRevision:'scm:prototype-'+op.hash};});return {...executionRepository,worktrees:trees,changes:trees.find(tree=>tree.isMain)?.changes||[],fileCount:trees.reduce((sum,tree)=>sum+(tree.fileCount||0),0)};},[executionRepository,commitMock.records]);
 const [scene,setScene]=useState<SourceControlScene>('changes');const [epoch,setEpoch]=useState(0);
 const [collapsed,setCollapsed]=useState(true);
 const [exitPhase,setExitPhase]=useState<'none'|'cleaning'|'exited'>('none'),[exitBusy,setExitBusy]=useState(false);
 const jobs=useRef(new Map<string,{main:boolean;agent:AgentId}>()),timers=useRef(new Map<string,ReturnType<typeof setTimeout>>());
 const startup=useRef(new Map<AgentId,ReturnType<typeof setTimeout>>()),shutdown=useRef<ReturnType<typeof setTimeout>|null>(null);
 const current=useRef({page:'commit-message',state:''});
 function setService(next:Service,agent:AgentId='codex'){servicesRef.current={...servicesRef.current,[agent]:next};storeServices(servicesRef.current);}
 function setDraft(key:string,draft:Draft){setDrafts(prev=>{const next={...prev,[key]:draft};draftsRef.current=next;return next;});}
 function clearTimers(){for(const timer of startup.current.values())clearTimeout(timer);if(shutdown.current)clearTimeout(shutdown.current);startup.current.clear();shutdown.current=null;for(const timer of timers.current.values())clearTimeout(timer);timers.current.clear();jobs.current.clear();}
 useEffect(()=>()=>clearTimers(),[]);
 function beginJob(key:string,main:boolean,agent:AgentId){
  const old=draftsRef.current[key]||{text:'',generated:false};setDraft(key,{...old,pending:true,phase:'generating',error:false,agentId:agent});
  const existing=timers.current.get(key);if(existing)clearTimeout(existing);
  timers.current.set(key,setTimeout(()=>{setDraft(key,{text:main?sampleMessage:'docs: 补充代码工作空间使用说明\n\n- 说明未提交变更的查看方式',generated:true,agentId:agent,generatedBy:agent,expanded:true});timers.current.delete(key);jobs.current.delete(key);},1700));
 }
 function generate(key:string,main:boolean,agent:AgentId){
  if(agent==='codex'&&connection!=='connected'||exitPhase!=='none')return;
  jobs.current.set(key,{main,agent});
  const old=draftsRef.current[key]||{text:'',generated:false};
  if(servicesRef.current[agent]==='running'){beginJob(key,main,agent);return;}
  setDraft(key,{...old,pending:true,phase:'starting',error:false,agentId:agent});
  if(servicesRef.current[agent]==='starting'&&startup.current.has(agent))return;
  setService('starting',agent);
  startup.current.set(agent,setTimeout(()=>{startup.current.delete(agent);setService('running',agent);for(const [queuedKey,job] of jobs.current)if(job.agent===agent&&!timers.current.has(queuedKey))beginJob(queuedKey,job.main,job.agent);},1100));
 }
 function cancel(key:string){const timer=timers.current.get(key);if(timer)clearTimeout(timer);timers.current.delete(key);jobs.current.delete(key);const old=draftsRef.current[key]||{text:'',generated:false};setDraft(key,{...old,pending:false,phase:undefined});}
 function quit(forceBusy?:boolean){
  const busy=forceBusy??Object.values(draftsRef.current).some(draft=>draft.pending);clearTimers();commitMock.stop();
  setAgentsOpen(false);setExitBusy(busy);setExitPhase('cleaning');setService('stopping','codex');setService('stopping','dsh');
  setDrafts(prev=>{const next=Object.fromEntries(Object.entries(prev).map(([key,draft])=>[key,{...draft,pending:false,phase:undefined}]));draftsRef.current=next;return next;});
  shutdown.current=setTimeout(()=>{shutdown.current=null;setService('stopped','codex');setService('stopped','dsh');setExitPhase('exited');},1200);
 }
 function select(page:string,next:string){
  clearTimers();commitMock.reset(next);setScenario(next);setExitPhase('none');setActiveKey(mainKey);setEpoch(value=>value+1);setScene('changes');
  setAgentsOpen(page==='agents');setNoChanges(next==='no-changes');setMultiAgent(next==='multiple-agents');setDefaultAgent('codex');
  setService('dormant','dsh');
  setConnection(next==='not-registered'?'unregistered':next==='login-required'?'login-required':next==='unavailable'?'unavailable':'connected');
  setService(next==='reclaimed'?'reclaimed':next==='starting'?'starting':['success','running','generating','error','content-changed','multiple-agents'].includes(next)?'running':'dormant');
  const example:Record<string,Draft>=['success','error','content-changed','reclaimed','push-will-fail','upstream-missing','committing'].includes(next)?{[mainKey]:{text:sampleMessage,generated:true,agentId:'codex',generatedBy:'codex',expanded:true,error:next==='error',stale:next==='content-changed'}}:['starting','generating'].includes(next)&&page==='commit-message'?{[mainKey]:{text:'',generated:false,pending:true,agentId:'codex',phase:next as 'starting'|'generating'}}:{};
  draftsRef.current=example;setDrafts(example);
  if(page==='exit'){if(next==='exited'){setService('stopped','codex');setService('stopped','dsh');setExitPhase('exited');}else quit(next==='busy');}
 }
 const active=drafts[activeKey],activeCommit=commitMock.records[activeKey];
 const commitState=activeCommit?.phase==='committing'?'committing':activeCommit?.phase==='pushing'?'pushing':activeCommit?.phase==='push-failed'?'push-failed':activeCommit?.phase==='upstream-missing'?'upstream-missing':activeCommit?.completed?(activeCommit.pushed?'commit-push-success':'commit-success'):scenario==='push-will-fail'?'push-will-fail':scenario==='upstream-missing'?'upstream-missing':'';
 const state=commitState|| (multiAgent?'multiple-agents':connection==='unregistered'?'not-registered':connection==='login-required'?'login-required':connection==='unavailable'?'unavailable':noChanges?'no-changes':active?.pending?active.phase||'generating':active?.error?'error':active?.stale?'content-changed':service==='reclaimed'?'reclaimed':active?.generated?'success':service==='running'?'running':service==='starting'?'starting':'');
 const page=exitPhase!=='none'?'exit':agentsOpen?'agents':'commit-message';
 const reportedState=page==='exit'?(exitPhase==='exited'?'exited':exitBusy?'busy':''):page==='agents'?(multiAgent?'multiple-agents':connection==='unregistered'?'not-registered':connection!=='connected'?connection:service==='running'?'running':service==='reclaimed'?'reclaimed':service==='starting'?'starting':''):state;
 const bridge=usePrototypeBridge(scenes.pages,current,select);
 useEffect(()=>{bridge.report(page,reportedState);},[page,reportedState]);
 const info=()=>message.info('此原型仅模拟 Codex 接入与说明生成。');
 const shell:AppShellContextValue={workspaceId:'prototype',workspace:{name:'Buildr',rootPath:'/模拟工作空间/Buildr'},navigationRevision:0,refreshNavigation:info,setWorkspace:info,openWorkspaceSettings:info,workspaceRegistryRevision:0,openAgentAction:info,breadcrumbParts:[],setBreadcrumbParts:()=>{},taskListResetToken:0,resetTaskList:info,workspaceMenuTarget:()=>({to:'/workspace'}),forgetWorkspacePage:()=>{}};
 return <PrototypeContext.Provider value={{connection,service,services,drafts,setDraft,setActiveKey,agentsOpen,setAgentsOpen,noChanges,commits:commitMock.records,commit:commitMock.commit,retryPush:commitMock.retryPush,preferredCommitMode:scenario==='push-will-fail'||scenario==='upstream-missing'?'commit-push':'commit',multiAgent,defaultAgent,setDefaultAgent,generate,cancel}}><AppShellContext.Provider value={shell}>
  {exitPhase!=='none'?<main className="cm-exit-screen" data-prototype-position="exit-result">{exitPhase==='cleaning'?<><Spin size="large"/><h1>正在退出 Buildr…</h1><p>{exitBusy?'正在停止生成并关闭 Codex 专用服务。':'正在检查并关闭 Codex 专用服务。'}</p></>:<Result status="success" title="Buildr 已退出" subTitle="专用服务已关闭，接入记录已保留。"/>}<small>此处仅模拟退出。可在原型阅读器中返回其他页面。</small></main>:<div className="app-shell codex-message-preview area-code">
  <AppShellHeader development brandHref="/workbench" workspaceName="Buildr" workspaceMenuItems={[{key:'preview',label:'Buildr · 原型数据',onClick:info}]} area="code" codeHref="/code/source-control" workbenchHref="/workbench" workspaceDestination={{to:'/workspace'}} actions={<><Tag className="cm-prototype-tag" bordered={false}>原型数据</Tag><Button type="text" aria-label="搜索" icon={<SearchOutlined/>} onClick={info}/><Tooltip title={'智能体 · '+(connection==='unregistered'?'未接入':agentNames[defaultAgent])+' · '+(connection!=='connected'?connection==='unregistered'?'未接入':connection==='login-required'?'需要授权':'暂不可用':services[defaultAgent]==='running'?'运行中':'按需启动')}><Button id="global-agents-entry" data-prototype-position="agents-entry" aria-label="智能体" type="text" icon={<RobotOutlined/>} onClick={()=>setAgentsOpen(true)}><span className="cm-agents-label">{connection==='unregistered'?'智能体':agentNames[defaultAgent]} <span className={'cm-dot '+(connection==='connected'?'':'cm-dot-error')}/></span></Button></Tooltip><Button id="quit-buildr" type="text" onClick={()=>quit()}>退出</Button><Button type="primary" icon={<PlusOutlined/>} onClick={info}>交给 Agent</Button></>}/>
  <AppShellFrame sidebarCollapsed={collapsed} onToggleSidebar={()=>setCollapsed(value=>!value)} navigation={<nav className="shell-navigation" aria-label="代码导航"><p className="shell-nav-caption">代码</p><AppNavigationItem name="explorer" label="资源管理器" icon={<FolderOpenOutlined/>} to="/code/explorer" path="/explorer" active={false} onClick={event=>{event.preventDefault();info();}}/><AppNavigationItem name="source-control" label="源代码管理" icon={<BranchesOutlined/>} to="/code/source-control" path="/source-control" active onClick={event=>{event.preventDefault();setScene('changes');}}/></nav>}>
   <div className="workspace-pages cm-page"><div className="cm-object-tabs"><ObjectTabStrip tabs={[{key:'scm',kind:'svc',title:'源代码管理'}]} active="scm" onActivate={()=>{}} onClose={info}/></div><MockSourceControlWorkbench key={epoch} repositories={[shownRepository]} scene={scene} state={noChanges?'clean':''} onScene={setScene} onOpenTask={info}/></div>
  </AppShellFrame><GlobalAgentsPanel key={epoch}/>
 </div>}
 </AppShellContext.Provider></PrototypeContext.Provider>;
}
