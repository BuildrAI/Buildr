import type { ConversationEntry, ConversationView } from './types';

export type StoppedConversationOutput = {workspaceId:string;conversationId:string;runId?:string;runIds?:string[];entries:ConversationEntry[]};

/** Only work with a live owner or a real running/stop-capable tool is actionable. */
export function conversationRunStoppable(run:ConversationView['run']):boolean {
  if(!run)return false;
  if(run.status==='stopping'||run.stopRequested)return false;
  if(run.executionState==='active')return true;
  // An unresolved execution whose control resources are still owned may
  // still be stoppable even when the last native observation was unknown.
  // The notice exposes one stop attempt for it; keep local freezing and
  // aggregate stop identities consistent with that action.
  if(run.status==='unknown'&&run.resourcesReleased!==true)return true;
  if(run.tools.some(tool=>tool.status==='running'||(tool.status!=='completed'&&tool.canStop===true)))return true;
  return ['starting','running','waiting-approval','waiting-question','tools-active'].includes(run.status);
}

export function conversationStopRunIds(conversation:ConversationView):string[] {
  return [...(conversation.run?[conversation.run]:[]),...conversation.retainedRuns??[]]
    .filter(run=>conversationRunStoppable(run)||conversation.requests.some(request=>request.runId===run.id))
    .map(run=>run.id);
}

/** Normal cancellation has no repeated button; partial/unknown work remains controllable. */
export function canStopConversation(conversation:ConversationView):boolean {
  if(conversation.pendingSend)return true;
  return [...(conversation.run?[conversation.run]:[]),...conversation.retainedRuns??[]]
    .some(run=>conversationRunStoppable(run)||conversation.requests.some(request=>request.runId===run.id));
}

/** Keep cancellation feedback in the same control without allowing duplicate effects. */
export function conversationStopControlState(conversation:ConversationView|null,requesting=false):'hidden'|'ready'|'stopping' {
  if(!conversation)return 'hidden';
  if(requesting)return 'stopping';
  const runs=[...(conversation.run?[conversation.run]:[]),...conversation.retainedRuns??[]];
  if(runs.some(run=>run.stopRequested&&run.status==='stopping'&&!run.resourcesReleased&&run.executionState!=='ended'))return 'stopping';
  return canStopConversation(conversation)?'ready':'hidden';
}

/** Freeze only this round's output; continue receiving control facts and other rounds. */
export function stoppedConversationEntries(conversation:ConversationView, stopped:StoppedConversationOutput|null):ConversationEntry[] {
  if(!stopped||conversation.workspaceId!==stopped.workspaceId||conversation.id!==stopped.conversationId)return conversation.entries;
  const runIds=new Set(stopped.runIds??(stopped.runId?[stopped.runId]:[]));
  const frozen=new Map(stopped.entries.map(entry=>[entry.id,entry]));
  const entries=conversation.entries.flatMap(entry=>{
    if(!entry.runId||!runIds.has(entry.runId))return [entry];
    const prior=frozen.get(entry.id);
    return prior?[{...entry,text:prior.text,input:prior.input,detail:prior.detail,presentedFiles:prior.presentedFiles}]:[];
  });
  // A later projection may page out an entry that was visible at the click.
  // Keep that observed output, without admitting newly arriving old-run text.
  const present=new Set(entries.map(entry=>entry.id));
  return [...entries,...stopped.entries.filter(entry=>entry.runId&&runIds.has(entry.runId)&&!present.has(entry.id))]
    .sort((a,b)=>a.sequence-b.sequence);
}

export function conversationStopAllObservedScope(conversation:ConversationView) {
  const seen=new Set<string>();
  const targets=[...(conversation.run?[conversation.run]:[]),...conversation.retainedRuns??[]].filter(run=>{
    const key=`${run.id}\0${run.participantId}\0${run.generation}`;
    if(seen.has(key))return false;
    seen.add(key);
    return true;
  }).map(run=>({runId:run.id,participantId:run.participantId,generation:run.generation}));
  return {currentRunId:conversation.run?.id??null,targets,pendingSendId:conversation.pendingSend?.id??null};
}

/** Only a known admission rejection can be retried; never widen a click to a newer turn. */
export async function stopAllWithRecovery(conversation:ConversationView,clientRequestId:string,stop:(current:ConversationView)=>Promise<ConversationView>,read:()=>Promise<ConversationView>):Promise<ConversationView> {
  let current=conversation;
  for(let attempt=0;;attempt++){
    try{return await stop(current);}catch(failure){
      const error=failure as {status?:number;code?:string};
      if(attempt>=2||error.status!==409||error.code!=='agent_revision_conflict')throw failure;
      const fresh=await read();
      if(fresh.id!==conversation.id||fresh.workspaceId!==conversation.workspaceId)throw new Error('对话已变化，停止未确认。');
      if(fresh.stopRequest?.id===clientRequestId)return fresh;
      const identities=(value:ConversationView)=>JSON.stringify([value.run?.id,...[...(value.run?[value.run]:[]),...value.retainedRuns??[]].map(run=>[run.id,run.participantId,run.generation]).sort(),value.pendingSend?.id]);
      if(identities(fresh)!==identities(conversation))throw new Error('对话执行或待发送内容已变化，未将停止扩展到新工作。');
      current=fresh;
    }
  }
}

/** Retry explicit stale observation or revision rejection, always pinned to the clicked round. */
export async function stopConversationWithRecovery(conversation:ConversationView, stop:(current:ConversationView)=>Promise<ConversationView>, read:()=>Promise<ConversationView>):Promise<ConversationView> {
  const owner=conversation.run;
  if(!owner)throw new Error('没有可以停止的执行。');
  let current=conversation;
  for(let attempt=0;;attempt++){
    try{return await stop(current);}catch(failure){
      const error=failure as {status?:number;code?:string};
      if(attempt>=2||error.status!==409||!['agent_revision_conflict','agent_control_stale'].includes(error.code??''))throw failure;
      const fresh=await read();
      const run=[...(fresh.run?[fresh.run]:[]),...(fresh.retainedRuns??[])].find(run=>run.id===owner.id&&run.participantId===owner.participantId&&run.generation===owner.generation);
      if(!run||fresh.id!==conversation.id||fresh.workspaceId!==conversation.workspaceId)throw new Error('原执行已变化，停止未确认。');
      current={...fresh,run};
    }
  }
}
