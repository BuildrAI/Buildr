type FileResult={kind:string;content:string;truncated:boolean};
export function engineeringFile(action:'read'|'open',workspaceId:string,conversationId:string,path:string,signal?:AbortSignal):Promise<FileResult>{
 return new Promise((resolve,reject)=>{if(signal?.aborted){reject(signal.reason);return;}const requestId=crypto.randomUUID();
 const finish=(error?:unknown,value?:FileResult)=>{clearTimeout(timer);window.removeEventListener('message',listener);signal?.removeEventListener('abort',abort);if(error)reject(error);else resolve(value!);};
 const listener=(event:MessageEvent)=>{if(event.source!==window.parent||event.origin!==location.origin||event.data?.protocol!=='buildr.harness-frame/v1'||event.data.action!=='file-result'||event.data.requestId!==requestId)return;finish(event.data.error?new Error(event.data.error):undefined,event.data.result);};
 const abort=()=>finish(signal?.reason??new Error('文件操作已取消。'));const timer=setTimeout(()=>finish(new Error('工程文件读取未确认。')),15000);window.addEventListener('message',listener);signal?.addEventListener('abort',abort,{once:true});window.parent.postMessage({protocol:'buildr.harness-frame/v1',event:'file',requestId,action,workspaceId,conversationId,path},location.origin);
 });
}
