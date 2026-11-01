import {test} from 'node:test';
import assert from 'node:assert/strict';
import {organizeHandoff,handoffEntries,receivingBudget,formatHandoffRounds,displayRounds} from '../../src/domain/handoff-material.ts';
import type {ConversationEntry} from '../../src/contracts.ts';
const entry=(sequence:number,fields:Partial<ConversationEntry>):ConversationEntry=>({id:String(sequence),sequence,kind:'message',role:'user',text:'request',createdAt:'2026-10-27T00:00:00Z',runId:'one',...fields});
test('round identity preserves in-run answers, failed tools and explicit artifacts without copying scripts or read bodies',()=>{
 const records=[entry(1,{}),entry(2,{kind:'tool',role:'system',name:'read',input:'{"file_path":"a.ts"}',text:'private file body',status:'completed'}),entry(3,{kind:'notice',text:'answer to question'}),entry(4,{kind:'tool',role:'system',name:'command',input:'python <<PY\n'+ 'x'.repeat(100000),text:'execution failed',status:'failed'}),entry(5,{kind:'tool',role:'system',name:'file-change',text:'修改文件\na.ts',status:'completed'}),entry(6,{kind:'handoff',role:'system',text:'previous packet'}),entry(7,{role:'assistant',text:'done',status:'completed'})];
 const rounds=organizeHandoff(records);assert.equal(rounds.length,1);assert.deepEqual(rounds[0]!.userInputs,['request','answer to question']);
 const text=JSON.stringify(rounds);assert.ok(!text.includes('private file body'));assert.ok(!text.includes('x'.repeat(1000)));assert.ok(!text.includes('previous packet'));assert.ok(text.includes('失败'));assert.equal(rounds[0]!.artifacts[0]!.location,'a.ts');
 assert.equal(handoffEntries(records).length,6);
});
test('interruption after assistant commentary does not invent a final reply or artifact',()=>{
 const rounds=organizeHandoff([entry(1,{}),entry(2,{role:'assistant',text:'will inspect',status:'completed'}),entry(3,{kind:'tool',role:'system',name:'read',text:'not finished',status:'running'})]);
 assert.equal(rounds[0]!.finalReply,undefined);assert.equal(rounds[0]!.artifacts.length,0);assert.ok(rounds[0]!.execution[0]!.result.includes('尚未结束'));
});
test('receiving budget respects independent adapter and conservative context bounds',()=>{
 assert.equal(receivingBudget(96000),96000);assert.equal(receivingBudget(96000,32000,4096),23808);assert.equal(receivingBudget(8000,32000,4096),8000);assert.equal(receivingBudget(96000,4096),2048);
});

test('successful repeated operations collapse while failures, unknowns, decisions and source counts remain',()=>{
 const records=[entry(1,{text:'不要改配置'}),...Array.from({length:100},(_,i)=>entry(i+2,{kind:'tool',role:'system',name:'read',input:JSON.stringify({path:'a.ts'}),text:'file body must not travel',status:'completed'})),entry(102,{kind:'tool',role:'system',name:'bash',text:'quota failed',status:'failed'}),entry(103,{kind:'tool',role:'system',name:'edit',text:'delivery unclear'}),entry(104,{role:'assistant',text:'需要核对，不可重试。',status:'completed'})];
 const rounds=organizeHandoff(records);assert.equal(rounds[0].executionCount,102);assert.equal(rounds[0].execution.length,3);assert.equal(displayRounds(rounds)[0].executionCount,102);
 const text=formatHandoffRounds(rounds);assert.match(text,/100 次执行结束/);assert.match(text,/quota failed/);assert.match(text,/结果未确认/);assert.match(text,/不要改配置/);assert.match(text,/#102/);assert.ok(!text.includes('file body must not travel'));assert.ok(!text.includes('"action"'));
 assert.ok(Buffer.byteLength(text)<Buffer.byteLength(JSON.stringify(records.map(e=>({action:e.name,result:'执行结束，具体结果见来源',location:'a.ts'}))))/3);
});

test('an active source round never promotes completed commentary into a final reply',()=>{
 const records=[entry(1,{text:'尚在进行的主任务'}),entry(2,{role:'assistant',text:'先解释当前发现',status:'completed'})];
 for(const status of ['running','waiting-question','waiting-approval','unknown','tools-active'] as const){
  const round=organizeHandoff(records,{one:{status,provider:"local",updatedAt:"2026-10-29T00:00:00Z"}})[0]!;
  assert.equal(round.finalReply,undefined);assert.deepEqual(round.assistantNotes,['先解释当前发现']);assert.equal(round.state,status);
 }
});

test('child inputs and reports stay out of primary handoff while child tool evidence remains attributable',()=>{
 const records=[entry(1,{text:'primary request'}),entry(2,{role:'assistant',text:'primary final',status:'completed'}),entry(3,{role:'user',text:'child instruction',parentToolId:'delegate'}),entry(4,{role:'assistant',text:'child report',parentToolId:'delegate',status:'completed'})];
 const round=organizeHandoff(records)[0]!;
 assert.deepEqual(round.userInputs,['primary request']);assert.equal(round.finalReply,'primary final');
 assert.deepEqual(round.assistantNotes,[]);assert.equal(handoffEntries(records).length,2);
 const tool=entry(5,{kind:'tool',role:'system',name:'Read',parentToolId:'delegate',text:'observed child output',status:'completed'});
 assert.equal(handoffEntries([...records,tool]).at(-1),tool);
 assert.equal(organizeHandoff([...records,tool])[0]!.finalReply,'primary final');
 assert.equal(organizeHandoff([...records,{...tool,status:'running'}])[0]!.finalReply,undefined);
});
