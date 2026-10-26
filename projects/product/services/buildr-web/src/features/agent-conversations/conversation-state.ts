import type { ConversationView, ConversationEvent, ConversationRun } from './types';

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
export function readDraft(key: string, storage: Pick<Storage, 'getItem'>): {text: string; available: boolean} {
  try { return { text: storage.getItem(key) || '', available: true }; } catch { return { text: '', available: false }; }
}
export function writeDraft(key: string, text: string, storage: Pick<Storage, 'setItem' | 'removeItem'>): boolean {
  try { if (text) storage.setItem(key, text); else storage.removeItem(key); return true; } catch { return false; }
}
export function transferDraftText(source:string,target:string,read:(key:string)=>{text:string},save:(key:string,text:string)=>boolean):{text:string;available:boolean} {
  const {text}=read(source);
  const available=save(target,text);
  if(source!==target)save(source,'');
  return {text,available};
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
