import test from 'node:test';
import assert from 'node:assert/strict';
import { runOpenSpecConvergencePreflight } from '../../src/modules/openspec/application/openspec-convergence-preflight.ts';
const context:any={change:'one',project:'demo',delta:{hash:'delta',operations:[],capabilities:new Map()}};
const executableIdentity={version:'1.13.0',sha256:'exact'};
test('preflight is read only and does not require full-tree planning',()=>{
 const r=runOpenSpecConvergencePreflight({context,executableIdentity});assert.equal(r.status,'ready');assert.deepEqual(r.effects,[]);
});
test('related conflicts block preflight',()=>{
 const r=runOpenSpecConvergencePreflight({context,executableIdentity,activeConflicts:[{code:'active-change-conflict'}]});assert.equal(r.status,'blocked');
});
test('preflight identity changes with input observations',()=>{
 const a=runOpenSpecConvergencePreflight({context,executableIdentity});
 const b=runOpenSpecConvergencePreflight({context:{...context,delta:{...context.delta,hash:'changed'}},executableIdentity});assert.notEqual(a.readinessIdentity,b.readinessIdentity);
});
