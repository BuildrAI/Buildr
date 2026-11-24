import test from 'node:test';
import assert from 'node:assert/strict';
import {modelBulkSelection} from '../../src/features/agent-conversations/model-bulk-selection.ts';
import {ModelPreferenceQueue,previewModelPreferences} from '../../src/features/agent-conversations/model-preference-queue.ts';

const source={id:'magpie',providerLabel:'Magpie',status:'ready'};
const row=(id,label,family,enabled,available=true,owner=source)=>({id,label,family,enabled,available,source:owner});
const rows=[row('opus','Claude Opus','Claude',true),row('sonnet','Claude Sonnet','Claude',true),row('old','Claude Old','Claude',false,false),row('gpt','GPT','GPT',false),row('alt','Claude Opus','Claude',false,true,{id:'alt',providerLabel:'Alt',status:'failed'})];

test('bulk status and changes use the same search, status and family intersection as the table',()=>{
 const allClaude=modelBulkSelection(rows,'magpie','all','Claude');
 assert.equal(allClaude.filtered.length,3);
 assert.equal(allClaude.enabledCount,2);
 assert.deepEqual(allClaude.enable,[]);
 assert.deepEqual(allClaude.disable,[{sourceId:'magpie',modelId:'opus',enabled:false},{sourceId:'magpie',modelId:'sonnet',enabled:false}]);
 const disabled=modelBulkSelection(rows,'gpt','disabled','GPT');
 assert.deepEqual(disabled.enable,[{sourceId:'magpie',modelId:'gpt',enabled:true}]);
 assert.deepEqual(disabled.disable,[]);
 assert.deepEqual(modelBulkSelection(rows,'missing','all','all'),{filtered:[],enabledCount:0,enable:[],disable:[]});
 const offline=modelBulkSelection(rows,'alt','all','Claude');
 assert.equal(offline.filtered.length,1);
 assert.deepEqual([offline.enable,offline.disable],[[],[]]);
 const magpieRows=[
  {...row('codex/gpt','GPT-6.2-Sol','GPT',true),upstreamProvider:'codex',upstreamProviderLabel:'Codex'},
  {...row('grok/g47','Grok 4.7','Grok',false),upstreamProvider:'grok',upstreamProviderLabel:'Grok'},
  {...row('qoder/ult','Ultimate','其他',false),upstreamProvider:'qoder',upstreamProviderLabel:'Qoder'},
 ];
 const onlyGrok=modelBulkSelection(magpieRows,'','all','all','grok');
 assert.deepEqual(onlyGrok.filtered.map(item=>item.id),['grok/g47']);
 assert.deepEqual(onlyGrok.enable,[{sourceId:'magpie',modelId:'grok/g47',enabled:true}]);
 assert.deepEqual(modelBulkSelection(magpieRows,'qoder','all','all','all').filtered.map(item=>item.id),['qoder/ult']);
});

const account=(revision,id='magpie',models=[])=>({id,revision,models});
const prefs=(id,enabled)=>[{id,enabled}];
function deferred(){let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};}

test('queued clicks keep their own targets and follow successful versions even when the UI catches up mid-queue',async()=>{
 const queue=new ModelPreferenceQueue(),first=deferred(),second=deferred(),startedSecond=deferred(),calls=[];
 const save=async(current,changes)=>{
  calls.push([current.revision,changes]);
  if(calls.length===1)await first.promise;
  if(calls.length===2){startedSecond.resolve();await second.promise;}
  return account(String(Number(current.revision)+1));
 };
 const one=queue.enqueue(account('1'),prefs('opus',false),save);
 const two=queue.enqueue(account('1'),prefs('gpt',true),save);
 first.resolve();
 await startedSecond.promise;
 const three=queue.enqueue(account('2'),prefs('opus',true),save);
 second.resolve();
 await Promise.all([one,two,three]);
 assert.deepEqual(calls,[['1',prefs('opus',false)],['2',prefs('gpt',true)],['3',prefs('opus',true)]]);
});

test('a true conflict does not replay dependent clicks or block a different supplier',async()=>{
 const queue=new ModelPreferenceQueue(),calls=[];
 const conflict=new Error('external change');
 const save=async(current)=>{calls.push([current.id,current.revision]);if(current.id==='magpie')throw conflict;return current;};
 const first=queue.enqueue(account('1'),prefs('opus',false),save);
 const dependent=queue.enqueue(account('1'),prefs('gpt',true),save);
 const other=queue.enqueue(account('1','alt'),prefs('gpt',true),save);
 assert.equal((await first).failure,conflict);
 assert.equal((await dependent).failure,conflict);
 assert.equal((await other).account.id,'alt');
 assert.deepEqual(calls,[['magpie','1'],['alt','1']]);
});

test('a click observed on a different revision does not inherit the prior write version',async()=>{
 const queue=new ModelPreferenceQueue(),calls=[];
 const save=async(current)=>{calls.push(current.revision);return account('own-result');};
 await Promise.all([queue.enqueue(account('1'),prefs('opus',false),save),queue.enqueue(account('external'),prefs('gpt',true),save)]);
 assert.deepEqual(calls,['1','external']);
});

test('optimistic state preserves separately queued fields and dropping a failed batch reveals the confirmed state',()=>{
 const baseline=[account('1','magpie',[{id:'opus',enabled:true,contextWindow:1000,defaultContextWindow:1000,reportedContextWindow:3000}])];
 const disable=[{sourceId:'magpie',modelId:'opus',enabled:false}];
 const resize=[{sourceId:'magpie',modelId:'opus',contextWindow:2000}];
 const [preview]=previewModelPreferences(baseline,[disable,resize]);
 assert.equal(preview.revision,'1');
 assert.equal(preview.models[0].enabled,false);
 assert.equal(preview.models[0].contextWindow,2000);
 const [recovered]=previewModelPreferences(baseline,[resize]);
 assert.equal(recovered.models[0].enabled,true);
 assert.equal(recovered.models[0].contextWindow,2000);
 assert.equal(baseline[0].models[0].contextWindow,1000);
});
