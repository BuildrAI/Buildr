import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PendingSendRepository } from '../../src/persistence/pending-send-repository.ts';
import { PendingSends } from '../../src/process/pending-sends.ts';
import { AgentServiceError } from '../../src/domain/agent-state.ts';
import type { AgentService } from '../../src/application/agent-service.ts';

test('pending cancellation and dispatch claims serialize; a crashed claim is recovered by exact request identity',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'agent-pending-'));
  try{
    const first=new PendingSendRepository(root),second=new PendingSendRepository(root);
    const draft={expectedRevision:'r1',connectionId:'codex',text:'work'};
    const submitted=first.submit('scope','conversation',draft,'request');
    const edited=second.submit('scope','conversation',{...draft,text:'edited'},'request',submitted.revision);
    assert.throws(()=>first.cancel('scope','conversation',submitted.revision),{code:'agent_pending_conflict'});
    assert.equal(first.claim(submitted,'first',()=>true),undefined);
    const claimed=first.claim(edited,'first',()=>true)!;assert.ok(claimed);
    assert.throws(()=>second.cancel('scope','conversation',claimed.revision),{code:'agent_pending_conflict'});
    assert.equal(second.claim(claimed,'second',()=>true),undefined);
    const recovered=second.claim(claimed,'second',()=>false)!;assert.ok(recovered);
    first.finish(claimed,'waiting','stale owner must not overwrite');
    second.finish(recovered,'delivered','accepted');assert.equal(first.read('scope','conversation'),undefined);
    assert.equal(first.submit('scope','conversation',draft,'request').state,'delivered');
    const another=first.submit('scope','conversation',draft,'another');second.cancel('scope','conversation',another.revision);
    assert.equal(first.submit('scope','conversation',draft,'another').state,'cancelled');
    assert.equal(first.read('scope','conversation'),undefined);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('an unconfirmed old conversation waits without blocking another conversation; recovery keeps the original submission',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'agent-pending-isolation-'));
  try{
    const repository=new PendingSendRepository(path.join(root,'agent-service'));
    const draft={expectedRevision:'r1',connectionId:'codex',text:'continue'};
    repository.submit('scope','old',draft,'old-request');repository.submit('scope','ready',draft,'ready-request');
    const accepted:string[]=[];
    const service={generation:'current',verifyNext:async()=>{},conversations:{
      lookupRequest:()=>({found:false}),read:()=>({revision:'current-revision'}),
      prepareHandoff:async()=>({fits:true,token:'current-preview'}),
      send:(_scope:string,_id:string,input:{clientRequestId:string})=>{accepted.push(input.clientRequestId);},
    }} as unknown as AgentService;
    let unknown=true;
    const sends=new PendingSends({dataRoot:root,service,active:()=>true,generationAlive:()=>false,conversationBusy:async(_scope,id)=>{
      if(id==='old'&&unknown)throw new AgentServiceError('agent_process_state_unconfirmed','old state unconfirmed',503);
      return false;
    }});
    await sends.pump();assert.deepEqual(accepted,['ready-request']);assert.equal(repository.read('scope','old')?.state,'waiting');
    await sends.pump();assert.deepEqual(accepted,['ready-request']);
    unknown=false;await sends.pump();assert.deepEqual(accepted,['ready-request','old-request']);assert.equal(repository.list().length,0);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
