import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  childEnvironment, createInstalledBuildrBridge, discoverBinding, fileDigest, launchInstallation,
  queryInstallation, registryFile, validateBinding,
} from '../../plugin/process.ts';
import { launcherExecutable, launcherIdentityFile, launcherRoots } from '../../plugin/platform.ts';

/** A machine-local pointer plus a launcher pair Buildr itself would report. */
async function fixture(t: any) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'buildr-dsh-process-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const cliEntry = path.join(root, 'CLI with spaces.mjs');
  const binding = { nodeExecutable: process.execPath, cliEntry };
  await fs.writeFile(cliEntry, `if (JSON.stringify(process.argv.slice(2)) !== JSON.stringify(['installation','status','--json'])) process.exit(2);\nconsole.log(JSON.stringify({schemaVersion:'fixture', inherited:process.env.BUILDR_APP_DATA_DIR || null, injected:process.env.NODE_OPTIONS || null}));\n`);
  const home = path.join(root, 'home');
  const roots = { released: path.join(home, 'Applications', 'Buildr Web.app'), development: path.join(root, 'Buildr Web Dev.app') };
  for (const [channel, target] of Object.entries(roots)) {
    const internal = channel === 'released' ? 'npm' : 'development';
    const executable = launcherExecutable(target, internal as 'npm' | 'development');
    await fs.mkdir(path.dirname(executable), { recursive: true });
    await fs.mkdir(path.dirname(launcherIdentityFile(target)), { recursive: true });
    await fs.writeFile(launcherIdentityFile(target), JSON.stringify({ schemaVersion: 'buildr.launcher-identity/v1', channel: internal }));
    await fs.writeFile(executable, '#!/bin/sh\nprintf "%s,%s,%s" "$BUILDR_LAUNCHER_NO_OPEN" "$BUILDR_LAUNCHER_NO_NOTIFY" "$BUILDR_APP_DATA_DIR" > "$(dirname "$0")/observed.txt"\n', { mode: 0o755 });
  }
  const status = (channel: 'released' | 'development', state = 'absent') => ({
    channels: { npm: { status: 'installed' }, development: { status: 'installed' } },
    launcher: { status: 'ready', channel: 'npm', platform: 'darwin', target: roots.released },
    // Buildr reports where its launchers live, so a non-conventional install is still reachable.
    launchers: { released: roots.released, development: roots.development },
    instances: { [channel]: { status: state } },
  });
  return { root, home, binding, roots, status };
}

const withHome = (home: string, extra: NodeJS.ProcessEnv = {}) => ({ ...process.env, HOME: home, ...extra });

test('DSH executes the registered CLI with exact arguments and does not inherit another Buildr channel', async t => {
  const { binding } = await fixture(t);
  const environment = { ...process.env, BUILDR_APP_DATA_DIR: '/must-not-use', NODE_OPTIONS: '--not-a-real-option' };
  const result = await queryInstallation(binding, new AbortController().signal, { environment });
  assert.deepEqual(result, { schemaVersion: 'fixture', inherited: null, injected: null });
  assert.equal(environment.BUILDR_APP_DATA_DIR, '/must-not-use');
  assert.equal(environment.NODE_OPTIONS, '--not-a-real-option');
});

test('DSH launches the launcher of the requested channel with no-open scoped to the child', async t => {
  const { home, binding, roots, status } = await fixture(t);
  const environment = withHome(home, { BUILDR_APP_DATA_DIR: '/must-not-use' });
  await launchInstallation(binding, 'npm', status('released'), new AbortController().signal, { environment });
  const observedFor = (target: string, channel: 'npm' | 'development') => path.join(path.dirname(launcherExecutable(target, channel)), 'observed.txt');
  assert.equal(await fs.readFile(observedFor(roots.released, 'npm'), 'utf8'), '1,1,');
  // A development entry uses a different launcher from the same machine pointer.
  await launchInstallation(binding, 'development', status('development'), new AbortController().signal, { environment });
  assert.equal(await fs.readFile(observedFor(roots.development, 'development'), 'utf8'), '1,1,');
  assert.equal(environment.BUILDR_LAUNCHER_NO_OPEN, undefined);
  assert.equal(environment.BUILDR_APP_DATA_DIR, '/must-not-use');
});

test('DSH refuses to launch when no launcher can be resolved', async t => {
  const { binding } = await fixture(t);
  await assert.rejects(
    launchInstallation(binding, 'npm', { channels: {}, launcher: {}, launchers: {}, instances: {} }, new AbortController().signal, { environment: { ...process.env, HOME: '/nonexistent-home' } }),
    { code: 'launcher-mismatch' },
  );
});

test('DSH detects CLI drift before execution and sanitizes subprocess parse failure', async t => {
  const { binding } = await fixture(t);
  const cliSha256 = await fileDigest(binding.cliEntry);
  await fs.appendFile(binding.cliEntry, '\nconsole.log("secret-test-marker");\n');
  await assert.rejects(queryInstallation({ ...binding, cliSha256 }, new AbortController().signal), { code: 'installation-drift' });
  await assert.rejects(queryInstallation(binding, new AbortController().signal), error => error.code === 'query-failed' && !error.message.includes('secret-test-marker'));
});

test('DSH development wrapper receives explicit Node without mutating parent environment', () => {
  const env = { HOME: '/home/test', PATH: '/bin', BUILDR_NODE: '/wrong', BUILDR_WEB_PROFILE: 'released', NODE_PATH: '/wrong' };
  assert.deepEqual(childEnvironment(env, { nodeExecutable: '/bound/node', cliEntry: '/cli' }, 'development'), { HOME: '/home/test', PATH: '/bin', BUILDR_NODE: '/bound/node' });
  assert.equal(env.BUILDR_NODE, '/wrong');
});

test('DSH pointer validation refuses guessed paths and bad digests', async t => {
  const { binding } = await fixture(t);
  assert.equal(validateBinding(binding).cliEntry, binding.cliEntry);
  assert.throws(() => validateBinding({ ...binding, cliEntry: 'buildr' }), { code: 'invalid-binding' });
  assert.throws(() => validateBinding({ ...binding, cliSha256: 'not-a-digest' }), { code: 'invalid-binding' });
});

test('registration in Buildr own registry is discovered without user input', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'buildr-registry-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const home = path.join(root, 'home');
  const entryPath = path.join(root, 'node_modules', '@buildr-ai', 'buildr', 'bin', 'buildr.mjs');
  await fs.mkdir(path.dirname(entryPath), { recursive: true });
  await fs.writeFile(entryPath, 'export {};\n');
  const registry = registryFile({ HOME: home } as NodeJS.ProcessEnv, 'darwin');
  await fs.mkdir(path.dirname(registry), { recursive: true });
  await fs.writeFile(registry, JSON.stringify({
    schemaVersion: 'buildr.product-installation-registry/v1',
    installations: [{
      origin: { channel: 'npm', package: '@buildr-ai/buildr' },
      entryPath,
      runtime: { executable: '/registered/node' },
    }],
  }));
  const found = await discoverBinding({ HOME: home } as NodeJS.ProcessEnv, 'darwin', '/runtime/node');
  assert.equal(found?.cliEntry, entryPath);
  assert.equal(found?.nodeExecutable, '/registered/node');
  // A machine with nothing installed is reported as such, never guessed at.
  assert.equal(await discoverBinding({ HOME: path.join(root, 'empty') } as NodeJS.ProcessEnv, 'darwin', '/nonexistent/node'), null);
  // A registry entry whose entry is gone is skipped rather than trusted.
  await fs.rm(entryPath);
  assert.equal(await discoverBinding({ HOME: home } as NodeJS.ProcessEnv, 'darwin', '/nonexistent/node'), null);
});

test('DSH launcher roots follow the platform convention without inventing a fallback', () => {
  assert.deepEqual(launcherRoots('development', {}, 'darwin'), ['/Applications/Buildr Web Dev.app']);
  const win = launcherRoots('development', { LOCALAPPDATA: 'C:\\Users\\u\\AppData\\Local' }, 'win32');
  assert.equal(win.length, 1);
  assert.match(win[0]!.replace(/\\/g, '/'), /AppData\/Local\/Programs\/Buildr Web Dev$/);
  // Windows remains unverified on real hardware: this asserts the declared convention only.
  assert.match(launcherExecutable(win[0]!, 'development', 'win32').replace(/\\/g, '/'), /Buildr Web Dev\/Buildr Dev\.exe$/);
});

test('DSH disposed bridge never executes a later query', async t => {
  const { binding } = await fixture(t);
  const bridge = createInstalledBuildrBridge({ binding }, 'npm', { platform: 'darwin', exec: () => assert.fail('disposed plugin executed a process') });
  assert.ok(bridge);
  bridge.dispose();
  await assert.rejects(bridge.open(), { code: 'disposed' });
  // An unregistered install yields no bridge instead of throwing at activation.
  assert.equal(createInstalledBuildrBridge({}, 'npm', { platform: 'darwin' }), null);
});
