import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fixture } from '../fixtures/openspec-upstream.ts';
import { runOpenSpecConvergence, convergenceReceiptPath } from '../../src/modules/openspec/application/openspec-converge.ts';

test('converge delegates actual spec writing and archive to OpenSpec 1.13',t=>{
 const f=fixture(t); const r=f.run(); assert.equal(r.status,'passed',JSON.stringify(r));
 assert.match(fs.readFileSync(f.target,'utf8'),/Requirement: New/);assert.ok(!fs.existsSync(f.changeRoot));
 assert.ok(!fs.existsSync(convergenceReceiptPath(f.input.resolveArchivedChangeRoot())));
 assert.deepEqual(r.execution.map(x=>x.id),['upstream-preview','upstream-archive']);
});
test('incomplete checklist prevents upstream archive',t=>{
 const f=fixture(t);f.write(path.join(f.changeRoot,'tasks.md'),'- [ ] implement\n');
 const before=fs.readFileSync(f.target,'utf8');const r=f.run();assert.equal(r.code,'change-checklist-incomplete');assert.equal(fs.readFileSync(f.target,'utf8'),before);
});
test('conflict blocks only the current mutation',t=>{
 const f=fixture(t);let called=false;const r=runOpenSpecConvergence({...f.input,activeConflicts:[{code:'active-change-conflict'}],archive:()=>{called=true;return {status:'passed'};}});
 assert.equal(r.status,'blocked');assert.equal(called,false);assert.ok(fs.existsSync(f.changeRoot));
});
test('upstream failure preserves recovery record and permits retry',t=>{
 const f=fixture(t);const r=runOpenSpecConvergence({...f.input,archive:()=>({status:'blocked',code:'fixture-failure'})});
 assert.equal(r.status,'blocked');assert.ok(fs.existsSync(convergenceReceiptPath(f.changeRoot)));
 assert.equal(f.run().status,'passed');
});
test('archive completed but receipt removal failed does not replay spec mutation',t=>{
 const f=fixture(t);const r=runOpenSpecConvergence({...f.input,releaseReceipt:()=>{throw new Error('fixture');}});
 assert.equal(r.code,'convergence-receipt-release-failed');const archived=f.input.resolveArchivedChangeRoot();
 const next=runOpenSpecConvergence({...f.input,context:{...f.context,changeRoot:archived,archived:true},archive:()=>{throw new Error('must not run');}});
 assert.equal(next.status,'passed');assert.ok(!fs.existsSync(convergenceReceiptPath(archived)));
});
