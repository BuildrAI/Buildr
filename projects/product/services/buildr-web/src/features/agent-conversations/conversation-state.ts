import type { ConversationView, ConversationEntry, ConversationEvent, ConversationRun, CatalogModel } from './types';

export function conversationRecoveryAction(conversation: ConversationView | null): {kind:'recover'|'observe';label:string} | null {
  const run = conversation?.run; if (!conversation || !run) return null;
  if (run.status === 'tools-active' && run.canContinue) return null;
  if (run.status === 'unknown' || run.status === 'tools-active' || ['failed','stopped','completed'].includes(run.status) && run.tools.some(tool => tool.status !== 'completed')) return {kind:'observe',label:'核对状态'};
  if (executionLocked(run) || currentConversationRequests(conversation).length || run.tools.some(tool => tool.status !== 'completed')) return null;
  const replied = conversation.entries.some(entry => !entry.parentToolId && entry.role === 'assistant' && entry.kind === 'message' && entry.text.trim() && (entry.runId === run.id || !entry.runId && entry.createdAt >= run.startedAt));
  if (!['failed','stopped','completed'].includes(run.status) || run.status === 'completed' && replied) return null;
  return {kind:'recover',label:run.accepted?'继续':'重试'};
}

/** A successful observation may confirm that the result is still unknown. */
export function conversationObservationFeedback(run?: ConversationRun): string {
  if (!run) return '读取完成：当前没有待处理的执行。';
  if (run.resourcesReleased && (run.status === 'unknown' || run.status === 'tools-active' || run.tools.some(tool => tool.status !== 'completed'))) return '读取完成：后台连接已释放，但未读到本轮结束记录。可发送新要求继续，不会重做原操作。';
  if (run.status === 'unknown') return '读取完成：仍无法读取原执行状态，记录已保留。可发送新要求，不会重做原操作。';
  if (run.status === 'tools-active' || run.tools.some(tool => tool.status !== 'completed')) return '读取完成：尚未取得部分命令的结束记录，请查看命令状态。';
  const labels: Record<ConversationRun['status'], string> = {starting:'正在准备执行',running:'仍在执行','waiting-approval':'仍在等待授权','waiting-question':'仍在等待你的回答',stopping:'正在停止',stopped:'已确认停止',completed:'本轮已结束',failed:'本轮执行失败',unknown:'执行状态待确认','tools-active':'仍有命令尚未确认结束'};
  return '读取完成：' + labels[run.status] + '。';
}

/** A changed execution choice may continue existing work after an explicit send. */
export function conversationContinuationText(conversation: ConversationView | null, changed: boolean, text: string, imageCount: number): string {
  if (text.trim() || imageCount || !changed || !conversation?.entries.some(entry => entry.role === 'user' && entry.kind === 'message')) return text;
  return '继续当前工作。请核对已有对话、尚未交付的用户要求和当前成果，接着完成未完成的目标；不要重复执行已完成的操作，不扩大原有授权。';
}

/** Only an unchanged, live execution can receive a supplement. Every other
 * ordinary input starts a new turn; old work is not an input admission gate. */
export function canSupplementConversation(conversation:ConversationView|null,choice:{connectionId?:string;model?:string;modelAccountId?:string;serviceTier?:string;permissionMode?:string;reasoningEffort?:string},supported:boolean):boolean {
  const run=conversation?.run,participant=conversation?.participants.find(value=>value.id===run?.participantId);
  return Boolean(supported&&run?.accepted&&run.status==='running'&&participant?.connectionId===choice.connectionId&&run.model===choice.model&&run.modelAccountId===choice.modelAccountId&&run.serviceTier===choice.serviceTier&&(run.permissionMode??'default')===(choice.permissionMode??'default')&&run.reasoningEffort===choice.reasoningEffort);
}

export function executionLocked(run?: ConversationRun): boolean {
  if (run?.status === 'tools-active' && run.canContinue) return false;
  return Boolean(run && ['starting', 'running', 'waiting-approval', 'waiting-question', 'stopping', 'tools-active', 'unknown'].includes(run.status));
}
/** Execution completion, not transport health or final-reply wording, ends observation. */
export function needsConversationObservation(conversation: ConversationView | null): boolean {
  if (!conversation) return false;
  if (conversation.pendingSend || conversation.requests.length || conversation.retainedRuns?.some(run=>executionLocked(run)||run.tools.some(tool=>tool.status!=='completed'))) return true;
  const run = conversation.run;
  return Boolean(run && (executionLocked(run) || run.tools.some(tool => tool.status !== 'completed') ||
    run.executionState === 'active' || run.executionState === 'unknown'));
}
/** Ordinary output/revision changes must not restart a healthy subscription. */
export function conversationObservationKey(conversation: ConversationView | null): string | null {
  if (!needsConversationObservation(conversation)) return null;
  return JSON.stringify([conversation!.workspaceId, conversation!.id, conversation!.run?.id,
    conversation!.run?.participantId, conversation!.run?.generation, conversation!.pendingSend?.id]);
}
const conversationConflictRefreshCodes = new Set(['agent_revision_conflict','agent_preview_stale','agent_model_source_changed','agent_model_source_unavailable','agent_model_unavailable','agent_model_disabled','agent_continue_stale']);
/** Only stale observations need a reread; busy and permission errors must keep their exact reason. */
export function conversationConflictNeedsRefresh(error:{status?:number;code?:string}|undefined):boolean {
  return error?.status===409&&Boolean(error.code&&conversationConflictRefreshCodes.has(error.code));
}
export function canStopConversationTool(tool:ConversationRun['tools'][number]):boolean {
  return tool.canStop===true&&tool.status!=='completed';
}
export function needsAttention(run?: ConversationRun): boolean {
  if (run?.status === 'tools-active' && run.canContinue) return false;
  return Boolean(run && ['waiting-approval', 'waiting-question', 'tools-active', 'unknown'].includes(run.status));
}
export function canGenerateConversationTitle(conversation:ConversationView|null):boolean {
  if(conversation?.run?.status!=='completed')return false;
  return (['user','assistant'] as const).every(role=>conversation.entries.some(entry=>entry.kind==='message'&&entry.role===role&&entry.text.trim()&&!['unknown','failed'].includes(entry.status||'')));
}
export function createdConversationVisibility(observed:{open:boolean;version:number},current:{open:boolean;version:number},openForTaskEntry:boolean):boolean {
  return observed.version===current.version?(openForTaskEntry||observed.open):current.open;
}
export function shouldSendOnKey(input: { key: string; shiftKey: boolean; isComposing?: boolean; keyCode?: number }): boolean {
  return input.key === 'Enter' && !input.shiftKey && !input.isComposing && input.keyCode !== 229;
}
export function applyConversationEvent(current: ConversationView | null, event: ConversationEvent, scope: {workspaceId: string; conversationId: string}, generation?: string, lastCursor?: number): ConversationView | null {
  if(!isCurrentConversationEvent(event,scope,generation,lastCursor))return current;
  const next = event.payload.conversation;
  if (!next || next.id !== scope.conversationId || next.workspaceId !== scope.workspaceId) return current;
  return mergeConversationView(current,next);
}
export function isCurrentConversationEvent(event:ConversationEvent,scope:{workspaceId:string;conversationId:string},generation?:string,lastCursor?:number):boolean {
  if(event.workspaceId!==scope.workspaceId||event.conversationId!==scope.conversationId)return false;
  if(event.type!=='snapshot'&&generation&&event.generation!==generation)return false;
  return !(generation===event.generation&&lastCursor!==undefined&&event.cursor<=lastCursor);
}
export function mergeConversationView(current: ConversationView | null,next: ConversationView, observedRevision?: string): ConversationView {
  if(current && current.id===next.id && current.workspaceId===next.workspaceId && observedRevision && current.revision!==observedRevision && current.revision!==next.revision)return current;
  if (!current || current.id !== next.id || current.workspaceId !== next.workspaceId || !next.entries.length) return next;
  const oldest = next.entries[0].sequence;
  const older = current.entries.filter(entry => entry.sequence < oldest);
  if (!older.length) return next;
  return {...next, entries:[...older,...next.entries], nextEntryCursor:current.nextEntryCursor};
}
export function prependConversationEntries(current: ConversationView,page: ConversationView): ConversationView {
  if(current.id!==page.id||current.workspaceId!==page.workspaceId)return current;
  const currentIds=new Set(current.entries.map(entry=>entry.id));
  return {...current,entries:[...page.entries.filter(entry=>!currentIds.has(entry.id)),...current.entries].sort((a,b)=>a.sequence-b.sequence),nextEntryCursor:page.nextEntryCursor};
}

export function draftKey(profile: string, workspaceId: string | null, conversationId: string | null): string {
  return !conversationId || conversationId === 'new'
    ? `buildr.agent-conversation.draft:${encodeURIComponent(profile)}:new`
    : `buildr.agent-conversation.draft:${encodeURIComponent(profile)}:${encodeURIComponent(workspaceId || 'unselected')}:${encodeURIComponent(conversationId)}`;
}
export function readDraft(key: string, storage: Pick<Storage, 'getItem'>): {text: string; taskId?: string; workspaceId?: string; available: boolean} {
  try {
    const saved=storage.getItem(key)||'';
    if(saved.startsWith('{')){const parsed=JSON.parse(saved);return {text:typeof parsed.text==='string'?parsed.text:'',taskId:typeof parsed.taskId==='string'&&parsed.taskId?parsed.taskId:undefined,...(typeof parsed.workspaceId==='string'&&parsed.workspaceId?{workspaceId:parsed.workspaceId}:{}),available:true};}
    return { text: saved, taskId: undefined, available: true };
  } catch { return { text: '', taskId: undefined, available: false }; }
}
export function writeDraft(key: string, text: string, storage: Pick<Storage, 'setItem' | 'removeItem'>, taskId?: string, workspaceId?: string): boolean {
  try { if (text || workspaceId) storage.setItem(key, taskId || workspaceId ? JSON.stringify({ text, taskId, workspaceId }) : text); else storage.removeItem(key); return true; } catch { return false; }
}
export function transferDraftText(source:string,target:string,read:(key:string)=>{text:string;taskId?:string},save:(key:string,text:string,taskId?:string)=>boolean):{text:string;taskId?:string;available:boolean} {
  const {text,taskId}=read(source);
  const available=save(target,text,taskId);
  if(source!==target)save(source,'');
  return {text,taskId,available};
}
export function appendDraftAttachment<T extends{id:string}>(current:T[],accepted:T):T[] {
  return current.some(item=>item.id===accepted.id)?current:[...current,accepted];
}
export function removeSubmittedAttachments<T extends{id:string}>(current:T[],submittedIds:readonly string[]):T[] {
  const submitted=new Set(submittedIds);
  return current.filter(item=>!submitted.has(item.id));
}
export function parseEventFrame(frame: string): {id?: string; data?: string; event?: string} {
  const result: {id?: string; data?: string; event?: string} = {};
  const lines: string[] = [];
  for (const line of frame.split('\n')) {
    if (line.startsWith(':')) continue;
    const separator = line.indexOf(':');
    const field = separator < 0 ? line : line.slice(0, separator);
    const value = separator < 0 ? '' : line.slice(separator + 1).replace(/^ /, '');
    if (field === 'data') lines.push(value);
    else if (field === 'id') result.id = value;
    else if (field === 'event') result.event = value;
  }
  if (lines.length) result.data = lines.join('\n');
  return result;
}

export type ConversationSelection = {generation:number;scope:{workspaceId:string;conversationId:string}|null};
export function sameConversationSelection(current:ConversationSelection,observed:ConversationSelection):boolean {
  return current.generation===observed.generation && current.scope?.workspaceId===observed.scope?.workspaceId && current.scope?.conversationId===observed.scope?.conversationId;
}

export function latestConversationParticipant(conversation:ConversationView|null) {
  return conversation?.participants.find(participant=>participant.id===conversation.run?.participantId)??conversation?.participants.at(-1);
}
/** A prompt may have only a run ID; never borrow an unrelated run or participant. */
export function conversationTurnBinding(entry:ConversationEntry|undefined,conversation:ConversationView|null) {
  const current=conversation?.run;
  const run=entry?.runId&&entry.runId===current?.id&&(!entry.participantId||entry.participantId===current.participantId)?current:undefined;
  const participantId=entry?.participantId??run?.participantId;
  const participant=participantId?conversation?.participants.find(item=>item.id===participantId):undefined;
  return {participant,run};
}
/** The same agent may hold several participants (sources or models); the summary names it once. */
export function participantAgentIds(participants:ConversationView['participants']):string[] {
  return [...new Set(participants.map(participant=>participant.provider))];
}

/** Actual participant bindings only; a draft or another participant's current model is not evidence. */
export function participantExecutionPairs(conversation:ConversationView|null):Array<{key:string;provider:string;model?:string;connectionId?:string;modelAccountId?:string}> {
  const pairs=new Map<string,{key:string;provider:string;model?:string;connectionId?:string;modelAccountId?:string}>();
  for(const participant of conversation?.participants??[]){
    const current=conversation?.run?.participantId===participant.id?conversation.run:undefined;
    const model=participant.model||current?.model;
    const key=JSON.stringify([participant.provider,model??null]);
    if(!pairs.has(key))pairs.set(key,{key,provider:participant.provider,model,connectionId:participant.connectionId,modelAccountId:participant.modelAccountId??current?.modelAccountId});
  }
  return [...pairs.values()];
}

// The visible stream interleaves conversation entries with per-run process blocks.
export type ConversationStreamItem = {type:'entry';entry:ConversationEntry}|{type:'process-block';entries:ConversationEntry[];active:boolean;finishedAt?:string};
/** Legacy records have no message phase: the last assistant message of a settled
 * run is its visible reply, regardless of length. Never promote live narration. */
export function groupConversationStream(entries:readonly ConversationEntry[],currentRun?:ConversationRun):ConversationStreamItem[] {
  const items:ConversationStreamItem[]=[];
  const isProcess=(entry:ConversationEntry)=>entry.kind==='tool'||entry.kind==='message'&&entry.role==='assistant';
  const finals=new Map<string,ConversationEntry>(),keys=new Map<ConversationEntry,string>();let legacy=0;
  for(const entry of entries){
    if(!entry.runId&&entry.kind==='message'&&entry.role==='user')legacy++;
    const key=entry.runId||'legacy:'+legacy;keys.set(entry,key);
    if(entry.kind==='message'&&entry.role==='assistant'&&!entry.parentToolId&&!(entry.runId===currentRun?.id&&executionLocked(currentRun)))finals.set(key,entry);
  }
  for(let index=0;index<entries.length;){
    const first=entries[index];
    if(!isProcess(first)){items.push({type:'entry',entry:first});index++;continue;}
    const run:ConversationEntry[]=[];
    while(index<entries.length&&isProcess(entries[index])&&entries[index].runId===first.runId)run.push(entries[index++]);
    const active=Boolean(currentRun&&currentRun.id===first.runId&&executionLocked(currentRun));
    const candidate=finals.get(keys.get(first)!);
    const result=active?undefined:run.find(entry=>entry===candidate);
    const process=result?run.filter(entry=>entry!==result):run;
    if(process.length)items.push({type:'process-block',entries:process,active,finishedAt:result?.createdAt});
    if(result)items.push({type:'entry',entry:result});
  }
  return items;
}
export type ConversationTurnItems={key:string;prompt?:ConversationEntry;items:ConversationStreamItem[]};
export function conversationStreamTurns(items:readonly ConversationStreamItem[]):ConversationTurnItems[]{
  const turns:ConversationTurnItems[]=[], owners=new Map<string,ConversationTurnItems>();
  for(const item of items){
    const entry=item.type==='entry'?item.entry:item.entries[0];
    if(item.type==='entry'&&entry.kind==='message'&&entry.role==='user'){
      const turn={key:entry.id,prompt:entry,items:[]};turns.push(turn);
      // Supplementary inputs in the same execution start a new visible segment.
      if(entry.runId)owners.set(entry.runId,turn);
    }else{
      if(!turns.length)turns.push({key:'earlier',items:[]});
      let owner=entry.runId?owners.get(entry.runId):undefined;
      if(!owner&&item.type==='process-block'&&entry.runId&&turns.at(-1)!.prompt?.runId&&entry.runId!==turns.at(-1)!.prompt!.runId){
        // A replayed result may precede the loaded history page. It cannot belong
        // to the latest input merely because it was projected later.
        owner={key:'history:'+entry.runId,items:[]};turns.unshift(owner);
      }
      owner??=turns.at(-1)!;
      let previous:ConversationStreamItem|undefined;
      for(let index=owner.items.length-1;index>=0;index--){
        const candidate=owner.items[index];
        const source=candidate.type==='entry'?candidate.entry:candidate.entries[0];
        if(!entry.runId||!source.runId||source.runId===entry.runId){previous=candidate;break;}
      }
      // Arrival order can interleave other runs. Once ownership is known,
      // reconnect only adjacent process pieces within this visible segment.
      if(item.type==='process-block'&&previous?.type==='process-block'&&previous.entries[0].runId===entry.runId){
        previous.entries.push(...item.entries);
        previous.active ||= item.active;
        previous.finishedAt=item.finishedAt??previous.finishedAt;
      }else owner.items.push(item.type==='process-block'?{...item,entries:[...item.entries]}:item);
      if(entry.runId)owners.set(entry.runId,owner);
    }
  }
  return turns;
}
/** Retry notices carry the accepted run before its first assistant/tool item. */
export function conversationTurnExecution(turn:ConversationTurnItems,run?:ConversationRun):{current:boolean;active:boolean;waiting?:string}{
  const entries=[...(turn.prompt?[turn.prompt]:[]),...turn.items.flatMap(item=>item.type==='entry'?[item.entry]:item.entries)];
  const current=Boolean(run&&entries.some(entry=>entry.runId===run.id));
  const active=current&&Boolean(run&&['starting','running'].includes(run.status));
  const responded=Boolean(run&&entries.some(entry=>entry.runId===run.id&&(entry.role==='assistant'||entry.kind==='tool')));
  return {current,active,...(active&&!responded?{waiting:run?.accepted?'已送达，等待智能体回应…':'正在准备连接并确认指令送达…'}:{})};
}
export function toolEntryHeadline(entry:ConversationEntry):string {
  return entry.text.split('\n',1)[0].trim();
}
const TOOL_NAME_LABELS:Record<string,string>={command:'已运行',commandExecution:'已运行','file-change':'已修改','mcp-tool':'已调用',bash:'已运行',read:'已读取',write:'已写入',edit:'已编辑',glob:'已查找',grep:'已搜索',web_fetch:'已获取',web_fetch_url:'已获取',web_search:'已搜索',ls:'已列出'};
/** Stable tool names map to semantic action labels; names the dictionary misses show as-is. */
export function toolStepLabel(entry:ConversationEntry):string {
  const name=entry.name?.trim();
  const headline=toolEntryHeadline(entry);
  if(!name)return headline;
  // File changes list affected paths below the generic first line.
  if(name==='file-change'){const paths=entry.text.split('\n').slice(1).map(line=>line.trim()).filter(Boolean);return `已修改 ${paths.length} 个文件${paths.length?'：'+paths[0]+(paths.length>1?' 等':''):''}`;}
  // Some executors keep the raw name as the text first line; prefer its argument line.
  const detail=headline===name?(entry.text.split('\n',2)[1]??'').trim():headline;
  const verb=TOOL_NAME_LABELS[name]??TOOL_NAME_LABELS[name.toLowerCase()];
  if(verb)return `${verb} ${detail}`.trim();
  return `已调用 ${name}${detail?' · '+detail:''}`;
}
export function processBlockSummary(entries:readonly ConversationEntry[]):{running:number;failed:number;latest:ConversationEntry;focus:ConversationEntry;startedAt:string;finishedAt:string} {
  let running=0,failed=0;
  let lastFailed:ConversationEntry|null=null;
  for(const entry of entries){
    if(entry.status==='running')running++;
    else if(entry.status==='failed'){failed++;lastFailed=entry;}
  }
  const latest=entries[entries.length-1];
  // Running blocks show the freshest step; settled blocks surface a failure over the tail.
  return {running,failed,latest,focus:running>0||!lastFailed?latest:lastFailed,startedAt:entries[0].createdAt,finishedAt:latest.createdAt};
}
// Keep expansion stable as more steps arrive in the same process.
export function processBlockKey(entries:readonly ConversationEntry[]):string {
  return 'process-block:'+entries[0].id;
}

/** Prepending steps can change a block's first entry; keep explicit open/closed choices on overlapping blocks. */
export function carryExpandedProcessBlocks(current:readonly ConversationEntry[],added:readonly ConversationEntry[],expanded:Record<string,boolean>,run?:ConversationRun):Record<string,boolean>{
 const marks=new Map<string,boolean>();
 for(const item of conversationStreamTurns(groupConversationStream(current,run)).flatMap(turn=>turn.items))if(item.type==='process-block'){
   const value=expanded[processBlockKey(item.entries)];
   if(value!==undefined)for(const entry of item.entries)marks.set(entry.id,value);
 }
 if(!marks.size)return expanded;
 const entries=[...new Map([...added,...current].map(e=>[e.id,e])).values()].sort((a,b)=>a.sequence-b.sequence),next={...expanded};
 for(const item of conversationStreamTurns(groupConversationStream(entries,run)).flatMap(turn=>turn.items))if(item.type==='process-block'){
   const value=item.entries.map(e=>marks.get(e.id)).find((v):v is boolean=>v!==undefined);
   if(value!==undefined)next[processBlockKey(item.entries)]=value;
 }
 return next;
}

/** Persisted running items do not prove a historical execution is still live. */
export function processEntryStatus(entry:ConversationEntry,active:boolean):string|undefined {
  return !active&&(!entry.status||entry.status==='running')?'unknown':entry.status;
}

/** Each entry toggles its own view; the other entry switches the visible view. */
export function nextConversationPanel(open:boolean,view:'conversation'|'history',target:'conversation'|'history') {
  return {open:!open||view!==target,view:target};
}

/** The latest real context-usage report observed for a conversation, kept with its original source. */
export type ConversationContextReport = {
  workspaceId: string;
  conversationId: string;
  runId: string;
  provider?: string;
  model?: string;
  modelAccountId?: string;
  modelAccountIdentity?: string;
  modelSourceLabel?: string;
  serviceTier?: string;
  usedTokens: number;
  windowTokens?: number;
};

/** A newer run without a report never erases the retained one; a real report (including zero) replaces it wholesale. */
export function rememberContextReport(current: ConversationContextReport | null, conversation: ConversationView | null | undefined): ConversationContextReport | null {
  const run = conversation?.run;
  const usage = run?.contextUsage;
  if (!conversation || !run || !usage || !Number.isSafeInteger(usage.usedTokens) || usage.usedTokens < 0) return current;
  if (current?.runId === run.id && current.conversationId === conversation.id && current.usedTokens === usage.usedTokens && current.windowTokens === usage.windowTokens) return current;
  return {
    workspaceId: conversation.workspaceId,
    conversationId: conversation.id,
    runId: run.id,
    provider: run.provider,
    model: run.model,
    modelAccountId: run.modelAccountId,
    modelAccountIdentity: run.modelAccountIdentity,
    modelSourceLabel: run.modelSourceLabel,
    serviceTier: run.serviceTier,
    usedTokens: usage.usedTokens,
    windowTokens: Number.isSafeInteger(usage.windowTokens) && usage.windowTokens! > 0 ? usage.windowTokens : undefined,
  };
}

/** A retained report is only visible in the workspace and conversation that produced it. */
export function visibleContextReport(report: ConversationContextReport | null | undefined, conversation: ConversationView | null | undefined): ConversationContextReport | null {
  if (!report || !conversation || report.workspaceId !== conversation.workspaceId || report.conversationId !== conversation.id) return null;
  return report;
}

/** The percentage basis belongs to the report; a missing window is filled only from the same catalog source and tier, never from the current selection. */
export function contextReportWindow(report: ConversationContextReport, catalog: CatalogModel[]): number | undefined {
  if (Number.isSafeInteger(report.windowTokens) && report.windowTokens! > 0) return report.windowTokens;
  const source = catalog.find(item => item.accountId === report.modelAccountId && item.modelId === report.model && (!report.modelAccountIdentity || item.accountIdentity === report.modelAccountIdentity));
  if (!source) return undefined;
  const tier = source.serviceTiers?.find(item => item.id === (report.serviceTier ?? source.defaultServiceTier));
  return source.contextWindowOverride === undefined ? tier?.contextWindow ?? source.contextWindow : Math.min(source.contextWindowOverride, tier?.contextWindow ?? source.reportedContextWindow ?? source.contextWindowOverride);
}

/** The current run's own report wins; a retained report fills the gap while a new run has not reported yet. */
export function conversationUsageReport(contextReport: ConversationContextReport | null | undefined, conversation: ConversationView | null | undefined): ConversationContextReport | null {
  return rememberContextReport(null, conversation) ?? visibleContextReport(contextReport, conversation);
}

/** Only current execution bindings are actionable; history is rendered as ordinary entries. */
export function currentConversationRequests(conversation: ConversationView | null): ConversationView['requests'] {
  const run=conversation?.run;
  if(!run||['completed','stopped'].includes(run.status))return [];
  return conversation!.requests.filter(request=>request.runId===run.id&&request.participantId===run.participantId&&request.generation===run.generation);
}
