import {ProgrammaticAccessSettings} from './ProgrammaticAccessSettings';
import {ModelLoginPages} from './model-login-pages';
import {AgentProgramUpdates} from './AgentProgramUpdates';
import {useCallback,useEffect,useRef,useState} from 'react';
import {Alert,App} from 'antd';
import {DrawerShell} from '../../components/DrawerShell';
import {useAgentConversations} from './AgentConversationsContext';
import {AgentProgramPreparation} from './AgentProgramPreparation';
import {type AccountSelection} from './AccountModelManager';
import {AgentModelSetup} from './AgentModelSetup';
import {modelSourceViews,newModelSourceProvider} from './account-model-view';
import {DEFAULT_CUSTOM_MODELS_PATH,type CustomProviderModelInput} from './custom-provider-model';
import {ProviderConnectionDrawer,type ProviderConnectionInitial,type ProviderConnectionInput} from './ProviderConnectionDrawer';
import type {ModelAccount,ConnectionView,ModelProviderView} from './types';
const waiting=(value:{state:string}|undefined)=>!!value&&['initializing','waiting-browser','checking'].includes(value.state);
function providerAccount(accounts:ModelAccount[],provider:ModelProviderView){
 return accounts.find(account=>provider.connectionId
  ?account.connectionId===provider.connectionId
  :provider.linked?account.id===provider.id||account.provider===provider.id
  :account.provider===provider.id&&!account.connectionId);
}
export function AgentConnectionSettings(){
 const context=useAgentConversations(),{message}=App.useApp();
 const [programGeneration,setProgramGeneration]=useState(0),[startProgram,setStartProgram]=useState(false);
 const [mode,setMode]=useState<'agents'|'accounts'|'programmatic'>('accounts');
 const [showDisabled,setShowDisabled]=useState(false);
 const [accounts,setAccounts]=useState<ModelAccount[]>([]),[providers,setProviders]=useState<ModelProviderView[]>([]),[selection,setSelection]=useState<AccountSelection>({sourceId:'all',tab:'quota'});
 const [providerEditing,setProviderEditing]=useState<ProviderConnectionInitial|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[program,setProgram]=useState<string|null>(null),[pendingLogin,setPendingLogin]=useState<string|null>(null),[preparing,setPreparing]=useState<Record<string,boolean>>({});
 const [refreshingIds,setRefreshingIds]=useState<string[]>([]);
 const checking=useRef(new Set<string>());
 const gate=useRef(false),readGeneration=useRef(0);
 const accountRead=useRef<AbortController|null>(null);
 const update=(account:ModelAccount)=>setAccounts(previous=>{const next=previous.some(value=>value.id===account.id)?previous.map(value=>value.id===account.id?account:value):[...previous,account];accountsRef.current=next;return next;});
 const refresh=useCallback(async()=>{
  const controller=accountRead.current;
  if(!controller)return;
  const generation=++readGeneration.current;
  const result=await context.api.modelAccounts(controller.signal,true).catch(error=>{
   if(!controller.signal.aborted)throw error;
  });
  if(!result)return;
  if(controller.signal.aborted||generation!==readGeneration.current)return;
  setAccounts(result.accounts);accountsRef.current=result.accounts;setProviders(result.providers);
  void context.refreshModelCatalog().catch(()=>{});
 },[context.api,context.refreshModelCatalog]);
 const act=async(operation:()=>Promise<void>):Promise<boolean>=>{if(gate.current)return false;gate.current=true;setBusy(true);setError('');try{await operation();await refresh();return true;}catch(failure){setError(failure instanceof Error?failure.message:'操作未完成。');await refresh().catch(()=>{});return false;}finally{gate.current=false;setBusy(false);}};
 const revisions=context.connections.map(connection=>connection.id+':'+connection.revision).join(',');
 useEffect(()=>{
  if(!context.settings)return;
  const controller=new AbortController();
  accountRead.current=controller;
  return()=>{accountRead.current=null;controller.abort();};
 },[context.settings]);
 useEffect(()=>{if(!context.settings)setProviderEditing(null);},[context.settings]);
 useEffect(()=>{
  if(!context.settings)return;
  const controller=accountRead.current;
  void refresh().catch(failure=>{if(controller&&!controller.signal.aborted&&mode==='accounts')setError(failure instanceof Error?failure.message:'供应商读取失败。');});
 },[context.settings,mode,revisions,refresh]);
 const active=[...context.connections.filter(connection=>waiting(connection.loginAttempt)).map(connection=>'native:'+connection.id+':'+connection.loginAttempt!.id),...accounts.filter(account=>!account.connectionId&&waiting(account.loginAttempt)).map(account=>account.id+':'+account.loginAttempt!.id)].join(',');
 useEffect(()=>{if(!context.settings||!active)return;const controller=new AbortController();let reading=false;const timer=setInterval(()=>{if(reading)return;reading=true;void (async()=>{await Promise.all(active.split(',').map(async key=>{const parts=key.split(':');if(parts[0]==='native')context.updateConnection(await context.api.loginAttempt(parts[1],parts[2],controller.signal));else update(await context.api.modelLoginAttempt(parts[0],parts[1],controller.signal));}));if(!controller.signal.aborted)await refresh();})().catch(failure=>{if(!controller.signal.aborted)setError(failure instanceof Error?failure.message:'登录观察失败。');}).finally(()=>{reading=false;});},750);return()=>{controller.abort();clearInterval(timer);};},[context.settings,active,context.api,context.updateConnection,refresh]);
 const loginPages=useRef<ModelLoginPages|null>(null);
 if(!loginPages.current)loginPages.current=new ModelLoginPages(()=>window.open('about:blank','_blank'));
 useEffect(()=>{loginPages.current!.observe(accounts);},[accounts]);
 useEffect(()=>()=>loginPages.current!.close(),[]);
 const onPending=useCallback((id:string,value:boolean)=>setPreparing(previous=>previous[id]===value?previous:{...previous,[id]:value}),[]);
 const nativeLogin=async(connection:ConnectionView)=>{context.updateConnection(await context.api.login(connection));};
 useEffect(()=>{if(!pendingLogin||preparing[pendingLogin]||busy)return;const connection=context.connections.find(connection=>connection.id===pendingLogin);if(connection?.enabled){setPendingLogin(null);setProgram(null);void act(()=>nativeLogin(connection));}},[pendingLogin,preparing,revisions,busy]);
 function login(id:string){if(gate.current)return;const account=accountsRef.current.find(account=>account.id===id);const reserved=account&&!account.connectionId?loginPages.current!.reserve(id):undefined;void act(async()=>{
  let account=accountsRef.current.find(account=>account.id===id);
  if(!account){const provider=newModelSourceProvider(id);if(!provider)throw new Error('供应商已变化，请刷新后重试。');account=await context.api.addModelAccount(provider);update(account);setSelection(current=>({...current,sourceId:account!.id}));}
  if(account.connectionId){const connection=context.connections.find(connection=>connection.id===account!.connectionId);if(!connection)throw new Error('请重新读取本机智能体程序。');if(!connection.executable||!connection.configPath){setMode('agents');setProgram(connection.id);return;}const target=connection.enabled?connection:await context.api.connect(connection.id,connection.revision);if(target!==connection)context.updateConnection(target);await nativeLogin(target);}
  else {const result=await context.api.modelAccountAction(account,'login-attempts');reserved?.bind(result.loginAttempt?.id);update(result);}
 }).then(success=>{if(!success)reserved?.close();});}
 function configureKey(id:string,key:string){return act(async()=>{let account=accounts.find(item=>item.id===id);if(!account){const provider=newModelSourceProvider(id),declared=provider?providers.find(item=>item.id===provider):undefined;if(!provider||(declared&&declared.authentication?.type!=='api-key'))throw new Error('供应商已变化，请刷新后重试。');account=await context.api.addModelAccount(provider);update(account);setSelection(current=>({...current,sourceId:account!.id}));}const configured=await context.api.configureModelAccount(account,key);update(configured);setSelection(current=>({...current,sourceId:configured.id}));});}
 async function saveProvider(input:ProviderConnectionInput):Promise<void>{
  let account:ModelAccount|undefined,startLogin=false;
  const saved=await act(async()=>{
   if(input.kind==='custom'){
    const custom={label:input.label,baseUrl:input.baseUrl!,protocol:input.protocol!,modelsPath:input.modelsPath??DEFAULT_CUSTOM_MODELS_PATH,useApiKey:Boolean(input.useApiKey),...(input.apiKey?{apiKey:input.apiKey}:{})};
    const existing=input.accountId?await context.api.modelAccount(input.accountId):undefined;
    const endpoint=(url:string)=>url.trim().replace(/\/+$/,'');
    if((!existing||endpoint(existing.custom?.baseUrl??'')!==endpoint(custom.baseUrl)||existing.custom?.protocol!==custom.protocol)&&accountsRef.current.some(item=>item.id!==existing?.id&&item.custom&&
      endpoint(item.custom.baseUrl)===endpoint(custom.baseUrl)&&item.custom.protocol===custom.protocol)){
      throw new Error('该端点与协议已接入，请编辑已有供应商。');
    }
    if(existing&&!existing.custom)throw new Error('供应商已变化，请刷新后重试。');
    account=existing
      ?await context.api.configureCustomModelAccount(existing,{...custom,models:existing.custom?.models??[]})
      :await context.api.addCustomModelAccount({...custom,models:[]});
    if(!account)throw new Error('供应商未创建。');
    update(account);
    setSelection({sourceId:account.id,tab:'models'});
    return;
   }
   const provider=providers.find(item=>item.id===input.kind);
   if(!provider)throw new Error('供应商已变化，请刷新后重试。');
   if(provider.connectionId)throw new Error('该供应商由智能体接入管理，请在“智能体”页完成登录。');
   let existing=providerAccount(accountsRef.current,provider);
   if(!existing){existing=await context.api.addModelAccount(provider.id);update(existing);}
   if(provider.authentication?.type==='api-key'){
    if(!input.apiKey)throw new Error('请输入 API Key。');
    account=await context.api.configureModelAccount(existing,input.apiKey);
   }else{
    account=existing;
    startLogin=account.status!=='ready'||!account.enabled;
   }
   update(account);
   setSelection({sourceId:account.id,tab:'quota'});
  });
  if(!saved)throw new Error('供应商配置未完成。');
  setProviderEditing(null);
  if(account&&startLogin)login(account.id);
 }
 async function deleteProvider(id:string):Promise<void>{
  const account=accountsRef.current.find(item=>item.id===id);
  if(!account)throw new Error('供应商已变化，请刷新后重试。');
  const deleted=await act(async()=>{await context.api.deleteModelAccount(account);});
  if(!deleted)throw new Error('供应商删除未完成。');
  setSelection(current=>current.sourceId===id?{sourceId:'all',tab:current.tab}:current);
  message.success(`已删除「${account.label}」；仍在使用它的对话会在下次发送时要求重新选择模型。`);
 }
 async function runManagedAuthTransition(id:string,switchAccount:boolean):Promise<void>{
  const account=accountsRef.current.find(item=>item.id===id);
  const connection=account?.connectionId?context.connections.find(item=>item.id===account.connectionId):undefined;
  if(!connection)throw new Error('智能体程序状态已变化，请刷新后重试。');
  let failureMessage='';
  const poll=connection.hostKeyringAuth||switchAccount?setInterval(()=>{void context.refreshConnections().catch(()=>{});},400):undefined;
  const done=await act(async()=>{
   try{
    const updated=(connection.hostKeyringAuth||switchAccount)&&context.api.logoutConnection
      ?await context.api.logoutConnection(connection,switchAccount)
      :await context.api.disconnect(connection);
    context.updateConnection(updated);
   }catch(failure){
    failureMessage=failure instanceof Error?failure.message:'';
    await context.refreshConnections().catch(()=>{});
    throw failure;
   }
  }).finally(()=>{if(poll)clearInterval(poll);});
  if(!done)throw new Error(failureMessage||(switchAccount?'切换账号未完成。':'退出登录未完成。'));
  message.success(switchAccount?`已退出原账号，请完成「${connection.label}」新账号官方登录。`:`已退出「${connection.label}」登录。`);
 }
 async function logoutManaged(id:string):Promise<void>{return runManagedAuthTransition(id,false);}
 async function switchManagedAccount(id:string):Promise<void>{return runManagedAuthTransition(id,true);}
 async function managedAccountImpact(id:string){
  const account=accountsRef.current.find(item=>item.id===id);
  if(!account?.connectionId||!context.api.connectionAccountImpact)return {activeConversations:[],references:0};
  return context.api.connectionAccountImpact(account.connectionId);
 }
 function check(id:string){for(const account of accounts.filter(item=>id==='all'?(item.enabled&&item.sourceEnabled!==false):id===item.id)){if(checking.current.has(account.id))continue;checking.current.add(account.id);setRefreshingIds([...checking.current]);const conn=account.connectionId?context.connections.find(item=>item.id===account.connectionId):undefined;const preCheck=id!=='all'&&conn&&conn.sendGate?.state==='paused'?context.api.check(conn).then(value=>context.updateConnection(value)).catch(()=>{}):Promise.resolve();void preCheck.then(()=>context.api.modelAccountAction(account,'check')).then(update).then(()=>Promise.allSettled([context.refreshModelCatalog(),...(conn?[context.refreshConnections()]:[])])).catch(()=>setError('部分供应商刷新失败，已保留已有信息。')).finally(()=>{checking.current.delete(account.id);setRefreshingIds([...checking.current]);});}}
 function disconnect(id:string){const account=accounts.find(account=>account.id===id);if(account)void act(async()=>{update(await context.api.modelAccountAction(account,'disconnect'));});}
 function cancel(id:string){const account=accounts.find(account=>account.id===id);if(!account)return;void act(async()=>{if(account.connectionId){const connection=context.connections.find(connection=>connection.id===account.connectionId);if(connection?.loginAttempt)context.updateConnection(await context.api.cancelLogin(connection,connection.loginAttempt.id));}else update(await context.api.cancelModelLogin(account));});}
 const accountsRef=useRef(accounts);accountsRef.current=accounts;
 async function saveCustomModels(id:string,models:CustomProviderModelInput[]):Promise<void>{
  const account=accountsRef.current.find(item=>item.id===id);
  if(!account?.custom)throw new Error('供应商已变化，请刷新后重试。');
  const saved=await act(async()=>{
   update(await context.api.configureCustomModelAccount(account,{label:account.label,baseUrl:account.custom!.baseUrl,protocol:account.custom!.protocol,modelsPath:account.custom!.modelsPath,useApiKey:account.custom!.useApiKey,models}));
  });
  if(!saved)throw new Error('模型列表未保存。');
 }
 function editProvider(id:string){
  const account=accountsRef.current.find(item=>item.id===id);
  if(!account?.custom)return;
  setProviderEditing({kind:'custom',accountId:account.id,label:account.label,baseUrl:account.custom.baseUrl,protocol:account.custom.protocol,modelsPath:account.custom.modelsPath??DEFAULT_CUSTOM_MODELS_PATH,useApiKey:account.custom.useApiKey,credentialConfigured:account.credentialConfigured});
 }
  const preferenceQueue=useRef(Promise.resolve());
  const preferenceEpochs=useRef(new Map<string,number>());
  function changes(values:Array<{sourceId:string;modelId:string;enabled?:boolean;contextWindow?:number|null}>){
   const snapshot=accountsRef.current;
   const epochs=values.map(value=>{const key=value.sourceId+'\0'+value.modelId;const epoch=(preferenceEpochs.current.get(key)??0)+1;preferenceEpochs.current.set(key,epoch);return {...value,key,epoch};});
   setAccounts(previous=>previous.map(account=>{
    const rows=epochs.filter(value=>value.sourceId===account.id);
    if(!rows.length)return account;
    return {...account,models:account.models.map(model=>{
     const row=rows.find(item=>item.modelId===model.id);
     if(!row)return model;
     const enabled=row.enabled??model.enabled;
     const reported=model.reportedContextWindow??model.contextWindow;
     const override=row.contextWindow===undefined?model.contextWindowOverride:row.contextWindow===null?undefined:row.contextWindow;
     return {...model,enabled,contextWindowOverride:override,contextWindow:override===undefined?reported:Math.min(override,reported??override)};
    })};
   }));
   preferenceQueue.current=preferenceQueue.current.then(async()=>{
    const pending=epochs.filter(value=>preferenceEpochs.current.get(value.key)===value.epoch);
    for(const account of snapshot){
     const rows=pending.filter(value=>value.sourceId===account.id).map(({modelId,enabled,contextWindow})=>({id:modelId,enabled,contextWindow}));
     if(!rows.length)continue;
     try{
      const saved=await context.api.modelPreferences(account,rows);
      setAccounts(previous=>previous.map(current=>{
       if(current.id!==saved.id)return current;
       const stillCurrent=pending.filter(value=>value.sourceId===account.id).every(value=>preferenceEpochs.current.get(value.key)===value.epoch);
       return {...saved,models:stillCurrent?saved.models:current.models.map(model=>{const confirmed=saved.models.find(item=>item.id===model.id);const touched=pending.some(value=>value.sourceId===account.id&&value.modelId===model.id&&preferenceEpochs.current.get(value.key)===value.epoch);return confirmed&&touched?confirmed:model;}),revision:stillCurrent?saved.revision:current.revision};
      }));
      void context.refreshModelCatalog().catch(()=>{});
     }catch(failure){
      setAccounts(previous=>previous.map(current=>{
       if(current.id!==account.id)return current;
       const original=snapshot.find(item=>item.id===account.id);
       if(!original)return current;
       return {...current,models:current.models.map(model=>{
        const change=pending.find(value=>value.sourceId===account.id&&value.modelId===model.id);
        return change&&preferenceEpochs.current.get(change.key)===change.epoch?original.models.find(item=>item.id===model.id)??model:model;
       })};
      }));
      message.error(failure instanceof Error?failure.message:'模型设置保存失败，已恢复修改前的选择。');
     }
    }
   }).catch(()=>{});
  }
  const sources=modelSourceViews(accounts,context.connections,true);
  const configuredProviderIds=providers.filter(provider=>Boolean(providerAccount(accounts,provider))).map(provider=>provider.id);
 const setSourceEnabled=(id:string,enabled:boolean)=>{void act(async()=>{await preferenceQueue.current;let current=accountsRef.current.find(a=>a.id===id);if(!current){const provider=newModelSourceProvider(id);if(!provider)throw new Error('供应商已变化，请刷新后重试。');current=await context.api.addModelAccount(provider);}else current=await context.api.modelAccount(id);update(await context.api.modelSourceEnabled(current,enabled));if(!enabled)setSelection({sourceId:'all',tab:selection.tab});});};
  return <><DrawerShell open={context.settings} title="智能体与模型" sub="管理智能体、模型与程序接入" onClose={()=>context.setSettings(false)} closeAriaLabel="关闭智能体与模型设置" width="min(800px,100vw)" rootClassName="agent-conversation-settings model-account-settings">
 {error&&<Alert type="warning" showIcon message={error} style={{marginBottom:16}}/>}
 <AgentModelSetup showDisabled={showDisabled} onShowDisabled={setShowDisabled} onSourceEnabled={setSourceEnabled} programmaticContent={context.settings&&mode==='programmatic'?<ProgrammaticAccessSettings/>:undefined} executorContent={<AgentProgramUpdates scope="settings" active={context.settings&&mode==='agents'} connections={context.connections} accounts={accounts} preparationId={program} onPrepare={id=>{setStartProgram(true);setProgramGeneration(value=>value+1);setProgram(id);}} onManageAccount={(accountId,startLogin)=>{setMode('accounts');setSelection({sourceId:accountId,tab:'quota'});if(startLogin)login(accountId);}} onDetails={(id,open)=>{if(open&&program!==id){setStartProgram(false);setProgram(id);}else if(!open&&program===id)setProgram(null);}} renderPreparation={id=>{const item=context.connections.find(item=>item.id===id);return item&&<AgentProgramPreparation key={id+programGeneration} connection={item} onPending={onPending} autoStart={program===id&&startProgram}/>;}}/>} refreshingIds={refreshingIds} mode={mode} onMode={setMode} executors={context.connections.map(item=>({id:item.id,label:item.label,prepared:item.enabled&&!!item.configPath,checking:preparing[item.id]}))} expandedExecutor={program} onPrepareExecutor={id=>{setStartProgram(true);setProgramGeneration(value=>value+1);setProgram(id);}} onToggleExecutor={id=>{setStartProgram(false);setProgram(current=>current===id?null:id);}} renderExecutor={id=>{const item=context.connections.find(item=>item.id===id);return item&&<AgentProgramPreparation key={id+programGeneration} connection={item} onPending={onPending} autoStart={startProgram}/>;}} sources={sources.map(({program:_,...source})=>source)} selection={selection} busy={busy} onSelect={setSelection} onRefresh={check} onLogin={login} onDisconnect={disconnect} onPrepare={id=>{setMode('agents');setStartProgram(false);setProgram(accounts.find(account=>account.id===id)?.connectionId??null);}} onCancelLogin={cancel} onConfigureKey={async(id,key)=>{if(!await configureKey(id,key))throw new Error('API Key 配置未完成。');}} onAddProvider={()=>setProviderEditing({kind:'custom',label:'',baseUrl:'',protocol:'chat-completions',modelsPath:DEFAULT_CUSTOM_MODELS_PATH,useApiKey:false})} onEditProvider={editProvider} onDeleteProvider={deleteProvider} onDeleteUsage={async id=>(await context.api.modelAccountUsage(id)).references} onLogoutManaged={logoutManaged} onSwitchManagedAccount={switchManagedAccount} onManagedAccountImpact={managedAccountImpact} onCustomModels={saveCustomModels} onCustomDiscover={input=>context.api.discoverCustomModels({baseUrl:input.baseUrl,protocol:input.protocol,modelsPath:input.modelsPath,useApiKey:input.useApiKey,...(input.accountId?{accountId:input.accountId}:{}),...(input.apiKey?{apiKey:input.apiKey}:{})})} onEnable={values=>changes(values)} onContext={(sourceId,modelId,contextWindow)=>changes([{sourceId,modelId,contextWindow}])}/>
 </DrawerShell>
 {providerEditing&&<ProviderConnectionDrawer key={providerEditing.accountId??providerEditing.kind} open initial={providerEditing} providers={providers} connections={context.connections} configuredProviders={configuredProviderIds} busy={busy} onClose={()=>setProviderEditing(null)} onSave={saveProvider}/>}
 </>;
}
