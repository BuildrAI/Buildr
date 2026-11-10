import type {ConversationEvent,ConversationView} from '../types';
type ConversationPatch=NonNullable<ConversationEvent['payload']['patch']>;

const fail = ():never => { throw new Error('实时更新基准已变化，需要重新观察。'); };
const forbidden = ['__proto__','prototype','constructor'];
const headerRequired = ['id','workspaceId','cwd','title','revision','hidden','updatedAt','participants','entries','requests'];
const runRequired=['id','participantId','provider','generation','status','accepted','tools','startedAt','updatedAt'];
const entryRequired = ['id','sequence','kind','role','text','createdAt'];
function merge<T extends object>(base:T,changes:object,unset:string[]|undefined,blocked:string[],required:string[]):T {
  if(!changes||typeof changes!=='object'||Array.isArray(changes))fail();
  if(Object.keys(changes).some(key=>forbidden.includes(key)||blocked.includes(key)))fail();
  if(unset&&(!Array.isArray(unset)||new Set(unset).size!==unset.length||unset.some(key=>typeof key!=='string'||forbidden.includes(key)||required.includes(key)||Object.hasOwn(changes,key))))fail();
  const result={...base,...changes};for(const key of unset??[])delete (result as Record<string,unknown>)[key];return result;
}
/** Reconstruct immutable snapshots; a rejected patch must leave its baseline untouched. */
export function restoreConversationPatch(base:ConversationView,patch:ConversationPatch):ConversationView {
  if(!Array.isArray(patch.entries)||!Array.isArray(patch.texts)||!Array.isArray(patch.runs))fail();
  const ids=patch.entryIds??base.entries.map(entry=>entry.id);
  if(!Array.isArray(ids)||ids.some(id=>typeof id!=='string')||new Set(ids).size!==ids.length)fail();
  const changed=[...patch.entries.map(entry=>entry.id),...patch.texts.map(entry=>entry.id)];
  if(new Set(changed).size!==changed.length||changed.some(id=>!ids.includes(id)))fail();
  const entries=new Map(base.entries.map(entry=>[entry.id,entry]));
  for(const entry of patch.entries)entries.set(entry.id,entry);
  for(const change of patch.texts){
    const old=entries.get(change.id);
    if(!old||!Number.isSafeInteger(change.offset)||change.offset!==old.text.length||typeof change.append!=='string')fail();
    const entry=merge(old!,change.changes,change.unset,['id','text'],entryRequired);
    entries.set(change.id,{...entry,text:old!.text+change.append});
  }
  const ordered=ids.map(id=>entries.get(id)??fail());
  const header=merge(base,patch.changes,patch.unset,['id','workspaceId','entries'],headerRequired);
  const runs=new Map([...(header.run?[header.run]:[]),...header.retainedRuns??[]].map(run=>[run.id,run]));
  if(new Set(patch.runs.map(run=>run.id)).size!==patch.runs.length)fail();
  for(const change of patch.runs){const old=runs.get(change.id);if(!old)fail();runs.set(change.id,merge(old!,change.changes,change.unset,['id'],runRequired));}
  return {...header,entries:ordered,...(header.run?{run:runs.get(header.run.id)!}:{}),...(header.retainedRuns?{retainedRuns:header.retainedRuns.map(run=>runs.get(run.id)!)}:{})};
}
