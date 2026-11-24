import {canonicalScopeKey,scopeDisplayName} from './workspace-scopes';
import {FrameSubmissions} from './frame-submissions';
import {useHarnessDirectoryFiles} from './directory-files';
import {engineeringFile} from './engineering-files';
import {conversationFileLink} from './lib/localFileLink';
import {ConversationHostProvider, useConversationHost, type HarnessThreePaneHost} from './integration/ConversationHost';
import {HarnessShell, WorkspacePanelIcon, type HarnessWorkEnvironment} from './shell/HarnessShell';
import {
  HARNESS_RAIL_WIDTH,
  THREE_PANE_DEFAULT_CONVERSATION_RATIO,
  THREE_PANE_HISTORY_DEFAULT_WIDTH,
  resizeThreePaneConversationRatio,
  resizeThreePaneHistory,
  resolveHarnessThreePaneLayout,
} from './shell/harness-layout';
import {readOptionalPreference, writeOptionalPreference} from './lib/optional-preferences';
import {lazy,Suspense,useCallback,useEffect,useLayoutEffect,useMemo,useState,useRef} from 'react';
import {Alert,Button,Input,Modal,Spin} from 'antd';
import {FolderOpenOutlined} from '@ant-design/icons';
import {AgentConversationsProvider,AgentConnectionSettings,ConversationWorkspace,HarnessDirectoryFilesProvider,LocalFilePreviewModal,useAgentConversations,type HarnessDirectoryFiles,type HarnessFileContent} from './index';
import {api} from './api/index';
import type {ConversationWorkspace as ScopeView} from './features/agent-conversations/ConversationHistory';
import {conversationDraftKey} from './features/agent-conversations/useConversationDraft';
import {canSplitFocusHistory,readDraft} from './features/agent-conversations/conversation-state';
import {directoryClient,observeWorkspaceDirectory} from './features/directory-workbench/api';
import type {ConversationFilePreview} from './directory-files';
import {desktopNotify} from './dsh-desktop';
import type {ConversationView} from './features/agent-conversations/types';

const DirectoryWorkbench=lazy(async()=>({default:(await import('./features/directory-workbench/HarnessDirectoryWorkbench')).HarnessDirectoryWorkbench}));

type Ref={sourceId:string;id:string};
type Directory={ref:Ref;rootPath:string;revision:string;name?:string};
type Catalog={scopes:Array<{key:string;ref:Ref;authority:'builtin'|'registered'|'offline';name?:string;rootPath?:string}>};
const directoryLeafName=(value:string)=>value.replace(/[\\/]+$/,'').split(/[\\/]/).filter(Boolean).at(-1)||value;
const request=<T,>(path:string,input?:unknown,signal?:AbortSignal)=>api(path,input===undefined?{headers:{'x-buildr-session':''},signal}:{method:'POST',body:JSON.stringify(input),signal}) as Promise<T>;
const harnessProfile=()=>typeof document==='undefined'?'local':document.querySelector('meta[name="buildr-web-profile"]')?.getAttribute('content')||'local';
const readSavedNumber=(key:string):number|undefined=>{
  const raw=readOptionalPreference(key);
  if(raw===null||!raw.trim())return undefined;
  const value=Number(raw);
  return Number.isFinite(value)?value:undefined;
};

export function HarnessApp({environment,desktop=false}:{environment?:HarnessWorkEnvironment;desktop?:boolean}={}){
  const [file,setFile]=useState<ConversationFilePreview|null>(null);
  const standalone=(typeof window==='undefined'||window.parent===window)&&!environment;
  const composition=useMemo(()=>({standalone}),[standalone]);
  const host=useMemo<HarnessDirectoryFiles>(()=>({
    readFile:(conversation:ConversationView,path:string,signal:AbortSignal)=>window.parent!==window?engineeringFile('read',conversation.workspaceId,conversation.id,path,signal):api('/api/v1/harness/files',{method:'POST',body:JSON.stringify({conversationId:conversation.id,path}),signal}) as Promise<HarnessFileContent>,
    async openFile(conversation,reference,literal,signal){
      if(window.parent!==window){await engineeringFile('open',conversation.workspaceId,conversation.id,reference,signal);return;}
      const {path,fragment,line}=conversationFileLink(reference,literal);
      const value=await request<HarnessFileContent>('/api/v1/harness/files',{conversationId:conversation.id,path},signal);
      signal?.throwIfAborted();setFile({path:value.path||path,value,fragment,line});return false;
    },
  }),[]);
  return <ConversationHostProvider host={composition}><HarnessDirectoryFilesProvider host={host}><AgentConversationsProvider standalone={standalone}><Workspace standalone={standalone} environment={environment} desktop={desktop}/></AgentConversationsProvider><LocalFilePreviewModal file={file} onClose={()=>setFile(null)}/></HarnessDirectoryFilesProvider></ConversationHostProvider>;
}
function Workspace({standalone,environment,desktop}:{standalone:boolean;environment?:HarnessWorkEnvironment;desktop:boolean}){
  const embedded=window.parent!==window;
  const context=useAgentConversations();
  const files=useHarnessDirectoryFiles();
  const submissions=useRef(new FrameSubmissions<unknown>());
  const [scopes,setScopes]=useState<ScopeView[]>([]),[selected,setSelected]=useState<string>(),[error,setError]=useState(''),[choosing,setChoosing]=useState(false),[path,setPath]=useState(''),[busy,setBusy]=useState(false),[name,setName]=useState('');
  const refresh=useCallback(async()=>{
    const [catalog,listed]=await Promise.all([request<Catalog>('/api/v1/harness/scopes'),request<{directories:Directory[]}>('/api/v1/harness/directories')]);
    setScopes(catalog.scopes.map(scope=>{const directory=listed.directories.find(value=>canonicalScopeKey(value.ref)===scope.key);return {id:scope.key,name:scopeDisplayName({...scope,name:directory?.name??scope.name},directory?.rootPath),rootPath:directory?.rootPath??scope.rootPath??''};}));
    const selectable=new Set([...listed.directories.map(value=>canonicalScopeKey(value.ref)),...catalog.scopes.filter(scope=>scope.key!=='@default'&&scope.authority!=='offline'&&Boolean(scope.rootPath)).map(scope=>scope.key)]);
    setSelected(previous=>previous&&selectable.has(previous)?previous:listed.directories[0]?canonicalScopeKey(listed.directories[0].ref):catalog.scopes.find(scope=>scope.key!=='@default'&&scope.authority!=='offline'&&Boolean(scope.rootPath))?.key);
  },[]);
  useEffect(()=>{if(!embedded)void refresh().catch(failure=>setError(failure instanceof Error?failure.message:'工作范围读取失败。'));if(!standalone){context.setOpen(true);if(!embedded)context.setFull(true);}},[embedded,standalone,refresh]);
  const initialConfigured=useRef(false);
  useEffect(()=>{
    if(!embedded)return;
    const listener=(event:MessageEvent)=>{
      if(event.source!==window.parent||event.origin!==location.origin)return;
      const message=event.data;
      if(!message||message.protocol!=='buildr.harness-frame/v1')return;
      if(message.action==='configure'&&Array.isArray(message.workspaces)){setScopes(message.workspaces.filter((value:ScopeView)=>typeof value?.id==='string'&&typeof value.name==='string'&&typeof value.rootPath==='string'));const nextFull=message.full===true;context.setFull(nextFull);if(!initialConfigured.current){initialConfigured.current=true;context.setView(nextFull&&message.view==='history'?'history':'conversation');}if(typeof message.defaultWorkspaceId==='string')setSelected(message.defaultWorkspaceId);}
      if(message.action==='new')context.newConversation(typeof message.workspaceId==='string'?{scope:{workspaceId:message.workspaceId,...(typeof message.taskId==='string'?{taskId:message.taskId}:{})}}:{});
      if(message.action==='open'&&typeof message.workspaceId==='string'&&typeof message.conversationId==='string')void context.openConversation(message.workspaceId,message.conversationId);
      if(message.action==='history')context.openHistory(null);
      if(message.action==='settings')context.setSettings(true);
      if(message.action==='start-text'&&typeof message.requestId==='string'&&message.input&&typeof message.input.workspaceId==='string'&&typeof message.input.cwd==='string'&&typeof message.input.text==='string'){
        const reply=(result:unknown)=>window.parent.postMessage({protocol:'buildr.harness-frame/v1',event:'result',requestId:message.requestId,result},location.origin);
        if(context.startTextConversation)void submissions.current.once(message.requestId,message.input,()=>context.startTextConversation!(message.input)).then(reply).catch(()=>reply({status:'recovering',reason:'submission-unknown',message:'原提交结果未确认，请核对原对话。'}));
        else reply({status:'unavailable',message:'Harness 尚未准备工程操作入口。'});
      }
    };
    window.addEventListener('message',listener);
    window.parent.postMessage({protocol:'buildr.harness-frame/v1',event:'ready'},location.origin);
    return()=>window.removeEventListener('message',listener);
  },[embedded,context.newConversation,context.openConversation,context.openHistory,context.setSettings,context.startTextConversation]);
  useEffect(()=>{
    if(embedded)window.parent.postMessage({protocol:'buildr.harness-frame/v1',event:'selection',workspaceId:context.conversation?.workspaceId??null,conversationId:context.conversation?.id??null},location.origin);
  },[embedded,context.conversation?.workspaceId,context.conversation?.id]);
  useEffect(()=>{if(embedded&&initialConfigured.current)window.parent.postMessage({protocol:'buildr.harness-frame/v1',event:'view',view:context.view},location.origin);},[embedded,context.view]);
  const chooseDirectory=async()=>{
    if(busy)return;setBusy(true);setError('');
    try{const result=await request<{path:string|null}>('/api/v1/harness/directories/choose',{});if(result.path)setPath(result.path);}
    catch(failure){setError(failure instanceof Error?failure.message:'无法打开本机目录选择器，请重试。');}
    finally{setBusy(false);}
  };
  const create=async()=>{
    if(!path.trim()||busy)return;setBusy(true);setError('');
    try{const directory=await request<Directory>('/api/v1/harness/directories',{path,name:name.trim()});await refresh();const scope=canonicalScopeKey(directory.ref);setSelected(scope);context.newConversation({scope:{workspaceId:scope}});if(!standalone)context.setFull(true);setChoosing(false);setPath('');setName('');}
    catch(failure){setError(failure instanceof Error?failure.message:'目录未登记，输入已保留。');}finally{setBusy(false);}
  };
  const composition=useConversationHost();
  const profile=useMemo(harnessProfile,[]);
  const workspaceRatioKey='buildr.harness-shell.workspace-ratio:'+profile;
  const threePaneHistoryKey='buildr.harness-three-pane.history-width:'+profile;
  const [shellWidth,setShellWidth]=useState<number>(()=>(typeof window!=='undefined'?window.innerWidth:1280));
  const [viewportWidth,setViewportWidth]=useState<number>(()=>(typeof window!=='undefined'?window.innerWidth:1280));
  const [preferredRatio,setPreferredRatio]=useState<number>(()=>{
    const saved=readSavedNumber(workspaceRatioKey);
    return saved!==undefined&&saved>0&&saved<1?saved:THREE_PANE_DEFAULT_CONVERSATION_RATIO;
  });
  const [preferredThreePaneHistory,setPreferredThreePaneHistory]=useState<number>(()=>{
    const saved=readSavedNumber(threePaneHistoryKey);
    return saved!==undefined&&saved>0?saved:THREE_PANE_HISTORY_DEFAULT_WIDTH;
  });
  useEffect(()=>{
    if(!standalone||typeof window==='undefined')return;
    const onResize=()=>setViewportWidth(window.innerWidth);
    window.addEventListener('resize',onResize);
    return()=>window.removeEventListener('resize',onResize);
  },[standalone]);
  const draftWorkspace=()=>{try{return readDraft(conversationDraftKey(null,null),sessionStorage).workspaceId;}catch{return undefined;}};
  const workbenchWorkspaceId=context.scope?.workspaceId??context.draftScope?.workspaceId??draftWorkspace()??selected;
  const [environmentOpen,setEnvironmentOpen]=useState(false);
  const [reveal,setReveal]=useState<{workspaceId:string;revision:string;path:string;line?:number}>();
  const workspaceRef=useRef(workbenchWorkspaceId);workspaceRef.current=workbenchWorkspaceId;
  const scopesRef=useRef(scopes);scopesRef.current=scopes;
  const currentWorkspaceName=scopes.find(scope=>scope.id===workbenchWorkspaceId)?.name?.trim();
  const observedScopeRef=useRef<{id:string;path:string;name?:string}|null>(null);
  const [nativeSidebar,setNativeSidebar]=useState(false);
  useEffect(()=>{
    if(!desktop)return;
    const receive=(event:Event)=>{const value=(event as CustomEvent).detail?.native;if(typeof value==='boolean')setNativeSidebar(value);};
    window.addEventListener('buildr-dsh-host',receive);
    return()=>window.removeEventListener('buildr-dsh-host',receive);
  },[desktop]);
  useEffect(()=>{
    if(!desktop)return;
    observedScopeRef.current=null;
    setNativeSidebar(false);
    desktopNotify({kind:'workspace',scope:null});
    if(!workbenchWorkspaceId)return;
    const abort=new AbortController();
    void observeWorkspaceDirectory(workbenchWorkspaceId,abort.signal).then(scope=>{
      if(abort.signal.aborted)return;
      const resolvedName=scope.name?.trim()||scopesRef.current.find(item=>item.id===workbenchWorkspaceId)?.name?.trim()||(workbenchWorkspaceId==='@default'?'默认工作空间':undefined);
      const next={id:workbenchWorkspaceId,path:scope.rootPath,...(resolvedName?{name:resolvedName}:{})};
      observedScopeRef.current=next;
      desktopNotify({kind:'workspace',scope:next});
    }).catch(()=>{});
    return()=>abort.abort();
  },[desktop,workbenchWorkspaceId]);
  useEffect(()=>{
    const current=observedScopeRef.current;
    if(!desktop||!workbenchWorkspaceId||!currentWorkspaceName||!current||current.id!==workbenchWorkspaceId||current.name===currentWorkspaceName)return;
    const next={id:current.id,path:current.path,name:currentWorkspaceName};
    observedScopeRef.current=next;
    desktopNotify({kind:'workspace',scope:next});
  },[desktop,workbenchWorkspaceId,currentWorkspaceName]);
  const effectiveEnvironmentOpen=standalone?environmentOpen&&!context.settings&&!nativeSidebar:undefined;
  const layout=useMemo(
    ()=>resolveHarnessThreePaneLayout({
      shellWidth,
      viewportWidth,
      historyOpen:context.view==='history'&&!context.settings,
      workspaceOpen:Boolean(effectiveEnvironmentOpen),
      preferredConversationRatio:preferredRatio,
      preferredHistoryWidth:preferredThreePaneHistory,
    }),
    [shellWidth,viewportWidth,context.view,context.settings,effectiveEnvironmentOpen,preferredRatio,preferredThreePaneHistory],
  );
  const workspaceNeedsSingleLeft=Boolean(effectiveEnvironmentOpen)&&!layout.canThreePane;
  const previousWorkspaceNeedsSingleLeftRef=useRef(workspaceNeedsSingleLeft);
  const stashedHistoryForWorkspaceRef=useRef(false);
  useLayoutEffect(()=>{
    const previous=previousWorkspaceNeedsSingleLeftRef.current;
    previousWorkspaceNeedsSingleLeftRef.current=workspaceNeedsSingleLeft;
    if(!standalone)return;
    if(!previous&&workspaceNeedsSingleLeft&&context.view==='history'){
      stashedHistoryForWorkspaceRef.current=true;
      context.setView('conversation');
    }else if(previous&&!workspaceNeedsSingleLeft&&stashedHistoryForWorkspaceRef.current){
      stashedHistoryForWorkspaceRef.current=false;
      const canRestore=Boolean(effectiveEnvironmentOpen)?layout.canThreePane:canSplitFocusHistory(Math.max(0,shellWidth-HARNESS_RAIL_WIDTH),viewportWidth);
      if(canRestore&&context.view!=='history')context.setView('history');
    }
  },[standalone,workspaceNeedsSingleLeft,effectiveEnvironmentOpen,layout.canThreePane,shellWidth,viewportWidth,context.view,context.setView]);
  const layoutRef=useRef(layout);layoutRef.current=layout;
  const shellWidthRef=useRef(shellWidth);shellWidthRef.current=shellWidth;
  const preferredRatioRef=useRef(preferredRatio);preferredRatioRef.current=preferredRatio;
  const preferredHistoryRef=useRef(preferredThreePaneHistory);preferredHistoryRef.current=preferredThreePaneHistory;
  const rightDragStartHistoryRef=useRef<number|null>(null);
  const leftDragStartRatioRef=useRef<number|null>(null);
  const handleEnvironmentDragChange=useCallback((dragging:boolean)=>{
    rightDragStartHistoryRef.current=dragging?layoutRef.current.historyWidth:null;
  },[]);
  const handleConversationRatioChange=useCallback((nextRatio:number,commit:boolean)=>{
    const currentLayout=layoutRef.current;
    const baseHistory=rightDragStartHistoryRef.current??preferredHistoryRef.current;
    const resized=resizeThreePaneConversationRatio({shellWidth:shellWidthRef.current,historyWidth:baseHistory,threePaneActive:currentLayout.threePaneActive},nextRatio);
    setPreferredRatio(resized.conversationRatio);
    if(currentLayout.threePaneActive)setPreferredThreePaneHistory(resized.historyWidth);
    if(commit){
      writeOptionalPreference(workspaceRatioKey,String(resized.conversationRatio));
      if(currentLayout.threePaneActive&&resized.historyWidth!==baseHistory){
        writeOptionalPreference(threePaneHistoryKey,String(resized.historyWidth));
      }
    }
  },[workspaceRatioKey,threePaneHistoryKey]);
  const handleHistoryDragChange=useCallback((dragging:boolean)=>{
    leftDragStartRatioRef.current=dragging?layoutRef.current.conversationRatio:null;
  },[]);
  const handleResizeHistory=useCallback((nextWidth:number,commit:boolean)=>{
    const baseRatio=leftDragStartRatioRef.current??preferredRatioRef.current;
    const resized=resizeThreePaneHistory({shellWidth:shellWidthRef.current,conversationRatio:baseRatio,historyWidth:preferredHistoryRef.current},nextWidth);
    setPreferredThreePaneHistory(resized.historyWidth);
    setPreferredRatio(resized.conversationRatio);
    if(commit){
      writeOptionalPreference(threePaneHistoryKey,String(resized.historyWidth));
      if(resized.conversationRatio!==baseRatio){
        writeOptionalPreference(workspaceRatioKey,String(resized.conversationRatio));
      }
    }
  },[workspaceRatioKey,threePaneHistoryKey]);
  const threePaneHost=useMemo<HarnessThreePaneHost|undefined>(
    ()=>standalone?{
      workspaceOpen:Boolean(effectiveEnvironmentOpen),
      canSplitHistory:layout.canThreePane,
      panelWidth:Math.max(0,layout.conversationRegionWidth-HARNESS_RAIL_WIDTH),
      historyWidth:layout.historyWidth,
      historyMinWidth:layout.historyMinWidth,
      historyMaxWidth:layout.historyMaxWidth,
      defaultHistoryWidth:THREE_PANE_HISTORY_DEFAULT_WIDTH,
      onResizeHistory:handleResizeHistory,
      onHistoryDragChange:handleHistoryDragChange,
    }:undefined,
    [standalone,effectiveEnvironmentOpen,layout.canThreePane,layout.conversationRegionWidth,layout.historyWidth,layout.historyMinWidth,layout.historyMaxWidth,handleResizeHistory,handleHistoryDragChange],
  );
  const workspaceHost=useMemo(()=>(threePaneHost?{...composition,threePane:threePaneHost}:composition),[composition,threePaneHost]);
  const findExplorerFile:HarnessDirectoryFiles['findExplorerFile']=standalone?async(conversation,reference,signal)=>{
    const {path,line}=conversationFileLink(reference,false);
    const workspaceId=conversation.workspaceId;
    const slash=(value:string)=>value.replace(/\\/g,'/').replace(/\/+$/,'');
    const resolve=async()=>{
      if(workspaceRef.current!==workspaceId)return null;
      const scope=await observeWorkspaceDirectory(workspaceId,signal);
      const absolute=slash(/^(?:[\\/]|[a-z]:[\\/])/i.test(path)?path:conversation.cwd+'/'+path);
      const root=slash(scope.rootPath);
      if(!absolute.startsWith(root+'/'))return null;
      const relative=absolute.slice(root.length+1).split('/').filter(part=>part&&part!=='.').join('/');
      if(!relative||relative.split('/').includes('..'))return null;
      await directoryClient(scope,workspaceId)('file',{path:relative},signal);
      signal.throwIfAborted();
      return {workspaceId,revision:scope.revision,path:relative,line};
    };
    const known=await resolve();
    if(!known)return null;
    return async()=>{
      const latest=await resolve();
      if(!latest||latest.revision!==known.revision||latest.path!==known.path||workspaceRef.current!==workspaceId)throw new Error('文件来源已变化，请重新定位。');
      if (desktop&&nativeSidebar) desktopNotify({kind:'reveal',file:latest});
      else {setReveal(latest);setEnvironmentOpen(true);context.setFull(false);}
    };
  }:undefined;
  const builtin:HarnessWorkEnvironment={id:'harness-conversation-workspace',title:'对话工作区',render:active=><Suspense fallback={<Spin size="small" />}>
    <DirectoryWorkbench reveal={reveal} active={active} workspaceId={workbenchWorkspaceId} workspaceName={scopes.find(scope=>scope.id===workbenchWorkspaceId)?.name}
      onDirectoryAdded={workspaceId=>{context.newConversation({scope:{workspaceId},preserveVisibility:true});void refresh().catch(failure=>setError(failure instanceof Error?failure.message:'工作范围读取失败。'));}} />
  </Suspense>};
  return <HarnessShell
    environment={environment??(standalone&&!nativeSidebar?builtin:undefined)}
    environmentOpen={effectiveEnvironmentOpen}
    onEnvironmentOpenChange={standalone?setEnvironmentOpen:undefined}
    resizable={standalone}
    conversationRatio={layout.conversationRatio}
    defaultConversationRatio={THREE_PANE_DEFAULT_CONVERSATION_RATIO}
    minConversationWidth={layout.minConversationRegion}
    minEnvironmentWidth={layout.minWorkspace}
    onConversationRatioChange={handleConversationRatioChange}
    onShellWidthChange={setShellWidth}
    onEnvironmentDragChange={handleEnvironmentDragChange}
  >{workspaceToggle=><>{error&&!choosing&&<Alert type="warning" closable onClose={()=>setError('')} message={error}/>}<main className="harness-main"><ConversationHostProvider host={workspaceHost}><HarnessDirectoryFilesProvider host={{...files,findExplorerFile,...(!embedded?{chooseWorkspace:()=>{setPath('');setName('');setError('');setChoosing(true);}}:{})}}><ConversationWorkspace workspaces={scopes} defaultWorkspaceId={selected??null} headerAction={desktop&&nativeSidebar?<Button type="text" className="harness-workspace-toggle" title="切换 DSH 工作区侧栏" aria-label="切换 DSH 工作区侧栏"
      icon={<WorkspacePanelIcon open={false}/>} onClick={()=>desktopNotify({kind:'shell',action:'toggle-right'})}/>:workspaceToggle}
      onReturnToHost={desktop?()=>desktopNotify({kind:'shell',action:'leave'}):undefined}/></HarnessDirectoryFilesProvider></ConversationHostProvider></main>{!standalone&&<AgentConnectionSettings/>}<Modal open={choosing} centered width={500} className="harness-workspace-modal" title="添加工作空间" confirmLoading={busy} maskClosable={!busy} cancelText="取消" okText="创建并使用" cancelButtonProps={{disabled:busy}} okButtonProps={{'aria-label':'创建并使用',disabled:!path.trim()}} onOk={()=>void create()} onCancel={()=>{if(!busy)setChoosing(false);}}>
    <div className="harness-workspace-modal-body">
      <p className="harness-workspace-intro">选择一个本机目录并设置可选名称，创建后直接用于新对话。</p>
      {error&&<Alert className="harness-workspace-alert" type="warning" showIcon message={error}/>}
      <div className="harness-workspace-field">
        <span className="harness-workspace-label">工作空间目录</span>
        <div className={'harness-workspace-directory'+(path?' is-selected':'')} aria-label="已选择的工作空间目录" title={path||undefined}>
          <span className="harness-workspace-dir-icon" aria-hidden="true"><FolderOpenOutlined/></span>
          <div className="harness-workspace-dir-info">
            <strong>{path?directoryLeafName(path):'尚未选择目录'}</strong>
            <span className="harness-workspace-dir-path">{path||'从本机选择一个已有文件夹'}</span>
          </div>
          <Button className="harness-workspace-choose-btn" aria-label={path?'重新选择目录':'选择本机目录'} onClick={()=>void chooseDirectory()} loading={busy}>{path?'重新选择目录':'选择本机目录'}</Button>
        </div>
      </div>
      <div className="harness-workspace-field">
        <label className="harness-workspace-label" htmlFor="harness-workspace-name"><span>工作空间名称</span><span className="harness-workspace-optional">可选</span></label>
        <Input id="harness-workspace-name" aria-label="工作空间名称" placeholder={path?`留空默认使用「${directoryLeafName(path)}」`:'留空时使用目录名'} maxLength={160} disabled={busy} value={name} onChange={event=>setName(event.target.value)} onPressEnter={()=>void create()}/>
      </div>
    </div>
  </Modal></>}</HarnessShell>;
}
