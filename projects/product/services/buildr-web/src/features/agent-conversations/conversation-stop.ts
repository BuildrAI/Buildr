import type { ConversationEntry, ConversationView } from './types';

export type StoppedConversationOutput = {workspaceId:string;conversationId:string;runId:string;entries:ConversationEntry[]};

/** Freeze only this round's output; continue receiving control facts and other rounds. */
export function stoppedConversationEntries(conversation:ConversationView, stopped:StoppedConversationOutput|null):ConversationEntry[] {
  if(!stopped||conversation.workspaceId!==stopped.workspaceId||conversation.id!==stopped.conversationId)return conversation.entries;
  const frozen=new Map(stopped.entries.map(entry=>[entry.id,entry]));
  return conversation.entries.flatMap(entry=>{
    if(entry.runId!==stopped.runId)return [entry];
    const prior=frozen.get(entry.id);
    return prior?[{...entry,text:prior.text,input:prior.input,detail:prior.detail,presentedFiles:prior.presentedFiles}]:[];
  });
}

/** Retry only explicit pre-dispatch revision rejection, always pinned to the clicked round. */
export async function stopConversationWithRecovery(conversation:ConversationView, stop:(current:ConversationView)=>Promise<ConversationView>, read:()=>Promise<ConversationView>):Promise<ConversationView> {
  const owner=conversation.run;
  if(!owner)throw new Error('没有可以停止的执行。');
  let current=conversation;
  for(let attempt=0;;attempt++){
    try{return await stop(current);}catch(failure){
      const error=failure as {status?:number;code?:string};
      if(attempt>=2||error.status!==409||error.code!=='agent_revision_conflict')throw failure;
      const fresh=await read();
      const run=[...(fresh.run?[fresh.run]:[]),...(fresh.retainedRuns??[])].find(run=>run.id===owner.id&&run.participantId===owner.participantId&&run.generation===owner.generation);
      if(!run||fresh.id!==conversation.id||fresh.workspaceId!==conversation.workspaceId)throw new Error('原执行已变化，停止未确认。');
      current={...fresh,run};
    }
  }
}
