import test from 'node:test';
import assert from 'node:assert/strict';
import {stopDshSessionTree,stopDshJobs} from '../../src/executors/dsh/stop-control.ts';

test('whole-turn stop pauses owned goals, cancels the selected descendant tree and jobs, and preserves another branch',async()=>{
 const calls:string[]=[],root='root',agents=new Map<string,any>();
 for(const id of [root,'child','grandchild','other'])agents.set(id,{id,status:'running',cancel(){calls.push('cancel:'+id);this.status='idle';},whenIdle:async()=>{}});
 const jobs=[{id:'root-job',owner:root,status:'running'},{id:'old-job',owner:root,status:'running'},{id:'child-job',owner:'child',status:'running'},{id:'other-job',owner:'other',status:'running'}];
 const ctx={agents:{get:(id:string)=>agents.get(id)},goals:{get:(a:any)=>({id:'goal-'+a.id,revision:1,phase:'active'}),pause:(a:any)=>calls.push('pause:'+a.id)},subagents:{listDescendants:async()=>[{kind:'child',id:'child',parentId:root},{kind:'child',id:'grandchild',parentId:'child'},{kind:'child',id:'other',parentId:root}],interrupt:(id:string,auth:any)=>{assert.ok(auth.parentSessionId===root||auth.parentSessionId==='child');agents.get(id).cancel();}},jobs:{list:(id:string)=>jobs.filter(j=>j.owner===id),kill:(jobId:string,id:string)=>{const job=jobs.find(j=>j.id===jobId)!;assert.equal(job.owner,id);job.status='killed';calls.push('kill:'+jobId);}}};
 const result=await stopDshSessionTree(ctx,root,['child'],['root-job']);
 assert.equal(result.stopped,true);assert.deepEqual(result.scopes,[root,'child','grandchild']);
 assert.ok(calls.indexOf('pause:root')<calls.indexOf('cancel:root'));assert.equal(agents.get('other').status,'running');
 assert.equal(jobs.find(j=>j.id==='old-job')!.status,'running');assert.equal(jobs.find(j=>j.id==='other-job')!.status,'running');assert.equal(jobs.find(j=>j.id==='child-job')!.status,'killed');
});
test('unproven descendant identity never cancels a different branch',async()=>{
 let cancelled=false;
 await assert.rejects(stopDshSessionTree({agents:{get:()=>({cancel(){cancelled=true;}})},subagents:{listDescendants:async()=>[]}},'root',['foreign'],[]),/unconfirmed/);
 assert.equal(cancelled,false);
});

test('individual job stop preserves model, goals and unrelated jobs and validates all targets before effects',async()=>{
 const jobs=[{id:'preview',owner:'root',status:'running'},{id:'server',owner:'root',status:'running'},{id:'foreign',owner:'other',status:'running'}];
 const killed:string[]=[];
 const ctx={jobs:{list:()=>jobs,kill:async(id:string,owner:string)=>{assert.equal(owner,'root');killed.push(id);jobs.find(job=>job.id===id)!.status='killed';}},agents:{get:()=>{throw new Error('must not cancel model');}}};
 await assert.rejects(stopDshJobs(ctx,'root',['preview','foreign']),/unconfirmed/);
 assert.deepEqual(killed,[]);
 assert.deepEqual(await stopDshJobs(ctx,'root',['preview']),{stopped:true});
 assert.deepEqual(killed,['preview']);assert.equal(jobs[1].status,'running');
 await stopDshJobs(ctx,'root',['preview']);assert.deepEqual(killed,['preview']);
});
test('job stop does not mistake stopping, disappeared or unknown jobs for confirmed termination',async()=>{
 for(const status of ['stopping','unknown']){
  const job={id:'preview',owner:'root',status};
  const ctx={jobs:{list:()=>[job],kill:()=>{}}};
  assert.deepEqual(await stopDshJobs(ctx,'root',['preview']),{stopped:false});
 }
 await assert.rejects(stopDshJobs({jobs:{list:()=>[],kill:()=>{}}},'root',['missing']),/unconfirmed/);
});
