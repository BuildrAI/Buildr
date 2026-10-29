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
import type { DraftImage } from './ConversationImageInput';
type InputAttempt={runId:string;participantId:string;generation:string;clientRequestId:string;text:string;images:Omit<DraftImage,'file'>[]};
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
