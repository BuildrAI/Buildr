import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {OwnedControlResource,closeOwnedProcess} from '../../../src/executors/native-process.ts';

test('force stop requires the exact owned context and binding and leaves another native process alive',{skip:process.platform==='win32'},async()=>{
 const own=new OwnedControlResource(process.execPath,['-e',"process.stdout.write('ready');setInterval(()=>{},1000)"],{cwd:process.cwd(),env:process.env});
 const other=new OwnedControlResource(process.execPath,['-e',"process.stdout.write('ready');setInterval(()=>{},1000)"],{cwd:process.cwd(),env:process.env});
 try{
  await Promise.all([once(own.child.stdout,'data'),once(other.child.stdout,'data')]);
  const ref=own.executionRef('run','context','binding',true);
  assert.equal(await own.stopExecution(ref,'foreign','binding'),false);assert.equal(await own.stopExecution(ref,'context','foreign'),false);
  assert.equal(own.child.exitCode,null);assert.equal(own.child.signalCode,null);
  assert.equal(await own.stopExecution(ref,'context','binding'),true);
  assert.ok(own.child.exitCode!==null||own.child.signalCode!==null);assert.equal(other.child.exitCode,null);assert.equal(other.child.signalCode,null);
 }finally{await Promise.all([closeOwnedProcess(own.child),closeOwnedProcess(other.child)]);}
});
