import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hash } from '../../tools/buildr-peer.ts';
import { assertPairReport, identity, inspectPairExecution, publicPairIdentity, type PairReport } from '../../tools/verify-buildr-plugin-pair.ts';
import type { CompatibilityArtifact } from '../../../buildr/tools/release/package-compatibility.ts';
const consumer:CompatibilityArtifact={packageName:'@buildr-ai/buildr-dsh-plugin',version:'1.0.0',integrity:'sha512-'+createHash('sha512').update('fixture').digest('base64'),artifactSha256:'a'.repeat(64),origin:'registry',compatibility:null};
const provider:CompatibilityArtifact={...consumer,packageName:'@buildr-ai/buildr',artifactSha256:'b'.repeat(64)};
function report(status:'passed'|'failed'|'unknown'='passed'):PairReport{
  const c=identity(consumer),p=identity(provider),features=[{feature:'entry',required:true,status},{feature:'sourceCapture',required:false,status:'unsupported' as const}],contracts=['buildr.installation-status/v1','buildr.web-protocol/v1'],diagnostic=null;
  const evidenceSha256=hash(Buffer.from(JSON.stringify({consumer:c,provider:p,features,contracts,diagnostic})));
  return {schemaVersion:'buildr.dsh-package-pair-verification/v1',status:status==='passed'?'passed':'blocked',consumer:c,provider:p,features,contracts,diagnostic,evidenceSha256,legacyPairEvidence:{schemaVersion:'buildr.package-pair-evidence/v1',consumer:c,provider:p,features,evidenceSha256}};
}
test('byte-bound pair proof preserves successful entry with optional unsupported feature',()=>{assert.equal(assertPairReport(report(),consumer,provider).status,'passed');});
test('failed or unknown actual entry cannot be reclassified as optional absence or success',()=>{
  for(const status of ['failed','unknown'] as const){const r=report(status);assert.equal(assertPairReport(r,consumer,provider).status,'blocked');assert.throws(()=>assertPairReport({...r,status:'passed'},consumer,provider),/result mismatch/);}
});
test('another same-version artifact and altered report features cannot reuse pair evidence',()=>{
  assert.throws(()=>assertPairReport(report(),consumer,{...provider,artifactSha256:'c'.repeat(64)}),/identity mismatch/);
  const r=report();assert.throws(()=>assertPairReport({...r,features:[{feature:'entry',required:true,status:'passed'}]},consumer,provider),/identity mismatch/);
  assert.throws(()=>assertPairReport({...r,evidenceSha256:'c'.repeat(64)},consumer,provider),/result mismatch/);
});
test('isolated child preparation failure retains its stage and npm error while compatibility stays unknown', () => {
  const execution = { stage: 'provider-install', code: 'isolated-npm-operation-failed', exitCode: 1, stderr: 'npm error code ENOTFOUND' };
  const stdout = [
    { schemaVersion: 'buildr.dsh-package-pair-failure/v1', execution },
    { schemaVersion: 'buildr.workspace-smoke-run/v1', status: 'failed', cleanup: 'cleaned', exitCode: 1 },
  ].map(value => JSON.stringify(value)).join('\n');
  const result = inspectPairExecution({ status: 1, stdout }, consumer, provider);
  assert.equal(result.status, 'blocked'); assert.equal(result.features[0].status, 'unknown');
  assert.deepEqual(result.execution, execution);
});
test('timeout, missing runtime and cleanup failure retain distinct diagnostics and never accept a partial success', () => {
  const stdout = JSON.stringify(report()) + '\n' + JSON.stringify({ schemaVersion: 'buildr.workspace-smoke-run/v1', status: 'passed', cleanup: 'cleaned' });
  assert.equal(inspectPairExecution({ status: 0, stdout }, consumer, provider).status, 'passed');
  const timeout = inspectPairExecution({ status: null, signal: 'SIGTERM', error: { code: 'ETIMEDOUT' }, stdout }, consumer, provider);
  assert.equal(timeout.execution?.code, 'pair-runtime-timeout'); assert.equal(timeout.execution?.errorCode, 'ETIMEDOUT');
  assert.equal(timeout.features[0].status, 'unknown');
  const missing = inspectPairExecution({ status: 1, stderr: 'Error [ERR_MODULE_NOT_FOUND]: Cannot find package yaml' }, consumer, provider);
  assert.match(missing.execution?.stderr ?? '', /ERR_MODULE_NOT_FOUND/);
  const cleanup = inspectPairExecution({ status: 0, stdout: stdout.replace('"cleaned"', '"failed"') }, consumer, provider);
  assert.equal(cleanup.execution?.code, 'pair-cleanup-failed'); assert.equal(cleanup.status, 'blocked');
});
test('the actual isolated runner preserves a preparation exception after cleaning its owned workspace', () => {
  const runner = fileURLToPath(new URL('../../../buildr/tools/development/run-isolated-workspace-smoke.ts', import.meta.url));
  const verifier = fileURLToPath(new URL('../../tools/verify-buildr-plugin-pair.ts', import.meta.url));
  const missing = path.join(tmpdir(), `buildr-pair-missing-${process.pid}-${Date.now()}.json`);
  const child = spawnSync(process.execPath, [runner, '--script', verifier, '--', '--pair-input', missing], { encoding: 'utf8', timeout: 10_000 });
  assert.equal(child.status, 1, child.stderr);
  assert.match(child.stdout, /"cleanup":"cleaned"/);
  const result = inspectPairExecution(child, consumer, provider);
  assert.equal(result.features[0].status, 'unknown');
  assert.equal(result.execution?.stage, 'pair-preparation');
  assert.equal(result.execution?.errorCode, 'ENOENT');
});
test('real public current npm identity is admitted while absent, stale, other artifact and mismatched instance stay refused',()=>{
 const base={schemaVersion:'buildr.installation-status/v1',channels:{npm:{status:'current',identity:{package:provider.packageName,version:provider.version,channel:'npm',protocolIdentity:'buildr.web-protocol/v1',ownershipIdentity:'owned-current'}}},instances:{released:{status:'ready',identity:{ownershipIdentity:'owned-current',url:'http://127.0.0.1:43123/'}}}};
 assert.equal(publicPairIdentity(base,provider).url.origin,'http://127.0.0.1:43123');assert.doesNotThrow(()=>publicPairIdentity({...base,channels:{npm:{...base.channels.npm,status:'installed'}}},provider));
 for(const mutate of [(s:any)=>s.channels.npm.status='absent',(s:any)=>s.channels.npm.status='stale',(s:any)=>s.channels.npm.identity.version='1.0.1',(s:any)=>s.channels.npm.identity.channel='development',(s:any)=>s.instances.released.identity.ownershipIdentity='another',(s:any)=>s.instances.released.identity.url='http://example.invalid:43123/']){const bad=structuredClone(base);mutate(bad);assert.throws(()=>publicPairIdentity(bad,provider));}
});
