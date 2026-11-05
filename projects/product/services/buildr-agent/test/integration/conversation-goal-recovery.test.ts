import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {goalRecoveryFixture as fixture} from '../support/goal-recovery-fixture.ts';

async function until(check: () => boolean) { for (let n = 0; n < 500; n++) { if (check()) return; await new Promise(resolve => setTimeout(resolve, 10)); } assert.fail('goal did not continue automatically'); }

test('released unknown work resumes the goal without replaying its original write',async()=>{
 const f=await fixture();try{
  await until(()=>f.read().run?.status==='completed');
  assert.equal(f.sends.length,2);assert.equal(f.firstWrites(),1);assert.equal(fs.readFileSync(f.remaining,'utf8'),'continued goal');
  assert.ok(f.read().entries.some(entry=>entry.kind==='tool'&&entry.status==='unknown'),'original unknown result stays unknown');
  await f.service.conversations.recoverInterrupted();assert.equal(f.sends.length,2);
 }finally{await f.close();}
});

for (const blocked of ['control', 'decision']) test('automatic goal recovery protects ' + blocked, async () => {
  const f = await fixture(blocked === 'control' ? { release: false } : { question: true });
  try {
    await until(() => f.read().run?.status === 'unknown');
    await f.service.conversations.recoverInterrupted();
    assert.equal(f.sends.length, 1); assert.equal(fs.existsSync(f.remaining), false); assert.equal(f.firstWrites(), 1);
  } finally { await f.close(); }
});

for(const executorId of ['codex','dsh','qoder'])test(executorId+' protocol recovery preserves unknown results and continues only missing work',async()=>{
 const f=await fixture({executorId,failure:'protocol'});try{
  await until(()=>f.read().run?.status==='completed');
  assert.equal(f.firstWrites(),1);assert.equal(f.sends.length,2);assert.equal(fs.readFileSync(f.remaining,'utf8'),'continued goal');
  assert.ok(f.read().entries.some(entry=>entry.kind==='tool'&&entry.status==='unknown'));
 }finally{await f.close();}
});
for(const blocked of ['control','decision'])test('protocol recovery protects '+blocked,async()=>{
 const f=await fixture({failure:'protocol',...(blocked==='control'?{release:false}:{question:true})});
 try{await until(()=>f.read().run?.status==='unknown');await f.service.conversations.recoverInterrupted();assert.equal(f.sends.length,1);assert.equal(f.firstWrites(),1);}finally{await f.close();}
});

for(const failure of ['protocol','request','idle-request'])test(failure+' failure with settled tool results resumes safely',async()=>{
 const f=await fixture({failure,uncertain:false});
 try{await until(()=>f.read().run?.status==='completed');assert.equal(f.firstWrites(),1);assert.equal(f.sends.length,2);}finally{await f.close();}
});
test('repeated recovery scans do not replay completed recovery work',async()=>{
 const f=await fixture({failure:'protocol'});try{
  await until(()=>f.read().run?.status==='completed');
  for(let n=0;n<3;n++)await f.service.conversations.recoverInterrupted();
  assert.equal(f.sends.length,2);assert.equal(f.firstWrites(),1);
 }finally{await f.close();}
});

test('explicit stop cancels protocol recovery even after later recovery scans',async()=>{
 const f=await fixture({failure:'protocol',release:false});
 try{
  await until(()=>f.read().run?.status==='unknown');
  const view=f.read(),run=view.run!;
  await f.service.conversations.stop('workspace',f.chat.id,{expectedRevision:view.revision,runId:run.id,participantId:run.participantId,generation:run.generation});
  await f.service.conversations.recoverInterrupted();
  assert.equal(f.sends.length,1);assert.equal(f.firstWrites(),1);assert.equal(fs.existsSync(f.remaining),false);
 }finally{await f.close();}
});
