/** Scoped native presets may own their own shell config. Enforce foreground expiry there too. */
export const inject=['tools','jobs'];
export async function settlePromotedCommand(ctx:any,exec:any,result:any):Promise<any|undefined> {
  if(!['bash','pwsh'].includes(exec.name)||exec.arguments?.run_in_background===true||result.isError||result.value?.kind!=='promoted')return;
  const value=result.value,owner=exec.agent?.id;
  let confirmed=false;
  try{
    // The canonical tool return binds this id to this invocation; public JobView omits toolCall.
    const job=ctx.jobs.list(owner).find((job:any)=>job.id===value.jobId&&job.owner===owner);
    if(!job)throw new Error('dsh_deadline_job_identity_unknown');
    const waiting=Promise.resolve(ctx.jobs.wait(job.id,2000,owner));
    waiting.catch(()=>{}); // A failed kill must not leave an unobserved wait rejection.
    if(['running','stopping'].includes(job.status))await ctx.jobs.kill(job.id,owner,'foreground command timed out');
    const settled=await waiting;
    confirmed=['completed','killed'].includes(settled.status);
  }catch{ /* Keep the native job and its unresolved state discoverable. */ }
  return {kind:'block',feedback:[{type:'text',text:String(value.output??'')+'\n'+(confirmed?'前台命令已超时，已确认原生后台作业退出。':'前台命令已超时，尚未确认原生后台作业退出；保留作业 '+String(value.jobId)+'，请按准确归属继续核对。')}]};
}
export function apply(ctx:any):void {
  ctx.on('tools/post-execute',async(exec:any,result:any,next:()=>Promise<any>)=>{
    const prior=await next();
    const stopped=await settlePromotedCommand(ctx,exec,result);
    return stopped??prior;
  });
}
