import {useMemo,useState} from 'react';
import {Alert,Button,Dropdown,Empty,Input,Progress,Select,Space,Switch,Table,Tag,Tabs,Tooltip,type MenuProps} from 'antd';
import {EllipsisOutlined,EyeOutlined,LoginOutlined,ReloadOutlined,RobotOutlined,SearchOutlined,ToolOutlined} from '@ant-design/icons';
import {reasoningEffortLabel,sortReasoningEfforts} from './conversation-options';
import {CombinationModelList} from './CombinationModelList';
import {ModelContextInput} from './ModelContextInput';
import './account-model-manager.css';

export interface ManagedModel {
  id:string;label:string;family:string;contextWindow?:number;contextOverride?:number;reportedContextWindow?:number;images?:boolean;tools?:boolean;enabled:boolean;available:boolean;
  efforts?:Array<{id:string;label:string}>;defaultEffort?:string;preset?:string;modes?:string[];
}
export interface QuotaWindowView {id:string;label:string;remainingPercent:number;resetLabel:string;balanceLabel?:string;}
export interface ModelSourceView {
  id:string;provider:string;providerLabel:string;accountLabel:string;planLabel:string;status:'ready'|'not-authenticated'|'expired'|'failed';
  models:ManagedModel[];combinations?:ManagedModel[];windows:QuotaWindowView[];quotaNote?:string;observedLabel:string;diagnostic?:string;loginPending?:boolean;loginUrl?:string;loginMessage?:string;program?:'ready'|'missing';
}
export type AccountSettingsTab='quota'|'models';
export interface AccountSelection {sourceId:string;tab:AccountSettingsTab;}
interface Props {
  refreshingIds?:string[];
  sources:ModelSourceView[];selection:AccountSelection;busy:boolean;
  onSelect(selection:AccountSelection):void;onRefresh(id:string):void;onLogin(id:string):void;onDisconnect(id:string):void;onPrepare(id:string):void;
  additionalProviders?:Array<{id:string;label:string}>;onAdd?(provider:string):void;
  onContext(sourceId:string,modelId:string,value:number|null):void;onCancelLogin?(id:string):void;
  onEnable(changes:Array<{sourceId:string;modelId:string;enabled:boolean}>):void;
}
const statusLabel={ready:'已登录','not-authenticated':'未登录',expired:'登录已过期',failed:'暂不可用'};
const count=(source:ModelSourceView)=>source.models.filter(model=>model.enabled).length;

/** Shared candidate view. Sources, selection and every operation are supplied by its host. */
export function AccountModelManager({sources,selection,busy,onSelect,onRefresh,onLogin,onDisconnect,onPrepare,onEnable,onContext,onCancelLogin,additionalProviders,onAdd,refreshingIds=[]}:Props){
  const [query,setQuery]=useState(''),[filter,setFilter]=useState('all'),[family,setFamily]=useState('all');
  const selected=sources.find(source=>source.id===selection.sourceId);
  const visible=selected?[selected]:sources;
  const rows=useMemo(()=>visible.flatMap(source=>source.models.map(model=>({...model,key:source.id+':'+model.id,source}))),[sources,selection.sourceId]);
  const families=[...new Set(rows.map(row=>row.family))];
  const filtered=rows.filter(row=>(!query||`${row.label} ${row.source.providerLabel}`.toLowerCase().includes(query.toLowerCase()))&&(filter==='all'||row.enabled===(filter==='enabled'))&&(family==='all'||family===row.family));
  const enabled=rows.filter(row=>row.enabled).length;
  const choose=(sourceId:string,tab=selection.tab)=>{setQuery('');setFamily('all');onSelect({sourceId,tab});};
  const updateQuery=(value:string)=>{setQuery(value);};
  const bulk=(enabled:boolean)=>onEnable(filtered.filter(row=>row.available&&row.source.status==='ready').map(row=>({sourceId:row.source.id,modelId:row.id,enabled})));
  function quota(source:ModelSourceView){
    const items:MenuProps['items']=[];
    if(source.status==='ready')items.push({key:'login',label:'重新登录'});
    if(source.status!=='not-authenticated')items.push({key:'disconnect',label:'断开账号'});
    if(source.program){if(items.length)items.push({type:'divider'});items.push({key:'program',label:source.program==='ready'?'检查本机程序':'准备本机程序'});}
    return <article key={source.id} className="amm-quota-card" data-prototype-position="quota-card">
    <header><div className="amm-account-heading"><span className={`amm-provider-mark is-${source.provider}`}>{source.providerLabel.slice(0,1)}</span><div><h3>{source.providerLabel}</h3><p>{source.status==='ready'||source.status==='expired'?source.accountLabel:'登录后自动发现模型'} {source.status==='ready'&&<Tag>{source.planLabel}</Tag>}</p></div></div><Space size={6}><Tag color={source.status==='ready'?'success':'default'}>{statusLabel[source.status]}</Tag>{source.status==='ready'&&<Button aria-label={`刷新${source.providerLabel}额度`} loading={refreshingIds.includes(source.id)} icon={<ReloadOutlined/>} disabled={busy} onClick={()=>onRefresh(source.id)}/>} {!!items.length&&<Dropdown trigger={['click']} menu={{items,onClick:({key})=>key==='login'?onLogin(source.id):key==='disconnect'?onDisconnect(source.id):onPrepare(source.id)}}><Button aria-label={`${source.providerLabel}更多操作`} icon={<EllipsisOutlined/>} disabled={busy}/></Dropdown>}</Space></header>
    {source.diagnostic&&<Alert type={source.status==='failed'?'warning':'info'} showIcon message={source.diagnostic}/>}
    {source.loginPending?<div className="amm-login-empty"><LoginOutlined/><div><strong>正在等待官方登录</strong><p>{source.loginMessage||'完成登录后自动发现模型与额度。'}</p></div>{source.loginUrl&&<Button href={source.loginUrl} target="_blank" rel="noopener noreferrer">打开登录页</Button>}{onCancelLogin&&<Button onClick={()=>onCancelLogin(source.id)}>取消登录</Button>}</div>:source.status!=='ready'&&!(source.status==='failed'&&source.windows.length)?<div className="amm-login-empty"><LoginOutlined/><div><strong>{source.status==='failed'?'本次读取未完成，可重新读取':source.status==='expired'?'登录已过期，重新登录后继续使用':'连接账号，自动发现模型与额度'}</strong><p>一次登录，即可供不同智能体选择使用。</p></div><Button type="primary" onClick={()=>source.status==='failed'?onRefresh(source.id):onLogin(source.id)} disabled={busy}>{source.status==='failed'?'重新读取':source.status==='expired'?'重新登录':'登录 '+source.providerLabel}</Button></div>:<>
    <div className="amm-quota-windows">{source.windows.length?source.windows.map(window=><section key={window.id}><div className="amm-window-head"><span>{window.label}</span><strong>剩余 {window.remainingPercent}%</strong></div><Progress percent={window.remainingPercent} showInfo={false} strokeColor={window.remainingPercent>25?'var(--primary)':'#b77b35'}/><div className="amm-window-foot"><span>{window.resetLabel}</span>{window.balanceLabel&&<span>{window.balanceLabel}</span>}</div></section>):<div className="amm-quota-unknown"><span>额度暂不可读</span><p>{source.quotaNote||'平台没有返回可展示的额度，模型仍可正常使用。'}</p></div>}</div>
    <footer><span>账号共享额度 · {source.observedLabel}</span><Button type="link" onClick={()=>choose(source.id,'models')}>管理模型 {count(source)} / {source.models.length}</Button></footer></>}
  </article>;}
  return <div className="account-model-manager">
    <aside className="amm-source-list" aria-label="账号来源" data-prototype-position="account-sources">
      <p className="amm-nav-caption">账号来源</p>
      <button className={selection.sourceId==='all'?'active':''} onClick={()=>choose('all')}><span className="amm-provider-mark all"><RobotOutlined aria-hidden/></span><span>全部来源</span></button>
      {sources.map(source=><button key={source.id} className={selection.sourceId===source.id?'active':''} onClick={()=>choose(source.id)}><span className={`amm-provider-mark is-${source.provider}`}>{source.providerLabel.slice(0,1)}</span><span>{source.providerLabel}<small title={source.accountLabel}>{source.status==='ready'?(sources.filter(item=>item.provider===source.provider).length>1?source.accountLabel:source.planLabel):statusLabel[source.status]}</small></span><i className={source.status==='ready'?'connected':'disconnected'} aria-label={statusLabel[source.status]}/></button>)}
      <div className="amm-nav-note">账号登录一次<br/>模型供不同智能体使用</div>
    </aside>
    <main className="amm-main">
      <div className="amm-main-heading"><div><h2>{selected?.providerLabel||'全部账号'}</h2><p>{selected?selected.status==='ready'?`${selected.accountLabel} · ${selected.planLabel}`:'登录后自动同步模型与额度':'集中管理登录、套餐额度和可选模型'}</p></div><Space size={4}><Button icon={<ReloadOutlined/>} loading={busy||refreshingIds.some(id=>!selected||id===selected.id)} onClick={()=>onRefresh(selected?.id||'all')}>刷新</Button>{onAdd&&!!additionalProviders?.length&&<Dropdown trigger={['click']} menu={{items:additionalProviders.map(provider=>({key:provider.id,label:'添加 '+provider.label})),onClick:({key})=>onAdd(key)}}><Button aria-label="添加额外账号" icon={<EllipsisOutlined/>} disabled={busy}/></Dropdown>}</Space></div>
      <Tabs className="amm-tabs" activeKey={selection.tab} onChange={tab=>onSelect({...selection,tab:tab as AccountSettingsTab})} items={[{key:'quota',label:'账号与额度'},{key:'models',label:<span>模型 <span className="amm-tab-count">{enabled}/{rows.length}</span></span>}]}/>
      <div className="amm-content">
      {selection.tab==='quota'&&<><p className="amm-section-description">登录后在这里查看账号共享额度，模型有独立限额时单独显示。</p>{visible.map(quota)}</>}
      {selection.tab==='models'&&<section data-prototype-position="model-visibility">
        <div className="amm-model-toolbar"><Input prefix={<SearchOutlined aria-hidden/>} aria-label="搜索模型" placeholder="搜索模型名称" value={query} allowClear onChange={e=>updateQuery(e.target.value)}/><Select aria-label="启用状态" value={filter} onChange={value=>{setFilter(value);}} options={[{value:'all',label:'全部模型'},{value:'enabled',label:'已启用'},{value:'disabled',label:'未启用'}]}/><Select aria-label="模型系列" value={family} onChange={value=>{setFamily(value);}} options={[{value:'all',label:'全部系列'},...families.map(value=>({value,label:value}))]}/></div>
        <div className="amm-model-summary"><span><strong>已启用 {enabled}</strong> / {rows.length}<span className="amm-divider-dot">·</span>仅已启用的模型出现在对话中</span><Space size={4}><Button size="small" disabled={busy||!filtered.some(row=>row.available&&row.source.status==='ready')} onClick={()=>bulk(true)}>{query||filter!=='all'||family!=='all'?'启用筛选结果':'全部启用'}</Button><Button size="small" disabled={busy||!filtered.some(row=>row.available&&row.source.status==='ready')} onClick={()=>bulk(false)}>{query||filter!=='all'||family!=='all'?'停用筛选结果':'全部停用'}</Button></Space></div>
        <Table className="amm-model-table" size="small" rowKey="key" dataSource={filtered} pagination={false} sticky locale={{emptyText:<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={query?'没有匹配的模型':'当前筛选下没有模型'}/>}} columns={[
          {title:'模型',key:'name',render:(_,row)=><div className="amm-model-name"><strong>{row.label}</strong><div><span>{row.source.providerLabel}</span>{row.images&&<Tooltip title="支持图片"><EyeOutlined aria-label="支持图片"/></Tooltip>}{row.tools&&<Tooltip title="支持工具调用"><ToolOutlined aria-label="支持工具调用"/></Tooltip>}{row.modes&&<span>{row.modes.join(' / ')}</span>}{row.efforts?.length?<Tooltip title={sortReasoningEfforts(row.efforts).map(reasoningEffortLabel).join(' · ')}><span>{row.efforts.length} 个思考档位</span></Tooltip>:row.preset&&<span>{row.preset}</span>}{!row.available&&<Tag>平台不可用</Tag>}</div></div>},
          {title:'上下文窗口',key:'context',width:152,render:(_,row)=><ModelContextInput label={row.label} value={row.contextWindow} override={row.contextOverride} reported={row.reportedContextWindow} disabled={busy} onSave={value=>onContext(row.source.id,row.id,value)}/>},
          {title:'启用',key:'enabled',width:66,align:'right',render:(_,row)=><Switch checked={row.enabled} disabled={busy||!row.available||row.source.status!=='ready'} aria-label={`${row.enabled?'停用':'启用'} ${row.label}`} onChange={enabled=>onEnable([{sourceId:row.source.id,modelId:row.id,enabled}])}/>},
        ]}/>
        {visible.some(source=>source.combinations?.length)&&<CombinationModelList sources={visible} busy={busy} onEnable={onEnable} onContext={onContext}/>}

        <p className="amm-footnote">开关即时保存。刷新保留你的选择，新发现的模型默认停用；已开始的任务继续执行。</p>
      </section>}
      </div>
    </main>
  </div>;
}
