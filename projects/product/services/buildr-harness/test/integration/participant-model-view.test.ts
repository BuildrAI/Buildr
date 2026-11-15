import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createAgentService} from '../../src/index.ts';
import {ConversationRepository} from '../../src/persistence/conversation-repository.ts';
import type {StoredConversation} from '../../src/domain/agent-state.ts';
test('准确历史参与方模型在正文与摘要中保留，读取不改变原记录',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'participant-model-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const repo=new ConversationRepository(path.join(root,'agent-service'));
 const record:StoredConversation={view:{id:'one',workspaceId:'w',cwd:root,title:'测试',revision:'r',hidden:false,updatedAt:'2026-10-27T00:00:00Z',participants:[],entries:[{id:'m',sequence:1,kind:'message',role:'user',text:'hello',createdAt:'2026-10-27T00:00:00Z'}],requests:[]},participants:[{id:'p1',provider:'codex',connectionId:'c',label:'Codex',modelId:'first-model',bindingIdentity:'private',deliveredThrough:1},{id:'p2',provider:'codex',connectionId:'c',label:'Codex',modelId:'second-model',bindingIdentity:'private',deliveredThrough:1}],sources:{},attachments:{},attempts:[],requests:{}};
 repo.saveConversation(record);
 const service=createAgentService({dataRoot:root,executors:[],resolveWorkspace:()=>({rootPath:root}),assertTask:()=>{}});
 try{
  const body=service.conversations.read('w','one');assert.deepEqual(body.participants.map(p=>p.model),['first-model','second-model']);
  assert.deepEqual(repo.querySummaries(['w'],{limit:10}).conversations[0].participants.map(p=>p.model),['first-model','second-model']);
  assert.ok(body.participants.every(p=>!('bindingIdentity'in p)));assert.equal(repo.readConversation('one')?.view.revision,'r');
 }finally{await service.close();}
});
