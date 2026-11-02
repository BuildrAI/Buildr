import type { ConversationView } from './types';

/** Bounded metadata pagination; source/tool bodies are fetched separately by their original revisions. */
export async function readParticipationRun(options:{
  initial:ConversationView;runId:string;signal:AbortSignal;current():boolean;
  read(cursor:number,signal:AbortSignal):Promise<ConversationView>;
  prepend(page:ConversationView):void;
}):Promise<'found'|'missing'|'limit'|'cancelled'> {
  let page=options.initial;const seen=new Set<number>();
  for(let index=0;index<=20;index++){
    if(options.signal.aborted||!options.current())return 'cancelled';
    if(page.entries.some(entry=>entry.runId===options.runId))return 'found';
    const cursor=page.nextEntryCursor;
    if(cursor===undefined)return 'missing';
    if(index===20||seen.has(cursor))return 'limit';
    seen.add(cursor);page=await options.read(cursor,options.signal);
    if(options.signal.aborted||!options.current())return 'cancelled';
    options.prepend(page);
  }
  return 'limit';
}
