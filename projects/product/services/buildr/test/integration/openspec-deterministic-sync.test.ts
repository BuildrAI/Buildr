import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fixture, requirement } from '../fixtures/openspec-upstream.ts';
test('upstream parser and archive preserve repeated delta sections',t=>{
 const f=fixture(t,`## ADDED Requirements\n${requirement('First')}\n## ADDED Requirements\n${requirement('Second')}`);
 assert.deepEqual(f.context.delta.operations.map(x=>x.title),['First','Second']);
 const r=f.run();assert.equal(r.status,'passed',JSON.stringify(r));const actual=fs.readFileSync(f.target,'utf8');assert.match(actual,/Requirement: First/);assert.match(actual,/Requirement: Second/);
});
test('upstream prevents omission of existing scenarios',t=>{
 const f=fixture(t,`## MODIFIED Requirements\n${requirement('Existing').replace('Scenario: Existing works','Scenario: replacement')}`);
 assert.equal(f.plan().status,'blocked');const before=fs.readFileSync(f.target,'utf8');assert.equal(f.run().status,'blocked');assert.equal(fs.readFileSync(f.target,'utf8'),before);
});
