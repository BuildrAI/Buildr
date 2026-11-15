import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultHarnessDataRoot,resolveHarnessProfile} from '../../src/profile.ts';
test('product entry identities are separate while same-channel data domains retain the old path',()=>{
  const options={platform:'darwin' as const,home:'/Users/fixture',env:{}};
  const harness=resolveHarnessProfile({productId:'buildr-harness',channel:'npm',runtimeRole:'host'},options),development=resolveHarnessProfile({productId:'buildr-development',channel:'npm',runtimeRole:'host'},options);
  assert.equal(harness.dataRoot,'/Users/fixture/Library/Application Support/Buildr');assert.equal(development.dataRoot,harness.dataRoot);assert.equal(development.domainIdentity,harness.domainIdentity);assert.notEqual(development.entryIdentity,harness.entryIdentity);
  const dev=resolveHarnessProfile({productId:'buildr-harness',channel:'development',runtimeRole:'development'},options);assert.equal(dev.dataRoot,defaultHarnessDataRoot('development',options));assert.notEqual(dev.domainIdentity,harness.domainIdentity);
  assert.throws(()=>resolveHarnessProfile({productId:'buildr-harness',channel:'npm',runtimeRole:'harness' as any},options),{code:'agent_profile_identity_invalid'});
  assert.throws(()=>resolveHarnessProfile({productId:'unknown' as any,channel:'npm',runtimeRole:'host'},options),{code:'agent_profile_identity_invalid'});
  const isolated=resolveHarnessProfile({productId:'buildr-harness',channel:'npm',runtimeRole:'host'},{...options,dataRoot:'/isolated'});assert.equal(isolated.dataRoot,'/isolated');assert.notEqual(isolated.domainIdentity,harness.domainIdentity);
});
