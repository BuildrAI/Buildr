import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { TestContext } from 'node:test';
import { inspectSourceInstallation, queryAssetSources } from '../../plugin/source-process.ts';
import type { SourceObservations } from '../../plugin/src/source-types.ts';
import { fileDigest } from '../../plugin/process.ts';

const input: SourceObservations = { schemaVersion: 'buildr.agent-asset-source-observations/v1', observations: [{ id: 'record:1', type: 'file', locator: { path: 'AGENTS.md' } }] };
async function fixture(t: TestContext, mode = 'valid') {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'buildr-source-'));
  const resolved = await fs.realpath(root);
  t.after(async () => { assert.equal(await fs.realpath(root), resolved); await fs.rm(root, { recursive: true, force: true }); });
  const entry = path.join(root, 'CLI with spaces.mjs');
  const wrapper = path.join(root, 'projects/product/buildr');
  const sourceRoot = path.join(root, 'projects/product/services/buildr');
  await fs.mkdir(sourceRoot, { recursive: true });
  const status = {
    schemaVersion: 'buildr.installation-status/v1',
    channels: {
      npm: { status: 'installed', identity: { ownershipIdentity: 'npm-A', version: '1', protocolIdentity: 'v1', package: '@buildr-ai/buildr', channel: 'npm' } },
      development: { status: 'installed', identity: { ownershipIdentity: 'dev-A', version: '1', protocolIdentity: 'v1', sourceRoot }, runtime: { executable: process.execPath } },
    },
    // Neither channel has a ready Web instance; a passive read must still succeed.
    instances: { released: { status: 'absent' }, development: { status: 'unreachable' } },
  };
  await fs.writeFile(wrapper, '#!/bin/sh\nexec "$BUILDR_NODE" "' + entry.replaceAll('"', '\\"') + '" "$@"\n', { mode: 0o755 });
  await fs.writeFile(entry, `
import fs from 'node:fs';
const argv=process.argv.slice(2);
if(JSON.stringify(argv)===JSON.stringify(['installation','status','--json'])){console.log(${JSON.stringify(JSON.stringify(status))});}
else {
 if(JSON.stringify(argv)!==JSON.stringify(['agent-assets','source','inspect','--target',${JSON.stringify(root)},'--input','-','--json'])){fs.writeFileSync(${JSON.stringify(path.join(root, 'unexpected-effect'))},JSON.stringify(argv)); process.exit(9);}
 if(process.env.BUILDR_APP_DATA_DIR||process.env.BUILDR_PRODUCT_DATA_DIR||process.env.NODE_OPTIONS||process.env.NODE_PATH){process.stderr.write('secret-env-leak');process.exit(8);}
 let raw='';for await(const part of process.stdin)raw+=part;
 const input=JSON.parse(raw);
 if(${JSON.stringify(mode)}==='failure'){process.stderr.write('/private/credentials token=secret-test');process.exit(3);}
 if(${JSON.stringify(mode)}==='invalid'){console.log('token=secret-test');process.exit();}
 if(${JSON.stringify(mode)}==='oversized'){console.log('x'.repeat(8192));process.exit();}
 if(${JSON.stringify(mode)}==='slow'){await new Promise(resolve=>setTimeout(resolve,10000));}
 console.log(JSON.stringify({schemaVersion:'buildr.agent-asset-source-result/v1',workspace:{id:process.env.BUILDR_NODE?'dev-A':'npm-A',scope:'.'},items:input.observations.map(item=>({id:item.id,status:'unknown',objects:[],diagnostic:null})),effects:[]}));
}
`);
  return { root, status, binding: { nodeExecutable: process.execPath, cliEntry: entry }, wrapper };
}

test('owned development status fixture proves Node/bin prefixes without sibling source', async t => {
  const { binding, status } = await fixture(t);
  const cliEntry = path.join(status.channels.development.identity.sourceRoot, 'bin/buildr.mjs');
  await fs.mkdir(path.dirname(cliEntry)); await fs.copyFile(binding.cliEntry, cliEntry);
  const result = await inspectSourceInstallation({ ...binding, cliEntry, nodeSha256: await fileDigest(binding.nodeExecutable), cliSha256: await fileDigest(cliEntry) }, 'development', AbortSignal.timeout(30_000));
  assert.deepEqual(result.prefixes, [[path.resolve(status.channels.development.identity.sourceRoot, '../../buildr')], [binding.nodeExecutable, cliEntry]]);
  assert.equal(result.prefixes.some(prefix => prefix.length === 1 && prefix[0] === cliEntry), false);
});

test('passive source query uses exact CLI/stdin and succeeds without a ready Web instance', async t => {
  const { root, binding } = await fixture(t);
  const environment = { ...process.env, BUILDR_APP_DATA_DIR: '/private/released', BUILDR_PRODUCT_DATA_DIR: '/private', NODE_OPTIONS: '--wrong', NODE_PATH: '/private' };
  const result = await queryAssetSources(binding, 'npm', root, input, new AbortController().signal, { environment });
  assert.equal(result.workspace.id, 'npm-A'); assert.equal(result.items[0].id, 'record:1');
  assert.equal(await fs.stat(path.join(root, 'unexpected-effect')).then(() => true, () => false), false);
  assert.equal(environment.BUILDR_APP_DATA_DIR, '/private/released');
});

test('passive development read uses only its own reported wrapper and retained Node', async t => {
  const { root, binding } = await fixture(t);
  const result = await queryAssetSources(binding, 'development', root, input, new AbortController().signal);
  assert.equal(result.workspace.id, 'dev-A');
});

test('missing selected channel never falls back to the available other channel', async t => {
  const { root, binding, status } = await fixture(t);
  status.channels.development.status = 'absent';
  let reads = 0;
  await assert.rejects(queryAssetSources(binding, 'development', root, input, new AbortController().signal, {
    exec: async () => ({ stdout: JSON.stringify(status) }),
    runInput: async () => { reads++; throw new Error('should not run'); },
  }), { code: 'source-channel-missing' });
  assert.equal(reads, 0);
});

test('binding digests and a drift between installation/source reads stop the source command', async t => {
  const { root, binding, status } = await fixture(t);
  const cliSha256 = await fileDigest(binding.cliEntry);
  await fs.appendFile(binding.cliEntry, '\n');
  await assert.rejects(queryAssetSources({ ...binding, cliSha256 }, 'npm', root, input, new AbortController().signal), { code: 'installation-drift' });
  let reads = 0;
  await assert.rejects(queryAssetSources(binding, 'npm', root, input, new AbortController().signal, {
    exec: async () => { await fs.appendFile(binding.cliEntry, '\n'); return { stdout: JSON.stringify(status) }; },
    runInput: async () => { reads++; throw new Error('should not run'); },
  }), { code: 'installation-drift' });
  assert.equal(reads, 0);
});

test('source failure and invalid JSON do not forward stdout stderr paths or credentials', async t => {
  for (const mode of ['failure', 'invalid']) {
    const { root, binding } = await fixture(t, mode);
    await assert.rejects(queryAssetSources(binding, 'npm', root, input, new AbortController().signal), (error: any) => {
      assert.equal(error.message.includes('secret-test'), false); assert.equal(error.message.includes(root), false);
      return error.code === (mode === 'invalid' ? 'source-invalid-response' : 'source-unavailable');
    });
  }
});

test('real stdout and input bounds stop oversized source reads', async t => {
  const { root, binding } = await fixture(t, 'oversized');
  await assert.rejects(queryAssetSources(binding, 'npm', root, input, new AbortController().signal, { maxOutputBytes: 256 }), { code: 'source-output-limit' });
  await assert.rejects(queryAssetSources(binding, 'npm', root, input, new AbortController().signal, { maxInputBytes: 8 }), { code: 'source-invalid-input' });
  await assert.rejects(queryAssetSources(binding, 'npm', 'relative', input, new AbortController().signal), { code: 'source-invalid-input' });
});

test('cancellation reason and real subprocess timeout are sanitized', async t => {
  const { root, binding, status } = await fixture(t, 'slow');
  const cancelled = new AbortController(); cancelled.abort(new Error('/private/reason token=secret-test'));
  await assert.rejects(queryAssetSources(binding, 'npm', root, input, cancelled.signal), { code: 'source-cancelled' });
  await assert.rejects(queryAssetSources(binding, 'npm', root, input, new AbortController().signal, { timeoutMs: 100 }), { code: 'source-timeout' });
  const controller = new AbortController();
  let observedAbort = false;
  const query = queryAssetSources(binding, 'npm', root, input, controller.signal, {
    exec: async () => ({ stdout: JSON.stringify(status) }),
    runInput: (_file, _args, options) => new Promise((_resolve, reject) => {
      options.signal!.addEventListener('abort', () => { observedAbort = true; reject(new Error('private reason')); });
      controller.abort(new Error('token=secret-test'));
    }),
  });
  await assert.rejects(query, { code: 'source-cancelled' }); assert.equal(observedAbort, true);
});
