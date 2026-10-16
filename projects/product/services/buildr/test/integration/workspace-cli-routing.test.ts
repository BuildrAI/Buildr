import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { canonicalApplicationPayloadIdentity } from '../../src/infrastructure/product-resources/index.ts';
import { inspectWorkspaceCliRouting } from '../../src/modules/installation/application/workspace-cli-routing.ts';
import { defaultWebDataRoot, oppositeWebProfile, resolveWebProfile } from '../../src/modules/installation/contracts/web-profile.ts';
import { createInstallationOrigin } from '../../src/modules/installation/infrastructure/installation-origin.ts';

type Profile = 'released' | 'development';
const routingModule = new URL('../../src/modules/installation/application/workspace-cli-routing.ts', import.meta.url).href;

function writeJson(file: string, value: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function git(root: string, args: string[]) {
  const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function initializeGit(root: string) {
  git(root, ['init', '-q']);
  git(root, ['config', 'user.name', 'Buildr Fixture']);
  git(root, ['config', 'user.email', 'fixture@example.com']);
  git(root, ['add', '.']);
  git(root, ['commit', '-qm', 'fixture']);
}

function npmEntry(root: string) {
  const packageRoot = path.join(root, 'npm');
  const entry = path.join(packageRoot, 'bin', 'buildr.mjs');
  const manifest: any = {
    schemaVersion: 'buildr.application-payload/v1', packageName: '@buildr-ai/buildr',
    buildrVersion: '1.2.3', protocolIdentity: 'buildr.web-protocol/v1', sourceCommit: 'a'.repeat(40),
    enginesNode: '>=24.15.0 <25', productionDependencies: [],
    files: [
      'resources/product/package.json', 'resources/product/resources/manifest.yml',
      'resources/product/src/infrastructure/sqlite/migrations/0000_create_migration_ledger.sql',
      'resources/product/web-dist/index.html', 'resources/runtime/read-worker.cjs',
      'resources/runtime/upstream-openspec-worker.cjs', 'runtime/buildr.cjs',
    ].map((file) => ({ path: file, mode: 0o644, size: 0, sha256: '0'.repeat(64) })),
  };
  manifest.applicationPayloadDigest = canonicalApplicationPayloadIdentity(manifest);
  writeJson(path.join(packageRoot, 'package.json'), { name: '@buildr-ai/buildr', version: '1.2.3' });
  writeJson(path.join(packageRoot, 'application-payload.json'), manifest);
  writeJson(path.join(packageRoot, 'installation-origin.json'), createInstallationOrigin({
    channel: 'npm', runtimeRole: 'host', package: manifest.packageName, version: manifest.buildrVersion,
    protocolIdentity: manifest.protocolIdentity, applicationPayloadDigest: manifest.applicationPayloadDigest,
    sourceCommit: manifest.sourceCommit, sourceTag: null, installUnit: '@buildr-ai/buildr@1.2.3',
  }));
  fs.mkdirSync(path.dirname(entry), { recursive: true });
  fs.writeFileSync(entry, '// npm caller fixture\n');
  return entry;
}

function fixture(t: any) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-workspace-cli-routing-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const developmentDataRoot = path.join(root, 'development');
  const dataRoots = { released: path.join(developmentDataRoot, '.peer', 'released'), development: developmentDataRoot };
  const profiles = Object.fromEntries((['released', 'development'] as const).map((profile) => [profile, resolveWebProfile({
    channel: profile === 'released' ? 'npm' : 'development',
    runtime: { role: profile === 'released' ? 'host' : 'development' },
  }, { dataRoot: dataRoots[profile], env: {} })]));
  const entryPath = npmEntry(root);
  const developmentLauncherRoot = path.join(root, 'Buildr Web Dev');
  const options = (cwd = root, env: NodeJS.ProcessEnv = {}) => ({
    cwd, home: root, env: { PATH: process.env.PATH, ...env }, dataRoots,
    entryPath, developmentLauncherRoot,
  });
  return { root, dataRoots, profiles, entryPath, developmentLauncherRoot, options };
}

function workspace(root: string, name: string, id = crypto.randomUUID()) {
  const target = path.join(root, name);
  fs.mkdirSync(path.join(target, '.buildr'), { recursive: true });
  fs.writeFileSync(path.join(target, '.buildr', 'workspace.yml'), `schemaVersion: buildr.workspace/v1\nid: ${id}\nname: ${name}\ndescription: Routing fixture\n`);
  return { root: target, id };
}

function registry(f: ReturnType<typeof fixture>, profile: Profile, roots: string[]) {
  writeJson(path.join(f.dataRoots[profile], 'workspace-registry.json'), {
    schemaVersion: 'buildr.local-workspace-registry/v1', roots, lastOpenedRoot: roots.at(-1) || null,
  });
}

function manage(f: ReturnType<typeof fixture>, target: ReturnType<typeof workspace>, profile: Profile, claim = true) {
  registry(f, profile, [target.root]);
  if (claim) writeJson(path.join(target.root, '.buildr', 'local', 'web-management.json'), {
    schemaVersion: 'buildr.workspace-web-management/v1', canonicalRoot: target.root,
    workspaceId: target.id, claimedAt: '2026-10-16T00:00:00.000Z',
    owner: {
      schemaVersion: 'buildr.workspace-web-management-owner/v1', profile,
      channel: f.profiles[profile].channel, runtimeRole: f.profiles[profile].runtimeRole,
      profileIdentity: f.profiles[profile].identity,
    },
  });
}

function development(f: ReturnType<typeof fixture>, program = 'process.stdout.write(JSON.stringify({ argv: process.argv.slice(2), cwd: process.cwd() }));\n') {
  const sourceGitRoot = path.join(f.root, 'source');
  const sourceRoot = path.join(sourceGitRoot, 'projects', 'product', 'services', 'buildr');
  const entry = path.join(sourceRoot, 'bin', 'buildr.mjs');
  fs.mkdirSync(path.join(sourceRoot, 'src'), { recursive: true });
  fs.mkdirSync(path.join(sourceRoot, 'resources'), { recursive: true });
  fs.mkdirSync(path.dirname(entry), { recursive: true });
  fs.writeFileSync(path.resolve(sourceRoot, '..', '..', '.node-version'), '24.15.0\n');
  writeJson(path.join(sourceRoot, 'package.json'), { name: '@buildr-ai/buildr', version: '9.9.9', engines: { node: '>=24.15.0' } });
  fs.writeFileSync(path.join(sourceRoot, 'resources', 'manifest.yml'), 'schemaVersion: buildr.resources/v1\n');
  fs.writeFileSync(entry, program);
  initializeGit(sourceGitRoot);
  const launcherFile = process.platform === 'darwin'
    ? path.join(f.developmentLauncherRoot, 'Contents', 'Resources', 'launcher-identity.json')
    : path.join(f.developmentLauncherRoot, 'launcher-identity.json');
  writeJson(launcherFile, {
    schemaVersion: 'buildr.launcher-identity/v1', channel: 'development', runtimeRole: 'development',
    source: 'checkout', platform: process.platform, protocolIdentity: 'buildr.web-protocol/v1', sourceRoot,
    developmentRuntime: {
      executable: process.execPath, version: process.versions.node,
      identity: `development-host:${fs.realpathSync(process.execPath)}:${process.versions.node}`,
    },
  });
  return { sourceGitRoot, sourceRoot, entry, launcherFile };
}

function inspect(f: ReturnType<typeof fixture>, args = ['version', '--json'], cwd = f.root, env: NodeJS.ProcessEnv = {}) {
  return inspectWorkspaceCliRouting([process.execPath, f.entryPath, ...args], f.options(cwd, env));
}

function assertRoutingFailure(action: () => unknown) {
  assert.throws(action, (error: any) => {
    assert.match(error.code, /^workspace_cli\./);
    assert.ok(error.message.length > 0);
    assert.ok(error.nextAction, 'routing failure must include a recovery direction');
    return true;
  });
}

test('unregistered directories and released registrations retain the current npm entry without creating state', (t) => {
  const f = fixture(t);
  const target = workspace(f.root, 'workspace');
  assert.equal(inspect(f).kind, 'local');
  assert.equal(inspect(f, undefined, target.root).kind, 'local');
  assert.equal(fs.existsSync(path.join(target.root, '.buildr', 'local')), false);
  manage(f, target, 'released');
  const before = fs.readFileSync(path.join(target.root, '.buildr', 'local', 'web-management.json'), 'utf8');
  assert.equal(inspect(f, undefined, target.root).kind, 'local');
  assert.equal(fs.readFileSync(path.join(target.root, '.buildr', 'local', 'web-management.json'), 'utf8'), before);
  assert.equal(fs.existsSync(path.join(target.root, '.buildr', 'local', 'workspace.sqlite')), false);
});

test('unregistered legacy metadata stays with the npm migration path while registered invalid metadata fails', (t) => {
  const f = fixture(t);
  const target = workspace(f.root, 'legacy-workspace');
  const metadataFile = path.join(target.root, '.buildr', 'workspace.yml');
  fs.writeFileSync(metadataFile, 'schemaVersion: 1\nkind: organization\nname: Legacy\nprofile: team\n');
  const before = fs.readFileSync(metadataFile, 'utf8');
  assert.equal(inspect(f, undefined, target.root).kind, 'local');
  assert.equal(fs.readFileSync(metadataFile, 'utf8'), before);
  registry(f, 'development', [target.root]);
  assertRoutingFailure(() => inspect(f, undefined, target.root));
});

test('development registration chooses its installed source and Node without a running Web instance', (t) => {
  const f = fixture(t);
  const target = workspace(f.root, 'workspace');
  manage(f, target, 'development');
  const dev = development(f);
  const claimFile = path.join(target.root, '.buildr', 'local', 'web-management.json');
  const registryFile = path.join(f.dataRoots.development, 'workspace-registry.json');
  const before = [claimFile, registryFile].map((file) => fs.readFileSync(file, 'utf8'));
  const plan = inspect(f, undefined, target.root);
  assert.equal(plan.kind, 'forward');
  assert.equal(plan.workspaceRoot, target.root);
  assert.equal(plan.profile, 'development');
  assert.equal(plan.command, process.execPath);
  assert.deepEqual(plan.args, [dev.entry, 'version', '--json']);
  assert.deepEqual([claimFile, registryFile].map((file) => fs.readFileSync(file, 'utf8')), before);
  assert.equal(fs.existsSync(path.join(f.dataRoots.development, 'instance.json')), false);
  assert.equal(fs.existsSync(path.join(target.root, '.buildr', 'local', 'workspace.sqlite')), false);
});

test('explicit targets override cwd while subdirectories and filesystem aliases preserve the same owner', (t) => {
  const f = fixture(t);
  const released = workspace(f.root, 'released-workspace');
  const target = workspace(f.root, 'development-workspace');
  manage(f, released, 'released');
  manage(f, target, 'development');
  const dev = development(f);
  const nested = path.join(target.root, 'services', 'example');
  fs.mkdirSync(nested, { recursive: true });
  const alias = path.join(f.root, 'workspace-alias');
  fs.symlinkSync(target.root, alias, process.platform === 'win32' ? 'junction' : 'dir');
  for (const cwd of [nested, alias]) assert.equal(inspect(f, undefined, cwd).workspaceRoot, target.root);
  const args = ['future-command', '--target', '../development-workspace', '中文 空格', '--unknown=value'];
  const plan = inspect(f, args, released.root);
  assert.equal(plan.kind, 'forward');
  assert.equal(plan.workspaceRoot, target.root);
  assert.deepEqual(plan.args, [dev.entry, ...args]);
});

test('a linked Git worktree inherits its proven registered source while an unrelated copy does not', (t) => {
  const f = fixture(t);
  const target = workspace(f.root, 'workspace');
  initializeGit(target.root);
  manage(f, target, 'development');
  development(f);
  const worktree = path.join(f.root, 'linked-worktree');
  git(target.root, ['worktree', 'add', '--detach', '-q', worktree]);
  assert.equal(inspect(f, undefined, worktree).kind, 'forward');
  const copy = workspace(f.root, 'independent-copy', target.id);
  initializeGit(copy.root);
  assert.equal(inspect(f, undefined, copy.root).kind, 'local');
  fs.cpSync(path.join(target.root, '.buildr', 'local'), path.join(copy.root, '.buildr', 'local'), { recursive: true });
  assertRoutingFailure(() => inspect(f, undefined, copy.root));
});

test('a registered linked checkout owns sibling worktrees without registering their main checkout', (t) => {
  const f = fixture(t);
  const main = workspace(f.root, 'main-workspace');
  initializeGit(main.root);
  const ownerRoot = path.join(f.root, 'registered-worktree');
  const callerRoot = path.join(f.root, 'calling-worktree');
  git(main.root, ['worktree', 'add', '--detach', '-q', ownerRoot]);
  git(main.root, ['worktree', 'add', '--detach', '-q', callerRoot]);
  manage(f, { root: ownerRoot, id: main.id }, 'development');
  const dev = development(f);
  const plan = inspect(f, undefined, callerRoot);
  assert.equal(plan.kind, 'forward');
  assert.equal(plan.workspaceRoot, ownerRoot);
  assert.equal(plan.cwd, callerRoot);
  assert.deepEqual(plan.args, [dev.entry, 'version', '--json']);
  const copy = workspace(f.root, 'independent-copy', main.id);
  initializeGit(copy.root);
  assert.equal(inspect(f, undefined, copy.root).kind, 'local');
  assert.equal(fs.existsSync(path.join(main.root, '.buildr', 'local')), false);
  assert.equal(fs.existsSync(path.join(callerRoot, '.buildr', 'local')), false);
});

test('one legacy registry can establish the owner without manufacturing a local claim', (t) => {
  const f = fixture(t);
  const target = workspace(f.root, 'legacy-workspace');
  manage(f, target, 'development', false);
  development(f);
  assert.equal(inspect(f, undefined, target.root).kind, 'forward');
  assert.equal(fs.existsSync(path.join(target.root, '.buildr', 'local')), false);
});

test('subsequent calls use a moved source after its existing launcher registration is updated', (t) => {
  const f = fixture(t);
  const target = workspace(f.root, 'workspace');
  manage(f, target, 'development');
  const dev = development(f);
  assert.equal(inspect(f, undefined, target.root).args?.[0], dev.entry);
  const moved = path.join(f.root, 'moved-source');
  fs.renameSync(dev.sourceGitRoot, moved);
  const sourceRoot = path.join(moved, 'projects', 'product', 'services', 'buildr');
  const identity = JSON.parse(fs.readFileSync(dev.launcherFile, 'utf8'));
  writeJson(dev.launcherFile, { ...identity, sourceRoot });
  assert.equal(inspect(f, undefined, target.root).args?.[0], path.join(sourceRoot, 'bin', 'buildr.mjs'));
});

test('init routes only an already established target root and does not inherit a parent for new workspaces', (t) => {
  const f = fixture(t);
  const target = workspace(f.root, 'workspace');
  manage(f, target, 'development');
  development(f);
  const nested = path.join(target.root, 'new-workspace');
  fs.mkdirSync(nested);
  assert.equal(inspect(f, ['init', '--name', 'existing'], target.root).kind, 'forward');
  assert.equal(inspect(f, ['init', '--name', 'nested'], nested).kind, 'local');
  assert.equal(inspect(f, ['init', '--target', nested], target.root).kind, 'local');
  assert.equal(inspect(f, ['init', '--target', target.root], nested).kind, 'forward');
});

test('global installation commands and explicit launcher entries bypass workspace routing', (t) => {
  const f = fixture(t);
  const target = workspace(f.root, 'workspace');
  manage(f, target, 'development');
  const dev = development(f);
  fs.writeFileSync(path.join(target.root, '.buildr', 'local', 'web-management.json'), '{broken');
  for (const args of [
    ['update'], ['update', 'check'], ['installation', 'status', '--json'],
    ['web', 'launcher', 'status'], ['__internal', 'enroll-npm-installation'],
    ['web'], ['web', 'preview', 'list'],
  ]) assert.equal(inspect(f, args, target.root).kind, 'local', args.join(' '));
  for (const env of [
    { BUILDR_LAUNCHER_IDENTITY: 'explicit-launcher' },
    { BUILDR_LOCAL_APP_PREVIEW: 'explicit-preview' },
  ]) assert.equal(inspect(f, ['web', '--target', target.root], target.root, env).kind, 'local');
  assert.equal(inspectWorkspaceCliRouting([process.execPath, dev.entry, 'version'], {
    ...f.options(target.root), entryPath: dev.entry,
  }).kind, 'local');
});

test('web with an explicit workspace target uses the registered source', (t) => {
  const f = fixture(t);
  const target = workspace(f.root, 'workspace');
  manage(f, target, 'development');
  development(f);
  assert.equal(inspect(f, ['web', '--target', target.root]).kind, 'forward');
});

test('conflicting registrations and stale or malformed management claims fail without falling back', (t) => {
  const f = fixture(t);
  const target = workspace(f.root, 'workspace');
  manage(f, target, 'development');
  development(f);
  const claimFile = path.join(target.root, '.buildr', 'local', 'web-management.json');
  const original = JSON.parse(fs.readFileSync(claimFile, 'utf8'));
  registry(f, 'released', [target.root]);
  assertRoutingFailure(() => inspect(f, undefined, target.root));
  const duplicate = workspace(f.root, 'duplicate-identity', target.id);
  registry(f, 'released', [duplicate.root]);
  assertRoutingFailure(() => inspect(f, undefined, target.root));
  registry(f, 'released', []);
  for (const change of [
    { workspaceId: crypto.randomUUID() }, { canonicalRoot: f.root },
    { owner: { ...original.owner, profileIdentity: `sha256-${'0'.repeat(64)}` } },
  ]) {
    writeJson(claimFile, { ...original, ...change });
    assertRoutingFailure(() => inspect(f, undefined, target.root));
  }
  fs.writeFileSync(claimFile, '{broken');
  assertRoutingFailure(() => inspect(f, undefined, target.root));
  writeJson(claimFile, original);
  registry(f, 'development', []);
  assertRoutingFailure(() => inspect(f, undefined, target.root));
});

test('an unrelated failed registry observation does not erase a proven matching claim', (t) => {
  const f = fixture(t);
  const target = workspace(f.root, 'workspace');
  manage(f, target, 'development');
  development(f);
  fs.mkdirSync(f.dataRoots.released, { recursive: true });
  fs.writeFileSync(path.join(f.dataRoots.released, 'workspace-registry.json'), '{broken');
  assert.equal(inspect(f, undefined, target.root).kind, 'forward');
  fs.rmSync(path.join(target.root, '.buildr', 'local', 'web-management.json'));
  assertRoutingFailure(() => inspect(f, undefined, target.root));
});

test('the selected development source must have a valid launcher, entry and executable Node', (t) => {
  const f = fixture(t);
  const target = workspace(f.root, 'workspace');
  manage(f, target, 'development');
  assertRoutingFailure(() => inspect(f, undefined, target.root));
  const dev = development(f);
  const original = JSON.parse(fs.readFileSync(dev.launcherFile, 'utf8'));
  fs.writeFileSync(dev.launcherFile, '{broken');
  assertRoutingFailure(() => inspect(f, undefined, target.root));
  for (const value of [
    { ...original, channel: 'npm' },
    { ...original, sourceRoot: path.join(f.root, 'missing-source') },
    { ...original, developmentRuntime: { ...original.developmentRuntime, executable: path.join(f.root, 'missing-node') } },
  ]) {
    writeJson(dev.launcherFile, value);
    assertRoutingFailure(() => inspect(f, undefined, target.root));
  }
  writeJson(dev.launcherFile, original);
  fs.rmSync(dev.entry);
  assertRoutingFailure(() => inspect(f, undefined, target.root));
  fs.symlinkSync(f.entryPath, dev.entry);
  assertRoutingFailure(() => inspect(f, undefined, target.root));
});

test('the Product Node minimum governs a source with the historical npm engine range', (t) => {
  const f = fixture(t);
  const target = workspace(f.root, 'workspace');
  manage(f, target, 'development');
  const dev = development(f);
  writeJson(path.join(dev.sourceRoot, 'package.json'), {
    name: '@buildr-ai/buildr', version: '9.9.9', engines: { node: '>=24.15.0 <25' },
  });
  assert.equal(inspect(f, undefined, target.root).kind, 'forward');
  fs.writeFileSync(path.resolve(dev.sourceRoot, '..', '..', '.node-version'), '99.0.0\n');
  assertRoutingFailure(() => inspect(f, undefined, target.root));
});

test('custom profile roots that the selected source cannot preserve fail without silently changing the peer', (t) => {
  const f = fixture(t);
  const target = workspace(f.root, 'workspace');
  manage(f, target, 'development');
  development(f);
  assert.throws(() => inspectWorkspaceCliRouting([process.execPath, f.entryPath, 'version'], {
    ...f.options(target.root),
    dataRoots: { released: path.join(f.root, 'unrelated-release'), development: f.dataRoots.development },
  }), (error: any) => error.code === 'workspace_cli.profile_roots_unrepresentable' && Boolean(error.nextAction));
});

test('forwarded environment uses the selected development identity and retains product-data isolation', (t) => {
  const f = fixture(t);
  const target = workspace(f.root, 'workspace');
  manage(f, target, 'development');
  const dev = development(f);
  const incoming = {
    BUILDR_NPM_ENTRY_PATH: f.entryPath, BUILDR_APPLICATION_PAYLOAD_ROOT: path.join(f.root, 'npm'),
    BUILDR_INSTALLATION_IDENTITY: path.join(f.root, 'npm', 'installation-origin.json'),
    BUILDR_SOURCE_ROOT: 'old-source', BUILDR_DEVELOPMENT_ENTRY: 'old-entry',
    BUILDR_HOST_RUNTIME_ROLE: 'host', BUILDR_CURRENT_PRODUCT_ROOT: 'old-product',
    BUILDR_LAUNCHER_IDENTITY: 'inherited-launcher', BUILDR_LOCAL_APP_PREVIEW: 'inherited-preview',
    BUILDR_INTERNAL_PRODUCT_REENTRY: '1',
    BUILDR_APP_DATA_DIR: f.dataRoots.released, BUILDR_PRODUCT_DATA_DIR: path.join(f.root, 'isolated-product-data'),
    ROUTING_USER_VALUE: '保留 用户值',
  };
  const env = inspect(f, undefined, target.root, incoming).env!;
  for (const key of [
    'BUILDR_NPM_ENTRY_PATH', 'BUILDR_APPLICATION_PAYLOAD_ROOT', 'BUILDR_INSTALLATION_IDENTITY',
    'BUILDR_SOURCE_ROOT', 'BUILDR_DEVELOPMENT_ENTRY', 'BUILDR_HOST_RUNTIME_ROLE', 'BUILDR_CURRENT_PRODUCT_ROOT',
    'BUILDR_LAUNCHER_IDENTITY', 'BUILDR_LOCAL_APP_PREVIEW', 'BUILDR_INTERNAL_PRODUCT_REENTRY',
  ]) assert.equal(env[key], undefined, key);
  assert.equal(env.BUILDR_APP_DATA_DIR, f.dataRoots.development);
  assert.equal(env.BUILDR_NODE, process.execPath);
  assert.equal(env.BUILDR_PRODUCT_DATA_DIR, incoming.BUILDR_PRODUCT_DATA_DIR);
  assert.equal(env.ROUTING_USER_VALUE, incoming.ROUTING_USER_VALUE);
  assert.equal(env.BUILDR_WORKSPACE_CLI_ROUTED_ENTRY, dev.entry);
  assert.equal(env.PATH?.split(path.delimiter)[0], path.join(dev.sourceRoot, 'tools', 'development', 'programs'));
});

test('an inherited default development data root still resolves the existing development registration', (t) => {
  const f = fixture(t);
  for (const profile of ['released', 'development'] as const) {
    f.dataRoots[profile] = defaultWebDataRoot(profile, { home: f.root, env: {} });
    f.profiles[profile] = resolveWebProfile({
      channel: profile === 'released' ? 'npm' : 'development',
      runtime: { role: profile === 'released' ? 'host' : 'development' },
    }, { dataRoot: f.dataRoots[profile], env: {} });
  }
  const target = workspace(f.root, 'workspace');
  manage(f, target, 'development');
  development(f);
  const plan = inspectWorkspaceCliRouting([process.execPath, f.entryPath, 'version', '--json'], {
    ...f.options(target.root, { BUILDR_APP_DATA_DIR: f.dataRoots.development }), dataRoots: undefined,
  });
  assert.equal(plan.kind, 'forward');
  assert.equal(plan.env?.BUILDR_APP_DATA_DIR, undefined);
  const productIdentity = { channel: 'development', runtime: { role: 'development' } };
  const downstream = resolveWebProfile(productIdentity, { home: f.root, env: plan.env });
  const downstreamPeer = oppositeWebProfile(downstream, productIdentity, { home: f.root, env: plan.env });
  assert.equal(downstream.dataRoot, f.dataRoots.development);
  assert.equal(downstreamPeer.dataRoot, f.dataRoots.released);
});

function dispatcherHarness(f: ReturnType<typeof fixture>, cwd: string, inheritEnvironment = false) {
  const file = path.join(f.root, 'dispatch.mjs');
  const options = f.options(cwd);
  fs.writeFileSync(file, `import { dispatchWorkspaceCli } from ${JSON.stringify(routingModule)};\nconst options = ${JSON.stringify(inheritEnvironment ? { ...options, env: undefined, dataRoots: undefined } : options)};\nif (!await dispatchWorkspaceCli([process.execPath, options.entryPath, ...process.argv.slice(2)], options)) throw new Error('unexpected local execution');\n`);
  return file;
}

test('a custom development data root inherited by the real process follows its matching management claim', (t) => {
  const f = fixture(t);
  const target = workspace(f.root, 'workspace');
  manage(f, target, 'development');
  development(f, 'process.stdout.write(JSON.stringify({ appData: process.env.BUILDR_APP_DATA_DIR, argv: process.argv.slice(2) }));\n');
  const plan = inspectWorkspaceCliRouting([process.execPath, f.entryPath, 'future-command'], {
    ...f.options(target.root, { BUILDR_APP_DATA_DIR: f.dataRoots.development }), dataRoots: undefined,
  });
  assert.equal(plan.kind, 'forward');
  const productIdentity = { channel: 'development', runtime: { role: 'development' } };
  const downstream = resolveWebProfile(productIdentity, { home: f.root, env: plan.env });
  const downstreamPeer = oppositeWebProfile(downstream, productIdentity, { home: f.root, env: plan.env });
  assert.equal(downstream.dataRoot, f.dataRoots.development);
  assert.equal(downstreamPeer.dataRoot, path.join(f.dataRoots.development, '.peer', 'released'));
  const result = spawnSync(process.execPath, [dispatcherHarness(f, target.root, true), 'future-command'], {
    encoding: 'utf8', timeout: 10000,
    env: {
      ...process.env, BUILDR_APP_DATA_DIR: f.dataRoots.development,
      BUILDR_INSTALLATION_IDENTITY: path.join(f.root, 'npm', 'installation-origin.json'),
    },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.deepEqual(JSON.parse(result.stdout), { appData: f.dataRoots.development, argv: ['future-command'] });
});

test('dispatch preserves unknown arguments, cwd, standard streams and nonzero exit status', (t) => {
  const f = fixture(t);
  const target = workspace(f.root, 'workspace');
  manage(f, target, 'development');
  const cwd = path.join(target.root, 'service');
  fs.mkdirSync(cwd);
  development(f, `let input = '';\nfor await (const chunk of process.stdin) input += chunk;\nprocess.stdout.write(JSON.stringify({ argv: process.argv.slice(2), cwd: process.cwd(), input }));\nprocess.stderr.write('fixture stderr\\n');\nprocess.exitCode = 23;\n`);
  const args = ['future-command', '--target', '..', '中文 空格', 'a"b', '$HOME'];
  const result = spawnSync(process.execPath, [dispatcherHarness(f, cwd), ...args], {
    cwd, input: '标准输入\n', encoding: 'utf8', timeout: 10000,
    // The reader must not resurrect this foreign receipt from process.env after cleaning options.env.
    env: { ...process.env, BUILDR_INSTALLATION_IDENTITY: path.join(f.root, 'npm', 'installation-origin.json') },
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 23, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { argv: args, cwd, input: '标准输入\n' });
  assert.equal(result.stderr, 'fixture stderr\n');
});

test('dispatch preserves the selected child termination signal', { skip: process.platform === 'win32' }, (t) => {
  const f = fixture(t);
  const target = workspace(f.root, 'workspace');
  manage(f, target, 'development');
  development(f, "process.kill(process.pid, 'SIGTERM');\n");
  const result = spawnSync(process.execPath, [dispatcherHarness(f, target.root), 'future-command'], { encoding: 'utf8', timeout: 10000 });
  assert.equal(result.error, undefined);
  assert.equal(result.signal, 'SIGTERM');
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
});

test('a later termination signal still reaches a child that handled an earlier interrupt', { skip: process.platform === 'win32', timeout: 10000 }, async (t) => {
  const f = fixture(t);
  const target = workspace(f.root, 'workspace');
  manage(f, target, 'development');
  const terminated = path.join(f.root, 'child-terminated');
  const pidFile = path.join(f.root, 'delegated-pid');
  development(f, `import fs from 'node:fs';\nfs.writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));\nprocess.on('SIGINT', () => process.stdout.write('interrupted\\n'));\nprocess.on('SIGTERM', () => { fs.writeFileSync(${JSON.stringify(terminated)}, 'terminated'); process.exit(0); });\nprocess.stdout.write('ready\\n');\nsetInterval(() => {}, 1000);\n`);
  const child = spawn(process.execPath, [dispatcherHarness(f, target.root), 'future-command'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let delegatedPid: number | undefined;
  t.after(() => {
    if (child.exitCode === null && child.signalCode === null) {
      if (delegatedPid) { try { process.kill(delegatedPid, 'SIGKILL'); } catch { /* already exited */ } }
      child.kill('SIGKILL');
    }
  });
  const completed = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => resolve({ code, signal }));
  });
  const waitForOutput = (expected: string) => new Promise<void>((resolve, reject) => {
    child.stdout.once('data', (value) => value.toString() === expected ? resolve() : reject(new Error(`unexpected child output: ${value}`)));
    child.once('error', reject);
    child.once('close', () => reject(new Error('dispatcher closed before its child was ready')));
  });
  await waitForOutput('ready\n');
  delegatedPid = Number(fs.readFileSync(pidFile, 'utf8'));
  const interrupted = waitForOutput('interrupted\n');
  child.kill('SIGINT');
  await interrupted;
  child.kill('SIGTERM');
  await completed;
  assert.equal(fs.readFileSync(terminated, 'utf8'), 'terminated');
});
