import test from 'node:test';
import assert from 'node:assert/strict';
import {settlePromotedCommand} from '../../src/executors/dsh/command-deadline-plugin.ts';

test('foreground expiry stops only the exact native job and reports failure rather than a background success',async()=>{
 const kills:string[]=[],job={id:'job',owner:'session',status:'running'};
 const ctx={jobs:{list:()=>[job],kill:async(id:string)=>{kills.push(id);job.status='killed';},wait:async()=>job}};
 const exec={name:'bash',callId:'call',agent:{id:'session'},arguments:{}};
 const result={isError:false,value:{kind:'promoted',jobId:'job',output:'partial output'}};
 const decision=await settlePromotedCommand(ctx,exec,result);
 assert.deepEqual(kills,['job']);assert.equal(decision.kind,'block');assert.match(decision.feedback[0].text,/partial output.*\n.*已确认/s);
 assert.equal(await settlePromotedCommand(ctx,{...exec,arguments:{run_in_background:true}},result),undefined);
 assert.deepEqual(kills,['job']);
});
test('foreign or unconfirmed jobs remain discoverable without a false termination claim',async()=>{
 let killed=false;
 const exec={name:'pwsh',callId:'call',agent:{id:'session'},arguments:{}};
 const result={isError:false,value:{kind:'promoted',jobId:'job'}};
 for(const owner of ['foreign','session']){
  const ctx={jobs:{list:()=>[{id:'job',owner,status:'running'}],kill:async()=>{killed=true;},wait:async()=>({status:'stopping'})}};
  const decision=await settlePromotedCommand(ctx,exec,result);assert.match(decision.feedback[0].text,/尚未确认/);
  if(owner==='foreign')assert.equal(killed,false);
 }
});
