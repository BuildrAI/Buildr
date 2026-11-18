import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { App, Button, ConfigProvider, Input, Modal, Popover, Select, Tag } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { ArrowUpOutlined, CheckCircleOutlined, CloseOutlined, CommentOutlined, EllipsisOutlined, FileTextOutlined, InfoCircleOutlined, MenuOutlined, PlusOutlined, SafetyCertificateOutlined, SearchOutlined, StopOutlined } from '@ant-design/icons';
import { AppShellFrame, AppShellHeader } from '../../app/AppShellView';
import { AppPrimaryNavigation } from '../../app/AppPrimaryNavigation';
import { PageTabStrip } from '../../app/PageTabStrip';
import { MarkdownHost } from '../../components/MarkdownHost';
import { ConversationAgentSelect, ConversationOptions } from '../../features/agent-conversations/ConversationOptions';
import type { ConversationChoice } from '../../features/agent-conversations/conversation-options';
import { ConversationProcessBlock } from '../../features/agent-conversations/ConversationProcessBlock';
import { connections, models, workEntries } from '../conversation-handoff/fixtures';
import { usePrototypeBridge } from '../prototype-bridge';
import { softProductTheme } from '../../theme';
import { ActivityHistory } from './ActivityHistory';
import { ActivityRail } from './ActivityRail';
import type { StatsStatus } from './ExecutionStats';
import { ConversationDockSurface } from '../../features/agent-conversations/ConversationDockSurface';
import { nextConversationPanel } from '../../features/agent-conversations/conversation-state';
import { conversations, type DemoConversation } from './fixtures';
import scenes from './scenes.json';
import 'antd/dist/reset.css';
import '../../styles.css';
import '../../features/agent-conversations/agent-conversations.css';
import '../../features/agent-conversations/conversation-dock.css';
import './preview.css';

function Preview() {
  const {message}=App.useApp();
  const [rows,setRows]=useState(conversations),[view,setView]=useState('work'),[selected,setSelected]=useState<string|null>(null);
  const [historyDocked,setHistoryDocked]=useState(false),[sceneVersion,setSceneVersion]=useState(0);
  const [workspace,setWorkspace]=useState('Buildr'),[query,setQuery]=useState(''),[hidden,setHidden]=useState(false),[error,setError]=useState(false);
  const [draft,setDraft]=useState(''),[processOpen,setProcessOpen]=useState(false),[rename,setRename]=useState(false),[title,setTitle]=useState(''),[generating,setGenerating]=useState(false);
  const [scene,setScene]=useState({page:'work',state:''}),[collapsed,setCollapsed]=useState(true);
  const [choice,setChoice]=useState<ConversationChoice>({connectionId:'codex',modelAccountId:'demo',modelAccountIdentity:'demo',modelAccountRevision:'demo',model:'sol',reasoningEffort:'medium',serviceTier:undefined});
  const sceneRef=useRef(scene),generation=useRef(0),timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  function updateScene(next:{page:string;state:string}) {sceneRef.current=next;setScene(next);}
  const chat=rows.find(row=>row.id===selected)??rows[0],busy=chat?.status==='running';
  const statsStatus:StatsStatus=scene.state==='stats-unknown'?'unknown':scene.state==='stats-error'||scene.state==='error'?'error':'ready';
  function clearTimer(){generation.current++;if(timer.current)clearTimeout(timer.current);setGenerating(false);}
  function chooseScene(page:string,state:string) {
    // The reader can echo in-page navigation; it must not reset a simulated result.
    if(sceneRef.current.page===page&&sceneRef.current.state===state)return;
    clearTimer();setHistoryDocked(false);setSceneVersion(value=>value+1);
    let next=conversations();
    setWorkspace(page==='history'&&(state==='all'||state.startsWith('stats-'))?'全部工作空间':'Buildr');setQuery(state==='empty'?'不存在的对话':'');setHidden(false);setError(state==='error');setDraft('');setRename(false);setProcessOpen(false);
    if(page==='work'&&state==='finished')next[0]={...next[0]!,status:'completed',time:30,answer:'提醒方案已整理好。执行中与未查看独立表示，全部工作空间的对话使用统一排序；工作结果还需要你查看。'};
    if(page==='work'&&state==='quiet')next=next.map(row=>({...row,status:'completed',unseen:false}));
    if(page==='work'&&state==='overflow')next.push(...['文档链接校准','目录准备验证','配置来源核对'].map((title,index)=>({...next[0]!,id:'extra-'+index,title,short:title.slice(0,4),unseen:index===0,time:13-index})));
    if(page==='work'&&state==='stats-other-active')next=next.map(row=>row.status==='running'?{...row,status:'completed',unseen:false}:row);
    if(page==='work'&&state==='stats-many')next.push(...Array.from({length:12},(_,index)=>({...next[index%3]!,id:'many-'+index,title:'并行工作 '+(index+1)+' · '+next[index%3]!.title,status:'running' as const,model:'模型 '+(index%6+1),time:14-index/10})));
    if(page==='history'&&state==='stats-empty')next=next.map(row=>({...row,status:'completed',unseen:false}));
    if(page==='history'&&state==='new-message')next=next.map(row=>row.short==='列表筛选'?{...row,unseen:true,time:32}:row);
    let id:string|null=null;
    if(page==='conversation') {
      const target=state==='waiting'?next[2]!:state.startsWith('title-')?next[4]!:next[0]!;
      id=target.id;
      next=next.map(row=>row.id===id?{...row,unseen:false,...(state==='title-pending'?{status:'running' as const,titleState:'pending' as const,answer:'我正在核对新对话的标题触发时机。首轮还在执行，标题会在成功回复后生成。'}:{})}:row);
    }
    setRows(next);setSelected(id);setView(page);updateScene({page,state});
  }
  const bridge=usePrototypeBridge(scenes.pages,sceneRef,chooseScene);
  useEffect(()=>{bridge.report(scene.page,scene.state);},[scene.page,scene.state]);
  useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current);},[]);
  function open(row:DemoConversation) {
    clearTimer();setSelected(row.id);setView('conversation');setDraft('');setProcessOpen(false);
    setRows(previous=>previous.map(item=>item.id===row.id?{...item,unseen:false}:item));
    updateScene({page:'conversation',state:row.status==='waiting'?'waiting':row.titleState==='failed'?'title-failed':row.titleState==='pending'?'title-pending':''});
  }
  function history(all=false) {clearTimer();setHistoryDocked(true);setView('history');if(all)setWorkspace('全部工作空间');setQuery('');updateScene({page:'history',state:all?'all':''});}
  function work(){setView('work');updateScene({page:'work',state:''});}
  function create() {
    const row:DemoConversation={id:'demo-'+(rows.length+1),title:'新对话',short:'新对话',workspace:workspace==='业务平台'?'业务平台':'Buildr',agent:'Codex',model:'GPT-6.1-Sol',status:'completed',unseen:false,time:0,titleState:'pending',user:'',answer:''};
    setRows(previous=>[row,...previous]);open(row);
  }
  function generateTitle() {
    if(!chat||busy||generating)return;
    const id=chat.id,observedTitle=chat.title,token=generation.current;setGenerating(true);
    timer.current=setTimeout(()=>{
      if(generation.current!==token)return;
      setRows(previous=>previous.map(row=>row.id===id&&row.title===observedTitle?{...row,title:'对话自动标题触发时机核对',short:'标题核对',titleState:'generated'}:row));
      setGenerating(false);message.success('已生成简短标题（模拟），没有重跑工作。');
    },900);
  }
  function send() {
    if(!chat||busy||!draft.trim())return;
    const id=chat.id,text=draft.trim();setDraft('');
    setRows(previous=>previous.map(row=>row.id===id?{...row,status:'running',user:text,answer:'已收到。我会先核对当前事实，再继续这项工作。',time:35}:row));
    message.info('已模拟新输入并置顶；不会调用模型或执行工具。');
  }
  const dockOpen=view==='conversation'||view==='history'&&historyDocked;
  function toggleDock(target:'conversation'|'history') {
    const next=nextConversationPanel(dockOpen,view==='history'?'history':'conversation',target);
    if(!next.open){work();return;}
    if(target==='history'){history(true);return;}
    if(chat){setSelected(chat.id);setView('conversation');setRows(previous=>previous.map(row=>row.id===chat.id?{...row,unseen:false}:row));updateScene({page:'conversation',state:''});}
  }
  const info=()=>message.info('这是模拟页面，不会修改真实工作资料。');
  const titleText=chat?.titleState==='pending'?'首轮成功结束并有可见问答后，自动生成简短标题。':chat?.titleState==='failed'?'本轮工作已结束，但独立标题生成超时。原回复完整保留。':'自动生成简短主题；手动改名始终优先。';
  const conversationPanel=chat?<section className="ac-panel ca-panel" id="agent-conversation-panel" aria-label="当前对话" data-prototype-position="conversation-panel">
            <header className="ac-thread-header"><Button type="text" icon={<MenuOutlined/>} aria-label="查看对话列表" onClick={()=>history()}/><button className="ac-thread-title" title="手动修改标题" onClick={()=>{setTitle(chat.title);setRename(true);}}>{chat.title}</button>
              <Popover trigger={['hover','click']} content={<div className="ca-title-status"><strong>{generating?'正在生成简短标题…':chat.titleState==='pending'?'标题待生成':chat.titleState==='failed'?'标题生成未完成':'对话标题'}</strong><p>{titleText}</p><div><Button size="small" disabled={busy||!chat.answer||generating} loading={generating} onClick={generateTitle}>{chat.titleState==='failed'?'重新生成标题':'生成简短标题'}</Button><Button size="small" type="text" onClick={()=>{setTitle(chat.title);setRename(true);}}>手动命名</Button></div></div>}>
                <Button type="text" data-prototype-position="title-status" icon={<InfoCircleOutlined/>} aria-label="查看标题生成状态"/>
              </Popover>
              <Button type="text" icon={<PlusOutlined/>} aria-label="新建对话" onClick={create}/><Button type="text" icon={<CloseOutlined/>} aria-label="收起对话" onClick={work}/>
            </header>
            <div className="ca-thread-subtitle"><span>{chat.workspace}</span><span className="ac-history-id">ID {chat.id}</span></div>
            <div className="ac-stream"><div className="ac-message-list">
              {!chat.user?<div className="ac-welcome"><CommentOutlined/><h1>聊聊你的目标</h1><p>写下问题或想做的事，发送后开始。</p></div>:<><article className="ac-message is-user"><p>{chat.user}</p></article><section className="ac-assistant-reply"><small className="ac-message-identity">Codex</small>{busy&&<ConversationProcessBlock blockKey="activity-demo" entries={workEntries} active open={processOpen} onToggle={(_,value)=>setProcessOpen(value)} onOpenFile={info}/>}<article className="ac-message"><MarkdownHost markdown={chat.answer}/></article></section></>}
              {chat.status==='waiting'&&<div className="ca-question"><strong>这次核对哪个环境？</strong><p>只读取该环境的订单和回调记录。</p><div>{['测试环境','预发布环境'].map(label=><Button key={label} size="small" onClick={()=>{setRows(previous=>previous.map(row=>row.id===chat.id?{...row,status:'running',time:35,answer:'已收到环境选择，正在核对相应记录。'}:row));updateScene({page:'conversation',state:''});message.success('已模拟回应，没有访问真实环境。');}}>{label}</Button>)}</div></div>}
            </div></div>
            <div className="ac-compose-wrap"><div className={'ca-execution-state is-'+chat.status}>{busy?<>执行中 <span>你可以先写下一条草稿</span></>:chat.status==='waiting'?<>等待你回应 <span>查看不等于已回答</span></>:chat.status==='unknown'?<>执行状态待确认 <span>不计入确定执行数量</span></>:chat.answer?<><CheckCircleOutlined/> 本轮已结束</>:<>尚未开始执行</>}</div>
              <div className="ac-composer"><Input.TextArea aria-label="对话输入" value={draft} placeholder={busy?'写下下一步想法，尚不会发送…':'继续说明你的要求…'} autoSize={{minRows:2,maxRows:5}} onChange={event=>setDraft(event.target.value)}/><div className="ac-compose-toolbar"><div className="ac-compose-access"><Button type="text" icon={<PlusOutlined/>} aria-label="添加材料" onClick={info}/><ConversationAgentSelect connections={connections} modelCatalog={models} value={choice} disabled={busy} onChange={setChoice}/><Select className="ac-choice ac-permission-select" aria-label="执行权限" variant="borderless" size="small" suffixIcon={null} labelRender={({label})=><span className="ac-permission-label"><SafetyCertificateOutlined/>{label}</span>} value="default" disabled={busy} options={[{value:'default',label:'默认权限'}]} onChange={info}/></div><div className="ac-compose-execution"><ConversationOptions connections={connections} modelCatalog={models} value={choice} onChange={setChoice} disabled={busy} showAgent={false}/>{busy?<Button type="text" icon={<StopOutlined/>} aria-label="停止执行" onClick={()=>{setRows(previous=>previous.map(row=>row.id===chat.id?{...row,status:'completed'}:row));message.success('已模拟停止；草稿保留。');}}/>:<Button type="primary" shape="circle" icon={<ArrowUpOutlined/>} aria-label="发送" disabled={!draft.trim()||chat.status==='waiting'} onClick={send}/>}</div></div></div>
            </div>
          </section>:<section className="ac-panel ca-panel" id="agent-conversation-panel"/>;
  const historyContent=<ActivityHistory key={scene.state} rows={rows} statsStatus={statsStatus} workspace={workspace} query={query} hidden={hidden} error={error} selected={selected} onWorkspace={value=>{setWorkspace(value);updateScene({page:'history',state:scene.state==='stats-narrow'?'stats-narrow':value==='全部工作空间'?'all':''});}} onQuery={setQuery} onHidden={()=>setHidden(value=>!value)} onRetry={()=>{setError(false);message.success('已更新对话列表（模拟）');}} onBack={historyDocked?()=>toggleDock('conversation'):work} onCreate={create} onOpen={open}/>;
  const panel=view==='history'&&historyDocked?<section className="ac-panel ca-panel" id="agent-conversation-panel">{historyContent}</section>:conversationPanel;
  return <div className="app-shell area-workbench has-primary-navigation ca-preview">
    <AppShellHeader primaryNavigation="rail" development brandHref="/overview" workspaceName="Buildr" workspaceMenuItems={[{key:'buildr',label:'Buildr',onClick:info},{key:'business',label:'业务平台',onClick:info}]} area="workbench" workbenchHref="/overview" workspaceDestination={{to:'/overview'}} actions={<><Button type="text" icon={<SearchOutlined/>} aria-label="搜索工作资料" onClick={info}/><Button type="text" icon={<EllipsisOutlined/>} aria-label="更多操作" onClick={info}/><Button type="primary" icon={<PlusOutlined/>} onClick={create}>提出新目标</Button></>}/>
    <AppShellFrame sidebarCollapsed={collapsed} onToggleSidebar={()=>setCollapsed(value=>!value)} navigation={null} navigationRail={<AppPrimaryNavigation workspaceId="demo" area="workbench" sidebarWidth={176} onSidebarResize={()=>{}}/>} afterContent={<ConversationDockSurface key={sceneVersion} initialActivityOpen={scene.page==='work'&&scene.state.startsWith('stats-')} panel={panel} activity={<ActivityRail initialFilter={scene.state==='stats-agent'?{kind:'agent',value:'Codex'}:scene.state==='stats-model'?{kind:'model',value:'SWE-2'}:null} statsStatus={statsStatus} onFilterState={filter=>{if(view==='work')updateScene({page:'work',state:filter?(filter.kind==='agent'?'stats-agent':'stats-model'):'stats-default'});}} rows={rows} view={dockOpen?view:'work'} selected={selected} onToggleHistory={()=>toggleDock('history')} onOpen={open} onHistory={value=>{history(value==='全部工作空间');if(value)setWorkspace(value);}}/>} open={dockOpen} view={view==='history'?'history':'conversation'} width={480} onToggle={()=>toggleDock('conversation')} railClassName="ca-rail"/>}>
      {view==='history'&&!historyDocked?<div className={'ca-history-stage'+(scene.state==='stats-narrow'?' is-narrow':'')}>{historyContent}</div>:
      <div className={'workspace-pages ca-workspace '+(view==='conversation'?'has-conversation':'')}>
        <div className="workspace-page-tabs"><PageTabStrip tabs={[{key:'task:demo',kind:'dir',title:'优化对话提醒体验',path:'/tasks/demo'}]} onClose={info} onReorder={()=>{}}/></div>
        <div className="ca-work-content">
          <section className="ca-task">
            <span className="ca-eyebrow">Buildr 产品 / 任务</span><h1>优化对话提醒体验</h1><p className="ca-task-description">让正在推进的工作与尚未查看的新结果，都能自然被发现。</p>
            <Tag color="processing">进行中</Tag><div className="ca-task-details"><h3>任务说明</h3><p>执行状态与查看状态各自独立。你可以继续浏览资料、修改文件，后台工作不会因为切换页面而中断。</p><h3>当前进展</h3><p>已核对现有对话列表、全局入口与自动标题的触发时机，正在整理提醒交互。</p><div className="ca-task-rule"/><h3>相关工作</h3><button onClick={()=>history(true)}><CommentOutlined/><span>查看全部工作空间的对话</span><span>→</span></button><button onClick={info}><FileTextOutlined/><span>对话提醒方案</span><span>→</span></button></div>
            <div className="ca-task-footer"><span>最近更新 · 今天 16:52</span><CheckCircleOutlined/> 已保存</div>
          </section>

        </div>
      </div>}
    </AppShellFrame>
    <Modal title="修改对话标题" open={rename} onCancel={()=>setRename(false)} okText="保存" cancelText="取消" onOk={()=>{if(!title.trim()||!chat)return;clearTimer();setRows(previous=>previous.map(row=>row.id===chat.id?{...row,title:title.trim(),short:title.trim().slice(0,4),titleState:undefined}:row));setRename(false);message.success('已手动命名（模拟），不会改变列表顺序。');}}><Input aria-label="新标题" value={title} maxLength={160} onChange={event=>setTitle(event.target.value)}/></Modal>
  </div>;
}
createRoot(document.getElementById('root')!).render(<ConfigProvider locale={zhCN} theme={{...softProductTheme,cssVar:true,hashed:false}} wave={{disabled:true}}><App><MemoryRouter initialEntries={['/tasks/demo']}><Preview/></MemoryRouter></App></ConfigProvider>);
