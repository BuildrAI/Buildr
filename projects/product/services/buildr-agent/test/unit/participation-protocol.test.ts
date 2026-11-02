import test from 'node:test';
import assert from 'node:assert/strict';
import { codexItem } from '../../src/executors/codex/index.ts';
import { dshHistoryItems } from '../../src/executors/dsh/protocol.ts';
import { qoderHistoryItems } from '../../src/executors/qoder/protocol.ts';

test('Codex maps exit evidence and measures native command output before display truncation',()=>{
 const text='中😀'.repeat(10000);
 const item=codexItem({id:'t',type:'commandExecution',command:'buildr task list',aggregatedOutput:text,status:'completed',exitCode:0},'r','completed')[0]!;
 assert.equal(item.participation?.output?.utf8Bytes,70000);assert.equal(item.participation?.outcome,'succeeded');assert.ok(item.text.length<text.length);
 assert.equal(codexItem({id:'x',type:'commandExecution',status:'completed'},'r','completed')[0]?.participation?.outcome,'unknown');
 assert.equal(codexItem({id:'x',type:'commandExecution',status:'completed'},'r','completed')[0]?.participation?.input,undefined);
 assert.equal(codexItem({id:'x',type:'commandExecution',exitCode:1},'r','completed')[0]?.participation?.outcome,'failed');
 const mcp=codexItem({id:'m',type:'mcpToolCall',tool:'Read',arguments:{path:'.agents/skills/buildr/SKILL.md'},result:{content:[{type:'text',text:'中文'}]}},'r','completed')[0]!;
 assert.equal(mcp.participation?.matches[0]?.status,'candidate');assert.equal(mcp.participation?.output?.utf8Bytes,6);
});
test('DSH cold history merges original call and result metadata without losing input or inventing success',()=>{
 const events=[{type:'turn/start',data:{turn:1}},{type:'user/message',data:{turn:1,source:{rpcId:'r'},content:'work'}},{type:'tool/call',data:{turn:1,callId:'t',name:'Read',arguments:'{"path":".agents/skills/buildr/SKILL.md"}'}},{type:'tool/result',data:{turn:1,message:{toolCallId:'t',content:[{type:'text',text:'中'}]}}}];
 const tool=dshHistoryItems(events).find(item=>item.id==='t')!;
 assert.equal(tool.participation?.matches.length,1);assert.ok(tool.participation?.input);assert.equal(tool.participation?.output?.utf8Bytes,3);assert.equal(tool.participation?.outcome,'unknown');
 const missing=dshHistoryItems([{type:'tool/result',data:{message:{toolCallId:'t'}}}])[0]!;assert.equal(missing.participation?.output,undefined);
});
test('Qoder cold history keeps call/result, exact native ownership and missing lengths unknown',()=>{
 const messages=[{uuid:'r',session_id:'c',type:'user',message:{content:'work'}},{uuid:'a',session_id:'c',type:'assistant',message:{content:[{type:'tool_use',id:'t',name:'Read',input:{path:'.agents/skills/buildr/SKILL.md'}}]}},{uuid:'o',session_id:'c',type:'user',message:{content:[{type:'tool_result',tool_use_id:'t',content:[{type:'text',text:'中'},{type:'text',text:'😀'}]}]}}];
 const tool=qoderHistoryItems(messages,'c').find(item=>item.id==='t')!;
 assert.equal(tool.executionId,'r');assert.equal(tool.participation?.matches.length,1);assert.ok(tool.participation?.input);assert.equal(tool.participation?.output?.utf8Bytes,8);assert.equal(tool.participation?.outcome,'unknown');
 assert.equal(qoderHistoryItems([{uuid:'x',session_id:'c',type:'user',message:{content:[{type:'tool_result',tool_use_id:'m'}]}}],'c')[0]?.participation?.output,undefined);
});
