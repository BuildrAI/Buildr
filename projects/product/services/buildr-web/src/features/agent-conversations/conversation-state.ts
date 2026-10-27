import type { ConversationView, ConversationEntry, ConversationEvent, ConversationRun } from './types';

export function executionLocked(run?: ConversationRun): boolean {
  return Boolean(run && ['starting', 'running', 'waiting-approval', 'waiting-question', 'stopping', 'tools-active', 'unknown'].includes(run.status));
}
export function canStopConversationTool(tool:ConversationRun['tools'][number]):boolean {
  return tool.canStop===true&&tool.status!=='completed';
}
export function needsAttention(run?: ConversationRun): boolean {
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
  return `buildr.agent-conversation.draft:${encodeURIComponent(profile)}:${encodeURIComponent(workspaceId || 'unselected')}:${encodeURIComponent(conversationId || 'new')}`;
}
export function readDraft(key: string, storage: Pick<Storage, 'getItem'>): {text: string; taskId?: string; available: boolean} {
  try {
    const saved=storage.getItem(key)||'';
    if(saved.startsWith('{')){const parsed=JSON.parse(saved);return {text:typeof parsed.text==='string'?parsed.text:'',taskId:typeof parsed.taskId==='string'&&parsed.taskId?parsed.taskId:undefined,available:true};}
    return { text: saved, taskId: undefined, available: true };
  } catch { return { text: '', taskId: undefined, available: false }; }
}
export function writeDraft(key: string, text: string, storage: Pick<Storage, 'setItem' | 'removeItem'>, taskId?: string): boolean {
  try { if (text) storage.setItem(key, taskId ? JSON.stringify({ text, taskId }) : text); else storage.removeItem(key); return true; } catch { return false; }
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
/** The same agent may hold several participants (sources or models); the summary names it once. */
export function participantAgentIds(participants:ConversationView['participants']):string[] {
  return [...new Set(participants.map(participant=>participant.provider))];
}

// The visible stream interleaves conversation entries with per-run process blocks.
export type ConversationStreamItem = {type:'entry';entry:ConversationEntry}|{type:'process-block';entries:ConversationEntry[];active:boolean;finishedAt?:string};
/** Legacy records have no message phase: the last assistant message of a settled
 * run is its visible reply, regardless of length. Never promote live narration. */
export function groupConversationStream(entries:readonly ConversationEntry[],currentRun?:ConversationRun):ConversationStreamItem[] {
  const items:ConversationStreamItem[]=[];
  const isProcess=(entry:ConversationEntry)=>entry.kind==='tool'||entry.kind==='message'&&entry.role==='assistant';
  for(let index=0;index<entries.length;){
    const first=entries[index];
    if(!isProcess(first)){items.push({type:'entry',entry:first});index++;continue;}
    const run:ConversationEntry[]=[];
    while(index<entries.length&&isProcess(entries[index])&&entries[index].runId===first.runId)run.push(entries[index++]);
    const active=Boolean(currentRun&&currentRun.id===first.runId&&executionLocked(currentRun));
    const result=active?undefined:[...run].reverse().find(entry=>entry.kind==='message'&&entry.role==='assistant');
    const process=result?run.filter(entry=>entry!==result):run;
    if(process.length)items.push({type:'process-block',entries:process,active,finishedAt:result?.createdAt});
    if(result)items.push({type:'entry',entry:result});
  }
  return items;
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

/** Prepending steps can change a block's first entry; keep expanded overlapping blocks open. */
export function carryExpandedProcessBlocks(current:readonly ConversationEntry[],added:readonly ConversationEntry[],expanded:Record<string,boolean>,run?:ConversationRun):Record<string,boolean>{
 const openIds=new Set(groupConversationStream(current,run).flatMap(item=>item.type==='process-block'&&expanded[processBlockKey(item.entries)]?item.entries.map(e=>e.id):[]));
 if(!openIds.size)return expanded;
 const entries=[...new Map([...added,...current].map(e=>[e.id,e])).values()].sort((a,b)=>a.sequence-b.sequence),next={...expanded};
 for(const item of groupConversationStream(entries,run))if(item.type==='process-block'&&item.entries.some(e=>openIds.has(e.id)))next[processBlockKey(item.entries)]=true;
 return next;
}

/** Persisted running items do not prove a historical execution is still live. */
export function processEntryStatus(entry:ConversationEntry,active:boolean):string|undefined {
  return !active&&(!entry.status||entry.status==='running')?'unknown':entry.status;
}
