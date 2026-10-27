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
import './preview.css';

const accountFixtures=()=>fixtures().map(({program:_,...source})=>({...source,observedLabel:source.status==='ready'?'10 分钟前':source.observedLabel,providerLabel:source.id==='codex'?'ChatGPT / Codex':source.id==='dsh'?'DeepSeek':source.providerLabel}));
const initialChoice:ConversationChoice={connectionId:'codex',modelAccountId:'devin',modelAccountIdentity:'demo-devin',modelAccountRevision:'demo',model:'gpt-sol'};
function Preview(){
 const {message}=App.useApp();
 const [sources,setSources]=useState(accountFixtures),[selection,setSelection]=useState<AccountSelection>({sourceId:'all',tab:'quota'});
 const [drawer,setDrawer]=useState(true),[collapsed,setCollapsed]=useState(false),[busy,setBusy]=useState(false);
 const [choice,setChoice]=useState(initialChoice),[scene,setScene]=useState({page:'quota',state:''});
 const [generation,setGeneration]=useState(0);
 const [executors,setExecutors]=useState<SetupExecutor[]>([{id:'codex',label:'Codex',prepared:true},{id:'qoder',label:'Qoder',prepared:true},{id:'dsh',label:'DSH',prepared:false}]);
 const [refreshingIds,setRefreshingIds]=useState<string[]>([]);const refreshTimers=useRef<ReturnType<typeof setTimeout>[]>([]);
 useEffect(()=>()=>refreshTimers.current.forEach(clearTimeout),[]);
 const timer=useRef<ReturnType<typeof setTimeout>|null>(null),current=useRef(scene);
 useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current);},[]);
 const bridge=usePrototypeBridge(scenes.pages,current,(page,state)=>{
   if(timer.current)clearTimeout(timer.current);refreshTimers.current.forEach(clearTimeout);setRefreshingIds([]);setExecutors([{id:'codex',label:'Codex',prepared:true},{id:'qoder',label:'Qoder',prepared:true},{id:'dsh',label:'DSH',prepared:false}]); setBusy(false); setSources(accountFixtures());setChoice(initialChoice);setGeneration(value=>value+1);setScene({page,state});setDrawer(page!=='conversation');
   const sourceId=['devin','qoder','dsh','codex'].includes(state)?state:page==='models'?'devin':'all';
   setSelection({sourceId,tab:(page==='conversation'||page==='agents'?'quota':page) as AccountSelection['tab']});
   if(page==='agents'&&state==='no-models')setSources(items=>items.map(source=>({...source,models:source.models.map(model=>({...model,enabled:false}))})));
   if(page==='agents'&&state==='other-source')setSources(items=>items.map(source=>source.id==='codex'?{...source,status:'not-authenticated'}:source));
   if(state==='all-disabled')setSources(items=>items.map(source=>source.id==='devin'?{...source,models:source.models.map(model=>({...model,enabled:false}))}:source));
   if(state==='empty')setSelection({sourceId:'dsh',tab:'models'});
   if(state==='expired'){setSelection({sourceId:'devin',tab:'quota'});setSources(items=>items.map(source=>source.id==='devin'?{...source,status:'expired'}:source));}
   if(state==='missing')setSelection({sourceId:'dsh',tab:'quota'});
   if(page==='conversation'&&state==='qoder')setChoice({...initialChoice,connectionId:'qoder',modelAccountId:'qoder',modelAccountIdentity:'demo-qoder',model:'qoder-auto'});
   if(page==='conversation'&&state==='fixed'){setSources(items=>items.map(source=>source.id==='devin'?{...source,models:source.models.map(model=>model.id==='deepseek'?{...model,enabled:true}:model)}:source));setChoice({...initialChoice,model:'deepseek'});}
   if(page==='conversation'&&state==='disabled')setSources(items=>items.map(source=>source.id==='devin'?{...source,models:source.models.map(model=>model.id==='gpt-sol'?{...model,enabled:false}:model)}:source));
 });
 useEffect(()=>{bridge.report(scene.page,scene.state);},[scene.page,scene.state]);
 function select(next:AccountSelection){setSelection(next);setScene({page:next.tab,state:next.sourceId==='all'||next.tab==='models'&&next.sourceId==='devin'?'':['devin','qoder','dsh','codex'].includes(next.sourceId)&&scenes.pages.find(page=>page.id===next.tab)?.states.some(state=>state.id===next.sourceId)?next.sourceId:''});}
 function close(){setDrawer(false);setScene({page:'conversation',state:''});}
 function open(){setDrawer(true);setScene({page:selection.tab,state:''});}
 function simulate(action:()=>void,text:string){setBusy(true);timer.current=setTimeout(()=>{action();setBusy(false);message.success(text+'（模拟）');},450);}
 function refresh(id:string){const ids=sources.filter(source=>(id==='all'||source.id===id)&&source.status==='ready').map(source=>source.id);setRefreshingIds(previous=>[...new Set([...previous,...ids])]);ids.forEach((sourceId,index)=>refreshTimers.current.push(setTimeout(()=>{setSources(items=>items.map(source=>source.id===sourceId?{...source,observedLabel:'刚刚更新'}:source));setRefreshingIds(previous=>previous.filter(id=>id!==sourceId));},350+index*500)));}
 function login(id:string){simulate(()=>setSources(items=>items.map(source=>source.id===id?{...source,status:'ready',accountLabel:source.provider+'@example.com',observedLabel:'刚刚更新',planLabel:source.id==='dsh'?'已登录':source.planLabel,models:source.models.length?source.models:[{id:'deepseek',label:'DeepSeek',family:'DeepSeek',enabled:false,available:true,tools:true,images:false,efforts:[{id:'off',label:'关闭'},{id:'high',label:'高'}],defaultEffort:'high'}]}:source)),'已登录，自动发现模型');}
 function disconnect(id:string){setSources(items=>items.map(source=>source.id===id?{...source,status:'not-authenticated'}:source));message.info('已断开示例账号；登录资料、对话和模型开关保留');}
 function prepare(id:string){simulate(()=>setSources(items=>items.map(source=>source.id===id?{...source,program:'ready'}:source)),'本机程序已就绪');}
 function enable(changes:Array<{sourceId:string;modelId:string;enabled:boolean}>){setSources(items=>items.map(source=>({...source,models:source.models.map(model=>({...model,enabled:changes.find(change=>change.sourceId===source.id&&change.modelId===model.id)?.enabled??model.enabled})),combinations:source.combinations?.map(model=>({...model,enabled:changes.find(change=>change.sourceId===source.id&&change.modelId===model.id)?.enabled??model.enabled}))})));}
 let models=catalog(sources);
 const selectedSource=sources.find(source=>source.id===choice.modelAccountId),selectedModel=selectedSource?.models.find(model=>model.id===choice.model);
 const selectedVisible=models.some(model=>model.accountId===choice.modelAccountId&&model.modelId===choice.model);
 const missing=selectedModel&&!selectedVisible;
 const unavailableLabel=selectedSource?.status==='expired'?'登录已过期':selectedSource?.status!=='ready'?'账号未登录':'已停用';
 if(missing&&selectedSource)models=[...models,...catalog([{...selectedSource,status:'ready',models:[{...selectedModel,enabled:true}],combinations:[]}]).map(model=>({...model,label:model.label+'（'+unavailableLabel+'）',available:false}))];
 const info=()=>message.info('交互原型使用示例数据，不执行真实操作');
 return <><div className="app-shell area-workbench model-controls-preview">
  <AppShellHeader development brandHref="/overview" workspaceName="Buildr" workspaceMenuItems={[{key:'demo',label:'Buildr · 交互原型',onClick:info}]} area="workbench" workbenchHref="/overview" workspaceDestination={{to:'/overview'}} actions={<><Tag>交互原型 · 示例数据</Tag><Button icon={<SettingOutlined/>} onClick={open}>智能体与模型</Button><Button type="primary" icon={<PlusOutlined/>} onClick={info}>提出新目标</Button></>}/>
  <AppShellFrame sidebarCollapsed={collapsed} onToggleSidebar={()=>setCollapsed(value=>!value)} navigation={<nav className="shell-navigation"><p className="shell-nav-caption">工作台</p><AppNavigationItem name="overview" label="概览" icon={<HomeOutlined/>} to="/overview" path="/overview" active onClick={event=>{event.preventDefault();info();}}/><AppNavigationItem name="tasks" label="任务" icon={<UnorderedListOutlined/>} to="/tasks" path="/tasks" active={false} onClick={event=>{event.preventDefault();info();}}/></nav>}>
   <div className="workspace-pages"><div className="workspace-page-tabs"><PageTabStrip tabs={[{key:'dir:overview',kind:'dir',title:'概览',path:'/overview'}]} onClose={info} onReorder={()=>{}}/></div><div className="workspace-page-stack"><div className="workspace-page mcp-background">
    <section className="mcp-conversation"><div className="mcp-conversation-title"><RobotOutlined/><h1>新的对话</h1><p>选择执行任务的智能体，再选择已启用的模型。</p></div>
    <div className="mcp-choice-summary"><Tag>{connections.find(connection=>connection.id===choice.connectionId)?.provider==='qoder'?'Qoder':choice.connectionId==='dsh'?'DSH':'Codex'} 执行</Tag><span>{selectedSource?.providerLabel} 提供模型</span></div>
    {missing&&<Alert type="warning" showIcon message={unavailableLabel==='已停用'?'当前模型已停用，请重新选择后再开始新请求。':'当前模型来源'+unavailableLabel+'，请先恢复账号连接或选择其他模型。'} action={<Button size="small" onClick={()=>{setSelection({sourceId:choice.modelAccountId||'all',tab:'models'});setDrawer(true);setScene({page:'models',state:''});}}>管理模型</Button>}/>}
    <div className="ac-composer mcp-composer"><Input.TextArea placeholder="描述你的目标…" autoSize={{minRows:3,maxRows:6}}/><div className="ac-compose-toolbar"><div className="ac-compose-access"><Button type="text" icon={<PlusOutlined/>} aria-label="添加图片" onClick={info}/><ConversationAgentSelect connections={connections} value={choice} disabled={busy} onChange={setChoice}/><Button type="text" icon={<SafetyCertificateOutlined/>} onClick={info}>默认权限</Button></div><div className="mcp-picker-area" data-prototype-position="conversation-picker"><ConversationOptions showAgent={false} connections={connections} modelCatalog={models} value={choice} disabled={busy} onChange={setChoice}/><Button type="primary" disabled={!!missing} onClick={()=>message.info('仅预览选择，不发送模型请求')}>发送</Button></div></div></div>
    <p className="mcp-caption">模型启用情况在“账号与模型”中统一管理。这里使用示例账号与模型。</p></section>
   </div></div></div>
  </AppShellFrame></div>
  <DrawerShell open={drawer} title="智能体与模型" sub="智能体与模型分别管理" extra={<Tag>交互原型</Tag>} onClose={close} width="min(800px,100vw)" rootClassName="mcp-account-drawer"><AgentModelSetup key={generation} mode={scene.page==='agents'?'agents':'accounts'} onMode={mode=>{setScene({page:mode==='agents'?'agents':selection.tab,state:''});}} executors={executors} onPrepareExecutor={id=>{setExecutors(items=>items.map(item=>item.id===id?{...item,prepared:true}:item));message.success('程序已准备，无需登录同平台模型账号（模拟）');}} refreshingIds={refreshingIds} sources={sources} selection={selection} busy={busy} onSelect={select} onRefresh={refresh} onLogin={login} onDisconnect={disconnect} onPrepare={prepare} onEnable={enable} onContext={(sourceId,modelId,value)=>setSources(items=>items.map(source=>source.id===sourceId?{...source,models:source.models.map(model=>model.id===modelId?{...model,reportedContextWindow:model.reportedContextWindow??model.contextWindow,contextOverride:value??undefined,contextWindow:value??model.reportedContextWindow??model.contextWindow}:model)}:source))}/></DrawerShell>
 </>;
}
createRoot(document.getElementById('root')!).render(<ConfigProvider locale={zhCN} theme={{...softProductTheme,cssVar:true,hashed:false}} wave={{disabled:true}}><App><MemoryRouter initialEntries={['/overview']}><Preview/></MemoryRouter></App></ConfigProvider>);
