import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ConversationRepository } from '../../src/persistence/conversation-repository.ts';
import type { StoredConversation } from '../../src/domain/agent-state.ts';
import { instructionParticipation, nativeParticipation, mergeParticipation } from '../../src/domain/participation.ts';
import { singleParticipation } from '../../src/domain/participation-record.ts';

test('optional metadata survives SQLite reopen, original text stays unchanged and stale index is never counted',async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'buildr-participation-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const repo=new ConversationRepository(root);t.after(()=>repo.stopReadModels());
  const at='2026-11-01T00:00:00.000Z';
  const r={view:{id:'c',workspaceId:'w',cwd:root,title:'test',revision:'r1',hidden:false,updatedAt:at,participants:[],requests:[],entries:[{id:'u',sequence:1,kind:'message',role:'user',text:'untouched user',createdAt:at},{id:'t',sequence:2,kind:'tool',role:'assistant',text:'original output',input:'buildr task list',name:'command',createdAt:at,runId:'r',participation:mergeParticipation(undefined,nativeParticipation('buildr task list','original output','unknown'),'command','buildr task list')}]},participants:[],sources:{},attachments:{},requests:{},attempts:[{runId:'r',participantId:'p',userEntryId:'u',clientRequestId:'request',accepted:true,participation:{version:1,submittedAt:at,segments:[instructionParticipation('control','known wrapper')],available:[],coverage:'partial',gaps:['implicit-consumption-unavailable']}}]} as unknown as StoredConversation;
  repo.saveConversation(r);
  const reopened=new ConversationRepository(root);t.after(()=>reopened.stopReadModels());
  const saved=reopened.readConversation('c')!;
  assert.equal(saved.view.entries[1]?.participation,undefined,'legacy public entries retain their original closed DTO shape');assert.ok(saved.participationTools?.t);
  assert.equal(saved.view.entries[0]?.text,'untouched user');assert.equal(saved.view.entries[1]?.text,'original output');
  const stale=structuredClone(saved);stale.view.entries[1]!.text='legacy writer native update';assert.ok(singleParticipation(stale,'r').gaps.includes('tool-observation-stale'));
  const view=singleParticipation(saved,'r');assert.equal(view.items.length,2);assert.equal(view.items[1]?.status,'candidate');
  const fragment=structuredClone(saved);fragment.participationTools!['t']!.matches[0]!.contentScope='fragment';assert.equal(singleParticipation(fragment,'r').items[1]?.output,undefined,'mixed file output must not be assigned to one source fragment');
  for(let i=0;i<30 && repo.participationProjections('w').incomplete;i++)await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(repo.participationProjections('w').projections[0]?.facts.length,2);
  // The old writer path round-trips unknown JSON fields; it does not rebuild records from public DTOs.
  const oldWriter=JSON.parse(JSON.stringify(saved)) as StoredConversation,competing=JSON.parse(JSON.stringify(saved)) as StoredConversation;
  oldWriter.view.title='legacy title update';oldWriter.view.revision='r2';reopened.saveConversation(oldWriter,'r1');
  assert.deepEqual(reopened.readConversation('c')!.attempts[0]!.participation,saved.attempts[0]!.participation);assert.deepEqual(reopened.readConversation('c')!.participationTools,saved.participationTools);
  competing.view.revision='r3';assert.throws(()=>repo.saveConversation(competing,'r1'),{code:'agent_revision_conflict'});
  assert.equal(reopened.readConversation('c')!.view.title,'legacy title update');
  const db=new DatabaseSync(repo.filename);db.exec('DELETE FROM conversation_participation');db.close();
  assert.equal(repo.participationProjections('w').incomplete,true);
  for(let i=0;i<30 && repo.participationProjections('w').incomplete;i++)await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(repo.participationProjections('w').projections[0]?.facts.length,2);
});
