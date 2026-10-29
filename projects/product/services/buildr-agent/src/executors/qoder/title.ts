import {randomUUID} from 'node:crypto';
import type {NativeRpc} from '../native-process.ts';

// Initialization + generation + bounded cleanup fit inside the application's 45s.
export const qoderTitleBudget={initializeMs:8_000,generateMs:30_000,closeMs:1_000,terminateMs:500,rpcMs:42_000,cancelMs:2_500} as const;
export async function generateQoderTitle(rpc:Pick<NativeRpc,'call'>,description:string,signal:AbortSignal):Promise<string|undefined> {
  if(signal.aborted)throw new Error('agent_title_cancelled');
  const requestId=randomUUID();let abort!:()=>void;
  const cancelled=new Promise<never>((_,reject)=>{abort=()=>reject(new Error('agent_title_cancelled'));});
  signal.addEventListener('abort',abort,{once:true});
  try {
    return await Promise.race([rpc.call('title',{requestId,description},qoderTitleBudget.rpcMs),cancelled]);
  } catch(error) {
    // Only this ephemeral title query is cancelled; the work runtime stays alive.
    try {await rpc.call('cancelTitle',{requestId},qoderTitleBudget.cancelMs);}
    catch {throw new Error('agent_title_cleanup_unconfirmed');}
    if(signal.aborted)throw new Error('agent_title_cancelled');
    if(error instanceof Error && error.message==='agent_native_timeout')throw new Error('agent_title_timeout');
    throw error;
  } finally {signal.removeEventListener('abort',abort);}
}
