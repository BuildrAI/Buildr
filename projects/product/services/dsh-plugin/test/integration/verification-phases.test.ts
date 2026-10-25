import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { collectPluginSourceVerificationBundle, parseVerificationInputs, PLUGIN_PEER_PHASE_FILES, PLUGIN_SOURCE_PHASE_IDS, pluginSourcePhaseFiles, pluginSourcePhaseStep, pluginSourceSdkKey } from '../../tools/verify-all.ts';

test('manual activation tests report the missing explicit SDK while formal full verification still rejects it', t => {
  const root = mkdtempSync(join(tmpdir(), 'buildr-plugin-no-sdk-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const env: NodeJS.ProcessEnv = { ...process.env, BUILDR_DSH_SDK_ROOT: join(root, 'unselected-sdk') };
  delete env.BUILDR_DSH_SOURCE_SDK_ROOT;
  delete env.NODE_TEST_CONTEXT;
  const output = execFileSync(process.execPath, ['--test', '--test-reporter=tap', fileURLToPath(new URL('./activation.test.ts', import.meta.url))], {
    cwd: root, env, encoding: 'utf8', timeout: 10_000,
  });
  assert.equal([...output.matchAll(/# SKIP explicit verified source SDK required/gu)].length, 4, output);
  for (const name of [
    'same-domain qualification is exclusive in order @buildr-ai/buildr-dsh-plugin then @buildr-ai/buildr-dsh-plugin-dev',
    'same-domain qualification is exclusive in order @buildr-ai/buildr-dsh-plugin-dev then @buildr-ai/buildr-dsh-plugin',
    'normal owner disposal releases the lease for a surviving plugin recheck',
    'independent service domains each retain their own owner',
  ]) assert.ok(output.includes(name), name);
  assert.match(output, /# pass 0\b/u);
  assert.match(output, /# fail 0\b/u);
  assert.match(output, /# skipped 4\b/u);
  assert.deepEqual(readdirSync(root), [], 'missing SDK must not create a guessed SDK or shared runtime output');
  assert.throws(() => parseVerificationInputs([], {}), /完整验证需要/u);
});

test('portable unit and fresh SDK/peer phases partition every test file without dropping or repeating coverage', () => {
  const groups = ['unit', 'static', 'integration', 'e2e'] as const;
  const all = groups.flatMap(group => readdirSync(new URL(`../${group}/`, import.meta.url))
    .filter(file => file.endsWith('.test.ts')).map(file => `test/${group}/${file}`)).sort();
  const unit = pluginSourcePhaseFiles('unit'), integration = pluginSourcePhaseFiles('integration');
  const selected = [...groups.flatMap(group => pluginSourcePhaseFiles(group)), ...PLUGIN_PEER_PHASE_FILES];
  assert.deepEqual([...selected].sort(), all);
  assert.equal(new Set(selected).size, all.length);
  assert.equal(unit.includes('test/integration/sdk-source.test.ts'), false);
  assert.equal(integration.includes('test/integration/sdk-source.test.ts'), true);
  assert.deepEqual(PLUGIN_SOURCE_PHASE_IDS, ['dsh-plugin:unit']);
  assert.equal(pluginSourcePhaseStep('integration', integration).reuse, false);
});
test('source phase execution binds the real managed worker budget into its reusable recipe', async () => {
  const { createVerificationReuseIdentity } = await import(new URL('../../../buildr/test/verification/verification-reuse.ts', import.meta.url).href);
  const files = ['test/unit/first.test.ts', 'test/unit/second.test.ts'];
  const one = pluginSourcePhaseStep('unit', files, { BUILDR_VERIFICATION_WORKER_BUDGET: '1' });
  const two = pluginSourcePhaseStep('unit', files, {});
  assert.deepEqual(one.executor.args, ['--test-concurrency=1']);
  assert.deepEqual(one.resourceDemand, { workers: 1, processes: 1 });
  assert.deepEqual(two.executor.args, ['--test-concurrency=2']);
  assert.throws(() => pluginSourcePhaseStep('unit', files, { BUILDR_VERIFICATION_WORKER_BUDGET: '0' }));
  const sha = `sha256-${'a'.repeat(64)}`;
  const snapshot: any = { contentIdentities: { plugin: sha }, environment: { platform: 'darwin', arch: 'arm64', nodeVersion: '24.21.0', variablesIdentity: sha,
    tools: { 'backend-dependencies': sha, 'web-dependencies': sha, 'plugin-dependencies': sha } } };
  assert.notEqual(createVerificationReuseIdentity(one, snapshot)!.key, createVerificationReuseIdentity(two, snapshot)!.key);
});
test('SDK-consuming integration has no reusable identity even with the former SDK source key', async () => {
  const { createVerificationReuseIdentity } = await import(new URL('../../../buildr/test/verification/verification-reuse.ts', import.meta.url).href);
  const sha = (value: string) => `sha256-${value.repeat(64)}`;
  const snapshot = { contentIdentities: { plugin: sha('a') }, environment: { platform: 'darwin', arch: 'arm64', nodeVersion: '24.21.0',
    variablesIdentity: sha('b'), tools: { sdk: sha('c'), peer: sha('d'), 'backend-dependencies':sha('1'),'web-dependencies':sha('2'),'plugin-dependencies':sha('3') } } };
  const step = pluginSourcePhaseStep('integration', pluginSourcePhaseFiles('integration'));
  assert.equal(createVerificationReuseIdentity(step, snapshot), null);
});
test('standalone source phase retains a real passed result after edits and executes a new round fully', async t => {
  const { verifyPluginSourcePhase } = await import('../../tools/verify-all.ts');
  const repo = realpathSync(mkdtempSync(join(tmpdir(), 'buildr-plugin-source-only-')));
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  const pluginRoot = join(repo, 'projects/product/services/dsh-plugin'), backend = join(repo, 'projects/product/services/buildr');
  mkdirSync(join(pluginRoot, 'test/unit'), { recursive: true }); mkdirSync(backend, { recursive: true });
  const file = join(pluginRoot, 'test/unit/fixture.test.ts');
  writeFileSync(file, "import test from 'node:test'; test('portable source', () => {});\n");
  const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, stdio: ['ignore', 'pipe', 'pipe'] });
  git('init', '-q'); git('config', 'user.name', 'Plugin test'); git('config', 'user.email', 'plugin@example.com'); git('add', '.'); git('commit', '-qm', 'source');
  const env: NodeJS.ProcessEnv = { ...process.env, BUILDR_VERIFICATION_WORKER_BUDGET: '1' }; delete env.NODE_TEST_CONTEXT; delete env.BUILDR_SOURCE_VERIFICATION;
  const round = { roundId: 'first', output: join(repo, 'first.json') };
  const executed = await verifyPluginSourcePhase('unit', { pluginRoot, env, round });
  assert.equal(executed.phase.status, 'passed'); assert.equal(executed.phase.disposition, 'executed');
  writeFileSync(file, "import test from 'node:test'; test('changed input', () => { throw Error('new failure'); });\n");
  const retained = await verifyPluginSourcePhase('unit', { pluginRoot, env, round });
  assert.equal(retained.phase.disposition, 'reused');
  assert.equal(retained.phase.sourceRecord.origin.sourceCommit, executed.log.records[0].origin.sourceCommit);
  await assert.rejects(verifyPluginSourcePhase('unit', { pluginRoot, env, round: { roundId: 'second', output: join(repo, 'second.json') } }), /verification failed/u);
});
