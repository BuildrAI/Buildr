import type { ConversationStopInput, ConversationView, RunView } from '../contracts.ts';
import { AgentServiceError, conversationRuns, expected, nonempty, unfinishedRun } from '../domain/agent-state.ts';
import type { StoredConversation } from '../domain/agent-state.ts';
import type { PendingSendRepository } from '../persistence/pending-send-repository.ts';

type Target = NonNullable<StoredConversation['stops']>[number]['targets'][number];
type Control = Pick<Target,'runId'|'participantId'|'generation'> & {expectedRevision:string};
type Options = {
  load(scope:string,id:string):StoredConversation;
  save(record:StoredConversation):void;
  read(scope:string,id:string):ConversationView;
  pending:PendingSendRepository;
  invoke(scope:string,id:string,input:Control,action:'stop'|'observe'):Promise<unknown>;
  now():string;
  activeRun?(runId:string):boolean;
};

/** Durable conversation scope; the original executor still owns each native stop. */
export class ConversationStops {
  private readonly work = new Map<string,Promise<void>>();
  constructor(options:Options) { this.options=options; }
  private readonly options: Options;
  get active():number { return this.work.size; }

  private controllableTargets(record:StoredConversation): RunView[] {
    return conversationRuns(record.view).filter(run=>unfinishedRun(run)||run.executionState==='active'||this.options.activeRun?.(run.id)||record.view.requests.some(request=>request.runId===run.id));
  }

  private assertStopAdmission(record:StoredConversation,input:ConversationStopInput,targets:RunView[],pendingId?:string): void {
    if(record.view.revision===input.expectedRevision)return;
    const observed=input.observedScope;
    if(!observed){expected(record.view.revision,input.expectedRevision);return;}
    // When every observed item has already settled before admission, fall back
    // to revision conflict so the caller rereads the terminal state instead of
    // writing an empty stop request.
    if(!targets.length&&!pendingId){expected(record.view.revision,input.expectedRevision);return;}
    const scopeKeys=new Set(observed.targets.map(target=>`${target.runId}\0${target.participantId}\0${target.generation}`));
    const sameTargets=targets.every(run=>scopeKeys.has(`${run.id}\0${run.participantId}\0${run.generation}`));
    const sameCurrent=(record.view.run?.id??null)===observed.currentRunId;
    const samePending=!pendingId||pendingId===observed.pendingSendId;
    if(!sameTargets||!sameCurrent||!samePending){
      throw new AgentServiceError('agent_revision_conflict','对话执行或待发送内容已变化，未将停止扩展到新工作。',409);
    }
  }

  private saveRecord(scope:string,id:string,mutate:(record:StoredConversation)=>boolean): void {
    for(let attempt=0;attempt<8;attempt++){
      const record=this.options.load(scope,id);
      if(!mutate(record))return;
      try{this.options.save(record);return;}
      catch(error){
        if(attempt<7&&error instanceof AgentServiceError&&error.code==='agent_revision_conflict')continue;
        throw error;
      }
    }
  }

  async stop(scope:string,id:string,input:ConversationStopInput):Promise<ConversationView> {
    const requestId=nonempty(input.clientRequestId,'停止请求身份',200);
    let record=this.options.load(scope,id);
    if(!record.stops?.some(stop=>stop.id===requestId)){
      if(!input.observedScope)expected(record.view.revision,input.expectedRevision);
      this.options.pending.cancelForStop(scope,id,pending=>{
        for(let attempt=0;attempt<8;attempt++){
          // The queue lock is also held during final dispatch; recheck the conversation.
          record=this.options.load(scope,id);
          if(record.stops?.some(stop=>stop.id===requestId))return;
          const targets=this.controllableTargets(record);
          this.assertStopAdmission(record,input,targets,pending?.id);
          record.stops??=[];
          record.stops.push({id:requestId,targets:targets.map(run=>({runId:run.id,participantId:run.participantId,generation:run.generation})),pendingSendId:pending?.id});
          record.view.stopRequest={id:requestId,runIds:targets.map(run=>run.id),createdAt:this.options.now(),...(pending?{cancelledSend:{id:pending.id,draft:pending.draft}}:{})};
          for(const run of targets){run.stopRequested=true;run.canContinue=false;if(!run.resourcesReleased)run.status='stopping';}
          if(targets.some(run=>run.id===record.view.run?.id))record.interruption={runId:record.view.run!.id,awaitingUser:false,cancelled:true};
          try{this.options.save(record);return;}
          catch(error){
            if(attempt<7&&error instanceof AgentServiceError&&error.code==='agent_revision_conflict')continue;
            throw error;
          }
        }
      });
    }
    // Admission is durable. Native cleanup remains owned by this application
    // even if a slow provider or disconnected browser outlives the response.
    let timer:ReturnType<typeof setTimeout>|undefined;
    try{await Promise.race([this.resume(scope,id,requestId),new Promise<void>(resolve=>{timer=setTimeout(resolve,1000);})]);}
    finally{clearTimeout(timer);}
    return this.options.read(scope,id);
  }

  resume(scope:string,id:string,requestId:string):Promise<void> {
    const key=JSON.stringify([scope,id,requestId]),existing=this.work.get(key);
    if(existing)return existing;
    const work=Promise.resolve().then(async()=>{
      const stop=this.options.load(scope,id).stops?.find(value=>value.id===requestId);
      if(!stop)return;
      if(stop.pendingSendId)this.options.pending.cancelStopped(scope,id,stop.pendingSendId);
      await Promise.allSettled(stop.targets.map(async target=>{
        for(let attempt=0;attempt<10;attempt++){
          let action:'observe'|'stop'|undefined;
          this.saveRecord(scope,id,record=>{
            const saved=record.stops?.find(value=>value.id===requestId)?.targets.find(value=>value.runId===target.runId);
            const run=conversationRuns(record.view).find(run=>run.id===target.runId&&run.participantId===target.participantId&&run.generation===target.generation);
            if(!saved||!run||!unfinishedRun(run)&&!record.view.requests.some(request=>request.runId===run.id))return false;
            action=saved.requested?'observe':'stop';
            if(action==='stop'){saved.requested=true;return true;}
            return false;
          });
          if(!action)return;
          const current=this.options.load(scope,id);
          try {
            await this.options.invoke(scope,id,{runId:target.runId,participantId:target.participantId,generation:target.generation,expectedRevision:current.view.revision},action);
            if(action==='observe'){
              const observed=this.options.load(scope,id),live=conversationRuns(observed.view).find(run=>run.id===target.runId&&run.participantId===target.participantId&&run.generation===target.generation);
              // Reassert only after the exact owner proves there is still live
              // work. An unknown historical result never triggers another effect.
              if(live&&!live.resourcesReleased&&(live.executionState==='active'||live.tools.some(tool=>tool.status==='running'))){
                action='stop';
                await this.options.invoke(scope,id,{runId:target.runId,participantId:target.participantId,generation:target.generation,expectedRevision:observed.view.revision},action);
              }
            }
            return;
          } catch(error) {
            // A version rejection has no native effect. Never retry an unknown delivery.
            if(action==='stop'&&error instanceof AgentServiceError&&error.code==='agent_revision_conflict'){
              this.saveRecord(scope,id,latest=>{
                const item=latest.stops?.find(value=>value.id===requestId)?.targets.find(value=>value.runId===target.runId);
                if(!item||!item.requested)return false;
                delete item.requested;
                return true;
              });
              if(attempt<9)continue;
            }
            this.saveRecord(scope,id,latest=>{
              const remaining=conversationRuns(latest.view).find(run=>run.id===target.runId&&run.participantId===target.participantId&&run.generation===target.generation);
              if(!remaining||!unfinishedRun(remaining))return false;
              remaining.status='unknown';remaining.executionState='unknown';
              remaining.diagnostic='停止已请求，但尚未确认原执行及所属工作的退出；不会重发原输入或终止其他对话。';
              return true;
            });
            throw error;
          }
        }
      }));
    }).finally(()=>this.work.delete(key));
    this.work.set(key,work);
    return work;
  }
}
