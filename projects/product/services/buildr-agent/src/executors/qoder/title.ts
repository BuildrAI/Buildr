import {randomUUID} from 'node:crypto';
import type {NativeRpc} from '../native-process.ts';

// Initialization + turn readiness + generation and bounded cleanup fit inside the application's 45s.
export const qoderTitleBudget={initializeMs:8_000,readyMs:10_000,turnReadyMs:10_000,generateMs:20_000,closeMs:1_000,terminateMs:500,rpcMs:42_000,cancelMs:2_500} as const;
const TITLE_CONTEXT_TAGS=new Set(['system-reminder','hook_context','local-command-caveat','loaded_context']);
/** qodercli compares descriptions with user text after stripping leading context blocks and collapsing whitespace. */
export function qoderTitleMatchText(raw:string):string {
  let text=raw.trim();
  while(text.startsWith('<')){
    const tag=/^<([a-z][\w-]*)(?:\s[^>]*)?>/.exec(text)?.[1];
    if(!tag||!TITLE_CONTEXT_TAGS.has(tag))break;
    const end=text.indexOf(`</${tag}>`);
    if(end<0)break;
    text=text.slice(end+tag.length+3).trim();
  }
  return text.replace(/\s+/g,' ').trim();
}
export async function generateQoderTitle(rpc:Pick<NativeRpc,'call'>,contextId:string,cwd:string,description:string,userText:string|undefined,signal:AbortSignal):Promise<string|undefined> {
  if(signal.aborted)throw new Error('agent_title_cancelled');
  const requestId=randomUUID();let abort!:()=>void;
  const cancelled=new Promise<never>((_,reject)=>{abort=()=>reject(new Error('agent_title_cancelled'));});
  signal.addEventListener('abort',abort,{once:true});
  try {
    return await Promise.race([rpc.call('title',{requestId,contextId,cwd,description,...(userText!==undefined?{userText}:{})},qoderTitleBudget.rpcMs),cancelled]);
  } catch(error) {
    // Only this ephemeral title query is cancelled; the work runtime stays alive.
    try {await rpc.call('cancelTitle',{requestId},qoderTitleBudget.cancelMs);}
    catch {throw new Error('agent_title_cleanup_unconfirmed');}
    if(signal.aborted)throw new Error('agent_title_cancelled');
    if(error instanceof Error && error.message==='agent_native_timeout')throw new Error('agent_title_timeout');
    throw error;
  } finally {signal.removeEventListener('abort',abort);}
}
