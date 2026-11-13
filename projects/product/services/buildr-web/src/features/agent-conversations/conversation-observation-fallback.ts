import { needsConversationObservation } from './conversation-state.ts';
import type { ConversationView } from './types';

type Timer = ReturnType<typeof setInterval>;

/**
 * A visible, bounded authoritative reread for live/uncertain conversations.
 * SSE remains the fast path; this watcher converges a quiet or half-open stream
 * without replaying input or mutating business state.
 * While the stream proves liveness, the reread is skipped: SSE already applies
 * every change and a parallel full read only duplicates transfer and load.
 */
export function startConversationRecoveryRead(options:{
  current():ConversationView|null;
  visible():boolean;
  live?:()=>boolean;
  probe?:()=>Promise<Pick<ConversationView,'revision'>>;
  read():Promise<ConversationView>;
  apply(next:ConversationView,observedRevision?:string):void;
  isCurrent():boolean;
  intervalMs?:number;
  schedule?(callback:()=>void,milliseconds:number):Timer;
  cancel?(timer:Timer):void;
}) {
  let stopped=false,pending=false;
  const run=async()=>{
    if(stopped||pending||!options.visible())return;
    if(options.live?.())return;
    const before=options.current();
    if(!before||!needsConversationObservation(before))return;
    pending=true;
    try{
      if(options.probe){
        const probed=await options.probe();
        if(stopped||!options.isCurrent())return;
        if(probed.revision===before.revision)return;
      }
      const next=await options.read();
      if(!stopped&&options.isCurrent())options.apply(next,before.revision);
    }catch{
      // The next visible tick or SSE reconciliation retries; a failed read
      // proves nothing about the original execution.
    }finally{pending=false;}
  };
  const schedule=options.schedule??setInterval;
  const cancel=options.cancel??clearInterval;
  const timer=schedule(()=>void run(),options.intervalMs??5000);
  return {run,stop(){stopped=true;cancel(timer);}};
}
