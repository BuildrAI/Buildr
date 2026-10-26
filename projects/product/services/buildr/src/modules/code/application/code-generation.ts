import { randomUUID } from 'node:crypto';
import { codeFailure } from '../infrastructure/code-file-reader.ts';

export type ModelSelection = {modelAccountId:string;modelId:string;accountIdentity:string;accountRevision:string;label:string;serviceTier?:string};
export type GenerationRun = {id:string;modelAccountId:string;modelId:string;label:string;accountRevision:string;status:'running'|'succeeded'|'failed'|'cancelled';output:unknown;error:{code:string;message:string}|null};
export type GenerationInput = ModelSelection & {root:string;prompt:string;timeoutMs:number;validateResult(output:unknown):Promise<void>};
export type GenerateModel = (input:{accountId:string;modelId:string;expectedIdentity:string;expectedRevision:string;agentId:string;conversationId:string;runId:string;prompt:string;signal:AbortSignal;serviceTier?:string})=>Promise<string>;

/** Short-lived business requests; no persistent chat, default executor or vendor process. */
export class CodeGeneration {
  private runs=new Map<string,{root:string;view:GenerationRun;controller:AbortController;timer?:ReturnType<typeof setTimeout>}>();
  private closed=false;
  private readonly generate:GenerateModel;
  constructor(generate:GenerateModel){this.generate=generate;}
  start(input:GenerationInput):GenerationRun {
    if(this.closed)throw codeFailure('code_generation_closed','生成服务已关闭。',503);
    // Completed observations are bounded; active requests are never evicted.
    for(const [id,run] of this.runs)if(this.runs.size>=128&&run.view.status!=='running')this.runs.delete(id);
    if(this.runs.size>=128)throw codeFailure('code_generation_busy','生成请求较多，请稍后重试。',429);
    const id=randomUUID(),controller=new AbortController(),deadline=Date.now()+input.timeoutMs;
    const view:GenerationRun={id,modelAccountId:input.modelAccountId,modelId:input.modelId,label:input.label,accountRevision:input.accountRevision,status:'running',output:null,error:null};
    const run:{root:string;view:GenerationRun;controller:AbortController;timer?:ReturnType<typeof setTimeout>}={root:input.root,view,controller};this.runs.set(id,run);
    const expire=()=>{if(view.status==='running'){view.status='failed';view.error={code:'code_commit_message_timeout',message:'生成超过本次时间预算，原说明已保留。'};controller.abort();}};
    const timer=setTimeout(expire,input.timeoutMs);
    run.timer=timer;timer.unref?.();
    void (async()=>{
      try {
        const text=await this.generate({accountId:input.modelAccountId,modelId:input.modelId,expectedIdentity:input.accountIdentity,expectedRevision:input.accountRevision,agentId:'commit-message',conversationId:id,runId:id,prompt:input.prompt,signal:controller.signal,...(input.serviceTier?{serviceTier:input.serviceTier}:{})});
        if(Date.now()>=deadline)expire();
        if(view.status!=='running')return;
        let output:unknown;try{output=JSON.parse(text);}catch{throw codeFailure('code_commit_message_output_invalid','生成结果不是有效 JSON，原说明已保留。',502);}
        await input.validateResult(output);
        if(Date.now()>=deadline)expire();
        if(view.status!=='running')return;
        view.output=output;view.status='succeeded';
      } catch(error) {
        if(Date.now()>=deadline)expire();
        if(view.status!=='running')return;
        const known=error as {code?:string;message?:string};view.status='failed';
        view.error={code:known.code||'code_generation_failed',message:known.code&&known.message?known.message:'生成未完成，原说明已保留。'};
      } finally { clearTimeout(timer); }
    })();
    return structuredClone(view);
  }
  read(root:string,id:string):GenerationRun {const run=this.runs.get(id);if(!run||run.root!==root)throw codeFailure('code_generation_missing','此工作空间没有对应生成请求。',404);return structuredClone(run.view);}
  cancel(root:string,id:string):GenerationRun {this.read(root,id);const run=this.runs.get(id)!;if(run.view.status==='running'){run.view.status='cancelled';clearTimeout(run.timer);run.controller.abort();}return structuredClone(run.view);}
  close(){this.closed=true;for(const run of this.runs.values())if(run.view.status==='running')this.cancel(run.root,run.view.id);}
}
