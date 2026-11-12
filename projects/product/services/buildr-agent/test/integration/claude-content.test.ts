import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { ClaudeReceiptCursor, readClaudePersistedExecution } from '../../src/executors/claude/content.ts';
import { claudeInputId } from '../../src/executors/claude/protocol.ts';
import { opaqueReference } from '../../src/executors/native-process.ts';

function fixture(t:test.TestContext){
  const root=fs.realpathSync(fs.mkdtempSync(path.join(tmpdir(),'buildr-claude-records-')));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const configRoot=path.join(root,'connections/claude-code'),contextId=randomUUID(),cwd=path.join(root,'work');
  const file=path.join(configRoot,'claude-config/projects/project',contextId+'.jsonl');
  fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'');
  const append=(value:any)=>fs.appendFileSync(file,JSON.stringify({sessionId:contextId,cwd,isSidechain:false,...value})+'\n');
  return {root,configRoot,contextId,cwd,file,append};
}
test('Claude receipt cursor observes only new exact owned UUIDs and refuses replacement',t=>{
  const f=fixture(t),old=claudeInputId('old'),current=claudeInputId('current');
  f.append({type:'user',uuid:old,message:{content:'old'}});
  const cursor=new ClaudeReceiptCursor(f),expected=new Set([old,current]);
  assert.deepEqual(cursor.read(expected),[]);
  f.append({type:'user',uuid:current,cwd:'/another',message:{content:'not owned'}});
  assert.deepEqual(cursor.read(expected),[]);
  const row=Buffer.from(JSON.stringify({type:'user',uuid:current,sessionId:f.contextId,cwd:f.cwd,isSidechain:false,message:{content:'中文'}})+'\n');
  fs.appendFileSync(f.file,row.subarray(0,row.length-3));assert.deepEqual(cursor.read(expected),[]);
  fs.appendFileSync(f.file,row.subarray(row.length-3));assert.deepEqual(cursor.read(expected),[current]);
  assert.deepEqual(cursor.read(expected),[]);
  fs.renameSync(f.file,f.file+'.old');fs.writeFileSync(f.file,'');
  assert.throws(()=>cursor.read(expected),/changed/);
});
test('Claude cold terminal observation never treats a background launch as completed work',async t=>{
  const f=fixture(t),id=claudeInputId('base');
  f.append({type:'user',uuid:id,message:{content:'work'}});
  f.append({type:'assistant',uuid:'call',message:{id:'model-call',content:[{type:'tool_use',id:'job',name:'Bash',input:{command:'server',run_in_background:true}}]}});
  f.append({type:'user',uuid:'result',message:{content:[{type:'tool_result',tool_use_id:'job',content:'started'}]},toolUseResult:{backgroundTaskId:'native-job'}});
  f.append({type:'assistant',uuid:'final',message:{id:'model-final',stop_reason:'end_turn',content:[{type:'text',text:'started'}]}});
  const result=await readClaudePersistedExecution({configRoot:f.configRoot,executable:'/program',cwd:f.cwd,bindingIdentity:'binding',contextRef:{id:f.contextId,data:{native:opaqueReference('claude-code',f.contextId,f.cwd,'binding')}},executionRef:{id:'execution'},nativeInputs:[{clientRequestId:'base',text:'work',createdAt:new Date().toISOString()}]});
  assert.equal(result?.observation.status,'unknown');assert.equal(result?.observation.tools[0]?.status,'unknown');
  assert.equal(result?.observation.backgroundWork,undefined);
});
