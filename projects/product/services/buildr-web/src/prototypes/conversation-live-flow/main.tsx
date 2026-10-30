import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { Alert, App, Button, ConfigProvider, Dropdown, Select, Tag } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { ArrowUpOutlined, CopyOutlined, EllipsisOutlined, MenuOutlined, PlusOutlined, SafetyCertificateOutlined, StopOutlined } from '@ant-design/icons';
import { AppShellFrame, AppShellHeader } from '../../app/AppShellView';
import { AppPrimaryNavigation } from '../../app/AppPrimaryNavigation';
import { MarkdownHost } from '../../components/MarkdownHost';
import { AgentConversationsViewProvider, useAgentConversations, type AgentConversationsContextValue } from '../../features/agent-conversations/AgentConversationsContext';
import { ConversationComposer } from '../../features/agent-conversations/ConversationComposer';
import { ConversationHistory } from '../../features/agent-conversations/ConversationHistory';
import { ConversationTurn } from '../../features/agent-conversations/ConversationTurn';
import { ConversationMessageImages } from '../../features/agent-conversations/ConversationMessageImages';
import { ConversationProcessBlock } from '../../features/agent-conversations/ConversationProcessBlock';
import { ConversationRequest } from '../../features/agent-conversations/ConversationRequest';
import { ConversationAgentSelect, ConversationOptions } from '../../features/agent-conversations/ConversationOptions';
import { imageSelectionError } from '../../features/agent-conversations/conversation-images';
import { shouldSendOnKey } from '../../features/agent-conversations/conversation-state';
import type { DraftImage } from '../../features/agent-conversations/ConversationImageInput';
import type { ConversationChoice } from '../../features/agent-conversations/conversation-options';
import type { ConversationEntry, ConversationView } from '../../features/agent-conversations/types';
import { usePrototypeBridge } from '../prototype-bridge';
import { softProductTheme } from '../../theme';
import { approvalRequest, connection, continuedProcess, finalAnswer, firstProcess, firstQuestion, model, sampleConversation, sampleImage, supplement, workspace } from './fixtures';
import { mockConversationClient } from './mock-client';
import scenes from './scenes.json';
import 'antd/dist/reset.css';
import '../../styles.css';
import '../../features/agent-conversations/agent-conversations.css';
import '../../features/agent-conversations/conversation-flow.css';
import './preview.css';

type Phase = 'running' | 'completed' | 'failed' | 'waiting' | 'supplement-error' | 'stopped';
type Segment = { id: string; user: { text: string; attachments: string[] }; process: ConversationEntry[] };
type SettledRound = { id: string; segments: Segment[]; phase: Phase; startedAt: string; finishedAt?: string; answer?: string };
const initialChoice: ConversationChoice = { connectionId: 'codex', modelAccountId: 'demo', modelAccountIdentity: 'demo', modelAccountRevision: 'demo', model: 'gpt-6.1-sol', reasoningEffort: 'high' };

function Preview({ record }: { record: { current: ConversationView } }) {
  const { message } = App.useApp(), context = useAgentConversations();
  const [phase, setPhase] = useState<Phase>('running'), [segments, setSegments] = useState<Segment[]>([]), [settledRounds, setSettledRounds] = useState<SettledRound[]>([]), [roundId, setRoundId] = useState('run-demo');
  const [choice, setChoice] = useState(initialChoice), [draft, setDraft] = useState(''), [images, setImages] = useState<DraftImage[]>([]);
  const [sending, setSending] = useState(false), [error, setError] = useState(''), [showHistory, setShowHistory] = useState(false), [sidebarWidth, setSidebarWidth] = useState(176);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({}), [startedAt, setStartedAt] = useState(() => new Date(Date.now() - 110000).toISOString()), [finishedAt, setFinishedAt] = useState<string>();
  const [scene, setScene] = useState({ page: 'conversation', state: '' });
  const currentScene = useRef(scene), generation = useRef(0), composing = useRef(false), stream = useRef<HTMLDivElement>(null), atBottom = useRef(true);
  const files = useRef(new Map<string, File>()), timers = useRef<Array<ReturnType<typeof setTimeout>>>([]), failNextSend = useRef(false);
  const currentSegments=useRef(segments);currentSegments.current=segments;
  const live = phase === 'running' || phase === 'supplement-error', pending = phase === 'waiting';
  const busy = live || pending;
  const stopped = phase === 'completed' || phase === 'failed' || phase === 'stopped';
  const updateScene = (next: { page: string; state: string }) => { currentScene.current = next; setScene(next); };
  const clearTimers = () => { generation.current++; for (const timer of timers.current) clearTimeout(timer); timers.current = []; setSending(false); };
  const later = (callback: () => void, delay: number) => { const token = generation.current; timers.current.push(setTimeout(() => { if (token === generation.current) callback(); }, delay)); };
  const readImage = useCallback(async (_conversation: ConversationView, id: string) => { const file = files.current.get(id); if (!file) throw new Error('示例图片不存在。'); return file; }, []);
  const historyGeneration = useRef(context.selectionGeneration);
  useEffect(() => {
    if (context.view === 'conversation') setShowHistory(false);
    if (context.selectionGeneration !== historyGeneration.current) { historyGeneration.current = context.selectionGeneration; setShowHistory(false); }
  }, [context.view, context.selectionGeneration]);

  function setRun(next: Phase, state = next) {
    if (next === 'completed' || next === 'failed' || next === 'stopped') clearTimers();
    setPhase(next);
    if(next==='completed'||next==='failed'||next==='stopped')setExpanded(previous=>Object.fromEntries(Object.entries(previous).filter(([id])=>!currentSegments.current.some(segment=>segment.id===id))));
    if (next === 'completed' || next === 'failed' || next === 'stopped') { setFinishedAt(new Date().toISOString()); setSegments(previous => previous.map(segment => ({ ...segment, process: segment.process.map(entry => entry.status === 'running' ? { ...entry, status: next === 'failed' ? 'failed' : next === 'stopped' ? 'unknown' : 'completed', ...(next === 'failed' ? { text: '检查命令暂时未完成：示例环境缺少依赖。' } : next === 'completed' ? { text: '对话发送、图片和历史记录检查通过。' } : {}) } : entry) }))); }
    updateScene({ page: 'conversation', state });
  }
  async function chooseScene(page: string, state: string, force = false) {
    if (!force && currentScene.current.page === page && currentScene.current.state === state && segments.length) return;
    clearTimers(); const token = generation.current;
    const next: Phase = ['running', 'completed', 'failed', 'waiting', 'supplement-error', 'stopped'].includes(state) ? state as Phase : 'running';
    setPhase(next); failNextSend.current=next==='supplement-error'; setSettledRounds([]); setRoundId('run-demo'); setShowHistory(false); context.setView('conversation'); setChoice(initialChoice); setDraft(''); setImages([]); setError(''); setExpanded({}); setFinishedAt(undefined); setStartedAt(new Date(Date.now() - 110000).toISOString());
    const image = await sampleImage(); if (generation.current !== token) return;
    files.current.set('sample-screenshot', image);
    const tail = continuedProcess().map((entry): ConversationEntry => entry.status !== 'running' ? entry : { ...entry, status: next === 'failed' ? 'failed' : next === 'completed' ? 'completed' : next === 'stopped' ? 'unknown' : 'running', ...(next === 'failed' ? { text: '检查命令暂时未完成：示例环境缺少依赖。' } : next === 'completed' ? { text: '对话发送、图片和历史记录检查通过。' } : {}) });
    setSegments([{ id: 'first', user: { text: firstQuestion, attachments: [] }, process: firstProcess() }, { id: 'supplement', user: { text: supplement, attachments: ['sample-screenshot'] }, process: tail }]);
    if (next === 'completed' || next === 'failed' || next === 'stopped') setFinishedAt(new Date().toISOString());
    if (next === 'supplement-error') { setDraft('再补充一点，图片也要支持直接粘贴和拖入。'); setImages([{ id: 'retry-screenshot', name: image.name, file: image, revision: 'demo', mimeType: image.type, size: image.size }]); setError('这条消息未发送成功，文字和图片已保留。请重试。'); }
    updateScene({ page, state });
  }
  const bridge = usePrototypeBridge(scenes.pages, currentScene, chooseScene);
  useEffect(() => { void chooseScene('conversation', ''); return () => clearTimers(); }, []);
  useEffect(() => { bridge.report(scene.page, scene.state); }, [scene.page, scene.state]);
  useEffect(() => { if (atBottom.current) stream.current?.scrollTo({ top: stream.current.scrollHeight }); }, [segments, phase, sending, images.length]);
  useEffect(() => {
    const allSegments=[...settledRounds.flatMap(round=>round.segments),...segments];
    record.current = { ...record.current, entries: allSegments.flatMap(segment => [{ id: 'user-' + segment.id, sequence: 1, kind: 'message' as const, role: 'user' as const, text: segment.user.text, createdAt: startedAt }, ...segment.process]), run: { ...record.current.run!, id:roundId, status: phase === 'waiting' ? 'waiting-approval' : phase === 'supplement-error' ? 'running' : phase, startedAt }, updatedAt: new Date().toISOString() };
  }, [segments, settledRounds, roundId, phase, startedAt, record]);
  async function addImages(selected: File[]) {
    const validation = imageSelectionError(selected, images.length); if (validation) { setError(validation); return; }
    setError(''); const next = selected.map(file => { const id = crypto.randomUUID(); files.current.set(id, file); return { id, name: file.name, file, mimeType: file.type, size: file.size, revision: 'demo' }; });
    setImages(previous => [...previous, ...next]);
  }
  async function send() {
    if (sending || !draft.trim() && !images.length) return;
    const submittedText = draft, submittedImages = [...images]; setSending(true); setError('');
    if (phase === 'supplement-error' && failNextSend.current) {
      failNextSend.current=false; later(() => { setSending(false); setError('这条消息未发送成功，文字和图片已保留。请重试。'); }, 450); return;
    }
    later(() => {
      setSending(false); setDraft(current => current === submittedText ? '' : current); setImages(current => current.filter(image => !submittedImages.some(sent => sent.id === image.id)));
      const acceptedRunId=busy?roundId:crypto.randomUUID();
      if (!busy) {
        setSettledRounds(previous=>[...previous,{id:roundId,segments,phase,startedAt,finishedAt,answer:phase==='completed'?finalAnswer:undefined}]);
        setSegments([]);setRoundId(acceptedRunId);setStartedAt(new Date().toISOString());setFinishedAt(undefined);setRun('running');
      }
      else if(phase==='supplement-error')setRun('running');
      const id = crypto.randomUUID();
      const makeNote = (text: string, suffix: string): ConversationEntry => ({ id: id + suffix, sequence: Date.now(), kind: 'message', role: 'assistant', provider: 'codex', runId: acceptedRunId, participantId: 'codex-demo', createdAt: new Date().toISOString(), text, status: 'completed' });
      setSegments(previous => [...previous, { id, user: { text: submittedText, attachments: submittedImages.map(image => { if (image.file) files.current.set(image.id, image.file); return image.id; }) }, process: [] }]);
      atBottom.current = true;
      later(() => setSegments(previous => previous.map(segment => segment.id === id ? { ...segment, process: [makeNote(pending ? '收到补充信息。命令仍在等待你的明确授权。' : submittedImages.length ? '我会结合这张图片和补充内容，继续当前工作。' : '我会把这项补充一并考虑，继续当前工作。', '-note')] } : segment)), 650);
      if (!pending) {
        later(() => setSegments(previous => previous.map(segment => segment.id === id ? { ...segment, process: [...segment.process, { ...makeNote('已核对补充内容与当前修改。', '-tool'), kind: 'tool', role: 'system', name: 'read', input: JSON.stringify({ file_path: 'src/features/agent-conversations/ConversationImageInput.tsx' }) }] } : segment)), 1450);
        later(() => setRun('completed'), 6500);
      }
    }, 450);
  }
  const info = () => { void message.info('这是交互原型，操作只影响本次演示。'); };
  function history() { context.setView('history'); setShowHistory(true); }
  const chat = record.current;
  const renderAnswer=(answer:string,id:string,position?:string)=><article className="ac-message is-assistant" data-run-id={id} data-prototype-position={position}><MarkdownHost markdown={answer} className="markdown-body"/><Button type="text" size="small" icon={<CopyOutlined/>} aria-label="复制回复" onClick={()=>{void message.success('已模拟复制回复。');}}/></article>;
  const renderSegments=(rows:Segment[],id:string,active:boolean,start:string,endedAt?:string,positions=false,answer?:string)=>rows.map((segment,index)=>{
    const keys=[...(!active?[segment.id]:[]),...segment.process.filter(entry=>entry.kind==='tool').flatMap(entry=>['tool-group:'+entry.id,'tool:'+entry.id])];
    return <ConversationTurn key={id+':'+segment.id} id={id+':'+segment.id} runId={id}
      prompt={{id:'user-'+segment.id,text:segment.user.text,images:segment.user.attachments.length>0?<ConversationMessageImages conversation={chat} ids={segment.user.attachments} read={readImage}/>:undefined}}
      identity="Codex · GPT-6.1-Sol" executing={active&&!pending&&index===rows.length-1} startedAt={active&&!pending&&index===rows.length-1?start:undefined}
      onCollapseProcess={keys.some(key=>expanded[key]===true)?()=>setExpanded(previous=>({...previous,...Object.fromEntries(keys.map(key=>[key,false]))})):undefined} collapseLabel={!active&&expanded[segment.id]?'收起处理过程':'收起工具调用'}>
      {segment.process.length>0&&<div data-run-id={id} data-prototype-position={positions?(index===0?'process-before':index===rows.length-1?'process-after':undefined):undefined}><ConversationProcessBlock blockKey={segment.id} entries={segment.process} active={active} finishedAt={endedAt} open={expanded[segment.id]??false}
        groupsOpen={expanded} onGroupToggle={(ids,open)=>setExpanded(previous=>({...previous,...Object.fromEntries(ids.map(key=>['tool-group:'+key,open]))}))} toolsOpen={expanded} onToolToggle={(key,open)=>setExpanded(previous=>({...previous,['tool:'+key]:open}))}
        onToggle={(key,open)=>setExpanded(previous=>({...previous,[key]:open}))} onOpenFile={path=>{void message.info('示例文件：'+path);}}/></div>}
      {index===rows.length-1&&answer&&renderAnswer(answer,id,positions?'final-answer':undefined)}
    </ConversationTurn>;
  });
  return <div className="app-shell area-workbench has-primary-navigation clf-preview">
    <AppShellHeader primaryNavigation="rail" development brandHref="/overview" workspaceName="Buildr" workspaceMenuItems={[{ key: 'demo', label: 'Buildr', onClick: info }]} area="workbench" workbenchHref="/overview" workspaceDestination={{ to: '/overview' }} actions={<Tag>交互原型 · 示例数据</Tag>} />
    <AppShellFrame sidebarCollapsed onToggleSidebar={info} navigation={null} navigationRail={<AppPrimaryNavigation workspaceId="demo" area="workbench" sidebarWidth={sidebarWidth} onSidebarResize={setSidebarWidth} />}>
      <section id="agent-conversation-panel" className="ac-panel is-full clf-panel" data-conversation-id="conversation-demo" aria-label="内部对话">
        {showHistory ? <ConversationHistory workspaces={[workspace]} defaultWorkspaceId={workspace.id} /> : <>
          <header className="ac-thread-header"><Button type="text" icon={<MenuOutlined />} aria-label="查看对话列表" title="对话列表" onClick={history} /><div className="ac-thread-heading"><button type="button" className="ac-thread-title" onClick={info}>让对话自然地继续</button><span className="ac-thread-identity">ID conversation-demo</span></div><div className="ac-thread-actions">{busy&&<Button className="ac-stop-button" type="text" icon={<StopOutlined/>} aria-label="停止本次执行" title="停止本次执行" onClick={()=>{clearTimers();setRun('stopped');}}>停止</Button>}<Button type="text" icon={<PlusOutlined />} aria-label="新建对话" onClick={info} /><Dropdown trigger={['click']} menu={{ items: [{ key: 'sample', label: '试试补充图文' }, { key: 'long', label: '试试长输入' }, { key: 'long-process', label: '试试长过程' }, { key: 'complete', label: '模拟本轮完成' }, { key: 'failure', label: '模拟执行失败' }, { key: 'waiting', label: '模拟等待授权' }, { key: 'send-error', label: '模拟发送失败' }, { type: 'divider' }, { key: 'reset', label: '重新开始演示' }], onClick: ({ key }) => { if (key === 'sample') { void sampleImage().then(file => { setDraft('还有，图片也要支持直接粘贴和拖入。'); void addImages([file]); }); } else if(key==='long-process'){clearTimers();setExpanded({});setPhase('completed');setFinishedAt(new Date().toISOString());setSegments([{id:'long-process',user:{text:firstQuestion,attachments:[]},process:Array.from({length:16},(_,i)=>[
      {id:'long-note-'+i,sequence:i*3,kind:'message' as const,role:'assistant' as const,provider:'codex',runId:roundId,text:`第 ${i+1} 项检查：保留上下文与展开选择，随时可以从固定名称行或内容底部收起处理过程。`,createdAt:startedAt,status:'completed' as const},
      ...[0,1].map(j=>({id:`long-tool-${i}-${j}`,sequence:i*3+j+1,kind:'tool' as const,role:'system' as const,name:'command',provider:'codex',runId:roundId,text:`echo check-${i}-${j}\n检查完成。`,createdAt:startedAt,status:'completed' as const}))
    ]).flat()}]);updateScene({page:'conversation',state:'completed'});atBottom.current=false;stream.current?.scrollTo({top:0});} else if(key==='long'){setSegments(previous=>previous.map((segment,index)=>index===0?{...segment,user:{...segment.user,text:Array.from({length:20},(_,i)=>`${i+1}. 请保留用户输入和智能体信息，滚动时可以随时回看本轮要求。长内容展开后在固定区域内阅读。`).join('\n')}}:segment));atBottom.current=false;stream.current?.scrollTo({top:0});} else if (key === 'complete') { clearTimers(); setRun('completed'); } else if (key === 'failure') { clearTimers(); setRun('failed'); } else void chooseScene('conversation', key === 'waiting' ? 'waiting' : key === 'send-error' ? 'supplement-error' : '', key === 'reset'); } }}><Button type="text" icon={<EllipsisOutlined />} aria-label="更多对话操作" title="更多" /></Dropdown></div></header>
          <div className="ac-participants">参与过此对话 <span>Codex · GPT-6.1-Sol</span></div>
          <div className="ac-stream" ref={stream} onScroll={event => { const node = event.currentTarget; atBottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < 48; }}>
            <div className="ac-message-list" data-prototype-position="conversation-stream">
              {settledRounds.map(round=><div className="clf-settled-round" key={round.id} data-settled-run-id={round.id}>{renderSegments(round.segments,round.id,false,round.startedAt,round.finishedAt,false,round.answer)}{round.phase==='failed'&&<p className="clf-stopped">这次执行没有完成，处理过程已保留。</p>}{round.phase==='stopped'&&<p className="clf-stopped">已停止，处理过程已保留。</p>}</div>)}
              {renderSegments(segments,roundId,!stopped,startedAt,finishedAt,true,phase==='completed'?finalAnswer:undefined)}
              {phase === 'failed' && <Alert className="clf-status-alert" type="warning" showIcon message="这次执行没有完成" description="检查命令暂时失败。已保留处理过程和你的补充内容，可以继续说明要求后再发送。" />}
              {phase === 'stopped' && <p className="clf-stopped" role="status">已停止，当前处理过程和你的补充内容已保留。</p>}
              {pending && <div data-prototype-position="approval-request"><ConversationRequest request={approvalRequest()} provider="codex" busy={false} onReply={answer => { if (answer === 'deny') { clearTimers(); setRun('stopped'); } else { setRun('running'); later(() => setRun('completed'), 5000); } }} /></div>}
            </div>
          </div>
          <div className="ac-compose-wrap" data-prototype-position="composer">
            {error && <Alert type="warning" showIcon message={error} closable onClose={() => setError('')} />}
            <ConversationComposer images={images} materialDisabled={sending} addDisabled={sending} input={{ id: 'agent-conversation-input', 'aria-label': '对话输入', placeholder: '继续补充要求', value: draft, autoSize: { minRows: 2, maxRows: 6 }, onChange: event => setDraft(event.target.value), onCompositionStart: () => { composing.current = true; }, onCompositionEnd: () => { composing.current = false; }, onKeyDown: event => { if (shouldSendOnKey({ key: event.key, shiftKey: event.shiftKey, isComposing: composing.current || event.nativeEvent.isComposing, keyCode: event.nativeEvent.keyCode })) { event.preventDefault(); void send(); } } }} onAdd={addImages} onRemove={id => setImages(current => current.filter(image => image.id !== id))} onBlocked={() => setError('正在发送，请稍后再添加图片。')}
              access={<><ConversationAgentSelect connections={[connection]} value={choice} disabled={busy || sending} onChange={setChoice} /><Select className="ac-choice ac-permission-select" aria-label="执行权限" placement="topLeft" variant="borderless" size="small" suffixIcon={null} labelRender={({ label }) => <span className="ac-permission-label"><SafetyCertificateOutlined />{label}</span>} value="default" disabled={busy || sending} options={[{ value: 'default', label: '默认权限' }]} onChange={info} /></>}
              execution={<><ConversationOptions connections={[connection]} modelCatalog={[model]} showAgent={false} value={choice} disabled={busy || sending} onChange={setChoice} /><Button type="primary" shape="circle" icon={<ArrowUpOutlined />} aria-label="发送对话" title="发送" disabled={sending || !draft.trim() && !images.length} loading={sending} onClick={() => void send()} /></>} />
            <div className="ac-location-meta"><span>所属工作空间：Buildr</span><span>· <button className="ac-task-associate-trigger" onClick={info}>关联任务</button></span><small className="ac-location-keys">Enter 发送 · Shift+Enter 换行</small></div>
          </div>
        </>}
      </section>
    </AppShellFrame>
  </div>;
}
function Prototype() {
  const record = useRef(sampleConversation()), client = useMemo(() => mockConversationClient(record), []);
  const [view,setView] = useState<'conversation'|'history'>('conversation'), [selectionGeneration,setSelectionGeneration] = useState(0);
  const selection = () => ({generation:selectionGeneration,scope:{workspaceId:workspace.id,conversationId:record.current.id}});
  const nothing = () => {}, resolved = async () => {};
  const value: AgentConversationsContextValue = {
    api:client,activityCounts:undefined,activityStats:undefined,activityRows:[],activityTotal:0,activityError:'',activityTick:0,historyWorkspaceId:workspace.id,openHistory:()=>setView('history'),refreshActivity:resolved,loadMoreActivity:resolved,markSeen:resolved,
    reconnecting:false,recovering:false,open:true,side:'right',full:true,view,scope:{workspaceId:workspace.id,conversationId:record.current.id},draftScope:null,conversation:record.current,connections:[connection],pending:[],modelCatalog:[model],modelCatalogReady:true,modelCatalogError:'',refreshModelCatalog:resolved,loading:false,error:'',streamError:'',settings:false,
    setSettings:nothing,setOpen:nothing,setFull:nothing,setView,move:nothing,openGlobal:()=>setView('history'),toggle:nothing,toggleView:setView,openConversation:async()=>{setView('conversation');setSelectionGeneration(current=>current+1);},newConversation:()=>{setView('conversation');setSelectionGeneration(current=>current+1);},refresh:resolved,refreshConnections:resolved,refreshPending:resolved,apply:nothing,prependEntries:nothing,updateConnection:nothing,selectionGeneration,getSelection:selection,isSelectionCurrent:observed=>observed.generation===selectionGeneration,create:async()=>record.current,
  };
  return <AgentConversationsViewProvider value={value}><Preview record={record} /></AgentConversationsViewProvider>;
}
createRoot(document.getElementById('root')!).render(<ConfigProvider locale={zhCN} theme={{ ...softProductTheme, cssVar: true, hashed: false }} wave={{ disabled: true }}><App><MemoryRouter initialEntries={['/overview']}><Prototype /></MemoryRouter></App></ConfigProvider>);
