import type { ConversationEntry, ConversationView } from '../contracts.ts';

type Header = Omit<ConversationView, 'entries'>;
type Run=NonNullable<ConversationView['run']>;
export interface ConversationPatch {
  baseCursor: number;
  baseRevision: string;
  changes: Partial<Header>;
  unset?: string[];
  entryIds?: string[];
  entries: ConversationEntry[];
  runs:Array<{id:string;changes:Partial<Omit<Run,'id'>>;unset?:string[]}>;
  texts: Array<{id:string;offset:number;append:string;changes:Partial<Omit<ConversationEntry,'id'|'text'>>;unset?:string[]}>;
}
const fail = ():never => { throw new Error('conversation_patch_baseline_mismatch'); };
const forbidden = ['__proto__','prototype','constructor'];
const headerRequired = ['id','workspaceId','cwd','title','revision','hidden','updatedAt','participants','entries','requests'];
const runRequired=['id','participantId','provider','generation','status','accepted','tools','startedAt','updatedAt'];
const entryRequired = ['id','sequence','kind','role','text','createdAt'];
const without = (value:object,excluded:string[]) => Object.fromEntries(Object.entries(value).filter(([key,item])=>!excluded.includes(key)&&item!==undefined));
function difference(value:object, prior:Map<string,string>) {
  const changes:Record<string,unknown>={},signatures=new Map<string,string>();
  for(const [key,item] of Object.entries(value))if(item!==undefined){const encoded=JSON.stringify(item);signatures.set(key,encoded);if(prior.get(key)!==encoded)changes[key]=item;}
  const unset=[...prior.keys()].filter(key=>!signatures.has(key));
  return {changes,signatures,...(unset.length?{unset}:{})};
}
/** Connection-local comparisons serialize unchanged metadata once, never cumulative text. */
export function conversationPatchEncoder() {
  let header = new Map<string,string>();
  let previousView:ConversationView|undefined;
  let runMetadata=new Map<string,Map<string,string>>();
  let entries = new Map<string,{entry:ConversationEntry;metadata:Map<string,string>}>();
  return (view:ConversationView,base?:{cursor:number;revision:string}):ConversationPatch|undefined => {
    const nextHeader=difference(without(view,['entries','run','retainedRuns']),header),nextEntries=new Map<string,{entry:ConversationEntry;metadata:Map<string,string>}>();
    const runs:ConversationPatch['runs']=[],nextRunMetadata=new Map<string,Map<string,string>>();
    const unset=[...nextHeader.unset??[]];
    for(const key of ['run','retainedRuns'] as const){
      const values=key==='run'?(view.run?[view.run]:[]):view.retainedRuns??[];
      const old=key==='run'?(previousView?.run?[previousView.run]:[]):previousView?.retainedRuns??[];
      const stable=!!previousView&&(view[key]===undefined)===(previousView[key]===undefined)&&values.length===old.length&&values.every((run,i)=>run.id===old[i]!.id);
      if(!stable){if(view[key]!==undefined)nextHeader.changes[key]=view[key];else if(previousView?.[key]!==undefined)unset.push(key);}
      for(const run of values){const diff=difference(without(run,['id']),runMetadata.get(run.id)??new Map());nextRunMetadata.set(run.id,diff.signatures);if(stable&&(Object.keys(diff.changes).length||diff.unset?.length))runs.push({id:run.id,changes:diff.changes,...(diff.unset?{unset:diff.unset}:{})});}
    }
    const changed:ConversationEntry[]=[],texts:ConversationPatch['texts']=[];
    for(const entry of view.entries){
      const old=entries.get(entry.id),meta=difference(without(entry,['id','text']),old?.metadata??new Map());
      nextEntries.set(entry.id,{entry,metadata:meta.signatures});
      if(!old||!entry.text.startsWith(old.entry.text)){changed.push(entry);continue;}
      if(entry.text!==old.entry.text||Object.keys(meta.changes).length||meta.unset?.length)texts.push({id:entry.id,offset:old.entry.text.length,append:entry.text.slice(old.entry.text.length),changes:meta.changes,...(meta.unset?{unset:meta.unset}:{})});
    }
    const ids=view.entries.map(entry=>entry.id),oldIds=[...entries.keys()];
    const orderChanged=ids.length!==oldIds.length||ids.some((id,i)=>id!==oldIds[i]);
    header=nextHeader.signatures;entries=nextEntries;runMetadata=nextRunMetadata;previousView=view;
    if(!base)return;
    return {baseCursor:base.cursor,baseRevision:base.revision,changes:{...nextHeader.changes,revision:view.revision},...(unset.length?{unset}:{}),...(orderChanged?{entryIds:ids}:{}),entries:changed,texts,runs};
  };
}
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
