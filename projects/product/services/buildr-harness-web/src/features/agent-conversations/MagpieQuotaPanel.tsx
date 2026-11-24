import {useEffect,useState} from 'react';
import {Alert,Button,Progress} from 'antd';
import type {AgentModelGatewayQuotaModelGatewayQuota as Snapshot} from '../../../build/generated/agent-service-http-dto';

const dateLabel=(value:string|undefined)=>value?new Date(value).toLocaleString():undefined;

export function MagpieQuotaRows({snapshot}:{snapshot:Snapshot}) {
  const groups=new Map<string,Snapshot['accounts']>();
  for(const account of snapshot.accounts){
    const group=groups.get(account.provider)??[];
    group.push(account);groups.set(account.provider,group);
  }
  if(!groups.size)return <p className="amm-section-description">Magpie 尚无可展示的额度记录。</p>;
  return <>{[...groups].map(([provider,accounts])=><section className="amm-quota-group" key={provider}>
    <h4>{accounts[0]!.providerLabel}</h4>
    {accounts.map((account,index)=><article className="amm-quota-windows" key={index}>
      <div className="amm-window-head"><strong>{account.accountLabel?`${account.accountLabel}${accounts.length>1?`（账号 ${index+1}）`:''}`:`账号 ${index+1}`}</strong>{account.plan&&<span>{account.plan}</span>}</div>
      <p className="amm-window-foot">{account.observedAt?`Magpie 观察于 ${dateLabel(account.observedAt)}`:'Magpie 未提供观察时间'}{account.unavailable?' · 上游读取未完成，所列值仅供参考':''}</p>
      {account.balance&&<p>余额：{account.balance}</p>}
      {account.windows.map((window,index)=><section key={index}>
        <div className="amm-window-head"><span>{window.label}</span><strong>{window.remainingPercent!==undefined?`剩余 ${window.remainingPercent}%`:'剩余未知'}</strong></div>
        {window.remainingPercent!==undefined&&<Progress percent={window.remainingPercent} showInfo={false}/>}
        <p className="amm-window-foot">{window.resetsAt?`${dateLabel(window.resetsAt)} 重置`:'重置时间未提供'}</p>
      </section>)}
      {!account.balance&&!account.windows.length&&<p className="amm-section-description">该账号没有可展示的余额或额度窗口。</p>}
    </article>)}
  </section>)}<small className="amm-section-description">Buildr 读取于 {dateLabel(snapshot.readAt)}</small></>;
}

export function MagpieQuotaPanel({accountId,revision,enabled,read}:{accountId:string;revision:string;enabled:boolean;read:(id:string,revision:string,signal:AbortSignal)=>Promise<Snapshot>}) {
  const [refresh,setRefresh]=useState(0);
  const [result,setResult]=useState<{refresh:number;snapshot?:Snapshot;failed?:boolean}>();
  useEffect(()=>{
    if(!enabled)return;
    const abort=new AbortController();
    void read(accountId,revision,abort.signal).then(snapshot=>{
      if(!abort.signal.aborted)setResult({refresh,snapshot});
    },()=>{
      if(!abort.signal.aborted)setResult({refresh,failed:true});
    });
    return ()=>abort.abort();
  },[accountId,revision,enabled,read,refresh]);
  const current=enabled&&result?.refresh===refresh?result:undefined;
  return <section aria-label="Magpie 上游账号额度">
    <p className="amm-section-description">按上游账号显示 Magpie 已记录的额度。不合计，也不代表所选模型下一次请求将使用哪个账号。</p>
    {!enabled?<p>Magpie 来源已停用或断开。</p>:<>
      <Button size="small" loading={!current} onClick={()=>setRefresh(value=>value+1)}>重新读取额度</Button>
      {!current&&<p role="status" className="amm-section-description">正在读取 Magpie 的额度记录…</p>}
      {current?.failed&&<Alert type="warning" showIcon message="暂时无法读取 Magpie 额度。模型使用不受影响。"/>}
      {current?.snapshot&&<MagpieQuotaRows snapshot={current.snapshot}/>}
    </>}
  </section>;
}
