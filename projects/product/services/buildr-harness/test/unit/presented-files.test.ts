import assert from 'node:assert/strict';
import test from 'node:test';
import {dshPresentedFiles,normalizePresentedFiles,presentedFilesForEntry} from '../../src/domain/presented-files.ts';
import {dshHistoryItems} from '../../src/executors/dsh/protocol.ts';
import type {ConversationEntry} from '../../src/contracts.ts';
const entry=(extra:Partial<ConversationEntry>={}):ConversationEntry=>({id:'tool',sequence:1,kind:'tool',role:'system',provider:'dsh',runId:'r',participantId:'p',name:'present',input:JSON.stringify({files:[{path:'/work/记录 文档.md',description:'交付记录'}]}),text:'Presented /work/记录 文档.md',status:'completed',createdAt:'now',...extra});
test('only exact successful native presentations become visible files',()=>{
 assert.deepEqual(presentedFilesForEntry(entry()),[{path:'/work/记录 文档.md',description:'交付记录'}]);
 for(const extra of [{status:'running'},{status:'failed'},{status:'unknown'},{parentToolId:'child'},{runId:undefined},{participantId:undefined},{provider:'codex'},{kind:'message',role:'assistant'},{name:'bash'},{input:'invalid'},{input:'{"files":[{"path":"https://example.com"}]}'}] as Partial<ConversationEntry>[])assert.deepEqual(presentedFilesForEntry(entry(extra)),[]);
 assert.equal(dshPresentedFiles('other','{}'),undefined);
 assert.equal(normalizePresentedFiles(Array.from({length:30},(_,i)=>({path:'/file'+i}))).length,20);
 assert.deepEqual(normalizePresentedFiles([{path:'/file'},{path:'/file'},{path:'bad\nfile'},{path:'/other',description:'x'.repeat(3000)}]).map(f=>[f.path,f.description?.length]),[['/file',undefined],['/other',2000]]);
});
test('live and cold DSH tool merging preserves explicit file metadata through the result',()=>{
 const items=dshHistoryItems([{type:'tool/call',data:{callId:'present',name:'present',arguments:entry().input}},{type:'tool/result',data:{message:{toolCallId:'present',content:[{type:'text',text:'Presented file'}]}}}]);
 assert.equal(items.length,1);assert.equal(items[0].status,'completed');assert.deepEqual(items[0].presentedFiles,[{path:'/work/记录 文档.md',description:'交付记录'}]);
 assert.deepEqual(presentedFilesForEntry(entry({provider:'codex',name:'native-file',presentedFiles:[{path:'/actual'}]})),[{path:'/actual'}]);
});
