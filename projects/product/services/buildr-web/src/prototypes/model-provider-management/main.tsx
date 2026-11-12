import {useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import {App,Alert,Button,ConfigProvider,Input,Tag} from 'antd';
import zhCN from 'antd/locale/zh_CN';
import {HomeOutlined,PlusOutlined,RobotOutlined,SettingOutlined,SafetyCertificateOutlined,UnorderedListOutlined} from '@ant-design/icons';
import {AppShellHeader,AppShellFrame} from '../../app/AppShellView';
import {AppNavigationItem} from '../../app/AppNavigationItem';
import {PageTabStrip} from '../../app/PageTabStrip';
import {DrawerShell} from '../../components/DrawerShell';
import type {ProviderConnection} from './ProviderConnectionDrawer';
import {ProviderPreviewContext,type ModelEntry,type PreviewSource} from './ProviderWorkspace';
import {balanceLines,OPENAI_BILLING_URL} from '../../features/agent-conversations/account-quota-view';
import {type AccountSelection} from '../../features/agent-conversations/AccountModelManager';
import {ConversationAgentSelect,ConversationOptions} from '../../features/agent-conversations/ConversationOptions';
import {AgentModelSetup,type SetupExecutor} from '../../features/agent-conversations/AgentModelSetup';
import type {ConversationChoice} from '../../features/agent-conversations/conversation-options';
import {softProductTheme} from '../../theme';
import {usePrototypeBridge} from '../prototype-bridge';
import {fixtures,catalog,connections} from './fixtures';
import scenes from './scenes.json';
import 'antd/dist/reset.css';
import '../../styles.css';
import '../../features/agent-conversations/agent-conversations.css';
import '../../features/agent-conversations/conversation-dock.css';
import './preview.css';

const accountFixtures=():PreviewSource[]=>{
 const rows=fixtures().map(({program:_,...source})=>({...source,observedLabel:source.status==='ready'?'10 分钟前':source.observedLabel,providerLabel:source.id==='codex'?'ChatGPT':source.id==='dsh'?'DeepSeek Harness':source.providerLabel}));
 return [...rows,{...rows.find(source=>source.id==='qoder')!,id:'qoder-cn',provider:'qoder-cn',providerLabel:'Qoder CN',sourceEnabled:false}];
};
const defaultSelection:AccountSelection={sourceId:'all',tab:'quota'};
const initialChoice:ConversationChoice={connectionId:'codex',modelAccountId:'devin',modelAccountIdentity:'demo-devin',modelAccountRevision:'demo',model:'gpt-sol'};
function Preview(){
 const {message}=App.useApp();
 const [sources,setSources]=useState(accountFixtures),[selection,setSelection]=useState<AccountSelection>(defaultSelection);
 const [drawer,setDrawer]=useState(true),[collapsed,setCollapsed]=useState(false),[busy,setBusy]=useState(false);
 const [choice,setChoice]=useState(initialChoice),[scene,setScene]=useState({page:'accounts',state:''});
 const [generation,setGeneration]=useState(0),[showDisabled,setShowDisabled]=useState(false);
 const nextCustomId=useRef(0);
 const [editId,setEditId]=useState<string>();
 const [executors,setExecutors]=useState<SetupExecutor[]>([{id:'codex',label:'Codex',prepared:true},{id:'qoder',label:'Qoder',prepared:true},{id:'dsh',label:'DSH',prepared:false}]);
 const [refreshingIds,setRefreshingIds]=useState<string[]>([]);const refreshTimers=useRef<ReturnType<typeof setTimeout>[]>([]);
 useEffect(()=>()=>refreshTimers.current.forEach(clearTimeout),[]);
 const timer=useRef<ReturnType<typeof setTimeout>|null>(null),current=useRef(scene);
 useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current);},[]);
 const bridge=usePrototypeBridge(scenes.pages,current,(page,state)=>{
   if(timer.current)clearTimeout(timer.current);
   refreshTimers.current.forEach(clearTimeout);
   setRefreshingIds([]);setBusy(false);setShowDisabled(state==='disabled');setChoice(initialChoice);
   setGeneration(value=>value+1);setScene({page,state});setDrawer(page!=='conversation');
   const rows=accountFixtures();
   setEditId(state==='add'?'new':undefined);
   setSources(state==='expired'?rows.map(source=>source.id==='devin'?{...source,status:'expired'}:source):rows);
   setSelection({sourceId:state==='harness'?'dsh':state==='disabled'?'qoder-cn':state==='expired'||page==='models'?'devin':'all',tab:page==='models'?'models':'quota'});

 });
 useEffect(()=>{bridge.report(scene.page,scene.state);},[scene.page,scene.state]);
 function select(next:AccountSelection){
   setSelection(next);
   const state=next.sourceId==='dsh'?'harness':next.sourceId==='qoder-cn'&&sources.some(source=>source.id==='qoder-cn'&&source.sourceEnabled===false)?'disabled':next.sourceId==='devin'&&sources.some(source=>source.id==='devin'&&source.status==='expired')?'expired':'';
   setScene(next.tab==='models'?{page:'models',state:''}:{page:'accounts',state});

 }
 function close(){setDrawer(false);setScene({page:'conversation',state:''});}
 function open(){setDrawer(true);select(selection);}
 function simulate(action:()=>void,text:string){setBusy(true);timer.current=setTimeout(()=>{action();setBusy(false);message.success(text+'（模拟）');},450);}
 function refresh(id:string){const ids=sources.filter(source=>(id==='all'||source.id===id)&&source.status==='ready'&&source.sourceEnabled!==false).map(source=>source.id);setRefreshingIds(previous=>[...new Set([...previous,...ids])]);ids.forEach((sourceId,index)=>refreshTimers.current.push(setTimeout(()=>{setSources(items=>items.map(source=>source.id===sourceId?{...source,observedLabel:'刚刚更新'}:source));setRefreshingIds(previous=>previous.filter(id=>id!==sourceId));},350+index*500)));}
 function login(id:string){simulate(()=>setSources(items=>items.map(source=>source.id===id?{...source,status:'ready',accountLabel:source.provider+'@example.com',observedLabel:'刚刚更新',planLabel:source.id==='dsh'?'个人账号':source.planLabel,balanceLabels:source.id==='dsh'?balanceLines([{currency:'CNY',total:'18.50',toppedUp:'16.00',granted:'2.50'}]):source.balanceLabels,models:source.models.length?source.models:[{id:'deepseek',label:'DeepSeek',family:'DeepSeek',enabled:false,available:true,tools:true,images:false,efforts:[{id:'off',label:'关闭'},{id:'high',label:'高'}],defaultEffort:'high'}]}:source)),'已登录，自动发现模型');}
 function disconnect(id:string){setSources(items=>items.map(source=>source.id===id?{...source,status:'not-authenticated',credentialConfigured:false,models:[],windows:[]}:source));message.info('已断开示例账号，重新使用前需再次连接');}
 function prepare(id:string){simulate(()=>setSources(items=>items.map(source=>source.id===id?{...source,program:'ready'}:source)),'本机程序已就绪');}
 function enable(changes:Array<{sourceId:string;modelId:string;enabled:boolean}>){setSources(items=>items.map(source=>({...source,models:source.models.map(model=>({...model,enabled:changes.find(change=>change.sourceId===source.id&&change.modelId===model.id)?.enabled??model.enabled})),combinations:source.combinations?.map(model=>({...model,enabled:changes.find(change=>change.sourceId===source.id&&change.modelId===model.id)?.enabled??model.enabled}))})));}
 function saveConnection(connection:ProviderConnection){
  const id=editId&&editId!=='new'?editId:connection.kind==='custom'?`custom-${++nextCustomId.current}`:connection.kind;
  setSources(items=>{
   const previous=items.find(item=>item.id===id);
   const source:PreviewSource={
    id,connection,provider:'custom',providerLabel:connection.label,
    accountLabel:connection.kind==='custom'?connection.baseUrl!:'官方 API',
    planLabel:connection.kind==='custom'?'自定义':'API Key',
    status:'ready',sourceEnabled:previous?.sourceEnabled??true,observedLabel:'刚刚更新',
    credentialConfigured:connection.credentialConfigured,windows:[],quotaNote:'暂未读取额度。',
    billingUrl:connection.kind==='openai'?OPENAI_BILLING_URL:undefined,
    models:previous?.models??[],
   };
   return previous?items.map(item=>item.id===id?source:item):[...items,source];
  });
  setEditId(undefined);
  select({sourceId:id,tab:'models'});
 }
 function addModels(id:string,entries:ModelEntry[]){
  setSources(items=>items.map(source=>{
   if(source.id!==id)return source;
   const models=[...source.models];
   for(const entry of entries){
    const index=models.findIndex(model=>model.id===entry.modelId);
    const previous=models[index];
    const model={...previous,id:entry.modelId,label:entry.label?.trim()||previous?.label||entry.modelId,family:source.providerLabel,available:true,enabled:previous?.enabled??false,contextWindow:entry.contextWindow??previous?.contextWindow};
    if(index===-1)models.push(model);
    else models[index]=model;
   }
   return {...source,models};
  }));
 }
 function discoverModels(id:string):ModelEntry[]{
  const kind=sources.find(source=>source.id===id)?.connection?.kind;
  if(kind==='openai')return [{modelId:'gpt-demo'}];
  if(kind==='deepseek-api')return [{modelId:'deepseek-demo'}];
  return [{modelId:'gateway-demo'},{modelId:'gateway-fast'}];
 }
 function removeModel(id:string,modelId:string){
  setSources(items=>items.map(source=>source.id===id?{...source,models:source.models.filter(model=>model.id!==modelId)}:source));
 }
 function sourceEnabled(id:string,value:boolean){
  setSources(items=>items.map(item=>item.id===id?{...item,sourceEnabled:value}:item));
  if(!value&&!showDisabled)select({sourceId:'all',tab:'quota'});
  message.success(value?'已恢复原配置和模型偏好（模拟）':'已停用，保留账号与模型偏好（模拟）');
 }
 let models=catalog(sources.filter(source=>source.sourceEnabled!==false));
 const selectedSource=sources.find(source=>source.id===choice.modelAccountId),selectedModel=selectedSource?.models.find(model=>model.id===choice.model);
 const selectedVisible=models.some(model=>model.accountId===choice.modelAccountId&&model.modelId===choice.model);
 const missing=selectedModel&&!selectedVisible;
 const unavailableLabel=selectedSource?.status==='expired'?'登录已过期':selectedSource?.status!=='ready'?'账号未登录':'已停用';
 if(missing&&selectedSource)models=[...models,...catalog([{...selectedSource,status:'ready',models:[{...selectedModel,enabled:true}],combinations:[]}]).map(model=>({...model,label:model.label+'（'+unavailableLabel+'）',available:false}))];
 const info=()=>message.info('交互原型使用示例数据，不执行真实操作');
 return <><div className="app-shell area-workbench model-controls-preview">
  <AppShellHeader development brandHref="/overview" workspaceName="Buildr" workspaceMenuItems={[{key:'demo',label:'Buildr · 交互原型',onClick:info}]} area="workbench" workbenchHref="/overview" workspaceDestination={{to:'/overview'}} actions={<><Tag>交互原型 · 示例数据</Tag><Button type="primary" icon={<PlusOutlined/>} onClick={info}>提出新目标</Button></>}/>
  <AppShellFrame sidebarCollapsed={collapsed} onToggleSidebar={()=>setCollapsed(value=>!value)} navigation={<nav className="shell-navigation"><p className="shell-nav-caption">工作台</p><AppNavigationItem name="overview" label="概览" icon={<HomeOutlined/>} to="/overview" path="/overview" active onClick={event=>{event.preventDefault();info();}}/><AppNavigationItem name="tasks" label="任务" icon={<UnorderedListOutlined/>} to="/tasks" path="/tasks" active={false} onClick={event=>{event.preventDefault();info();}}/></nav>}>
   <div className="workspace-pages"><div className="workspace-page-tabs"><PageTabStrip tabs={[{key:'dir:overview',kind:'dir',title:'概览',path:'/overview'}]} onClose={info} onReorder={()=>{}}/></div><div className="workspace-page-stack"><div className="workspace-page mcp-background">
    <section className="mcp-conversation"><div className="mcp-conversation-title"><RobotOutlined/><h1>新的对话</h1><p>选择执行任务的智能体，再选择已启用的模型。</p></div>
    {missing&&<Alert type="warning" showIcon message={unavailableLabel==='已停用'?'当前模型已停用，请重新选择后再开始新请求。':'当前模型来源'+unavailableLabel+'，请先恢复账号连接或选择其他模型。'} action={<Button size="small" onClick={()=>{setSelection({sourceId:choice.modelAccountId||'all',tab:'models'});setDrawer(true);setScene({page:'models',state:''});}}>管理模型</Button>}/>}
    <div className="ac-composer mcp-composer"><Input.TextArea placeholder="描述你的目标…" autoSize={{minRows:3,maxRows:6}}/><div className="ac-compose-toolbar"><div className="ac-compose-access"><Button type="text" icon={<PlusOutlined/>} aria-label="添加图片" onClick={info}/><ConversationAgentSelect connections={connections} value={choice} disabled={busy} onChange={setChoice}/><Button type="text" icon={<SafetyCertificateOutlined/>} onClick={info}>默认权限</Button></div><div className="mcp-picker-area" data-prototype-position="conversation-picker"><ConversationOptions showAgent={false} connections={connections} modelCatalog={models} value={choice} disabled={busy} onChange={setChoice}/><Button type="primary" disabled={!!missing} onClick={()=>message.info('仅预览选择，不发送模型请求')}>发送</Button></div></div></div>
   </section></div></div></div>
  </AppShellFrame>
  <aside className="ac-collapsed-rail pmp-demo-rail" data-dock="right" aria-label="对话工具">
   <Button type="text" className="ac-conversation-icon ac-account-settings" icon={<SettingOutlined aria-hidden="true"/>} aria-label="智能体与模型设置" title="智能体与模型设置" onClick={open}/>
  </aside>
  </div>
  <DrawerShell open={drawer} title="智能体与模型" sub="管理智能体、模型与程序接入" extra={<Tag>交互原型</Tag>} onClose={close} width="min(800px,100vw)" rootClassName="mcp-account-drawer"><ProviderPreviewContext.Provider value={{editId,editConnection:setEditId,saveConnection,discoverModels,addModels,removeModel}}><AgentModelSetup key={generation} mode={scene.page==='agents'?'agents':scene.page==='programmatic'?'programmatic':'accounts'} onMode={mode=>mode==='accounts'?select(selection):setScene({page:mode,state:''})} programmaticContent={<p className="ams-intro">程序接入设置不在本次调整范围内。</p>} executors={executors} onPrepareExecutor={id=>{setExecutors(items=>items.map(item=>item.id===id?{...item,prepared:true}:item));message.success('程序已准备，无需登录同平台模型账号（模拟）');}} refreshingIds={refreshingIds} showDisabled={showDisabled} onShowDisabled={setShowDisabled} onSourceEnabled={sourceEnabled}
    sources={sources} selection={selection} busy={busy} onSelect={select} onRefresh={refresh} onLogin={login} onDisconnect={disconnect} onPrepare={prepare} onEnable={enable} onContext={(sourceId,modelId,value)=>setSources(items=>items.map(source=>source.id===sourceId?{...source,models:source.models.map(model=>model.id===modelId?{...model,reportedContextWindow:model.reportedContextWindow??model.contextWindow,contextOverride:value??undefined,contextWindow:value??model.reportedContextWindow??model.contextWindow}:model)}:source))}/></ProviderPreviewContext.Provider></DrawerShell>
 </>;
}
createRoot(document.getElementById('root')!).render(<ConfigProvider locale={zhCN} theme={{...softProductTheme,cssVar:true,hashed:false}} wave={{disabled:true}}><App><MemoryRouter initialEntries={['/overview']}><Preview/></MemoryRouter></App></ConfigProvider>);
