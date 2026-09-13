import { spawnSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fixture } from '../fixtures/openspec-upstream.ts';
import { convergenceReceiptPath, runOpenSpecConvergence } from '../../src/modules/openspec/application/openspec-converge.ts';
test('interrupted after all writes resumes archive only',t=>{
 const f=fixture(t),receipt=f.receipt();f.input.writeReceipt(convergenceReceiptPath(f.changeRoot),receipt);
 for(const file of receipt.files)f.write(`${f.root}/${file.path}`,file.expectedContent);
 let skip=false;const r=runOpenSpecConvergence({...f.input,archive:(value)=>{skip=value;return f.input.archive(value);}});
 assert.equal(r.status,'passed',JSON.stringify(r));assert.equal(skip,true);
});
test('concurrent edit after interruption is retained',t=>{
 const f=fixture(t);f.input.writeReceipt(convergenceReceiptPath(f.changeRoot),f.receipt());
 f.write(f.target,'concurrent content\n');const r=f.run();assert.equal(r.status,'recovery-unprovable');assert.equal(fs.readFileSync(f.target,'utf8'),'concurrent content\n');
});
test('changed delta after interruption cannot reuse old authorization',t=>{
 const f=fixture(t);f.input.writeReceipt(convergenceReceiptPath(f.changeRoot),f.receipt());
 const r=runOpenSpecConvergence({...f.input,context:{...f.context,delta:{...f.context.delta,hash:'changed'}}});assert.equal(r.code,'recovery-input-changed');
});
test('legacy recovery files are preserved and diagnosed',t=>{
 const f=fixture(t);const file=`${f.changeRoot}/.buildr/deterministic-convergence.json`;f.write(file,'{"legacy":true}');
 assert.equal(f.run().status,'recovery-unprovable');assert.equal(fs.readFileSync(file,'utf8'),'{"legacy":true}');
});

test('process killed after receipt persistence can restart safely',t=>{
 const f=fixture(t);const child=spawnSync(process.execPath,['--input-type=module','-e',`
   import fs from 'node:fs';
   const input=JSON.parse(fs.readFileSync(0,'utf8'));
   fs.mkdirSync(input.directory,{recursive:true});fs.writeFileSync(input.file,JSON.stringify(input.receipt));
   process.kill(process.pid,'SIGKILL');
 `],{input:JSON.stringify({directory:`${f.changeRoot}/.buildr`,file:convergenceReceiptPath(f.changeRoot),receipt:f.receipt()}),encoding:'utf8'});
 assert.equal(child.signal,'SIGKILL');assert.equal(f.run().status,'passed');
});

test('recovery detects byte changes including trailing whitespace',t=>{
 const f=fixture(t);f.input.writeReceipt(convergenceReceiptPath(f.changeRoot),f.receipt());
 f.write(f.target,fs.readFileSync(f.target,'utf8').replace('Existing.','Existing.  '));
 assert.equal(f.run().status,'recovery-unprovable');assert.match(fs.readFileSync(f.target,'utf8'),/Existing\.  /);
});
