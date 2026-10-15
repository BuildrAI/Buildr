import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveCommandIdentityBindings, resolveSourceBinding } from '../../plugin/source-binding.ts';
import type { Config } from '../../plugin/src/types.ts';

const installed = { nodeExecutable: '/installed/node', cliEntry: '/installed/buildr.mjs' };
const candidate = { nodeExecutable: '/candidate/node', cliEntry: '/candidate/buildr.mjs', nodeSha256: 'sha256-' + 'a'.repeat(64), cliSha256: 'sha256-' + 'b'.repeat(64) };

test('development sources select the explicit candidate without changing the open binding', async () => {
  const config: Config = { binding: installed, sourceBinding: candidate };
  assert.deepEqual(await resolveSourceBinding(config, 'development', () => assert.fail('candidate fell back to discovery')), candidate);
  assert.equal(config.binding, installed); assert.equal(config.sourceBinding, candidate);
});

test('source binding absent or schema-empty retains installed pointer and ordinary discovery', async () => {
  let queries = 0;
  const discover = async () => { queries++; return installed; };
  assert.deepEqual(await resolveSourceBinding({}, 'development', discover), installed);
  assert.deepEqual(await resolveSourceBinding({ sourceBinding: {} as Config['sourceBinding'] }, 'development', discover), installed);
  assert.deepEqual(await resolveSourceBinding({ binding: installed }, 'development', () => assert.fail('explicit pointer discovered')), installed);
  assert.equal(queries, 2);
});

test('npm source override is rejected locally without discovery or fallback', async () => {
  await assert.rejects(resolveSourceBinding({ binding: installed, sourceBinding: candidate }, 'npm', () => assert.fail('npm switched installation')), { code: 'source-binding-unsupported' });
  assert.deepEqual(await resolveSourceBinding({ binding: installed }, 'npm'), installed);
});

test('source pointer validation rejects relative paths and malformed SHA without discovery', async () => {
  for (const sourceBinding of [{ ...candidate, cliEntry: 'buildr' }, { ...candidate, cliSha256: 'sha256-short' }]) {
    await assert.rejects(resolveSourceBinding({ sourceBinding }, 'development', () => assert.fail('invalid override fell back')), { code: 'invalid-binding' });
  }
});

test('command identity keeps candidate and normal discovery separate without changing either pointer', async () => {
  const config: Config = { sourceBinding: candidate };
  let discoveries = 0;
  const values = await resolveCommandIdentityBindings(config, 'development', async () => { discoveries++; return installed; });
  assert.deepEqual(values, [candidate, installed]); assert.equal(discoveries, 1); assert.equal(config.sourceBinding, candidate); assert.equal(config.binding, undefined);
  assert.deepEqual(await resolveCommandIdentityBindings({ binding: installed, sourceBinding: candidate }, 'development', () => assert.fail('normal explicit pointer discovered')), [candidate, installed]);
});

test('failed command pointers are isolated and npm never imports the development candidate', async () => {
  assert.deepEqual(await resolveCommandIdentityBindings({ sourceBinding: { ...candidate, cliEntry: 'relative' } }, 'development', async () => installed), [installed]);
  assert.deepEqual(await resolveCommandIdentityBindings({ sourceBinding: candidate }, 'development', async () => { throw Error('normal discovery unavailable'); }), [candidate]);
  assert.deepEqual(await resolveCommandIdentityBindings({ binding: installed, sourceBinding: candidate }, 'npm', () => assert.fail('npm explicit pointer discovered')), [installed]);
  assert.deepEqual(await resolveCommandIdentityBindings({ binding: installed, sourceBinding: installed }, 'development'), [installed]);
});
