/** UI request ownership; native control identities remain in the HTTP request. */
export function conversationActionKey(scope:{workspaceId:string;conversationId:string},action:string,identity=''):string {
  return JSON.stringify([scope.workspaceId,scope.conversationId,action,identity]);
}
export function createConversationActions(changed:()=>void=()=>{}) {
  const pending=new Set<string>();
  return {
    has:(key:string)=>pending.has(key),
    begin(key:string){if(pending.has(key))return false;pending.add(key);changed();return true;},
    finish(key:string){if(pending.delete(key))changed();},
    move(from:string,to:string){if(from===to)return;pending.delete(from);pending.add(to);changed();},
  };
}

import type { ConversationView } from './types';
import type { SupplementResult } from './types';
import type { DraftImage } from './ConversationImageInput';
export type InputAttempt={runId:string;participantId:string;generation:string;clientRequestId:string;text:string;images:Omit<DraftImage,'file'>[]};

/** A local receipt belongs to one exact draft and owner; it never locks the conversation. */
export function conversationInputAttemptMatches(
  attempt:InputAttempt|undefined,
  conversation:Pick<ConversationView,'run'>,
  text:string,
  images:readonly {id:string}[],
):boolean {
  const run=conversation.run;
  return Boolean(attempt&&run&&attempt.runId===run.id&&attempt.participantId===run.participantId&&attempt.generation===run.generation&&
    attempt.text===text&&attempt.images.length===images.length&&attempt.images.every((image,index)=>image.id===images[index]?.id));
}

/** Durable read may have repaired this exact unknown row while the send response was in flight. */
export function conversationInputAttemptAccepted(
  before:Pick<ConversationView,'entries'>,
  after:Pick<ConversationView,'entries'>,
  attempt:InputAttempt,
):boolean {
  const ids=attempt.images.map(image=>image.id);
  const pending=[...before.entries].reverse().find(entry=>
    entry.runId===attempt.runId&&entry.kind==='message'&&entry.role==='user'&&entry.text===attempt.text&&
    (entry.attachments??[]).length===ids.length&&(entry.attachments??[]).every((id,index)=>id===ids[index])&&
    (entry.status==='sending'||entry.status==='unknown')
  );
  return Boolean(pending&&after.entries.some(entry=>entry.id===pending.id&&entry.status==='accepted'&&
    entry.runId===attempt.runId&&entry.kind==='message'&&entry.role==='user'&&entry.text===attempt.text&&
    (entry.attachments??[]).length===ids.length&&(entry.attachments??[]).every((id,index)=>id===ids[index])));
}

/** Reconcile only the original idempotent request; unknown receipt never frees it. */
export async function reconcileConversationInputAttempt(attempt:InputAttempt, options:{
  reconcile(attempt:InputAttempt):Promise<SupplementResult>;
  finish(requestId:string):void;
  isCurrent():boolean;
}):Promise<SupplementResult | {delivery:'rejected';diagnostic?:string} | undefined> {
  if(!options.isCurrent())return;
  try {
    const result=await options.reconcile(attempt);
    if(!options.isCurrent())return;
    if(result.delivery!=='unknown')options.finish(attempt.clientRequestId);
    return result;
  } catch(failure) {
    const error=failure as {status?:number;code?:string};
    // These guards run before native dispatch. A transport failure proves nothing.
    if(error.status!==409||!['agent_supplement_stale','agent_supplement_unavailable'].includes(error.code??''))throw failure;
    if(!options.isCurrent())return;
    options.finish(attempt.clientRequestId);
    return {delivery:'rejected',diagnostic:(failure as Error).message};
  }
}
/** Retain transport retry identities with the local draft, including across a reload. */
export function createConversationInputAttempts(storage?:Pick<Storage,'getItem'|'setItem'|'removeItem'>,prefix='buildr.conversation-input:'){
  const memory=new Map<string,InputAttempt|null>();
  const key=(conversation:Pick<ConversationView,'workspaceId'|'id'>)=>prefix+JSON.stringify([conversation.workspaceId,conversation.id]);
  const read=(conversation:Pick<ConversationView,'workspaceId'|'id'>):InputAttempt|undefined=>{
    const name=key(conversation);if(memory.has(name))return memory.get(name)??undefined;
    try{
      const value=JSON.parse(storage?.getItem(name)||'null');
      if(value&&['runId','participantId','generation','clientRequestId','text'].every(field=>typeof value[field]==='string')&&Array.isArray(value.images)&&value.images.length<=4&&value.images.every((image:Record<string,unknown>)=>image&&['id','name','revision','mimeType'].every(field=>typeof image[field]==='string')&&typeof image.size==='number')){memory.set(name,value);return value;}
    }catch{/* Same-page identities remain available if storage is denied. */}
    return undefined;
  };
  return {
    read,
    begin(conversation:ConversationView,text:string,images:DraftImage[]):InputAttempt{
      const run=conversation.run!;const previous=read(conversation),ids=images.map(image=>image.id);
      if(previous?.runId===run.id&&previous.text===text&&JSON.stringify(previous.images.map(image=>image.id))===JSON.stringify(ids))return previous;
      const next:InputAttempt={runId:run.id,participantId:run.participantId,generation:run.generation,clientRequestId:crypto.randomUUID(),text,images:images.map(({file:_file,...image})=>image)};
      memory.set(key(conversation),next);try{storage?.setItem(key(conversation),JSON.stringify(next));}catch{/* No transport replay is scheduled. */}return next;
    },
    finish(conversation:Pick<ConversationView,'workspaceId'|'id'>,requestId:string){
      if(read(conversation)?.clientRequestId!==requestId)return;
      memory.set(key(conversation),null);try{storage?.removeItem(key(conversation));}catch{/* Keep the same-page terminal state. */}
    },
  };
}
