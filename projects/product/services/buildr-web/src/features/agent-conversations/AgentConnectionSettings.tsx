import {useCallback,useEffect,useRef,useState} from 'react';
import {Alert,App,Modal} from 'antd';
import {DrawerShell} from '../../components/DrawerShell';
import {useAgentConversations} from './AgentConversationsContext';
import {AgentProgramPreparation} from './AgentProgramPreparation';
import {AccountModelManager,type AccountSelection} from './AccountModelManager';
import {modelSourceViews} from './account-model-view';
import type {ModelAccount,ConnectionView} from './types';
const waiting=(value:{state:string}|undefined)=>!!value&&['initializing','waiting-browser','checking'].includes(value.state);
export function AgentConnectionSettings(){
 const context=useAgentConversations(),{message}=App.useApp();
 const [providers,setProviders]=useState<Array<{id:string;label:string}>>([]);
 const [accounts,setAccounts]=useState<ModelAccount[]>([]),[selection,setSelection]=useState<AccountSelection>({sourceId:'all',tab:'quota'});
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[program,setProgram]=useState<string|null>(null),[pendingLogin,setPendingLogin]=useState<string|null>(null),[preparing,setPreparing]=useState<Record<string,boolean>>({});
 const gate=useRef(false),readGeneration=useRef(0);
 const update=(account:ModelAccount)=>setAccounts(previous=>previous.some(value=>value.id===account.id)?previous.map(value=>value.id===account.id?account:value):[...previous,account]);
 const refresh=useCallback(async()=>{const generation=++readGeneration.current;const result=await context.api.modelAccounts();if(generation===readGeneration.current){setAccounts(result.accounts);setProviders(result.providers);}await context.refreshModelCatalog();},[context.api,context.refreshModelCatalog]);
 const act=async(operation:()=>Promise<void>)=>{if(gate.current)return;gate.current=true;setBusy(true);setError('');try{await operation();await refresh();}catch(failure){setError(failure instanceof Error?failure.message:'操作未完成。');await refresh().catch(()=>{});}finally{gate.current=false;setBusy(false);}};
 useEffect(()=>{if(context.settings)void refresh().catch(failure=>setError(failure instanceof Error?failure.message:'账号读取失败。'));},[context.settings,refresh]);
 const active=[...context.connections.filter(connection=>waiting(connection.loginAttempt)).map(connection=>'native:'+connection.id+':'+connection.loginAttempt!.id),...accounts.filter(account=>!account.connectionId&&waiting(account.loginAttempt)).map(account=>account.id+':'+account.loginAttempt!.id)].join(',');
 useEffect(()=>{if(!context.settings||!active)return;const controller=new AbortController();let reading=false;const timer=setInterval(()=>{if(reading)return;reading=true;void (async()=>{for(const key of active.split(',')){const parts=key.split(':');if(parts[0]==='native')context.updateConnection(await context.api.loginAttempt(parts[1],parts[2],controller.signal));else update(await context.api.modelLoginAttempt(parts[0],parts[1],controller.signal));}if(!controller.signal.aborted)await refresh();})().catch(failure=>{if(!controller.signal.aborted)setError(failure instanceof Error?failure.message:'登录观察失败。');}).finally(()=>{reading=false;});},1500);return()=>{controller.abort();clearInterval(timer);};},[context.settings,active,context.api,context.updateConnection,refresh]);
 const revisions=context.connections.map(connection=>connection.id+':'+connection.revision).join(',');
 useEffect(()=>{if(context.settings)void refresh().catch(()=>{});},[revisions,context.settings,refresh]);
 const onPending=useCallback((id:string,value:boolean)=>setPreparing(previous=>previous[id]===value?previous:{...previous,[id]:value}),[]);
 const nativeLogin=async(connection:ConnectionView)=>{if(connection.status!=='ready')context.updateConnection(await context.api.login(connection));const account=accounts.find(account=>account.connectionId===connection.id);if(account)update(await context.api.modelAccountAction(account,'check'));};
 useEffect(()=>{if(!pendingLogin||preparing[pendingLogin]||busy)return;const connection=context.connections.find(connection=>connection.id===pendingLogin);if(connection?.enabled){setPendingLogin(null);setProgram(null);void act(()=>nativeLogin(connection));}},[pendingLogin,preparing,revisions,busy]);
 function login(id:string){void act(async()=>{
  let account=accounts.find(account=>account.id===id);
  if(!account){account=await context.api.addModelAccount('devin');update(account);setSelection(current=>({...current,sourceId:account!.id}));}
  if(account.connectionId){const connection=context.connections.find(connection=>connection.id===account!.connectionId);if(!connection)throw new Error('请重新读取本机智能体程序。');if(!connection.enabled){setPendingLogin(connection.id);setProgram(connection.id);return;}await nativeLogin(connection);}
  else update(await context.api.modelAccountAction(account,'login-attempts'));
 });}
 function check(id:string){void act(async()=>{const targets=accounts.filter(account=>(id==='all'||id===account.id)&&account.enabled);const results=await Promise.allSettled(targets.map(account=>context.api.modelAccountAction(account,'check')));for(const result of results){if(result.status==='fulfilled')update(result.value);}const failed=results.filter(result=>result.status==='rejected');if(failed.length)throw new Error('部分账号读取失败，已保留其他账号和已有观察，请刷新后重试。');});}
 function disconnect(id:string){const account=accounts.find(account=>account.id===id);if(account)void act(async()=>{update(await context.api.modelAccountAction(account,'disconnect'));});}
 function cancel(id:string){const account=accounts.find(account=>account.id===id);if(!account)return;void act(async()=>{if(account.connectionId){const connection=context.connections.find(connection=>connection.id===account.connectionId);if(connection?.loginAttempt)context.updateConnection(await context.api.cancelLogin(connection,connection.loginAttempt.id));}else update(await context.api.cancelModelLogin(account));});}
 function changes(values:Array<{sourceId:string;modelId:string;enabled?:boolean;contextWindow?:number|null}>){void act(async()=>{for(const account of accounts){const rows=values.filter(value=>value.sourceId===account.id).map(({modelId,...value})=>({id:modelId,...value,sourceId:undefined}));if(rows.length)update(await context.api.modelPreferences(account,rows));}message.success('模型设置已保存');});}
 const sources=modelSourceViews(accounts,context.connections),connection=context.connections.find(connection=>connection.id===program);
 return <><DrawerShell open={context.settings} title="账号与模型" sub="登录一次，模型供不同智能体使用" onClose={()=>context.setSettings(false)} closeAriaLabel="关闭智能体账号与配置" width="min(680px,100vw)" rootClassName="agent-conversation-settings model-account-settings">
 {error&&<Alert type="warning" showIcon message={error} style={{marginBottom:16}}/>}
 <AccountModelManager additionalProviders={providers} onAdd={provider=>void act(async()=>{const account=await context.api.addModelAccount(provider);update(account);setSelection({sourceId:account.id,tab:'quota'});})} sources={sources} selection={selection} busy={busy} onSelect={setSelection} onRefresh={check} onLogin={login} onDisconnect={disconnect} onPrepare={id=>setProgram(accounts.find(account=>account.id===id)?.connectionId??null)} onCancelLogin={cancel} onEnable={values=>changes(values)} onContext={(sourceId,modelId,contextWindow)=>changes([{sourceId,modelId,contextWindow}])}/>
 </DrawerShell><Modal open={!!connection} title="本机程序与连接" footer={null} width={600} onCancel={()=>{setProgram(null);setPendingLogin(null);}} destroyOnHidden>{connection&&<AgentProgramPreparation key={connection.id} connection={connection} onPending={onPending} autoStart/>}</Modal></>;
}
