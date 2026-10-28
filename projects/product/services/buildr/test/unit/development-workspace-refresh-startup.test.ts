import assert from 'node:assert/strict';
import test from 'node:test';
import {resumeDevelopmentWorkspaceRefresh} from '../../src/web/module.ts';

test('only the real development profile schedules prepared-workspace refresh after readiness',async()=>{
  let called=0;const refresh=async()=>{called++;};
  for(const [channel,options] of [
    ['npm',{webProfile:{profile:'released',overridden:false}}],
    ['development',{webProfile:{profile:'development',overridden:true}}],
    ['development',{previewIdentity:{id:'preview'},webProfile:{profile:'development',overridden:false}}],
    ['development',{}],
  ] as const)resumeDevelopmentWorkspaceRefresh({channel},options,refresh);
  await new Promise<void>(resolve=>setImmediate(resolve));assert.equal(called,0);
  resumeDevelopmentWorkspaceRefresh({channel:'development'},{webProfile:{profile:'development',overridden:false}},refresh);
  assert.equal(called,0,'HTTP readiness is not blocked by the background pass');
  await new Promise<void>(resolve=>setImmediate(resolve));assert.equal(called,1);
});
