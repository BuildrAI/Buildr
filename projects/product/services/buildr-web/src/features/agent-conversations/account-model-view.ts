import {balanceLines} from './account-quota-view.ts';
import type {ModelAccount,ConnectionView} from './types';
import type {ManagedModel,ModelSourceView} from './AccountModelManager';
const waiting=(value:{state:string}|undefined)=>!!value&&['initializing','waiting-browser','checking'].includes(value.state);
const labels:Record<string,string>={codex:'Codex',dsh:'DSH',qoder:'Qoder',devin:'Devin',deepseek:'DeepSeek'};
function resetLabel(value?:string):string {if(!value)return '重置时间未提供';const ms=Date.parse(value);return Number.isFinite(ms)?`${new Date(ms).toLocaleString()} 重置`:'重置时间未提供';}
export function modelSourceViews(accounts:ModelAccount[],connections:ConnectionView[]):ModelSourceView[]{
 const visible=accounts.filter(account=>account.connectionId||account.provider==='devin'||account.status==='ready'||account.models.length||waiting(account.loginAttempt));
 const sources:ModelSourceView[]=visible.map(account=>{
  const provider=account.connectionId||account.provider,connection=connections.find(connection=>connection.id===account.connectionId);
  const login=account.connectionId?connection?.loginAttempt:account.loginAttempt;
  const rawLabel=account.accountLabel||account.label,plan=account.quota?.planLabel;
  const accountLabel=plan&&rawLabel.endsWith(' · '+plan)?rawLabel.slice(0,-(' · '+plan).length):rawLabel;
  const models:ManagedModel[]=account.models.map(model=>({id:model.id,label:model.label,family:model.family||model.label.split(/[ -]/)[0]||'其他',contextWindow:model.contextWindow,contextOverride:model.contextWindowOverride,reportedContextWindow:model.reportedContextWindow,images:model.images,tools:model.tools,enabled:model.enabled!==false,available:true,efforts:model.reasoningEfforts,defaultEffort:model.defaultReasoningEffort,modes:model.serviceTiers?.map(tier=>tier.label),creditFactor:model.creditFactor}));
  const windows=account.quota?.available?(account.quota.windows?.map(window=>({id:window.id,label:window.label,remainingPercent:window.remainingPercent,resetLabel:resetLabel(window.resetsAt)}))??(typeof account.quota.remainingPercent==='number'?[{id:'account',label:'账号额度',remainingPercent:account.quota.remainingPercent,resetLabel:resetLabel(account.quota.resetsAt)}]:[])):[];
  return {id:account.id,provider,providerLabel:labels[provider]||account.label,accountLabel,planLabel:account.quota?.planLabel||'已登录',status:account.status==='disconnected'?'not-authenticated':account.status,models:models.filter((_,index)=>account.models[index].kind!=='combination'),combinations:models.filter((_,index)=>account.models[index].kind==='combination'),windows,balanceLabels:account.quota?.available?balanceLines(account.quota.balances):[],quotaNote:account.quota?.summary||'平台没有返回可读取额度，不能据此判断余额。',observedLabel:account.quota?.observedAt?new Date(account.quota.observedAt).toLocaleString():'尚未读取',diagnostic:account.diagnostic||account.quota?.diagnostic||(account.quota?.stale?'本次读取未完成，以下为上次观察。':undefined),program:connection?(connection.enabled?'ready':'missing'):undefined,loginPending:waiting(login),loginUrl:login?.url?.startsWith('https://')?login.url:undefined,loginMessage:login?.diagnostic};
 });
 if(!sources.some(source=>source.provider==='devin'))sources.push({id:'new-devin',provider:'devin',providerLabel:'Devin',accountLabel:'尚未登录',planLabel:'—',status:'not-authenticated',models:[],windows:[],observedLabel:'尚未读取'});
 return sources;
}
