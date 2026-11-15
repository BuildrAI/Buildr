import test from 'node:test';import assert from 'node:assert/strict';import {checkDistribution} from '../src/distribution.ts';
const components=[{name:'fixture-dependency',version:'1.0.0',license:'MIT'}];
const approved={name:'fixture-dependency',version:'1.0.0',disposition:'approved' as const,authority:{name:'fixture owner',source:'fixture explicit decision'},reason:'fixture licensed distribution'};
test('distribution check does not infer approval from permissive SPDX, another version, missing source or private packaging',()=>{
  assert.equal(checkDistribution(components,[]).status,'blocked');assert.equal(checkDistribution(components,[approved]).status,'eligible');
  for(const disposition of ['restricted','denied'] as const)assert.equal(checkDistribution(components,[{...approved,disposition}]).status,'blocked');
  assert.equal(checkDistribution(components,[{...approved,version:'0.9.0'}]).status,'blocked');
  assert.equal(checkDistribution(components,[{...approved,authority:{name:'fixture owner',source:''}}]).status,'blocked');
  assert.equal(checkDistribution(components,[approved,approved]).status,'blocked');
  assert.equal(checkDistribution([],[]).status,'blocked');
});
