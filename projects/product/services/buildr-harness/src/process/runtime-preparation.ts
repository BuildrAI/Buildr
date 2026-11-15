import path from 'node:path';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { AgentServiceError } from '../domain/agent-state.ts';
import { prepareAgentRuntime } from './runtime-unit.ts';
import type { AgentRuntimeUnit } from '../execution-contracts.ts';

type Input = Parameters<typeof prepareAgentRuntime>[0];
const pending = new Map<string, Promise<AgentRuntimeUnit>>();

/** Keep byte validation and materialization off the host request thread. */
export function prepareAgentRuntimeAsync(input: Input, signal?: AbortSignal): Promise<AgentRuntimeUnit> {
  if (signal?.aborted) return Promise.reject(signal.reason);
  const normalized = {...input, dataRoot:path.resolve(input.dataRoot)};
  // A cancellable host owns its preparation lifetime. It must not cancel another
  // caller's shared preparation or return before its own worker has released locks.
  const key=JSON.stringify(normalized), existing=signal ? undefined : pending.get(key);
  if(existing)return existing;
  const result=new Promise<AgentRuntimeUnit>((resolve,reject)=>{
    const cancellation = new Int32Array(new SharedArrayBuffer(4));
    const cancel = () => { Atomics.store(cancellation, 0, 1); };
    signal?.addEventListener('abort', cancel, { once: true });
    const worker=new Worker(new URL(import.meta.url),{workerData:{kind:'prepare-agent-runtime',input:normalized,cancellation:cancellation.buffer}});
    let reply:any;
    worker.once('message',value=>{reply=value;});
    worker.once('error',reject);
    worker.once('exit',code=>{
      signal?.removeEventListener('abort', cancel);
      if(signal?.aborted)return reject(signal.reason);
      if(code!==0||!reply)return reject(new AgentServiceError('agent_runtime_preparation_failed','执行运行单元准备线程未正常完成。',503));
      if(reply.error){
        const value=reply.error;
        const error=value.agent?new AgentServiceError(value.code,value.message,value.status):Object.assign(new Error(value.message),{code:value.code});
        reject(error);
      }else resolve(reply.runtime);
    });
  });
  if(!signal){
    pending.set(key,result);
    void result.finally(()=>{if(pending.get(key)===result)pending.delete(key);}).catch(()=>{});
  }
  return result;
}

if(!isMainThread&&workerData?.kind==='prepare-agent-runtime'){
  const cancellation = new Int32Array(workerData.cancellation);
  try{parentPort!.postMessage({runtime:prepareAgentRuntime(workerData.input, () => {
    if(Atomics.load(cancellation,0))throw Object.assign(new Error('Runtime preparation cancelled.'),{code:'agent_runtime_preparation_cancelled'});
  })});}
  catch(cause){const error=cause as Error&{code?:string;status?:number};parentPort!.postMessage({error:{agent:error instanceof AgentServiceError,code:error.code,message:error.message,status:error.status}});}
}
