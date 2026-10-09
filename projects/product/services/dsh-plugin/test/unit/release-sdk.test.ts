import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { test, type TestContext } from 'node:test';
import { DSH_SDK_BASELINES, DSH_SDK_REPOSITORY } from '../../tools/sdk-baselines.ts';
import { ownedBuildRoot, sha256, SOURCE_SDK_RECEIPT, type SourceSdkReceipt } from '../../tools/prepare-source-sdk.ts';
import { parseReleaseSdkInput, preparedReleaseSdkOutput, prepareReleaseSdk, releaseSdkEnvironment, releaseSdkPlan, releaseSdkValidationCommand, RELEASE_SDK_MANIFEST, RELEASE_SDK_PNPM_VERSION, RELEASE_SDK_REPOSITORY, verifyPatchedReleaseSdkCheckout, verifyReleaseSdkCheckout, type ReleaseSdkCommand } from '../../tools/prepare-release-sdk.ts';

const service = resolve(import.meta.dirname, '../..'), plan = releaseSdkPlan();
function directory(t: TestContext, prefix = 'release-sdk-test-'): string {
  const root = mkdtempSync(join(ownedBuildRoot(service), prefix));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}
test('release inputs preserve registered rc.2 and reviewed settings manifest identities', () => {
  assert.equal(RELEASE_SDK_REPOSITORY, `https://github.com/${DSH_SDK_REPOSITORY}.git`);
  assert.equal(plan.manifestFile, join(service, RELEASE_SDK_MANIFEST));
  assert.deepEqual(plan.manifest.upstream, DSH_SDK_BASELINES.find(item => item.commit === '639ed015397290b3745d163aafe02ffee4aa3f84'));
  assert.deepEqual(plan.manifest.clientPackages, ['packages/client/ui-settings-agent-loop']);
  assert.equal(plan.nodeVersion, JSON.parse(readFileSync(join(service, 'package.json'), 'utf8')).engines.node);
  assert.equal(plan.pnpmVersion, RELEASE_SDK_PNPM_VERSION);
  assert.deepEqual(parseReleaseSdkInput(['--node', process.execPath, '--pnpm', '/tmp/pnpm.cjs']), { node: process.execPath, pnpm: '/tmp/pnpm.cjs' });
  for (const args of [[], ['--node', process.execPath], ['--node', process.execPath, '--pnpm', '/tmp/pnpm.cjs', '--node', process.execPath], ['--node', '--pnpm'], ['--repository', 'https://example.invalid/evil.git'], ['--ref', 'main'], ['--source', '/tmp/existing'], ['--manifest', '/tmp/other'], ['--output', '/tmp/sdk']]) assert.throws(() => parseReleaseSdkInput(args), /dsh_release_sdk_invalid/);
});
test('runner environment gives installers empty explicit configs and no inherited credentials or selectors', () => {
  const env = releaseSdkEnvironment('/tmp/tools/node', '/tmp/owned/user.npmrc', '/tmp/owned/global.npmrc');
  assert.equal(env.NPM_CONFIG_USERCONFIG, '/tmp/owned/user.npmrc');
  assert.equal(env.NPM_CONFIG_GLOBALCONFIG, '/tmp/owned/global.npmrc');
  assert.equal(env.NPM_CONFIG_REGISTRY, 'https://registry.npmjs.org/');
  assert.equal(env.NPM_CONFIG_CACHE, '/tmp/owned/npm-cache'); assert.equal(env.TMPDIR, '/tmp/owned/tmp');
  assert.equal(env.XDG_CONFIG_HOME, '/tmp/owned/config'); assert.equal(env.PNPM_CONFIG_NPMRC_AUTH_FILE, '/tmp/owned/user.npmrc');
  assert.equal(env.XDG_CACHE_HOME, '/tmp/owned/cache'); assert.equal(env.XDG_DATA_HOME, '/tmp/owned/data'); assert.equal(env.XDG_STATE_HOME, '/tmp/owned/state');
  assert.equal(env.GIT_TERMINAL_PROMPT, '0'); assert.equal(env.GIT_ALLOW_PROTOCOL, 'https');
  assert.equal(env.npm_config_manage_package_manager_versions, 'false');
  assert.ok(env.PATH?.startsWith('/tmp/tools'));
  for (const key of ['NPM_TOKEN', 'NODE_AUTH_TOKEN', 'NPM_CONFIG_AUTH', 'npm_config_auth', 'BUILDR_DSH_SOURCE_SDK_ROOT', 'BUILDR_DSH_SDK_ROOT', 'GIT_DIR', 'GIT_WORK_TREE', 'GIT_ASKPASS', 'SSH_AUTH_SOCK']) assert.equal(env[key], undefined);
});
function localGit(t: TestContext) {
  const root = directory(t), source = join(root, 'source'); mkdirSync(source);
  const global = join(root, 'global.config'); writeFileSync(global, '');
  const env = releaseSdkEnvironment(process.execPath, join(root, 'user.npmrc'), global);
  const git = (args: string[]) => execFileSync('git', args, { cwd: source, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git(['init', '--quiet']); git(['remote', 'add', 'origin', RELEASE_SDK_REPOSITORY]);
  writeFileSync(join(source, 'package.json'), JSON.stringify({ version: plan.manifest.upstream.version, packageManager: `pnpm@${RELEASE_SDK_PNPM_VERSION}` }));
  writeFileSync(join(source, 'input.txt'), 'original\n'); git(['add', 'package.json', 'input.txt']);
  git(['-c', 'user.name=SDK fixture', '-c', 'user.email=sdk-fixture@example.invalid', 'commit', '--quiet', '-m', 'fixture']);
  const baseline = { ...plan.manifest.upstream, commit: git(['rev-parse', 'HEAD']) };
  return { source, baseline, git, env };
}
test('real Git checkout identity refuses nested paths, worktree files, wrong HEAD, remote and package metadata', t => {
  const { source, baseline, git, env } = localGit(t);
  assert.equal(verifyReleaseSdkCheckout(source, baseline, undefined, env), source);
  const nested = join(source, 'nested'); mkdirSync(nested);
  assert.throws(() => verifyReleaseSdkCheckout(nested, baseline, undefined, env));
  writeFileSync(join(nested, '.git'), 'gitdir: ../.git\n');
  assert.throws(() => verifyReleaseSdkCheckout(nested, baseline, undefined, env), /independent/);
  assert.throws(() => verifyReleaseSdkCheckout(source, { ...baseline, commit: 'a'.repeat(40) }, undefined, env), /HEAD/);
  git(['remote', 'set-url', 'origin', 'https://example.invalid/other.git']);
  assert.throws(() => verifyReleaseSdkCheckout(source, baseline, undefined, env), /remote/);
  git(['remote', 'set-url', 'origin', RELEASE_SDK_REPOSITORY]);
  writeFileSync(join(source, 'package.json'), JSON.stringify({ version: baseline.version, packageManager: 'pnpm@other' }));
  assert.throws(() => verifyReleaseSdkCheckout(source, baseline, undefined, env), /package manager/);
});
test('real patched checkout checks every changed byte and refuses unrelated or symlink changes', t => {
  const { source, baseline, env } = localGit(t);
  writeFileSync(join(source, 'input.txt'), 'patched\n');
  const selected = { ...plan, manifest: { ...plan.manifest, upstream: baseline, files: [{ path: 'input.txt', baseSha256: sha256('original\n'), patchedSha256: sha256('patched\n') }] } };
  const run: ReleaseSdkCommand = (file, args, options) => execFileSync(file, args, { ...options, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  assert.doesNotThrow(() => verifyPatchedReleaseSdkCheckout(source, selected, run, env));
  writeFileSync(join(source, 'input.txt'), 'drifted\n');
  assert.throws(() => verifyPatchedReleaseSdkCheckout(source, selected, run, env), /patch bytes/);
  writeFileSync(join(source, 'input.txt'), 'patched\n'); writeFileSync(join(source, 'other.txt'), 'unreviewed\n');
  assert.throws(() => verifyPatchedReleaseSdkCheckout(source, selected, run, env), /complete reviewed patch/);
  rmSync(join(source, 'other.txt')); rmSync(join(source, 'input.txt')); symlinkSync('package.json', join(source, 'input.txt'));
  assert.throws(() => verifyPatchedReleaseSdkCheckout(source, selected, run, env), /patch bytes/);
});
interface FakeOptions { wrongTag?: boolean; nodeVersion?: string; pnpmVersion?: string; installFailure?: boolean; lockDrift?: boolean; validationFailure?: boolean; existingOutput?: string }
function collaborators(t: TestContext, options: FakeOptions = {}) {
  const root = directory(t), pnpm = join(root, 'pnpm.cjs'); writeFileSync(pnpm, '');
  const calls: Array<{ file: string; args: string[]; cwd: string }> = [];
  let source = '', sdk = '', patchChecks = 0;
  const command: ReleaseSdkCommand = (file, args, request) => {
    calls.push({ file, args, cwd: request.cwd });
    assert.equal(request.env.NPM_TOKEN, undefined); assert.equal(request.env.NODE_AUTH_TOKEN, undefined);
    assert.equal(readFileSync(request.env.NPM_CONFIG_USERCONFIG!, 'utf8'), '');
    assert.equal(readFileSync(request.env.NPM_CONFIG_GLOBALCONFIG!, 'utf8'), '');
    if (args[0] === '--version') { t.after(() => rmSync(request.cwd, { recursive: true, force: true })); return options.nodeVersion ?? `v${plan.nodeVersion}`; }
    if (args[0] === pnpm && args[1] === '--version') return options.pnpmVersion ?? plan.pnpmVersion;
    if (file === 'git') {
      source = request.cwd;
      if (args[0] === 'init') mkdirSync(join(source, '.git'));
      if (args[0] === 'checkout') {
        writeFileSync(join(source, 'package.json'), JSON.stringify({ version: plan.manifest.upstream.version, packageManager: `pnpm@${plan.pnpmVersion}` }));
        writeFileSync(join(source, 'pnpm-lock.yaml'), 'frozen dependency lock\n');
      }
      if (args[0] === 'rev-parse' && args[1] === 'FETCH_HEAD^{commit}') return options.wrongTag ? 'a'.repeat(40) : plan.manifest.upstream.commit;
      if (args[0] === 'rev-parse' && args[1] === 'HEAD') return plan.manifest.upstream.commit;
      if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return source;
      if (args[0] === 'rev-parse' && args[1] === '--absolute-git-dir') return join(source, '.git');
      if (args[0] === 'remote' && args[1] === 'get-url') return plan.repository;
      return '';
    }
    if (args[0] === pnpm && args[1] === 'install') {
      if (options.installFailure) throw new Error('install failed');
      mkdirSync(join(source, 'node_modules'));
      if (options.lockDrift) writeFileSync(join(source, 'pnpm-lock.yaml'), 'changed dependency lock\n');
      return '';
    }
    if (args[0] === join(service, 'tools/prepare-source-sdk.ts')) {
      if (options.existingOutput) sdk = options.existingOutput;
      else { const stage = directory(t, 'dsh-source-sdk-'); sdk = join(stage, 'sdk'); mkdirSync(sdk); writeFileSync(join(sdk, SOURCE_SDK_RECEIPT), '{"status":"ready"}\n'); }
      return `compiler diagnostics\n${JSON.stringify({ status: 'prepared', sdk })}\n`;
    }
    throw new Error(`unexpected collaborator command: ${file}`);
  };
  return {
    input: { node: process.execPath, pnpm }, calls, getSdk: () => sdk, getSource: () => source, getPatchChecks: () => patchChecks,
    dependencies: {
      command,
      verifyInput: (input: string, manifest: string) => { assert.equal(input, source); assert.equal(manifest, plan.manifestFile); return { source, manifest: plan.manifest, patchFile: join(dirname(plan.manifestFile), plan.manifest.patch.path) }; },
      verifyPatched: (input: string, selected: typeof plan) => { assert.equal(input, source); assert.deepEqual(selected, plan); patchChecks += 1; },
      validate: (input: string) => {
        assert.equal(input, sdk); if (options.validationFailure) throw new Error('artifact validation failed');
        return { status: 'ready', baseline: plan.manifest.upstream, sourceCheckout: source, sourceManifest: { path: plan.manifestFile, sha256: sha256(readFileSync(plan.manifestFile)) }, patchSha256: plan.manifest.patch.sha256 } as SourceSdkReceipt;
      },
    },
  };
}
test('preparer fetches only the fixed tag, installs frozen patched dependencies, and returns a new verified output', async t => {
  const fake = collaborators(t);
  const result = await prepareReleaseSdk(fake.input, fake.dependencies);
  assert.equal(result.status, 'prepared'); assert.equal(result.sdk, fake.getSdk());
  assert.deepEqual(result.baseline, plan.manifest.upstream); assert.equal(result.runtimeActivated, false);
  assert.equal(fake.getPatchChecks(), 2);
  assert.deepEqual(fake.calls.find(call => call.args[0] === 'remote' && call.args[1] === 'add')?.args, ['remote', 'add', 'origin', RELEASE_SDK_REPOSITORY]);
  assert.deepEqual(fake.calls.find(call => call.args[0] === 'fetch')?.args, ['fetch', '--quiet', '--depth=1', 'origin', `refs/tags/${plan.manifest.upstream.tag}`]);
  const install = fake.calls.find(call => call.args[1] === 'install')!;
  assert.equal(install.file, process.execPath); assert.deepEqual(install.args, [fake.input.pnpm, 'install', '--frozen-lockfile', '--ignore-scripts', '--store-dir', join(dirname(fake.getSource()), 'pnpm-store')]);
  assert.equal(install.cwd, fake.getSource());
  const prepare = fake.calls.find(call => call.args[0] === join(service, 'tools/prepare-source-sdk.ts'))!;
  assert.equal(prepare.file, process.execPath);
  assert.deepEqual(prepare.args, [join(service, 'tools/prepare-source-sdk.ts'), '--source', fake.getSource(), '--manifest', plan.manifestFile, '--node', process.execPath]);
});
test('default input and final validation also run under explicit Node with isolated credentials and config', async t => {
  const fake = collaborators(t), ordinary = fake.dependencies.command;
  const actions: string[] = [];
  const deps = {
    command: ((file, args, request) => {
      if (args[0] !== '--input-type=module') return ordinary(file, args, request);
      assert.equal(file, process.execPath); assert.equal(request.cwd, service);
      assert.equal(request.env.NPM_TOKEN, undefined); assert.equal(request.env.NODE_AUTH_TOKEN, undefined);
      assert.equal(request.env.BUILDR_DSH_SOURCE_SDK_ROOT, undefined); assert.ok(request.env.XDG_CONFIG_HOME);
      const action = args[2].includes(':verify-input') ? 'verify-input' : 'validate-sdk'; actions.push(action);
      assert.deepEqual(args, releaseSdkValidationCommand(action, action === 'verify-input' ? [fake.getSource(), plan.manifestFile] : [fake.getSdk(), service]));
      return JSON.stringify(action === 'verify-input' ? fake.dependencies.verifyInput(fake.getSource(), plan.manifestFile) : fake.dependencies.validate(fake.getSdk()));
    }) as ReleaseSdkCommand,
    verifyPatched: fake.dependencies.verifyPatched,
  };
  assert.equal((await prepareReleaseSdk(fake.input, deps)).status, 'prepared');
  assert.deepEqual(actions, ['verify-input', 'validate-sdk']);
});
test('source mismatch, incompatible tools, failed install and lock drift cannot produce a prepared output', async t => {
  for (const [options, message] of [
    [{ wrongTag: true }, /registered exact commit/], [{ nodeVersion: 'v22.0.0' }, /declared Node/], [{ pnpmVersion: '11.0.0' }, /pnpm 11.7.0/], [{ installFailure: true }, /install failed/], [{ lockDrift: true }, /lockfile changed/],
  ] as const) {
    const fake = collaborators(t, options);
    await assert.rejects(prepareReleaseSdk(fake.input, fake.dependencies), message);
    assert.equal(fake.getSdk(), '');
    assert.ok(!fake.calls.some(call => call.args[0] === join(service, 'tools/prepare-source-sdk.ts')));
  }
});
test('failed final verification withdraws only this invocation ready receipt and preserves output diagnosis', async t => {
  const fake = collaborators(t, { validationFailure: true });
  await assert.rejects(prepareReleaseSdk(fake.input, fake.dependencies), /artifact validation failed/);
  assert.ok(existsSync(fake.getSdk())); assert.ok(!existsSync(join(fake.getSdk(), SOURCE_SDK_RECEIPT)));
});
test('preparer refuses reused output without removing its prior receipt', async t => {
  const stage = directory(t, 'dsh-source-sdk-'), sdk = join(stage, 'sdk'); mkdirSync(sdk);
  writeFileSync(join(sdk, SOURCE_SDK_RECEIPT), 'previous receipt\n');
  const fake = collaborators(t, { existingOutput: sdk });
  await assert.rejects(prepareReleaseSdk(fake.input, fake.dependencies), /unique build output/);
  assert.equal(readFileSync(join(sdk, SOURCE_SDK_RECEIPT), 'utf8'), 'previous receipt\n');
});
test('output protocol rejects old, escaping, symlink and non-final success records', t => {
  const stage = directory(t, 'dsh-source-sdk-'), sdk = join(stage, 'sdk'); mkdirSync(sdk);
  const json = JSON.stringify({ status: 'prepared', sdk });
  assert.equal(preparedReleaseSdkOutput(`log\n${json}\n`, new Set()), sdk);
  assert.throws(() => preparedReleaseSdkOutput(json, new Set([stage])), /unique build output/);
  assert.throws(() => preparedReleaseSdkOutput(`${json}\nsubsequent error`, new Set()), /final JSON/);
  assert.throws(() => preparedReleaseSdkOutput(JSON.stringify({ status: 'failed', sdk }), new Set()), /prepared SDK/);
  assert.throws(() => preparedReleaseSdkOutput(JSON.stringify({ status: 'prepared', sdk: service }), new Set()), /unique build output/);
  const linkStage = directory(t, 'dsh-source-sdk-'); symlinkSync(sdk, join(linkStage, 'sdk'));
  assert.throws(() => preparedReleaseSdkOutput(JSON.stringify({ status: 'prepared', sdk: join(linkStage, 'sdk') }), new Set()), /regular directory/);
});
test('input paths are passed as files and never shell-expanded', async t => {
  const fake = collaborators(t);
  await assert.rejects(prepareReleaseSdk({ ...fake.input, node: 'node' }, fake.dependencies), /absolute file path/);
  await assert.rejects(prepareReleaseSdk({ ...fake.input, pnpm: `${fake.input.pnpm}\n--repository=other` }, fake.dependencies), /absolute file path/);
  const suspicious = join(dirname(fake.input.pnpm), 'pnpm;echo injected.cjs'); writeFileSync(suspicious, '');
  const injected = collaborators(t); const ordinary = injected.dependencies.command;
  injected.dependencies.command = (file, args, request) => ordinary(file, args.map(arg => arg === suspicious ? injected.input.pnpm : arg), request);
  assert.equal((await prepareReleaseSdk({ ...injected.input, pnpm: suspicious }, injected.dependencies)).status, 'prepared');
  assert.ok(!existsSync(join(service, 'injected.cjs')));
});
