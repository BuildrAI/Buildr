/** Runs inside the native host: use its owning services, never kill by a supplied PID. */
export async function stopDshSessionTree(ctx:any,sessionId:string,childIds:readonly string[],jobIds:readonly string[]):Promise<{stopped:boolean;scopes:string[]}> {
  const root=ctx.agents.get(sessionId);
  if(!root){
    // Aborting the model can retire the Agent before this control request arrives.
    // Verify the exact durable session without loading or waking it again.
    const handle=await ctx.sessionPersistence.open(sessionId,'read');
    try{if(handle.header?.id!==sessionId)throw new Error('dsh_stop_root_unavailable');}
    finally{await handle[Symbol.asyncDispose]();}
  }
  const selected=new Set([sessionId]),parents=new Map<string,string>();
  if(childIds.length){
    if(!ctx.subagents?.listDescendants)throw new Error('dsh_stop_tree_unavailable');
    const rows=await ctx.subagents.listDescendants(sessionId);
    for(const row of rows){
      if(!selected.has(row.parentId))continue;
      if(row.parentId===sessionId&&!childIds.includes(row.id))continue;
      if(row.kind!=='child')throw new Error('dsh_stop_tree_unconfirmed');
      selected.add(row.id);parents.set(row.id,row.parentId);
    }
    if(childIds.some(id=>!selected.has(id)))throw new Error('dsh_stop_tree_unconfirmed');
  }
  const agents=[...selected].map(id=>ctx.agents.get(id)).filter(Boolean);
  for(const agent of agents){
    const goal=ctx.goals?.get(agent);
    if(goal?.phase==='active')ctx.goals.pause(agent,{id:goal.id,revision:goal.revision});
  }
  // Stop the root before cancelling children: completion notices must not wake it again.
  root?.cancel({kind:'user'});
  for(const [id,parentSessionId]of parents)ctx.subagents.interrupt(id,{kind:'user',parentSessionId});
  if(!ctx.jobs?.list||!ctx.jobs?.kill)throw new Error('dsh_stop_jobs_unavailable');
  for(const id of selected)for(const job of ctx.jobs.list(id)){
    if(job.owner!==id||!['running','stopping'].includes(job.status))continue;
    if(id===sessionId&&!jobIds.includes(job.id))continue;
    ctx.jobs.kill(job.id,id,'cancelled by the user');
  }
  await Promise.all(agents.map(agent=>agent.whenIdle()));
  const stopped=[...selected].every(id=>{
    const agent=ctx.agents.get(id);
    if(!agent&&id!==sessionId)return false; // An external child needs its own settled proof.
    if(agent?.status==='running')return false;
    return !ctx.jobs.list(id).some((job:any)=>job.owner===id&&['running','stopping'].includes(job.status)&&(id!==sessionId||jobIds.includes(job.id)));
  });
  return {stopped,scopes:[...selected]};
}
