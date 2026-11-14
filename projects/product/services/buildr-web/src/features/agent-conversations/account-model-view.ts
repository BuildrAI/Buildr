import {
  fallbackApiKeyQuotaNote,
  fallbackNewModelSourceProvider,
  fallbackSourceCardLabel,
  fallbackVendorName,
  isAlwaysVisibleLegacyProvider,
  isLegacyDuplicateEmptySource,
  missingLegacyPlaceholderSource,
} from '../../lib/model-picker.ts';
import {accountBillingLink,accountSourceName,balanceLines,compareSourceNames,quotaWindowCredits} from './account-quota-view.ts';
import type {ModelAccount,ConnectionView} from './types';
import type {ManagedModel,ModelSourceView} from './AccountModelManager';
const waiting=(value:{state:string}|undefined)=>!!value&&['initializing','waiting-browser','checking'].includes(value.state);
export function newModelSourceProvider(id:string):string|undefined{return fallbackNewModelSourceProvider(id);}
function resetLabel(value?:string):string {if(!value)return '重置时间未提供';const ms=Date.parse(value);return Number.isFinite(ms)?`${new Date(ms).toLocaleString()} 重置`:'重置时间未提供';}
export function modelSourceViews(accounts:ModelAccount[],connections:ConnectionView[],includeDisabled=false):ModelSourceView[]{
 // A source that owns its credentials has exactly one row whose id is the provider id
 // (see ModelAccess.ensureLinked); it must stay visible while logged out.
 const linkedSource=(account:ModelAccount)=>account.id===account.provider;
 const visible=accounts.filter(account=>!isLegacyDuplicateEmptySource(account,accounts,waiting)&&(includeDisabled||account.sourceEnabled!==false)&&(account.connectionId||linkedSource(account)||account.authType==='api-key'||Boolean(account.singleton)||isAlwaysVisibleLegacyProvider(account.provider)||account.provider==='custom'||account.status==='ready'||account.models.length||waiting(account.loginAttempt)));
 const sources:ModelSourceView[]=visible.map(account=>{
  const provider=account.connectionId||(account.provider.startsWith('native-')?account.provider.slice('native-'.length):account.provider),connection=connections.find(connection=>connection.id===account.connectionId);
  const login=account.connectionId?connection?.loginAttempt:account.loginAttempt;
  const loginMessage=login?.diagnostic||(login?.state==='checking'?'正在核对登录结果，模型与额度会自动更新。':undefined);
  const rawLabel=account.accountLabel||account.label,plan=account.quota?.planLabel;
  const accountLabel=plan&&rawLabel.endsWith(' · '+plan)?rawLabel.slice(0,-(' · '+plan).length):rawLabel;
  const visibleModels = account.provider === 'google-ai-subscription' && account.models.some(model => model.id === 'gemini-3.8-flash-high')
    ? account.models.filter(model => model.id !== 'gemini-3.8-flash-tiered')
    : account.models;
  const models:ManagedModel[]=visibleModels.map(model=>({id:model.id,label:model.label,family:model.family||model.label.split(/[ -]/)[0]||'其他',contextWindow:model.contextWindow,contextOverride:model.contextWindowOverride,reportedContextWindow:model.reportedContextWindow,images:model.images,tools:model.tools,enabled:model.enabled!==false,available:true,efforts:model.reasoningEfforts,defaultEffort:model.defaultReasoningEffort,modes:model.serviceTiers?.map(tier=>tier.label),creditFactor:model.creditFactor}));
  const windows=account.quota?.available?(account.quota.windows?.map(window=>({id:window.id,label:window.label,groupLabel:window.groupLabel,remainingPercent:window.remainingPercent,resetLabel:resetLabel(window.resetsAt),balanceLabel:quotaWindowCredits(window)}))??(typeof account.quota.remainingPercent==='number'?[{id:'account',label:'账号额度',remainingPercent:account.quota.remainingPercent,resetLabel:resetLabel(account.quota.resetsAt)}]:[])):[];
  const custom=account.provider==='custom';
  const observedAt=custom||account.authType==='api-key'?(account.quota?.observedAt??account.observedAt):account.quota?.observedAt;
  const providerLabel=custom?accountSourceName(account):(account.presentation?.sourceLabel||fallbackSourceCardLabel(account.connectionId,accountSourceName(account)));
  const vendorLabel=account.presentation?.vendorLabel||fallbackVendorName(provider,providerLabel);
  const billing=accountBillingLink(account);
  const quotaNote=custom&&!account.quota?.available
   ?'自定义供应商没有额度接口，模型仍可正常使用。'
   :!account.quota?.available&&account.presentation?.quotaUnavailableNote
    ?account.presentation.quotaUnavailableNote
    :account.authType==='api-key'&&!account.quota?.available
     ?fallbackApiKeyQuotaNote(provider)
     :account.quota?.summary||'平台没有返回可读取额度，不能据此判断余额。';
  return {id:account.id,sourceEnabled:account.sourceEnabled!==false,provider,managed:Boolean(account.connectionId),...(connection?.label?{agentLabel:connection.label}:{}),...(connection?.hostKeyringAuth?{hostKeyringAuth:true}:{}),...(connection?.sendGate?{sendGate:connection.sendGate}:{}),providerLabel,vendorLabel,...(account.presentation?.apiKeyHint?{apiKeyHint:account.presentation.apiKeyHint}:{}),...(billing?.label?{billingLabel:billing.label}:{}),...(account.sharing?.kind==='executor-exclusive'?{exclusiveReason:account.sharing.reason}:{}),groupLabel:account.group?.label,modeLabel:account.modeLabel,authType:account.authType,credentialConfigured:account.credentialConfigured,accountLabel,planLabel:custom?(account.modeLabel||'自定义'):account.modeLabel==='API Key'?'API Key':account.quota?.planLabel||'已登录',status:account.status==='disconnected'?'not-authenticated':account.status,models:models.filter((_,index)=>visibleModels[index].kind!=='combination'),combinations:models.filter((_,index)=>visibleModels[index].kind==='combination'),windows,balanceLabels:account.quota?.available?balanceLines(account.quota.balances):[],quotaNote,billingUrl:billing?.url,observedLabel:observedAt?new Date(observedAt).toLocaleString():'尚未读取',diagnostic:waiting(login)?undefined:loginMessage||account.diagnostic||account.quota?.diagnostic||(account.quota?.stale?'本次读取未完成，以下为上次观察。':undefined),program:connection?((connection.enabled||Boolean(connection.executable))&&Boolean(connection.configPath)?'ready':'missing'):undefined,loginPending:waiting(login),loginUrl:login?.url?.startsWith('https://')?login.url:undefined,loginMessage,loginChecking:login?.state==='checking',custom:custom&&account.custom?{baseUrl:account.custom.baseUrl,protocol:account.custom.protocol,modelsPath:account.custom.modelsPath,useApiKey:account.custom.useApiKey,models:account.custom.models.map(model=>({...model}))}:undefined};
 });
 const placeholder=missingLegacyPlaceholderSource(accounts);
 if(placeholder)sources.push({...placeholder,accountLabel:'尚未登录',planLabel:'—',status:'not-authenticated',models:[],windows:[],observedLabel:'尚未读取'});
 return sources.sort((left,right)=>compareSourceNames(left.providerLabel,right.providerLabel)||compareSourceNames(left.accountLabel,right.accountLabel)||left.id.localeCompare(right.id));
}
