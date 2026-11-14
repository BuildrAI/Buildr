import { groupQuotaWindows } from './account-quota-view';
import {Fragment,useRef,useState} from 'react';
import {Alert,Button,Checkbox,Dropdown,Empty,Input,InputNumber,Modal,Progress,Select,Space,Switch,Table,Tag,Tabs,Tooltip,type MenuProps} from 'antd';
import {EllipsisOutlined,EyeOutlined,LoginOutlined,PlusOutlined,ReloadOutlined,RobotOutlined,SearchOutlined,ToolOutlined} from '@ant-design/icons';
import {reasoningEffortLabel,sortReasoningEfforts} from './conversation-options';
import {CombinationModelList} from './CombinationModelList';
import {DEFAULT_CUSTOM_MODELS_PATH,upsertCustomModel,type CustomProviderDiscoverInput,type CustomProviderDiscoverResult,type CustomProviderModelInput,type CustomProviderProtocol,type CustomProviderSaveInput} from './custom-provider-model';
import {ModelContextInput} from './ModelContextInput';
import './account-model-manager.css';

export interface ManagedModel {
  id:string;label:string;family:string;contextWindow?:number;contextOverride?:number;reportedContextWindow?:number;images?:boolean;tools?:boolean;enabled:boolean;available:boolean;
  efforts?:Array<{id:string;label:string}>;defaultEffort?:string;preset?:string;modes?:string[];creditFactor?:number;
}
export interface QuotaWindowView {id:string;label:string;remainingPercent:number;resetLabel:string;groupLabel?:string;balanceLabel?:string;}
export interface ManagedAccountActiveConversation {workspaceId:string;conversationId:string;title:string;status:string;}
export interface ManagedAccountImpact {activeConversations:ManagedAccountActiveConversation[];references:number;}
export interface ModelSourceSendGate {state:'open'|'paused';reason?:'account-change'|'account-unconfirmed';diagnostic?:string;}
export interface ModelSourceView {
  id:string;sourceEnabled?:boolean;provider:string;providerLabel:string;agentLabel?:string;vendorLabel?:string;apiKeyHint?:string;billingLabel?:string;exclusiveReason?:string;accountLabel:string;planLabel:string;status:'ready'|'not-authenticated'|'expired'|'failed';
  models:ManagedModel[];combinations?:ManagedModel[];windows:QuotaWindowView[];balanceLabels?:string[];quotaNote?:string;billingUrl?:string;observedLabel:string;diagnostic?:string;loginPending?:boolean;loginChecking?:boolean;loginUrl?:string;loginMessage?:string;program?:'ready'|'missing';
  groupLabel?:string;modeLabel?:string;authType?:'oauth'|'api-key';credentialConfigured?:boolean;managed?:boolean;hostKeyringAuth?:boolean;sendGate?:ModelSourceSendGate;
  custom?:{baseUrl:string;protocol:CustomProviderProtocol;modelsPath?:string;useApiKey:boolean;models:CustomProviderModelInput[]};
}
export type AccountSettingsTab='quota'|'models';
export interface AccountSelection {sourceId:string;tab:AccountSettingsTab;}
interface Props {
  refreshingIds?:string[];
  sources:ModelSourceView[];selection:AccountSelection;busy:boolean;
  onSelect(selection:AccountSelection):void;onRefresh(id:string):void;onLogin(id:string):void;onDisconnect(id:string):void;onPrepare(id:string):void;
  additionalProviders?:Array<{id:string;label:string}>;onAdd?(provider:string):void;
  onAddProvider?():void;onEditProvider?(sourceId:string):void;onDeleteProvider?(sourceId:string):Promise<void>;onDeleteUsage?(sourceId:string):Promise<number>;
  onLogoutManaged?(sourceId:string):Promise<void>;
  onSwitchManagedAccount?(sourceId:string):Promise<void>;
  onManagedAccountImpact?(sourceId:string):Promise<ManagedAccountImpact>;
  onContext(sourceId:string,modelId:string,value:number|null):void;onCancelLogin?(id:string):void;
  onConfigureKey?(id:string,key:string):Promise<void>;
  onCustomSave?(input:CustomProviderSaveInput):Promise<void>;
  onCustomDiscover?(input:CustomProviderDiscoverInput):Promise<CustomProviderDiscoverResult>;
  onCustomModels?(sourceId:string,models:CustomProviderModelInput[]):Promise<void>;
  showDisabled?:boolean;onShowDisabled?(value:boolean):void;onSourceEnabled?(id:string,enabled:boolean):void;
  onEnable(changes:Array<{sourceId:string;modelId:string;enabled:boolean}>):void;
}
const statusLabel={ready:'已登录','not-authenticated':'未登录',expired:'登录已过期',failed:'暂不可用'};
const customStatusLabel={ready:'已连接','not-authenticated':'待配置',expired:'已失效',failed:'暂不可用'};
const sourceStatusLabel=(source:Pick<ModelSourceView,'status'|'authType'|'provider'>)=>source.provider==='custom'
  ?customStatusLabel[source.status]
  :source.authType==='api-key'
    ?({ready:'已连接','not-authenticated':'未配置',expired:'密钥失效',failed:'暂不可用'} as const)[source.status]
    :statusLabel[source.status];
const count=(source:ModelSourceView)=>source.models.filter(model=>model.enabled).length;

/** Shared candidate view. Sources, selection and every operation are supplied by its host. */
export function AccountModelManager({sources,selection,busy,onSelect,onRefresh,onLogin,onDisconnect,onPrepare,onEnable,onContext,onCancelLogin,onConfigureKey,onCustomDiscover,onCustomModels,onAddProvider,onEditProvider,onDeleteProvider,onDeleteUsage,onLogoutManaged,onSwitchManagedAccount,onManagedAccountImpact,refreshingIds=[],showDisabled=false,onShowDisabled,onSourceEnabled}:Props){
  const [query,setQuery]=useState(''),[filter,setFilter]=useState('all'),[family,setFamily]=useState('all');
  const [deleting,setDeleting]=useState<ModelSourceView|null>(null),[deleteBusy,setDeleteBusy]=useState(false),[deleteError,setDeleteError]=useState('');
  const [deleteUsage,setDeleteUsage]=useState<number|undefined>(undefined),[deleteUsageLoaded,setDeleteUsageLoaded]=useState(false),[deleteUsageLoading,setDeleteUsageLoading]=useState(false);
  const deleteUsageToken=useRef(0);
  const [loggingOut,setLoggingOut]=useState<{source:ModelSourceView;mode:'logout'|'switch'}|null>(null),[logoutBusy,setLogoutBusy]=useState(false),[logoutError,setLogoutError]=useState('');
  const [logoutImpact,setLogoutImpact]=useState<ManagedAccountImpact|undefined>(undefined),[logoutImpactLoaded,setLogoutImpactLoaded]=useState(false),[logoutImpactLoading,setLogoutImpactLoading]=useState(false);
  const logoutImpactToken=useRef(0);
  const [keyInputs,setKeyInputs]=useState<Record<string,string>>({}),[keyEditing,setKeyEditing]=useState<Record<string,boolean>>({});
  const [manual,setManual]=useState<{sourceId:string;id:string;label:string;contextWindow?:number}|null>(null);
  const [discovery,setDiscovery]=useState<{sourceId:string;models:CustomProviderModelInput[]}>();
  const [removing,setRemoving]=useState<string>();
  const [readingModels,setReadingModels]=useState(''),[modelNotice,setModelNotice]=useState('');
  const entries=sources.filter(source=>showDisabled||source.sourceEnabled!==false);
  const disabledCount=sources.filter(source=>source.sourceEnabled===false).length;
  const sourceGroups=[
    {key:'subscription',label:'订阅账号',items:entries.filter(source=>!source.managed&&source.provider!=='custom'&&source.authType!=='api-key')},
    {key:'api-key',label:'API Key',items:entries.filter(source=>!source.managed&&source.provider!=='custom'&&source.authType==='api-key')},
    {key:'custom',label:'自定义供应商',items:entries.filter(source=>!source.managed&&source.provider==='custom')},
    {key:'managed',label:'智能体接入',items:entries.filter(source=>source.managed)},
  ].filter(group=>group.items.length);
  function startDelete(source:ModelSourceView){
    setDeleting(source);setDeleteError('');setDeleteUsage(undefined);setDeleteUsageLoaded(false);
    const token=++deleteUsageToken.current;
    if(!onDeleteUsage){setDeleteUsageLoading(false);return;}
    setDeleteUsageLoading(true);
    void onDeleteUsage(source.id).then(value=>{if(token===deleteUsageToken.current){setDeleteUsage(value);setDeleteUsageLoaded(true);}}).catch(()=>{if(token===deleteUsageToken.current)setDeleteUsageLoaded(false);}).finally(()=>{if(token===deleteUsageToken.current)setDeleteUsageLoading(false);});
  }
  function startLogout(source:ModelSourceView,mode:'logout'|'switch'='logout'){
    setLoggingOut({source,mode});setLogoutError('');setLogoutImpact(undefined);setLogoutImpactLoaded(false);
    const token=++logoutImpactToken.current;
    if(!onManagedAccountImpact){setLogoutImpactLoading(false);return;}
    setLogoutImpactLoading(true);
    void onManagedAccountImpact(source.id).then(value=>{if(token===logoutImpactToken.current){setLogoutImpact(value);setLogoutImpactLoaded(true);}}).catch(()=>{if(token===logoutImpactToken.current)setLogoutImpactLoaded(false);}).finally(()=>{if(token===logoutImpactToken.current)setLogoutImpactLoading(false);});
  }
  const selected=entries.find(source=>source.id===selection.sourceId);
  const visible=selected?[selected]:entries;
  const rows=visible.flatMap(source=>source.models.map(model=>({...model,key:source.id+':'+model.id,source})));
  const families=[...new Set(rows.map(row=>row.family))];
  const filtered=rows.filter(row=>(!query||`${row.label} ${row.source.providerLabel}`.toLowerCase().includes(query.toLowerCase()))&&(filter==='all'||row.enabled===(filter==='enabled'))&&(family==='all'||family===row.family));
  const enabled=rows.filter(row=>row.enabled).length;
  const choose=(sourceId:string,tab=selection.tab)=>{setQuery('');setFamily('all');setModelNotice('');onSelect({sourceId,tab});};
  const bulk=(enabled:boolean)=>onEnable(filtered.filter(row=>row.available&&row.source.status==='ready').map(row=>({sourceId:row.source.id,modelId:row.id,enabled})));
  const sidebarDetail=(source:ModelSourceView)=>{
    if(source.provider==='custom')return source.custom?.baseUrl.replace(/^https?:\/\//,'')||source.accountLabel;
    if(source.sendGate?.state==='paused')return source.sendGate.reason==='account-unconfirmed'?'账号待核对':'账号操作中';
    if(source.status!=='ready'){
      const detail=source.status==='failed'&&source.accountLabel&&source.accountLabel!=='尚未登录'&&source.accountLabel!==source.providerLabel?source.accountLabel:sourceStatusLabel(source);
      return source.modeLabel?`${source.modeLabel} · ${detail}`:detail;
    }
    if(source.modeLabel)return [source.modeLabel,source.planLabel!==source.modeLabel?source.planLabel:''].filter(Boolean).join(' · ');
    return entries.filter(item=>item.provider===source.provider).length>1?source.accountLabel:source.planLabel;
  };
  const submitKey=(source:ModelSourceView)=>{
    const key=(keyInputs[source.id]??'').trim();if(!key||!onConfigureKey)return;
    void onConfigureKey(source.id,key).then(()=>{setKeyInputs(current=>({...current,[source.id]:''}));setKeyEditing(current=>({...current,[source.id]:false}));}).catch(()=>{});
  };
  const customEditable=selected?.provider==='custom'&&Boolean(selected.custom)&&Boolean(onCustomModels);
  const candidates=selected&&discovery?.sourceId===selected.id?discovery.models.filter(candidate=>!selected.custom?.models.some(model=>model.id===candidate.id)):[];
  async function saveModels(source:ModelSourceView,models:CustomProviderModelInput[],message:string){
    if(!onCustomModels)return;
    try{await onCustomModels(source.id,models);setModelNotice(message);return true;}
    catch(failure){setModelNotice(failure instanceof Error?failure.message:'模型列表未保存。');return false;}
  }
  async function readModels(source:ModelSourceView){
    if(!onCustomDiscover||!source.custom||readingModels)return;
    setReadingModels(source.id);setModelNotice('');
    try{
      const result=await onCustomDiscover({accountId:source.id,baseUrl:source.custom.baseUrl,protocol:source.custom.protocol,modelsPath:source.custom.modelsPath??DEFAULT_CUSTOM_MODELS_PATH,useApiKey:source.custom.useApiKey});
      setDiscovery({sourceId:source.id,models:result.models});
      setModelNotice(result.diagnostic||(result.models.length?'':'端点没有返回可用的模型列表，请手动添加模型。'));
    }catch(failure){setModelNotice(failure instanceof Error?failure.message:'模型列表读取失败。');}
    finally{setReadingModels('');}
  }
  async function addManualModel(){
    if(!manual||!selected?.custom)return;
    const id=manual.id.trim();if(!id)return;
    const models=upsertCustomModel(selected.custom.models,{id,label:manual.label.trim()||undefined,...(manual.contextWindow!==undefined?{contextWindow:manual.contextWindow}:{})});
    if(await saveModels(selected,models,`已加入 ${id}。`))setManual(null);
  }
  function quota(source:ModelSourceView){
    const items:MenuProps['items']=[];
    const custom=source.provider==='custom';
    const gatePaused=source.sendGate?.state==='paused';
    const canManageHostAuth=Boolean(source.hostKeyringAuth)&&(source.status!=='not-authenticated'||gatePaused);
    if(onSourceEnabled)items.push({key:'source-enabled',label:source.sourceEnabled===false?'重新启用供应商':'停用供应商'});
    const apiKey=source.authType==='api-key';
    if(custom&&onEditProvider){if(items.length)items.push({type:'divider'});items.push({key:'custom-edit',label:'编辑供应商'});}
    if(canManageHostAuth&&onSwitchManagedAccount)items.push({key:'switch-account',label:'切换账号'});
    else if(source.status==='ready'&&!apiKey&&!custom&&!source.hostKeyringAuth)items.push({key:'login',label:'重新登录'});
    if(apiKey&&(source.credentialConfigured||source.status==='ready'))items.push({key:'api-key',label:'更换 API Key'});
    if(source.status!=='not-authenticated'||canManageHostAuth)items.push({key:'disconnect',label:source.managed&&onLogoutManaged?'退出登录':'断开供应商'});
    if(source.program&&!apiKey){if(items.length)items.push({type:'divider'});items.push({key:'program',label:source.program==='ready'?'检查本机程序':'准备本机程序'});}
    if(!source.managed&&!source.id.startsWith('new-')&&onDeleteProvider){if(items.length)items.push({type:'divider'});items.push({key:'delete-source',label:'删除供应商',danger:true});}
    const showKeyEditor=apiKey&&(keyEditing[source.id]||source.status==='not-authenticated'||source.status==='expired'||source.status==='failed'&&!source.credentialConfigured);
    const hasFailedIdentity=source.status==='failed'&&Boolean(source.accountLabel)&&source.accountLabel!=='尚未登录'&&source.accountLabel!==source.providerLabel;
    const showPlanBadge=source.status==='ready'||(hasFailedIdentity&&Boolean(source.planLabel)&&source.planLabel!=='已登录'&&source.planLabel!=='—'&&source.planLabel!==source.accountLabel);
    return <article key={source.id} className="amm-quota-card" data-prototype-position="quota-card">
    <header><div className="amm-account-heading"><span className={`amm-provider-mark is-${source.provider}`}>{source.providerLabel.slice(0,1)}</span><div><h3>{source.providerLabel}{source.sourceEnabled===false&&<Tag>已停用</Tag>}</h3><p>{custom?<span title={source.custom?.baseUrl}>{source.custom?.baseUrl||source.accountLabel}</span>:source.status==='ready'||source.status==='expired'||hasFailedIdentity?source.accountLabel:apiKey?'使用 API Key 连接官方接口':'登录后自动发现模型'} {(showPlanBadge||source.modeLabel)&&<Tag>{source.modeLabel||source.planLabel}</Tag>} {showPlanBadge&&source.modeLabel&&source.planLabel!==source.modeLabel&&<Tag>{source.planLabel}</Tag>}</p></div></div><Space size={6}><Tag color={gatePaused?'processing':source.status==='ready'?'success':'default'}>{gatePaused?(source.sendGate?.reason==='account-unconfirmed'?'账号待核对':'账号操作中'):sourceStatusLabel(source)}</Tag>{(source.status==='ready'||hasFailedIdentity)&&<Button aria-label={custom?`刷新${source.providerLabel}模型与连接`:`刷新${source.providerLabel}额度`} loading={refreshingIds.includes(source.id)} icon={<ReloadOutlined/>} disabled={busy} onClick={()=>onRefresh(source.id)}/>} {!!items.length&&<Dropdown trigger={['click']} menu={{items,onClick:({key})=>key==='source-enabled'?onSourceEnabled?.(source.id,source.sourceEnabled===false):key==='switch-account'?startLogout(source,'switch'):key==='login'?onLogin(source.id):key==='api-key'?setKeyEditing(current=>({...current,[source.id]:true})):key==='custom-edit'?onEditProvider?.(source.id):key==='delete-source'?startDelete(source):key==='disconnect'?(source.managed&&onLogoutManaged?startLogout(source,'logout'):onDisconnect(source.id)):onPrepare(source.id)}}><Button aria-label={`${source.providerLabel}更多操作`} icon={<EllipsisOutlined/>} disabled={busy}/></Dropdown>}</Space></header>
    {gatePaused&&<Alert type={source.sendGate?.reason==='account-unconfirmed'?'warning':'info'} showIcon message={source.sendGate?.reason==='account-unconfirmed'?'账号状态待核对，新发送已暂停':'正在执行账号操作，新发送已暂停'} description={source.sendGate?.diagnostic||'操作完成前该智能体的新发送会暂停，草稿保留。'} action={source.sendGate?.reason==='account-unconfirmed'?<Space size={4}><Button size="small" disabled={busy} onClick={()=>onRefresh(source.id)}>重新核对</Button>{onSwitchManagedAccount&&<Button size="small" disabled={busy} onClick={()=>startLogout(source,'switch')}>切换账号</Button>}{onLogoutManaged&&<Button size="small" danger disabled={busy} onClick={()=>startLogout(source,'logout')}>重试退出</Button>}</Space>:undefined}/>}
    {source.diagnostic&&!gatePaused&&<Alert type={source.status==='failed'?'warning':'info'} showIcon message={source.diagnostic}/>}
    {source.program==='missing'&&<Alert type="info" showIcon message={`${source.providerLabel} 需要先准备本机程序，登录与模型发现才会生效。`} action={<Button size="small" onClick={()=>onPrepare(source.id)}>准备本机程序</Button>}/>}
    {source.loginPending?<div className="amm-login-empty"><LoginOutlined/><div><strong>{source.loginChecking?'正在核对登录结果':'正在等待官方登录'}</strong><p>{source.loginMessage||'完成登录后自动发现模型与额度。'}</p></div>{source.loginUrl&&<Button href={source.loginUrl} target="_blank" rel="noopener noreferrer">打开登录页</Button>}{onCancelLogin&&<Button onClick={()=>onCancelLogin(source.id)}>取消登录</Button>}</div>:showKeyEditor?<div className="amm-api-key-editor"><strong>{source.credentialConfigured?'更换 API Key':'连接 '+source.providerLabel}</strong><p>只保存 API Key，固定使用 {source.vendorLabel||source.providerLabel} 官方 API，不需要填写 URL。</p><Space.Compact block><Input.Password aria-label={`${source.providerLabel} API Key`} placeholder={source.apiKeyHint||'sk-...'} autoComplete="new-password" value={keyInputs[source.id]??''} disabled={busy} onChange={event=>setKeyInputs(current=>({...current,[source.id]:event.target.value}))}/><Button type="primary" disabled={busy||!onConfigureKey||!(keyInputs[source.id]??'').trim()} onClick={()=>submitKey(source)}>{source.credentialConfigured?'更换并验证':'保存并验证'}</Button>{source.status==='ready'&&<Button disabled={busy} onClick={()=>setKeyEditing(current=>({...current,[source.id]:false}))}>取消</Button>}</Space.Compact>{source.status!=='ready'&&onRefresh&&<Button type="link" size="small" disabled={busy||!source.credentialConfigured} onClick={()=>onRefresh(source.id)}>重新读取已有密钥</Button>}</div>:custom&&source.status!=='ready'?<div className="amm-login-empty"><LoginOutlined/><div><strong>{source.status==='failed'?'端点检查未完成，可核对配置后重试':'填写端点信息后接入自定义模型'}</strong><p>使用 {source.modeLabel||'OpenAI 兼容'} 协议；模型可从端点获取或手动添加。</p></div><Space><Button type="primary" disabled={busy||!onEditProvider} onClick={()=>onEditProvider?.(source.id)}>编辑供应商</Button>{source.status==='failed'&&<Button disabled={busy} onClick={()=>onRefresh(source.id)}>重新检查</Button>}</Space></div>:source.status!=='ready'&&!(source.status==='failed'&&(source.windows.length||source.balanceLabels?.length))?<div className="amm-login-empty"><LoginOutlined/><div><strong>{source.status==='failed'?(hasFailedIdentity?`当前状态：${source.accountLabel}`:'本次读取未完成，可重新读取'):source.status==='expired'?'登录已过期，重新登录后继续使用':'连接供应商，自动发现模型与额度'}</strong><p>{apiKey?'API Key 已保存，本次暂未读取到模型。':source.exclusiveReason||'一次登录，即可供不同智能体选择使用。'}</p></div><Space><Button type="primary" onClick={()=>source.program==='missing'?onPrepare(source.id):source.status==='failed'||apiKey?onRefresh(source.id):onLogin(source.id)} disabled={busy}>{source.program==='missing'?'准备本机程序':source.status==='failed'||apiKey?'重新读取':source.status==='expired'?'重新登录':'登录 '+source.providerLabel}</Button>{source.status==='failed'&&canManageHostAuth&&onSwitchManagedAccount&&<Button disabled={busy} onClick={()=>startLogout(source,'switch')}>切换账号</Button>}</Space></div>:<>
    <div className="amm-quota-windows">{source.balanceLabels?.length?<div className="amm-quota-balances">{source.balanceLabels.map((label,index)=><p key={index}>{label}</p>)}</div>:null}{source.windows.length?groupQuotaWindows(source.windows).map(([label,windows])=><div className="amm-quota-group" key={label??'windows'}>{label&&<h4>{label}</h4>}{windows.map(window=><section key={window.id}><div className="amm-window-head"><span>{window.label}</span><strong>剩余 {window.remainingPercent}%</strong></div><Progress percent={window.remainingPercent} showInfo={false} strokeColor={window.remainingPercent>25?'var(--primary)':'#b77b35'}/><div className="amm-window-foot"><span>{window.resetLabel}</span>{window.balanceLabel&&<span>{window.balanceLabel}</span>}</div></section>)}</div>):!source.balanceLabels?.length?<div className="amm-quota-unknown"><span>额度暂不可读</span><p>{source.quotaNote||'平台没有返回可展示的额度，模型仍可正常使用。'}</p>{source.billingUrl&&<Button type="link" size="small" href={source.billingUrl} target="_blank" rel="noopener noreferrer">{source.billingLabel||'打开账单页面'}</Button>}</div>:null}</div>
    {source.provider==='google-ai-subscription'&&source.models.length>0&&<div className="amm-google-ai-models" aria-label="Google AI 模型">{source.models.filter(model=>model.enabled).map(model=><Tag key={model.id}>{model.label}</Tag>)}</div>}
    <footer><span>{custom?'自定义端点':apiKey?'API Key 供应商':source.exclusiveReason?'专属智能体账号':'共享额度'} · {source.observedLabel}</span><Button type="link" onClick={()=>choose(source.id,'models')}>管理模型 {count(source)} / {source.models.length}</Button></footer></>}
  </article>;
  }
  return <><div className="account-model-manager">
    <aside className="amm-source-list" aria-label="供应商" data-prototype-position="account-sources">
      <div className="amm-source-heading"><p className="amm-nav-caption">供应商</p></div>
      {onAddProvider&&<div className="amm-add-provider"><Button block icon={<PlusOutlined aria-hidden="true"/>} disabled={busy} onClick={onAddProvider}>添加供应商</Button></div>}
      {onShowDisabled&&<Checkbox className="amm-show-disabled" checked={showDisabled} onChange={event=>onShowDisabled(event.target.checked)}>显示已停用{disabledCount?` (${disabledCount})`:''}</Checkbox>}
      <button className={!selected?'active':''} onClick={()=>choose('all')}><span className="amm-provider-mark all"><RobotOutlined aria-hidden/></span><span>全部供应商</span></button>
      {sourceGroups.map(group=><Fragment key={group.key}><p className="amm-source-group-label">{group.label}</p>{group.items.map(source=><button key={source.id} className={selection.sourceId===source.id?'active':''} onClick={()=>choose(source.id)}><span className={`amm-provider-mark is-${source.provider}`}>{source.providerLabel.slice(0,1)}</span><span>{source.providerLabel}<small title={source.provider==='custom'?source.custom?.baseUrl??source.accountLabel:source.accountLabel}>{sidebarDetail(source)}</small></span><i className={source.status==='ready'?'connected':'disconnected'} aria-label={sourceStatusLabel(source)}/></button>)}</Fragment>)}
      {!sourceGroups.length&&<p className="amm-source-empty">暂无供应商</p>}
      <div className="amm-nav-note">登录一次<br/>模型供不同智能体使用</div>
    </aside>
    <main className="amm-main">
      <div className="amm-main-heading"><div><h2>{selected?.providerLabel||'全部供应商'}</h2><p>{selected?selected.provider==='custom'?selected.custom?.baseUrl||'自定义模型端点':selected.authType==='api-key'?(selected.status==='ready'?`${selected.accountLabel} · API Key`:`使用 API Key 连接 ${selected.vendorLabel||selected.providerLabel} 官方 API`):selected.status==='ready'?`${selected.accountLabel} · ${selected.planLabel}`:'登录后自动同步模型与额度':'集中管理登录、套餐额度和可选模型'}</p></div><Space size={4}>{selected?.provider==='custom'&&onEditProvider&&<Button onClick={()=>onEditProvider(selected.id)}>编辑接入</Button>}<Button icon={<ReloadOutlined/>} loading={busy||refreshingIds.some(id=>!selected||id===selected.id)} onClick={()=>onRefresh(selected?.id||'all')}>刷新</Button></Space></div>
      <Tabs className="amm-tabs" activeKey={selection.tab} onChange={tab=>onSelect({...selection,tab:tab as AccountSettingsTab})} items={[{key:'quota',label:'账号与额度'},{key:'models',label:<span>模型 <span className="amm-tab-count">{enabled}/{rows.length}</span></span>}]}/>
      <div className="amm-content">
      {selection.tab==='quota'&&<><p className="amm-section-description">{selected?.provider==='custom'?'自定义供应商没有额度接口，Buildr 不推断余额。':selected?.authType==='api-key'?`API Key 模式的费用与额度由 ${selected.vendorLabel||selected.providerLabel} 账户管理，Buildr 不推断套餐余额。`:selected?.exclusiveReason||'登录后在这里查看供应商共享额度，模型有独立限额时单独显示。'}</p>{visible.map(quota)}</>}
      {selection.tab==='models'&&<section data-prototype-position="model-visibility">
        {customEditable&&selected&&<div className="amm-model-actions">
          <Button size="small" icon={<ReloadOutlined/>} loading={readingModels===selected.id} disabled={busy} onClick={()=>void readModels(selected)}>读取模型列表</Button>
          <Button size="small" icon={<PlusOutlined/>} disabled={busy} onClick={()=>setManual({sourceId:selected.id,id:'',label:''})}>手动添加模型</Button>
          {!!selected.custom?.models.length&&<Button size="small" disabled={busy} onClick={()=>setRemoving('')}>移除模型</Button>}
        </div>}
        {customEditable&&selected&&candidates.length>0&&<Space wrap className="amm-model-actions">
          {candidates.map(model=><Button key={model.id} size="small" disabled={busy} onClick={()=>void saveModels(selected,upsertCustomModel(selected.custom!.models,model),'已加入模型。')}>加入 {model.label||model.id}</Button>)}
          <Button size="small" disabled={busy} onClick={()=>void saveModels(selected,candidates.reduce(upsertCustomModel,selected.custom!.models),'已加入候选模型。')}>全部加入</Button>
        </Space>}
        {modelNotice&&<Alert className="amm-model-notice" type="info" showIcon closable message={modelNotice} onClose={()=>setModelNotice('')}/>}
        <div className="amm-model-toolbar"><Input prefix={<SearchOutlined aria-hidden/>} aria-label="搜索模型" placeholder="搜索模型名称" value={query} allowClear onChange={e=>setQuery(e.target.value)}/><Select aria-label="启用状态" value={filter} onChange={value=>{setFilter(value);}} options={[{value:'all',label:'全部模型'},{value:'enabled',label:'已启用'},{value:'disabled',label:'未启用'}]}/><Select aria-label="模型系列" value={family} onChange={value=>{setFamily(value);}} options={[{value:'all',label:'全部系列'},...families.map(value=>({value,label:value}))]}/></div>
        <div className="amm-model-summary"><span><strong>已启用 {enabled}</strong> / {rows.length}<span className="amm-divider-dot">·</span>仅已启用的模型出现在对话中</span><Space size={4}><Button size="small" disabled={busy||!filtered.some(row=>row.available&&row.source.status==='ready')} onClick={()=>bulk(true)}>{query||filter!=='all'||family!=='all'?'启用筛选结果':'全部启用'}</Button><Button size="small" disabled={busy||!filtered.some(row=>row.available&&row.source.status==='ready')} onClick={()=>bulk(false)}>{query||filter!=='all'||family!=='all'?'停用筛选结果':'全部停用'}</Button></Space></div>
        <Table className="amm-model-table" size="small" rowKey="key" dataSource={filtered} pagination={false} sticky locale={{emptyText:<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={query?'没有匹配的模型':'当前筛选下没有模型'}/>}} columns={[
          {title:'模型',key:'name',render:(_,row)=><div className="amm-model-name"><strong>{row.label}</strong><div><span>{row.source.providerLabel}</span>{row.images&&<Tooltip title="支持图片"><EyeOutlined aria-label="支持图片"/></Tooltip>}{row.tools&&<Tooltip title="支持工具调用"><ToolOutlined aria-label="支持工具调用"/></Tooltip>}{row.modes&&<span>{row.modes.join(' / ')}</span>}{row.creditFactor!==undefined&&<Tooltip title="每请求 credit 系数"><span>{row.creditFactor.toFixed(2)}x</span></Tooltip>}{row.efforts?.length?<Tooltip title={sortReasoningEfforts(row.efforts).map(reasoningEffortLabel).join(' · ')}><span>{row.efforts.length} 个思考档位</span></Tooltip>:row.preset&&<span>{row.preset}</span>}{!row.available&&<Tag>平台不可用</Tag>}</div></div>},
          {title:'上下文窗口',key:'context',width:152,render:(_,row)=><ModelContextInput label={row.label} value={row.contextWindow} override={row.contextOverride} reported={row.reportedContextWindow} disabled={busy} onSave={value=>onContext(row.source.id,row.id,value)}/>},
          {title:'启用',key:'enabled',width:66,align:'right',render:(_,row)=><Switch checked={row.enabled} disabled={busy||!row.available||row.source.status!=='ready'} aria-label={`${row.enabled?'停用':'启用'} ${row.label}`} onChange={enabled=>onEnable([{sourceId:row.source.id,modelId:row.id,enabled}])}/>},
        ]}/>
        {visible.some(source=>source.combinations?.length)&&<CombinationModelList sources={visible} busy={busy} onEnable={onEnable} onContext={onContext}/>}

        <p className="amm-footnote">开关即时保存。刷新保留你的选择，新发现的模型默认停用；已开始的任务继续执行。</p>
      </section>}
      </div>
    </main>
  </div>
  <Modal title="移除模型" open={removing!==undefined&&Boolean(customEditable)} okText="移除" cancelText="取消"
    okButtonProps={{danger:true,disabled:!removing}} confirmLoading={busy} onCancel={()=>setRemoving(undefined)} onOk={async()=>{
      if(selected?.custom&&removing&&await saveModels(selected,selected.custom.models.filter(model=>model.id!==removing),'已移除模型。'))setRemoving(undefined);
    }}>
    <Select aria-label="选择要移除的模型" placeholder="选择要移除的模型" value={removing||undefined} onChange={setRemoving}
      options={selected?.custom?.models.map(model=>({value:model.id,label:model.label||model.id}))} style={{width:'100%'}}/>
  </Modal>
  <Modal title="手动添加模型"  open={Boolean(manual)} okText="添加" cancelText="取消" confirmLoading={busy} onCancel={()=>setManual(null)} onOk={()=>void addManualModel()}>
    <p className="amm-manual-hint">模型 ID 会原样发送给端点；新模型默认停用。</p>
    <Space direction="vertical" size={10} style={{width:'100%'}}>
      <Input aria-label="模型 ID" placeholder="模型 ID，例如 my-model-v2" value={manual?.id??''} disabled={busy} onChange={event=>setManual(current=>current?{...current,id:event.target.value}:current)}/>
      <Input aria-label="模型显示名" placeholder="显示名（可选）" value={manual?.label??''} disabled={busy} onChange={event=>setManual(current=>current?{...current,label:event.target.value}:current)}/>
      <InputNumber aria-label="上下文窗口" placeholder="上下文窗口（可选）" min={1} max={10000000} style={{width:'100%'}} value={manual?.contextWindow??null} disabled={busy} onChange={value=>setManual(current=>current?{...current,contextWindow:typeof value==='number'?value:undefined}:current)}/>
    </Space>
  </Modal>
  <Modal title="删除供应商" open={Boolean(deleting)} okText="删除" cancelText="取消" okButtonProps={{danger:true}} confirmLoading={deleteBusy}
    onCancel={()=>{if(!deleteBusy){setDeleting(null);setDeleteError('');}}}
    onOk={async()=>{
      if(!deleting||!onDeleteProvider)return;
      setDeleteBusy(true);setDeleteError('');
      try{await onDeleteProvider(deleting.id);setDeleting(null);}
      catch(failure){setDeleteError(failure instanceof Error?failure.message:'供应商删除未完成。');}
      finally{setDeleteBusy(false);}
    }}>
    {deleting&&<><p>确定删除「{deleting.providerLabel}」？删除后将同时清理：</p>
      <ul className="amm-delete-summary">
        <li>{deleting.authType==='api-key'?'本机保存的 API Key':deleting.provider==='custom'?'自定义端点配置与密钥（如有）':'本机保存的登录凭据'}</li>
        <li>模型列表、启用状态与上下文偏好</li>
      </ul>
      {deleteUsageLoading?<p className="amm-delete-usage">正在统计仍在使用此供应商的对话…</p>:deleteUsageLoaded&&deleteUsage?<Alert className="amm-delete-impact" type="warning" showIcon message={`有 ${deleteUsage} 个对话正在使用此供应商`} description="对话内容会保留；下次发送时这些对话需要重新选择模型。"/>:deleteUsageLoaded?<p className="amm-delete-usage">当前没有对话使用此供应商。</p>:<p className="amm-delete-usage">仍在引用此供应商的对话会保留，下次发送时需要重新选择模型。</p>}
      <p className="amm-delete-warning">此操作不可撤销，不会删除服务商账号、订阅或远端数据。</p></>}
    {deleteError&&<Alert type="warning" showIcon message={deleteError}/>}
  </Modal>
  <Modal title={loggingOut?.mode==='switch'?'切换账号':'退出登录'} open={Boolean(loggingOut)} okText={loggingOut?.mode==='switch'?'退出并发起新登录':'退出登录'} cancelText="取消" okButtonProps={{danger:loggingOut?.mode!=='switch'}} confirmLoading={logoutBusy}
    onCancel={()=>{if(!logoutBusy){setLoggingOut(null);setLogoutError('');}}}
    onOk={async()=>{
      if(!loggingOut)return;
      const handler=loggingOut.mode==='switch'?onSwitchManagedAccount:onLogoutManaged;
      if(!handler)return;
      setLogoutBusy(true);setLogoutError('');
      try{await handler(loggingOut.source.id);setLoggingOut(null);}
      catch(failure){setLogoutError(failure instanceof Error?failure.message:(loggingOut.mode==='switch'?'切换账号未完成。':'退出登录未完成。'));}
      finally{setLogoutBusy(false);}
    }}>
    {loggingOut&&<><p>{loggingOut.mode==='switch'?`退出当前「${loggingOut.source.providerLabel}」并登录其他账号？`:`退出「${loggingOut.source.providerLabel}」的本机登录？`}</p>
      {logoutImpactLoading?<p className="amm-delete-usage">正在检查运行中的对话…</p>:logoutImpactLoaded&&logoutImpact?.activeConversations.length?<Alert className="amm-delete-impact" type="warning" showIcon message={`将先停止 ${logoutImpact.activeConversations.length} 个正在运行的对话`} description={<ul className="amm-delete-summary">{logoutImpact.activeConversations.map(item=><li key={item.workspaceId+':'+item.conversationId}>{item.title||item.conversationId}</li>)}</ul>}/>:logoutImpactLoaded?<p className="amm-delete-usage">当前没有正在运行的对话。</p>:null}
      {loggingOut.source.hostKeyringAuth&&<Alert className="amm-delete-impact" type="info" showIcon message="同时影响本机命令行登录" description={`此操作通过受管程序更新当前系统用户密钥环中的登录凭据，本机共享同一密钥环的 ${loggingOut.source.agentLabel||loggingOut.source.providerLabel} 命令行（如 agy）登录状态也会同步${loggingOut.mode==='switch'?'切换':'退出'}；期间新发送会暂停，草稿与历史记录保留。`}/>}
      <p className="amm-delete-usage">{loggingOut.mode==='switch'?'原账号下的历史对话会保留，切换完成后不会自动复用原原生会话，下次发送前需确认新账号模型。':'退出后该智能体程序会断开，使用此供应商的对话会保留，但下一次发送前需要重新登录或选择其他模型。'}</p></>}
    {logoutError&&<Alert type="warning" showIcon message={logoutError}/>}
  </Modal></>;
}
