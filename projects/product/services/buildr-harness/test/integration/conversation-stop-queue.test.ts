import assert from 'node:assert/strict';
import test, {type TestContext} from 'node:test';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PendingSendRepository} from '../../src/persistence/pending-send-repository.ts';

function fixture(t:TestContext){const root=mkdtempSync(join(tmpdir(),'buildr-stop-queue-'));t.after(()=>rmSync(root,{recursive:true,force:true}));return new PendingSendRepository(root);}
const draft={expectedRevision:'r',connectionId:'qoder-cn',text:'submitted work'};
test('conversation stop cancels an already claimed input; stale dispatch cannot start it or erase its draft',t=>{
 const repo=fixture(t),row=repo.submit('ws','chat',draft,'input'),claimed=repo.claim(row,'generation',()=>false)!;
 const result=repo.cancelForStop('ws','chat',pending=>{assert.equal(pending?.id,'input');return 'saved';});
 let sends=0;assert.equal(repo.dispatch(claimed,()=>++sends),undefined);assert.equal(sends,0);assert.equal(result,'saved');
 assert.equal(repo.lookup('ws','chat','input')?.state,'cancelled');assert.equal(repo.lookup('ws','chat','input')?.draft.text,draft.text);
 repo.finish(claimed,'waiting','late callback');assert.equal(repo.read('ws','chat'),undefined);
 repo.submit('ws','chat',draft,'new-input');repo.cancelStopped('ws','chat','input');assert.equal(repo.read('ws','chat')?.id,'new-input');
});
test('failure to persist a stop rolls back queue cancellation',t=>{
 const repo=fixture(t);repo.submit('ws','chat',draft,'input');
 assert.throws(()=>repo.cancelForStop('ws','chat',()=>{throw new Error('record changed');}),/record changed/);
 assert.equal(repo.read('ws','chat')?.state,'waiting');
});
test('dispatch admission wins before stop; stop does not rewrite an accepted delivery as cancelled',t=>{
 const repo=fixture(t),row=repo.submit('ws','chat',draft,'input'),claimed=repo.claim(row,'generation',()=>false)!;
 let sends=0;assert.equal(repo.dispatch(claimed,()=>++sends),1);
 repo.cancelForStop('ws','chat',pending=>assert.equal(pending,undefined));assert.equal(repo.lookup('ws','chat','input')?.state,'delivered');assert.equal(sends,1);
});
