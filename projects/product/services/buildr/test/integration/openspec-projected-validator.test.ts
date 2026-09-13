import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fixture } from '../fixtures/openspec-upstream.ts';
test('upstream preview validates affected output without writing',t=>{
 const f=fixture(t),before=fs.readFileSync(f.target,'utf8');assert.equal(f.plan().status,'safe');assert.equal(fs.readFileSync(f.target,'utf8'),before);
});
test('unrelated invalid spec is not a global validation gate',t=>{
 const f=fixture(t);f.write(`${f.root}/openspec/specs/unrelated/spec.md`,'invalid unrelated content');
 const r=f.run();assert.equal(r.status,'passed',JSON.stringify(r));assert.equal(fs.readFileSync(`${f.root}/openspec/specs/unrelated/spec.md`,'utf8'),'invalid unrelated content');
});
