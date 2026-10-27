import {useCallback,useEffect,useRef,useState} from 'react';
import {Alert,App} from 'antd';
import {DrawerShell} from '../../components/DrawerShell';
import {useAgentConversations} from './AgentConversationsContext';
import {AgentProgramPreparation} from './AgentProgramPreparation';
import {type AccountSelection} from './AccountModelManager';
import {AgentModelSetup} from './AgentModelSetup';
import {modelSourceViews} from './account-model-view';
import type {ModelAccount,ConnectionView} from './types';
const waiting=(value:{state:string}|undefined)=>!!value&&['initializing','waiting-browser','checking'].includes(value.state);
export function AgentConnectionSettings(){
 const context=useAgentConversations(),{message}=App.useApp();
 const [programGeneration,setProgramGeneration]=useState(0),[startProgram,setStartProgram]=useState(false);
 const [mode,setMode]=useState<'agents'|'accounts'>('agents');
 const [providers,setProviders]=useState<Array<{id:string;label:string}>>([]);
 const [accounts,setAccounts]=useState<ModelAccount[]>([]),[selection,setSelection]=useState<AccountSelection>({sourceId:'all',tab:'quota'});
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[program,setProgram]=useState<string|null>(null),[pendingLogin,setPendingLogin]=useState<string|null>(null),[preparing,setPreparing]=useState<Record<string,boolean>>({});
 const [refreshingIds,setRefreshingIds]=useState<string[]>([]);
 const checking=useRef(new Set<string>());
 const gate=useRef(false),readGeneration=useRef(0);
 const update=(account:ModelAccount)=>setAccounts(previous=>previous.some(value=>value.id===account.id)?previous.map(value=>value.id===account.id?account:value):[...previous,account]);
 const refresh=useCallback(async()=>{const generation=++readGeneration.current;const result=await context.api.modelAccounts();if(generation===readGeneration.current){setAccounts(result.accounts);setProviders(result.providers);}await context.refreshModelCatalog();},[context.api,context.refreshModelCatalog]);
 const act=async(operation:()=>Promise<void>)=>{if(gate.current)return;gate.current=true;setBusy(true);setError('');try{await operation();await refresh();}catch(failure){setError(failure instanceof Error?failure.message:'操作未完成。');await refresh().catch(()=>{});}finally{gate.current=false;setBusy(false);}};
 useEffect(()=>{if(context.settings)void refresh().catch(failure=>setError(failure instanceof Error?failure.message:'账号读取失败。'));},[context.settings,refresh]);
 useEffect(()=>{if(!context.settings)return;const timer=setInterval(()=>void refresh().catch(()=>{}),3000);return()=>clearInterval(timer);},[context.settings,refresh]);
 const active=[...context.connections.filter(connection=>waiting(connection.loginAttempt)).map(connection=>'native:'+connection.id+':'+connection.loginAttempt!.id),...accounts.filter(account=>!account.connectionId&&waiting(account.loginAttempt)).map(account=>account.id+':'+account.loginAttempt!.id)].join(',');
 useEffect(()=>{if(!context.settings||!active)return;const controller=new AbortController();let reading=false;const timer=setInterval(()=>{if(reading)return;reading=true;void (async()=>{for(const key of active.split(',')){const parts=key.split(':');if(parts[0]==='native')context.updateConnection(await context.api.loginAttempt(parts[1],parts[2],controller.signal));else update(await context.api.modelLoginAttempt(parts[0],parts[1],controller.signal));}if(!controller.signal.aborted)await refresh();})().catch(failure=>{if(!controller.signal.aborted)setError(failure instanceof Error?failure.message:'登录观察失败。');}).finally(()=>{reading=false;});},1500);return()=>{controller.abort();clearInterval(timer);};},[context.settings,active,context.api,context.updateConnection,refresh]);
 const revisions=context.connections.map(connection=>connection.id+':'+connection.revision).join(',');
 useEffect(()=>{if(context.settings)void refresh().catch(()=>{});},[revisions,context.settings,refresh]);
 const onPending=useCallback((id:string,value:boolean)=>setPreparing(previous=>previous[id]===value?previous:{...previous,[id]:value}),[]);
 const nativeLogin=async(connection:ConnectionView)=>{context.updateConnection(await context.api.login(connection));};
 useEffect(()=>{if(!pendingLogin||preparing[pendingLogin]||busy)return;const connection=context.connections.find(connection=>connection.id===pendingLogin);if(connection?.enabled){setPendingLogin(null);setProgram(null);void act(()=>nativeLogin(connection));}},[pendingLogin,preparing,revisions,busy]);
 function login(id:string){void act(async()=>{
  let account=accounts.find(account=>account.id===id);
  if(!account){account=await context.api.addModelAccount('devin');update(account);setSelection(current=>({...current,sourceId:account!.id}));}
  if(account.connectionId){const connection=context.connections.find(connection=>connection.id===account!.connectionId);if(!connection)throw new Error('请重新读取本机智能体程序。');if(!connection.enabled){setPendingLogin(connection.id);setProgram(connection.id);return;}await nativeLogin(connection);}
  else update(await context.api.modelAccountAction(account,'login-attempts'));
 });}
 function check(id:string){for(const account of accounts.filter(item=>(id==='all'||id===item.id)&&item.enabled)){if(checking.current.has(account.id))continue;checking.current.add(account.id);setRefreshingIds([...checking.current]);void context.api.modelAccountAction(account,'check').then(update).then(()=>context.refreshModelCatalog()).catch(()=>setError('部分账号刷新失败，已保留已有信息。')).finally(()=>{checking.current.delete(account.id);setRefreshingIds([...checking.current]);});}}
 function disconnect(id:string){const account=accounts.find(account=>account.id===id);if(account)void act(async()=>{update(await context.api.modelAccountAction(account,'disconnect'));});}
 function cancel(id:string){const account=accounts.find(account=>account.id===id);if(!account)return;void act(async()=>{if(account.connectionId){const connection=context.connections.find(connection=>connection.id===account.connectionId);if(connection?.loginAttempt)context.updateConnection(await context.api.cancelLogin(connection,connection.loginAttempt.id));}else update(await context.api.cancelModelLogin(account));});}
 const accountsRef=useRef(accounts);accountsRef.current=accounts;
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
  const sources=modelSourceViews(accounts,context.connections);
 return <><DrawerShell open={context.settings} title="智能体与模型" sub="智能体与模型分别管理" onClose={()=>context.setSettings(false)} closeAriaLabel="关闭智能体账号与配置" width="min(800px,100vw)" rootClassName="agent-conversation-settings model-account-settings">
 {error&&<Alert type="warning" showIcon message={error} style={{marginBottom:16}}/>}
 <AgentModelSetup refreshingIds={refreshingIds} mode={mode} onMode={setMode} executors={context.connections.map(item=>({id:item.id,label:item.label,prepared:item.enabled&&!!item.configPath,checking:preparing[item.id]}))} expandedExecutor={program} onPrepareExecutor={id=>{setStartProgram(true);setProgramGeneration(value=>value+1);setProgram(id);}} onToggleExecutor={id=>{setStartProgram(false);setProgram(current=>current===id?null:id);}} renderExecutor={id=>{const item=context.connections.find(item=>item.id===id);return item&&<AgentProgramPreparation key={id+programGeneration} connection={item} onPending={onPending} autoStart={startProgram}/>;}} additionalProviders={providers} onAdd={provider=>void act(async()=>{const account=await context.api.addModelAccount(provider);update(account);setSelection({sourceId:account.id,tab:'quota'});})} sources={sources.map(({program:_,...source})=>source)} selection={selection} busy={busy} onSelect={setSelection} onRefresh={check} onLogin={login} onDisconnect={disconnect} onPrepare={id=>setProgram(accounts.find(account=>account.id===id)?.connectionId??null)} onCancelLogin={cancel} onEnable={values=>changes(values)} onContext={(sourceId,modelId,contextWindow)=>changes([{sourceId,modelId,contextWindow}])}/>
 </DrawerShell></>;
}
