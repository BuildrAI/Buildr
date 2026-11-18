import {useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import {App,Button,ConfigProvider,Dropdown,Input,Tag} from 'antd';
import zhCN from 'antd/locale/zh_CN';
import {ArrowUpOutlined,CheckCircleOutlined,EllipsisOutlined,FileTextOutlined,LoadingOutlined,MenuOutlined,PlusOutlined,SafetyCertificateOutlined,WarningOutlined} from '@ant-design/icons';
import {AppShellHeader,AppShellFrame} from '../../app/AppShellView';
import {AppPrimaryNavigation} from '../../app/AppPrimaryNavigation';
import {PageTabStrip} from '../../app/PageTabStrip';
import {MaterialDrawer} from './MaterialDrawer';
import type {SourceRecord} from './handoff-material';
import {changeNotice,executionChanges,modelLabel,type ExecutionChange} from './handoff-display';
import {MarkdownHost} from '../../components/MarkdownHost';
import {ConversationAgentSelect,ConversationOptions} from '../../features/agent-conversations/ConversationOptions';
import {ConversationProcessBlock} from '../../features/agent-conversations/ConversationProcessBlock';
import type {ConversationChoice} from '../../features/agent-conversations/conversation-options';
import {softProductTheme} from '../../theme';
import {usePrototypeBridge} from '../prototype-bridge';
import {connections,localRecords,materialText,models,workEntries} from './fixtures';
import scenes from './scenes.json';
import 'antd/dist/reset.css';
import '../../styles.css';
import '../../features/agent-conversations/agent-conversations.css';
import './preview.css';

type Receipt={id:number;agent:string;model:string;changes:ExecutionChange[];summary:boolean;instruction:string;text:string;through:number};
type Phase='idle'|'summary'|'records'|'sending'|'received'|'unknown'|'active'|'capacity';
const initialChoice:ConversationChoice={connectionId:'dsh',modelAccountId:'demo',modelAccountIdentity:'demo',modelAccountRevision:'demo',model:'astra',reasoningEffort:'medium',serviceTier:undefined};
const previousChoice:ConversationChoice={...initialChoice,connectionId:'codex',model:'sol'};
const names:Record<string,string>={codex:'Codex',dsh:'DSH',qoder:'Qoder'};
function Preview(){
 const {message}=App.useApp();
 const [choice,setChoice]=useState(initialChoice),[lastChoice,setLastChoice]=useState(previousChoice),[phase,setPhase]=useState<Phase>('idle');
 const [quota,setQuota]=useState(true),[needsCompression,setNeedsCompression]=useState(false),[draft,setDraft]=useState('继续验证缺少工作目录时的启动行为。');
 const [receipts,setReceipts]=useState<Receipt[]>([]),[extra,setExtra]=useState<SourceRecord[]>([]);
 const [drawer,setDrawer]=useState(false),[selectedReceipt,setSelectedReceipt]=useState<Receipt|null>(null),[processOpen,setProcessOpen]=useState(false);
 const [collapsed,setCollapsed]=useState(false),[dock,setDock]=useState<'left'|'right'>('right'),[scene,setScene]=useState({page:'switch',state:''});
 const sceneRef=useRef(scene),timer=useRef<ReturnType<typeof setTimeout>|null>(null),stream=useRef<HTMLDivElement>(null);
 const generation=useRef(0);
 const busy=['summary','records','sending'].includes(phase),blocked=['unknown','active','capacity'].includes(phase);
 const changes=executionChanges(lastChoice,choice),proposed=changes.length>0;
 const currentText=materialText(extra,draft||'继续当前工作。',false,phase==='active'?'原执行未结束，尚不能发送':phase==='unknown'?'上次是否送达待确认，尚不能重发':'原执行已结束，无活动工具');
 function clearTimer(){generation.current++;if(timer.current)clearTimeout(timer.current);}
 function makeReceipt(id:number,target:ConversationChoice,withSummary:boolean,instruction:string,records=extra,previous=lastChoice):Receipt{return{id,agent:target.connectionId,model:modelLabel(target),changes:executionChanges(previous,target),summary:withSummary,instruction,text:materialText(records,instruction,withSummary),through:[...localRecords,...records].at(-1)!.sequence};}
 function sceneSelect(page:string,state:string){
  clearTimer();setScene({page,state});setChoice(initialChoice);setLastChoice(previousChoice);setQuota(state!=='no-quota'&&state!=='long-no-quota');setNeedsCompression(state==='long-history'||state==='long-no-quota');setDraft('继续验证缺少工作目录时的启动行为。');setExtra([]);setReceipts([]);setDrawer(false);setDock(state==='left'?'left':'right');setProcessOpen(false);setPhase('idle');
  if(state==='agent-only')setChoice({...initialChoice,model:'sol'});
  if(state==='model-only')setChoice({...initialChoice,connectionId:'codex'});
  if(page==='received'){
   const first=makeReceipt(1,initialChoice,false,'继续验证缺少工作目录时的启动行为。',[],previousChoice);setReceipts([first]);setLastChoice(initialChoice);setDraft('');setPhase('received');
   if(state==='chain'){
    const records=[{sequence:9,turnId:'turn-3',kind:'user',text:'继续验证缺少工作目录时的启动行为。'},{sequence:10,turnId:'turn-3',kind:'check',text:'DSH 已检查目录准备分支，真实服务启动仍待验证。'}];
    setExtra(records);setReceipts([first,makeReceipt(2,{...initialChoice,connectionId:'qoder'},false,'继续完成真实启动验证。',records,initialChoice)]);setLastChoice({...initialChoice,connectionId:'qoder'});setChoice({...initialChoice,connectionId:'qoder'});
   }
  }
  if(page==='decision')setPhase(state==='active'?'active':state==='capacity'?'capacity':'unknown');
 }
 const bridge=usePrototypeBridge(scenes.pages,sceneRef,sceneSelect);
 useEffect(()=>{bridge.report(scene.page,scene.state);},[scene.page,scene.state]);
 useEffect(()=>()=>clearTimer(),[]);
 useEffect(()=>{if(stream.current)stream.current.scrollTop=stream.current.scrollHeight;},[phase,receipts.length]);
 function openMaterials(receipt:Receipt|null=null){setSelectedReceipt(receipt);setDrawer(true);}
 function finish(withSummary:boolean,instruction:string,target:ConversationChoice){
  const agent=target.connectionId;
  const receipt=makeReceipt(receipts.length+1,target,withSummary,instruction);
  setReceipts(items=>receipt.changes.length?[...items,receipt]:items);setExtra(items=>[...items,{sequence:9+items.length,turnId:'turn-'+(3+items.length/2),kind:'user',text:instruction},{sequence:10+items.length,turnId:'turn-'+(3+items.length/2),kind:'assistant',text:names[agent]+' 已接收本地记录，下一步核对当前文件与尚未完成的验证。'}]);
  setLastChoice(target);setDraft('');setPhase('received');setScene({page:'received',state:receipts.length?'chain':''});
 }
 function dispatch(withSummary:boolean){
  const instruction=draft.trim()||'继续当前工作。',target={...choice},token=generation.current;
  setPhase('sending');timer.current=setTimeout(()=>{if(token===generation.current)finish(withSummary,instruction,target);},650);
 }
 function send(){
  if(busy||blocked||!draft.trim())return;clearTimer();
  if(!proposed){dispatch(false);return;}
  const token=generation.current;
  if(quota&&needsCompression){setPhase('summary');timer.current=setTimeout(()=>{if(token===generation.current)dispatch(true);},1600);}
  else{setPhase('records');timer.current=setTimeout(()=>{if(token===generation.current)dispatch(false);},650);}
 }
 function skip(){clearTimer();dispatch(false);}
 function select(value:ConversationChoice){const next={...choice,...value};setChoice(next);if(phase==='capacity'&&next.model==='large')setPhase('idle');if(phase==='received')setPhase('idle');setSelectedReceipt(null);}
 const viewed=selectedReceipt?.text??currentText;
 const sourceRows=[...localRecords,...extra].filter(row=>!selectedReceipt||row.sequence<=selectedReceipt.through);
 const caption=phase==='summary'?'历史较长，正在精简交接材料…':phase==='records'?'正在从本地记录准备资料…':phase==='sending'?'正在交给 '+names[choice.connectionId]+'…':'';
 const info=()=>message.info('这是界面原型，使用模拟数据。');
 return <div className="app-shell area-workbench has-primary-navigation handoff-preview">
  <AppShellHeader primaryNavigation="rail" development brandHref="/overview" workspaceName="Buildr" workspaceMenuItems={[{key:'demo',label:'Buildr · 示例',onClick:info}]} area="workbench" workbenchHref="/overview" workspaceDestination={{to:'/overview'}} actions={<Tag>交互原型</Tag>}/>
  <AppShellFrame sidebarCollapsed={collapsed} onToggleSidebar={()=>setCollapsed(value=>!value)} navigation={null} navigationRail={<AppPrimaryNavigation workspaceId="demo" area="workbench" sidebarWidth={176} onSidebarResize={()=>{}}/>}>
   <div className="workspace-pages"><div className="workspace-page-tabs"><PageTabStrip tabs={[{key:'task:demo',kind:'dir',title:'优化服务启动体验',path:'/tasks/demo'}]} onClose={info} onReorder={()=>{}}/></div>
   <div className="hp-workspace" data-conversation-side={dock}><section className="hp-task"><span className="hp-eyebrow">Buildr 产品 · 任务</span><h1>优化服务启动体验</h1><p className="hp-subtitle">只启动选中的服务，并准备缺少的工作目录。</p><Tag color="processing">进行中</Tag><div className="hp-task-body"><h3>当前进展</h3><p>启动范围已调整，待验证目录准备和实际启动行为。</p><h3>工作成果</h3><button onClick={()=>openMaterials()}><FileTextOutlined/> start-selected-service.ts</button><button onClick={()=>openMaterials()}><FileTextOutlined/> 服务选择检查记录</button></div></section>
    <section id="agent-conversation-panel" className="ac-panel hp-panel" data-dock={dock} aria-label="工作对话">
     <header className="ac-thread-header"><Button type="text" icon={<MenuOutlined/>} aria-label="对话历史" onClick={info}/><button className="ac-thread-title" onClick={info}>优化服务启动体验</button><div className="ac-thread-actions"><Button type="text" icon={<PlusOutlined/>} aria-label="新对话" onClick={info}/><Dropdown trigger={['click']} menu={{items:[{key:'move',label:dock==='right'?'对话移到左侧':'对话移到右侧'}],onClick:()=>{setDock(value=>value==='right'?'left':'right');setDrawer(false);}}}><Button type="text" icon={<EllipsisOutlined/>} aria-label="更多对话操作"/></Dropdown></div></header>
     <div className="ac-stream" ref={stream}><div className="ac-message-list">
      <article className="ac-message is-user"><p>{localRecords[0].text}</p></article>
      <section className="ac-assistant-reply"><small className="ac-message-identity">Codex</small><article className="ac-message"><MarkdownHost markdown="可以。第二个方案是保留服务选择，单独准备缺少的工作目录，再启动所选服务。"/></article></section>
      <article className="ac-message is-user"><p>{localRecords.find(record=>record.id==='u2')!.text}</p></article>
      <section className="ac-assistant-reply"><small className="ac-message-identity">Codex</small><ConversationProcessBlock blockKey="demo-work" entries={workEntries} active={false} open={processOpen} onToggle={(_,open)=>setProcessOpen(open)} onOpenFile={()=>openMaterials()} finishedAt="2026-10-27T01:01:00Z"/><article className="ac-message"><MarkdownHost markdown="启动范围已调整，所选服务的单元检查通过。接下来验证缺少工作目录时的准备和实际启动行为。"/></article></section>
      {receipts.map(receipt=><div key={receipt.id} className="hp-receipt-pair"><article className="ac-message is-user"><p>{receipt.instruction}</p></article><div className="hp-receipt" data-prototype-position="handoff-receipt"><CheckCircleOutlined/><span>{changeNotice(receipt.changes,true)}</span><Button type="link" size="small" onClick={()=>openMaterials(receipt)}>交接内容</Button></div><section className="ac-assistant-reply"><small className="ac-message-identity">{names[receipt.agent]}</small><article className="ac-message"><MarkdownHost markdown="已接上已有要求和工作记录。我会先核对当前文件，再继续尚未完成的验证。"/></article></section></div>)}
     </div></div>
     <div className="ac-compose-wrap">
      {phase==='unknown'?<div className="hp-notice is-warning" data-prototype-position="handoff-notice" role="status"><WarningOutlined/><div className="hp-notice-copy"><strong>上次是否送达，还未确认</strong><p>先核对，避免重复执行。</p></div><Button size="small" onClick={()=>{setPhase('idle');message.success('已核对：上次未送达，可以继续发送（模拟）');}}>核对状态</Button></div>:
       phase==='active'?<div className="hp-notice is-warning" data-prototype-position="handoff-notice" role="status"><WarningOutlined/><div className="hp-notice-copy"><strong>原执行还未结束</strong><p>停止后，再交给 {names[choice.connectionId]}。</p></div><Button size="small" onClick={()=>{setPhase('idle');message.success('已确认停止，草稿保留（模拟）');}}>停止原执行</Button></div>:
       phase==='capacity'?<div className="hp-notice is-warning" data-prototype-position="handoff-notice" role="status"><WarningOutlined/><div className="hp-notice-copy"><strong>必要资料仍超出容量</strong><p>已精简，换用更大容量的模型继续。</p></div><Button size="small" onClick={()=>{select({...choice,model:'large'});message.success('已选择大容量模型（模拟）');}}>选择模型</Button><Button type="link" size="small" onClick={()=>openMaterials()}>交接内容</Button></div>:
       busy?<div className="hp-notice" role="status" data-prototype-position="handoff-notice"><LoadingOutlined/><span>{caption}</span>{phase==='summary'&&<Button type="link" size="small" onClick={skip}>跳过整理</Button>}{phase!=='sending'&&<Button type="text" size="small" onClick={()=>{clearTimer();setPhase('idle');}}>取消发送</Button>}</div>:
       proposed?<div className="hp-transfer" data-prototype-position="handoff-notice"><div><span>{changeNotice(changes)}</span><div className="hp-transfer-actions"><Button type="link" size="small" onClick={()=>openMaterials()}>交接内容</Button></div></div>{needsCompression&&<p>{quota?'材料较长，发送时将尝试精简。':'原模型不可用，将使用本地记录与按需读取。'}</p>}</div>:null}
      <div className="ac-composer"><Input.TextArea aria-label="对话输入" disabled={busy} value={draft} onChange={event=>setDraft(event.target.value)} placeholder={busy?'可以先写下一条草稿…':'继续说明你的要求…'} autoSize={{minRows:2,maxRows:5}}/>
       <div className="ac-compose-toolbar"><div className="ac-compose-access"><Button type="text" icon={<PlusOutlined/>} aria-label="添加图片" onClick={info}/><ConversationAgentSelect connections={connections} modelCatalog={models} value={choice} disabled={busy||phase==='active'||phase==='unknown'} onChange={select}/><Button type="text" icon={<SafetyCertificateOutlined/>} size="small" onClick={info}>默认权限</Button></div><div className="ac-compose-execution"><ConversationOptions connections={connections} modelCatalog={models} value={choice} disabled={busy} onChange={select} showAgent={false}/><Button type="primary" shape="circle" icon={<ArrowUpOutlined/>} aria-label="发送" title="发送" disabled={busy||blocked||!draft.trim()} onClick={send}/></div></div>
      </div>

     </div>
     <MaterialDrawer open={drawer} side={dock} agent={names[selectedReceipt?.agent??choice.connectionId]} model={selectedReceipt?.model??modelLabel(choice)} changes={selectedReceipt?.changes??changes} text={viewed} through={selectedReceipt?.through??[...localRecords,...extra].at(-1)!.sequence} records={sourceRows} received={!!selectedReceipt} issue={!selectedReceipt?(phase==='capacity'?'必要资料仍超出容量，请先换用更大容量的模型。':phase==='unknown'?'先核对上次是否送达，避免重复执行。':phase==='active'?'先停止原执行，再发送。':undefined):undefined} onClose={()=>setDrawer(false)}/>
    </section></div></div>
  </AppShellFrame>

 </div>;
}
createRoot(document.getElementById('root')!).render(<ConfigProvider locale={zhCN} theme={{...softProductTheme,cssVar:true,hashed:false}} wave={{disabled:true}}><App><MemoryRouter initialEntries={['/tasks/demo']}><Preview/></MemoryRouter></App></ConfigProvider>);
