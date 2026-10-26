import {useCallback,useEffect,useState} from 'react';
import {Alert,Button,Progress,Space,Tag} from 'antd';
import {useAgentConversations} from './AgentConversationsContext';
import type {ModelAccount} from './types';
const waiting=(account:ModelAccount)=>account.loginAttempt&&['initializing','waiting-browser','checking'].includes(account.loginAttempt.state);
const status:Record<ModelAccount['status'],string>={'not-authenticated':'尚未登录',ready:'可使用',expired:'登录已过期',failed:'检查失败',disconnected:'已断开'};
export function ModelAccountSettings(){
  const context=useAgentConversations();
  const [accounts,setAccounts]=useState<ModelAccount[]>([]),[providers,setProviders]=useState<Array<{id:string;label:string}>>([]),[error,setError]=useState(''),[busy,setBusy]=useState(''),[more,setMore]=useState(false);
  const refresh=useCallback(async()=>{const result=await context.api.modelAccounts();setAccounts(result.accounts);setProviders(result.providers);await context.refreshModelCatalog();},[context.api,context.refreshModelCatalog]);
  useEffect(()=>{void refresh().catch(failure=>setError(failure instanceof Error?failure.message:'套餐读取失败。'));},[refresh]);
  const update=(account:ModelAccount)=>setAccounts(previous=>previous.some(item=>item.id===account.id)?previous.map(item=>item.id===account.id?account:item):[...previous,account]);
  const act=async(key:string,operation:()=>Promise<ModelAccount>)=>{if(busy)return;setBusy(key);setError('');try{update(await operation());await context.refreshModelCatalog();}catch(failure){setError(failure instanceof Error?failure.message:'操作未完成。');}finally{setBusy('');}};
  const active=accounts.filter(account=>waiting(account)).map(account=>account.id+':'+account.loginAttempt!.id).join(',');
  useEffect(()=>{if(!active)return;const controller=new AbortController();let reading=false;const timer=setInterval(()=>{if(reading)return;reading=true;void Promise.all(active.split(',').map(async value=>{const [id,attempt]=value.split(':');const account=await context.api.modelLoginAttempt(id,attempt,controller.signal);if(!controller.signal.aborted)update(account);})).then(()=>context.refreshModelCatalog()).catch(failure=>{if(!controller.signal.aborted)setError(failure instanceof Error?failure.message:'登录观察失败。');}).finally(()=>{reading=false;});},1500);return()=>{controller.abort();clearInterval(timer);};},[active,context.api,context.refreshModelCatalog]);
  return <section className="ac-account-section" aria-label="模型套餐">
    <header><h3>其他模型账号</h3><Button size="small" disabled={Boolean(busy)} onClick={()=>void refresh().catch(failure=>setError(String(failure)))}>刷新套餐</Button></header>
    <p className="ac-subtle">Devin 登录后也会自动发现模型。已有的额外套餐账号继续保留。</p>
    {error&&<Alert type="warning" showIcon message={error}/>}
    <Button type="link" size="small" onClick={()=>setMore(value=>!value)}>{more?'收起额外账号':'管理额外账号'}</Button>
    <Space wrap>{providers.filter(provider=>provider.id==='devin'?!accounts.some(a=>a.provider==='devin'):more).map(provider=><Button key={provider.id} loading={busy==='add:'+provider.id} disabled={Boolean(busy)} onClick={()=>void act('add:'+provider.id,()=>context.api.addModelAccount(provider.id))}>添加 {provider.label}</Button>)}</Space>

    {accounts.filter(account=>!account.connectionId&&(account.provider==='devin'||more)).map(account=><section key={account.id} className="ac-model-account" aria-label={account.label}>
      <header><strong>{account.accountLabel||account.label}</strong><Tag color={account.status==='ready'?'success':'default'}>{status[account.status]}</Tag></header>
      {account.diagnostic&&<Alert type="warning" message={account.diagnostic}/>}
      <p className="ac-subtle">{account.quota?.available?account.quota.summary||'已读取套餐额度':'额度暂不可读取'}{account.quota?.observedAt&&` · ${new Date(account.quota.observedAt).toLocaleString()}`}</p>
      {typeof account.quota?.remainingPercent==='number'&&<Progress percent={account.quota.remainingPercent} size="small"/>}
      <p>{account.models.length?`${account.models.length} 个模型 · ${account.models.map(model=>model.label).join('、')}`:'登录后发现可用模型'}</p>
      <Space wrap>
        {waiting(account)?<><Button disabled={Boolean(busy)} onClick={()=>void act(account.id,()=>context.api.cancelModelLogin(account))}>取消本次登录</Button>{account.loginAttempt?.url&&<Button type="primary" href={account.loginAttempt.url} target="_blank" rel="noopener noreferrer">打开官方登录页</Button>}</>:account.status!=='ready'&&<Button disabled={Boolean(busy)} loading={busy===account.id+':login'} onClick={()=>void act(account.id+':login',()=>context.api.modelAccountAction(account,'login-attempts'))}>登录 {account.label}</Button>}
        <Button disabled={Boolean(busy)||Boolean(waiting(account))} onClick={()=>void act(account.id+':check',()=>context.api.modelAccountAction(account,'check'))}>检查账号与模型</Button>
        {account.enabled&&<Button disabled={Boolean(busy)||Boolean(waiting(account))} onClick={()=>void act(account.id+':disconnect',()=>context.api.modelAccountAction(account,'disconnect'))}>断开套餐</Button>}
      </Space>
      {account.loginAttempt?.diagnostic&&<p role="status">{account.loginAttempt.diagnostic}</p>}
    </section>)}

  </section>;
}
