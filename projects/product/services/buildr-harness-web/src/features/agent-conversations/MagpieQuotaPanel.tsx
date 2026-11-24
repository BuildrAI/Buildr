import {useEffect,useState} from 'react';
import {Alert,Progress,Tag} from 'antd';
import type {AgentModelGatewayQuotaModelGatewayQuota as Snapshot} from '../../../build/generated/agent-service-http-dto';
import {compareSourceNames,formatQuotaPercent} from './account-quota-view.ts';

const dateLabel=(value:string|undefined)=>value?new Date(value).toLocaleString():undefined;

export function MagpieQuotaRows({snapshot}:{snapshot:Snapshot}) {
  const groups=new Map<string,Snapshot['accounts']>();
  for(const account of snapshot.accounts){
    const group=groups.get(account.provider)??[];
    group.push(account);groups.set(account.provider,group);
  }
  if(!groups.size)return <p className="amm-section-description">Magpie 尚无可展示的额度记录。</p>;
  const sorted=[...groups].sort((left,right)=>compareSourceNames(left[1][0]!.providerLabel,right[1][0]!.providerLabel)||left[0].localeCompare(right[0]));
  return <div className="amm-magpie-provider-list">{sorted.map(([provider,accounts])=>{
    const label=accounts[0]!.providerLabel;
    return <section className="amm-magpie-provider-card" key={provider}>
      <header className="amm-magpie-provider-head">
        <div className="amm-magpie-provider-title">
          <span className={`amm-provider-mark is-${provider}`}>{label.slice(0,1)}</span>
          <h4>{label}</h4>
        </div>
        {accounts.length>1&&<Tag>{accounts.length} 个账号</Tag>}
      </header>
      <div className="amm-magpie-accounts">{accounts.map((account,index)=><article className="amm-magpie-account" key={index}>
        <div className="amm-magpie-account-head">
          <strong>{account.accountLabel?`${account.accountLabel}${accounts.length>1?`（账号 ${index+1}）`:''}`:`账号 ${index+1}`}</strong>
          {account.plan&&<Tag>{account.plan}</Tag>}
        </div>
        <p className="amm-magpie-observed">{account.observedAt?`Magpie 观察于 ${dateLabel(account.observedAt)}`:'Magpie 未提供观察时间'}{account.unavailable?' · 上游读取未完成，所列值仅供参考':''}</p>
        {account.balance&&<div className="amm-magpie-balance"><span>余额</span><strong>{account.balance}</strong></div>}
        {account.windows.length>0&&<div className="amm-magpie-windows">{account.windows.map((window,windowIndex)=>{
          const percent=window.remainingPercent!==undefined?Number(formatQuotaPercent(window.remainingPercent)):undefined;
          return <section className="amm-magpie-window" key={windowIndex}>
            <div className="amm-window-head"><span>{window.label}</span><strong>{window.remainingPercent!==undefined?`剩余 ${formatQuotaPercent(window.remainingPercent)}%`:'剩余未知'}</strong></div>
            {percent!==undefined&&<Progress percent={percent} showInfo={false} strokeColor={percent>25?'var(--primary)':'#b77b35'}/>}
            <p className="amm-window-foot">{window.resetsAt?`${dateLabel(window.resetsAt)} 重置`:'重置时间未提供'}</p>
          </section>;
        })}</div>}
        {!account.balance&&!account.windows.length&&<p className="amm-section-description">该账号没有可展示的余额或额度窗口。</p>}
      </article>)}</div>
    </section>;
  })}<p className="amm-magpie-read-at">Buildr 读取于 {dateLabel(snapshot.readAt)}</p></div>;
}

export function MagpieQuotaPanel({accountId,revision,enabled,refreshToken=0,read}:{accountId:string;revision:string;enabled:boolean;refreshToken?:number;read:(id:string,revision:string,signal:AbortSignal)=>Promise<Snapshot>}) {
  const requestKey=`${accountId}:${revision}:${refreshToken}`;
  const [result,setResult]=useState<{key:string;snapshot?:Snapshot;failed?:boolean}>();
  useEffect(()=>{
    if(!enabled)return;
    const abort=new AbortController();
    void read(accountId,revision,abort.signal).then(snapshot=>{
      if(!abort.signal.aborted)setResult({key:requestKey,snapshot});
    },()=>{
      if(!abort.signal.aborted)setResult(current=>({key:requestKey,snapshot:current?.snapshot,failed:true}));
    });
    return ()=>abort.abort();
  },[accountId,revision,enabled,refreshToken,read,requestKey]);
  const loading=enabled&&result?.key!==requestKey;
  const snapshot=enabled?result?.snapshot:undefined;
  const failed=enabled&&result?.key===requestKey&&result.failed;
  return <section className="amm-magpie-quota-panel" aria-label="Magpie 上游账号额度">
    {!enabled?<p className="amm-section-description">Magpie 来源已停用或断开。</p>:<>
      {loading&&!snapshot&&<p role="status" className="amm-section-description">正在读取 Magpie 的额度记录…</p>}
      {failed&&<Alert className="amm-magpie-alert" type="warning" showIcon message={snapshot?'本次未能更新 Magpie 额度，已保留上次观察。模型使用不受影响。':'暂时无法读取 Magpie 额度。模型使用不受影响。'}/>}
      {snapshot&&<MagpieQuotaRows snapshot={snapshot}/>}
    </>}
  </section>;
}
