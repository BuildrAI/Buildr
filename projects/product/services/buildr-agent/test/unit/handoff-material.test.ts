import {test} from 'node:test';
import assert from 'node:assert/strict';
import {organizeHandoff,handoffEntries,receivingBudget} from '../../src/domain/handoff-material.ts';
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
