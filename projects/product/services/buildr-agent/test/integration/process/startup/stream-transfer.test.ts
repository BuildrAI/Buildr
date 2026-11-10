import assert from 'node:assert/strict';
import { acquirePreparedProcessFixture } from '../../../support/prepared-process-fixture.ts';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {executionScopeKey,conversationEventDecoder} from '../../../../src/index.ts';
import {readProcessRecord} from '../../../../src/process/ownership.ts';
import {ConversationRepository} from '../../../../src/persistence/conversation-repository.ts';
import {actor,cleanupProcessFixture,connectAgentProcess} from '../../../support/process-fixture.ts';

test('v2 process stream and public client preserve committed updates and external-writer recovery',{timeout:60000},async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'agent-stream-transfer-')),dataRoot=path.join(root,'profile'),workspace=path.join(root,'work');fs.mkdirSync(workspace);

 const runtime=acquirePreparedProcessFixture(dataRoot),profileId='stream-isolation',scope=executionScopeKey({sourceId:'minimal',id:'directory'});
 let host:Awaited<ReturnType<typeof actor>>|undefined,observer:Awaited<ReturnType<typeof connectAgentProcess>>|undefined;
 const abort=new AbortController();let reader:ReadableStreamDefaultReader<Uint8Array>|undefined,subscription:Awaited<ReturnType<NonNullable<typeof observer>['operations']['conversations']['subscribe']>>|undefined;
 t.after(async()=>{abort.abort();subscription?.close();await reader?.cancel().catch(()=>{});await cleanupProcessFixture({root,dataRoot,profileId,host,observer});});
 host=await actor({dataRoot,profileId,runtime,workspace});const chat=await host.call('conversations.create',[scope,{}]);
 observer=await connectAgentProcess({dataRoot,profileId,runtime,sourceId:'minimal'});
 subscription=await observer.operations.conversations.subscribe(scope,chat.id);const events=subscription.events[Symbol.asyncIterator]();assert.equal((await events.next()).value!.payload.conversation!.id,chat.id);
 const record=readProcessRecord(dataRoot)!;
 const response=await fetch(record.origin+'/events',{method:'POST',headers:{authorization:'Bearer '+record.token,'content-type':'application/json'},body:JSON.stringify({sourceId:'minimal',scope,id:chat.id,transfer:'delta-v2'}),signal:abort.signal});assert.equal(response.status,200);reader=response.body!.getReader();let buffer='';const decoder=new TextDecoder(),decode=conversationEventDecoder();
 async function next(){for(;;){const at=buffer.indexOf('\n\n');if(at>=0){const frame=buffer.slice(0,at);buffer=buffer.slice(at+2);if(frame.startsWith('data: '))return JSON.parse(frame.slice(6));continue;}const part=await reader!.read();assert.equal(part.done,false);buffer+=decoder.decode(part.value,{stream:true});}}
 decode(await next());
 const renamed=await host.call('conversations.update',[scope,chat.id,{expectedRevision:chat.revision,title:'committed'}]);
 const patch=await next();assert.equal(patch.payload.patch.changes.title,'committed');assert.equal(decode(patch).payload.conversation!.revision,renamed.revision);
 assert.equal((await events.next()).value!.payload.conversation!.title,'committed');
 const repo=new ConversationRepository(path.join(dataRoot,'agent-service'));repo.stopReadModels();const external=repo.readConversation(chat.id)!,prior=external.view.revision;external.view.title='external';external.view.revision=randomUUID();repo.saveConversation(external,prior);
 let projected;do{projected=decode(await next());}while(projected.payload.conversation!.title!=='external');assert.equal(projected.payload.conversation!.revision,external.view.revision);
 let publicView;do{publicView=(await events.next()).value!.payload.conversation!;}while(publicView.title!=='external');assert.equal(publicView.revision,external.view.revision);
});
