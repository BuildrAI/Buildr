import type { ConversationStopInput, ConversationView } from '../contracts.ts';
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

  async stop(scope:string,id:string,input:ConversationStopInput):Promise<ConversationView> {
    const requestId=nonempty(input.clientRequestId,'停止请求身份',200);
    let record=this.options.load(scope,id);
    if(!record.stops?.some(stop=>stop.id===requestId)){
      expected(record.view.revision,input.expectedRevision);
      this.options.pending.cancelForStop(scope,id,pending=>{
        // The queue lock is also held during final dispatch; recheck the conversation.
        record=this.options.load(scope,id);
        expected(record.view.revision,input.expectedRevision);
        const targets=conversationRuns(record.view).filter(run=>unfinishedRun(run)||run.executionState==='active'||this.options.activeRun?.(run.id)||record.view.requests.some(request=>request.runId===run.id));
        record.stops??=[];
        record.stops.push({id:requestId,targets:targets.map(run=>({runId:run.id,participantId:run.participantId,generation:run.generation})),pendingSendId:pending?.id});
        record.view.stopRequest={id:requestId,runIds:targets.map(run=>run.id),createdAt:this.options.now(),...(pending?{cancelledSend:{id:pending.id,draft:pending.draft}}:{})};
        for(const run of targets){run.stopRequested=true;run.canContinue=false;if(!run.resourcesReleased)run.status='stopping';}
        if(targets.some(run=>run.id===record.view.run?.id))record.interruption={runId:record.view.run!.id,awaitingUser:false,cancelled:true};
        this.options.save(record);
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
        for(let attempt=0;attempt<3;attempt++){
          const record=this.options.load(scope,id);
          const saved=record.stops?.find(value=>value.id===requestId)?.targets.find(value=>value.runId===target.runId);
          const run=conversationRuns(record.view).find(run=>run.id===target.runId&&run.participantId===target.participantId&&run.generation===target.generation);
          if(!saved||!run||!unfinishedRun(run)&&!record.view.requests.some(request=>request.runId===run.id))return;
          let action:'observe'|'stop'=saved.requested?'observe':'stop';
          if(action==='stop'){
            saved.requested=true;
            try{this.options.save(record);}
            catch(error){if(error instanceof AgentServiceError&&error.code==='agent_revision_conflict')continue;throw error;}
          }
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
              const latest=this.options.load(scope,id),item=latest.stops?.find(value=>value.id===requestId)?.targets.find(value=>value.runId===target.runId);
              if(item){delete item.requested;this.options.save(latest);}
              continue;
            }
            const latest=this.options.load(scope,id),remaining=conversationRuns(latest.view).find(run=>run.id===target.runId&&run.participantId===target.participantId&&run.generation===target.generation);
            if(remaining&&unfinishedRun(remaining)){
              remaining.status='unknown';remaining.executionState='unknown';
              remaining.diagnostic='停止已请求，但尚未确认原执行及所属工作的退出；不会重发原输入或终止其他对话。';
              this.options.save(latest);
            }
            throw error;
          }
        }
      }));
    }).finally(()=>this.work.delete(key));
    this.work.set(key,work);
    return work;
  }
}
