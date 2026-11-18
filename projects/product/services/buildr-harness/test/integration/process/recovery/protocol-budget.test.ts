import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {goalRecoveryFixture} from '../../../support/goal-recovery-fixture.ts';

test('persistent protocol recovery is bounded and later scans never replay it',{timeout:40_000},async()=>{
 const f=await goalRecoveryFixture({failure:'protocol',persistent:true});try{
  for(let n=0;n<3000&&!/自动恢复已达上限/.test(f.read().run?.diagnostic??'');n++)await new Promise(resolve=>setTimeout(resolve,10));
  assert.match(f.read().run?.diagnostic??'',/自动恢复已达上限/);
  assert.equal(f.sends.length,4);assert.equal(f.firstWrites(),1);assert.equal(fs.existsSync(f.remaining),false);
  for(let n=0;n<3;n++)await f.service.conversations.recoverInterrupted();
  assert.equal(f.sends.length,4);assert.ok(f.read().entries.some(entry=>entry.kind==='tool'&&entry.status==='unknown'));
 }finally{await f.close();}
});
