import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareLocalSourceVerification } from '../verification/local-source-verification.ts';
import { decodeCandidateSourceImport } from '../verification/candidate-source-reuse.ts';

const record = { schemaVersion: 'buildr.verification-source-result/v1', identity: { stepId: 'unit', key: `sha256-${'a'.repeat(64)}` } };
function fixture(records: any[], valid = true): any {
  return {
    createSourcePlan: () => ({ status: 'ready', runner: 'macos', steps: [{ id: 'unit', reuse: { scope: 'backend' } }, { id: 'fresh-only', reuse: false }] }),
    collectBundle: () => ({ schemaVersion: 'buildr.verification-source-bundle/v1', records }),
    validateRecord: (_record: any, options: any) => valid && options.stepId === 'unit' && (!options.runner || options.runner === 'macos'),
  };
}
test('release preparation returns the missing local check before any remote dispatch', async () => {
  const missing = await prepareLocalSourceVerification({ repo: '/source' }, fixture([]));
  assert.equal(missing.status, 'local-verification-required');
  assert.deepEqual(missing.missingStepIds, ['unit']);
  assert.equal(missing.transport, undefined);
  assert.match(missing.nextActions[0], /test:source/u);
  assert.equal((await prepareLocalSourceVerification({ repo: '/source' }, fixture([record], false))).status, 'local-verification-required');
});
test('release preparation transports only the content-validated source bundle', async () => {
  const ready = await prepareLocalSourceVerification({ repo: '/source' }, fixture([record]));
  assert.equal(ready.status, 'ready');
  assert.deepEqual(ready.missingStepIds, []);
  assert.deepEqual(decodeCandidateSourceImport(ready.transport).records, [record]);
});

test('plugin-only preparation transports its own source phases and does not require Buildr source checks', async () => {
  const phases = ['dsh-plugin:unit'].map(stepId => ({ ...record, identity: { ...record.identity, stepId } }));
  const dependencies = { ...fixture([]), createSourcePlan: () => ({ status: 'blocked', steps: [], runner: 'macos' }),
    collectPluginBundle: async (options: any) => { assert.equal(options.repo, '/frozen'); return { schemaVersion: 'buildr.verification-source-bundle/v1', records: phases }; } };
  const ready = await prepareLocalSourceVerification({ repo: '/frozen', packages: ['dsh-plugin'] }, dependencies);
  assert.equal(ready.status, 'ready');
  assert.deepEqual(decodeCandidateSourceImport(ready.transport).records.map((item: any) => item.identity.stepId), phases.map(item => item.identity.stepId));
  const missing = await prepareLocalSourceVerification({ repo: '/frozen', packages: ['dsh-plugin'] }, {
    ...dependencies, collectPluginBundle: async () => ({ schemaVersion: 'buildr.verification-source-bundle/v1', records: [] }),
  });
  assert.equal(missing.status, 'local-verification-required');
  assert.deepEqual(missing.missingStepIds, ['dsh-plugin:unit']);
});

test('release preparation refuses a structurally valid source record invalidated by a newer local failure', async () => {
  const missing = await prepareLocalSourceVerification({ repo: '/source' }, { ...fixture([record]), isCurrent: () => false });
  assert.equal(missing.status, 'local-verification-required');
  assert.deepEqual(missing.missingStepIds, ['unit']);
  assert.equal(missing.transport, undefined);
});

test('Buildr readiness matches the standard offline source environment without changing plugin or release environment', async () => {
  const env = { BUILDR_VERIFICATION_NETWORK_MODE: 'online', KEEP: 'release-context' };
  const processMode = process.env.BUILDR_VERIFICATION_NETWORK_MODE;
  const phases = ['dsh-plugin:unit'].map(stepId => ({ ...record, identity: { ...record.identity, stepId } }));
  const ready = await prepareLocalSourceVerification({ repo: '/source', env, packages: ['buildr', 'dsh-plugin'] }, {
    ...fixture([record]),
    collectBundle(options: any) {
      assert.ok(options.env !== env, 'Buildr source environment must be a separate object');
      assert.equal(options.env.KEEP, 'release-context');
      assert.equal(options.env.BUILDR_VERIFICATION_NETWORK_MODE, 'offline');
      assert.equal(options.env.npm_config_offline, 'true');
      return { schemaVersion: 'buildr.verification-source-bundle/v1', records: [record] };
    },
    collectPluginBundle: async (options: any) => {
      assert.ok(options.env === env, 'Plugin retains its own original environment');
      assert.equal(options.env.BUILDR_VERIFICATION_NETWORK_MODE, 'online');
      return { schemaVersion: 'buildr.verification-source-bundle/v1', records: phases };
    },
  });
  assert.equal(ready.status, 'ready');
  assert.equal(decodeCandidateSourceImport(ready.transport).records.length, 2);
  assert.equal(env.BUILDR_VERIFICATION_NETWORK_MODE, 'online');
  assert.equal(process.env.BUILDR_VERIFICATION_NETWORK_MODE, processMode);
});
