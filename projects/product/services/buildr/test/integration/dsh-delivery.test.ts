import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { createDeliveryBinding, prepareDshPlugin } from '../../resources/runtime/dsh/delivery.ts';
import { registryFile } from '../../resources/runtime/dsh/process.ts';
import { createAgentAssetsCliContributions } from '../../src/modules/agent-assets/interfaces/cli/agent-assets.ts';

const digest = `sha256-${'1'.repeat(64)}`;

/** A machine where Buildr recorded one npm installation; nothing else is discoverable. */
async function machine(t: any) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'buildr-dsh-delivery-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const home = path.join(root, 'home');
  const entryPath = path.join(root, 'node_modules', '@buildr-ai', 'buildr', 'bin', 'buildr.mjs');
  const status = {
    schemaVersion: 'buildr.installation-status/v1',
    channels: { npm: { status: 'current', channel: 'npm', runtime: { executable: process.execPath } } },
  };
  // The entry answers the one command preparation falls back to, so a test that omits the status
  // exercises the same path production takes instead of needing an injected value.
  await fs.mkdir(path.dirname(entryPath), { recursive: true });
  await fs.writeFile(entryPath, `process.stdout.write(${JSON.stringify(`${JSON.stringify(status)}\n`)});\n`);
  const registry = registryFile({ HOME: home } as NodeJS.ProcessEnv, 'darwin');
  await fs.mkdir(path.dirname(registry), { recursive: true });
  await fs.writeFile(registry, JSON.stringify({
    schemaVersion: 'buildr.product-installation-registry/v1',
    installations: [{ origin: { channel: 'npm', package: '@buildr-ai/buildr' }, entryPath, runtime: { executable: '/registered/node' } }],
  }));
  const dependencies = { platform: 'darwin', environment: { HOME: home } as NodeJS.ProcessEnv, digest: async () => digest, query: async () => status, status, signal: AbortSignal.timeout(5_000) } as any;
  return { root, home, entryPath, registry, status, dependencies };
}

async function bundleFixture(t: any) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'buildr-dsh-bundle-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const source = path.join(root, 'base');
  await fs.mkdir(path.join(source, 'lib'), { recursive: true });
  await fs.writeFile(path.join(source, 'package.json'), JSON.stringify({ name: '@buildr-ai/dsh-plugin', version: '0.1.0', dsh: { bundle: { patch: 'cordis.patch.yml' } } }));
  await fs.writeFile(path.join(source, 'lib/index.js'), 'export function apply() {}\n');
  await fs.writeFile(path.join(source, 'lib/client.js'), '// compiled client fixture\n');
  return { root, source, output: path.join(root, 'registered') };
}

test('registration records only where Buildr runs, copying Buildr own entry', async t => {
  const { entryPath, status, dependencies } = await machine(t);
  const binding = await createDeliveryBinding(status, dependencies);
  assert.deepEqual(Object.keys(binding).sort(), ['cliEntry', 'cliSha256', 'nodeExecutable', 'nodeSha256']);
  assert.equal(binding.cliEntry, entryPath);
  assert.equal(binding.nodeExecutable, process.execPath);
  // No channel and no installation identity are persisted: those are read from public status per click.
  assert.equal(JSON.stringify(binding).includes('channel'), false);
});

test('registration refuses a machine with no usable Buildr and never guesses a path', async t => {
  const { status, dependencies } = await machine(t);
  const absent = { ...status, channels: { npm: { status: 'absent' } } };
  await assert.rejects(createDeliveryBinding(absent, dependencies), /未证明已安装/);
  const noRegistry = { ...dependencies, environment: { HOME: path.join(os.tmpdir(), 'buildr-empty-home') } as NodeJS.ProcessEnv };
  await assert.rejects(createDeliveryBinding(status, noRegistry), /没有找到已登记的 Buildr/);
});

test('preparation emits one private bundle whose own layer carries the pointer', async t => {
  const { status, dependencies } = await machine(t);
  const { source, output } = await bundleFixture(t);
  const prepared = await prepareDshPlugin({ bundleRoot: source, output, invocation: { command: process.execPath, argsPrefix: [] } }, dependencies);
  assert.equal(prepared.status, 'prepared');
  assert.equal(prepared.installationApplied, false);
  assert.equal(prepared.requires.slot, 'sidebar.footer.action');
  assert.equal(prepared.install.arguments.action, 'install_bundle');
  const patch = JSON.parse(await fs.readFile(path.join(prepared.packageRoot, 'cordis.patch.yml'), 'utf8'));
  assert.equal(patch[0].insert[0].id, 'buildr');
  assert.deepEqual(Object.keys(patch[0].insert[0].config).sort(), ['binding']);
  const manifest = JSON.parse(await fs.readFile(path.join(prepared.packageRoot, 'package.json'), 'utf8'));
  assert.equal(manifest.private, true);
  // macOS AppleDouble companions are not package content; shipping them breaks the consumer.
  const listed = await new Promise<string>((resolve, reject) => {
    const child = execFile('/usr/bin/tar', ['-tzf', prepared.archive], { encoding: 'utf8' }, (error, stdout) => error ? reject(error) : resolve(stdout));
    child.on('error', reject);
  });
  assert.equal(listed.split('\n').some(line => line.includes('/._') || line.endsWith('/._')), false, 'the archive must not carry AppleDouble metadata');
});

test('preparation refuses an existing output directory and a bundle with install scripts', async t => {
  const { status, dependencies } = await machine(t);
  const { root, source } = await bundleFixture(t);
  const existing = path.join(root, 'existing');
  await fs.mkdir(existing);
  await assert.rejects(prepareDshPlugin({ bundleRoot: source, output: existing, invocation: { command: process.execPath, argsPrefix: [] } }, dependencies));
  const scripts = path.join(root, 'with-scripts');
  await fs.cp(source, scripts, { recursive: true });
  await fs.writeFile(path.join(scripts, 'package.json'), JSON.stringify({ name: '@buildr-ai/dsh-plugin', version: '0.1.0', scripts: { postinstall: 'x' }, dsh: { bundle: { patch: 'cordis.patch.yml' } } }));
  const other = path.join(root, 'other');
  await assert.rejects(prepareDshPlugin({ bundleRoot: scripts, output: other, invocation: { command: process.execPath, argsPrefix: [] } }, dependencies), /安装脚本/);
  assert.equal(await fs.stat(other).then(() => true).catch(() => false), false, 'a refused preparation must not leave output behind');
});

test('the development bundle is accepted by the same preparation', async t => {
  const { status, dependencies } = await machine(t);
  const { root, source } = await bundleFixture(t);
  const dev = path.join(root, 'dev');
  await fs.cp(source, dev, { recursive: true });
  await fs.writeFile(path.join(dev, 'package.json'), JSON.stringify({ name: '@buildr-ai/dsh-plugin-dev', version: '0.1.0', dsh: { bundle: { patch: 'cordis.patch.yml' } } }));
  const prepared = await prepareDshPlugin({ bundleRoot: dev, output: path.join(root, 'dev-out'), invocation: { command: process.execPath, argsPrefix: [] } }, dependencies);
  assert.equal(prepared.package, '@buildr-ai/dsh-plugin-dev@0.1.0');
});

test('the CLI route registers without any channel choice', async () => {
  const route: any = createAgentAssetsCliContributions().find((item: any) => item.key === 'runtime dsh-plugin');
  assert.ok(route);
  assert.doesNotMatch(JSON.stringify(route), /--channel/);
  let received: any;
  await route.run({ prepareDshPlugin: async (input: any) => { received = input; return { output: '/tmp/x', status: 'prepared' }; } },
    { argv: ['node', 'buildr', 'runtime', 'dsh-plugin', 'prepare', '--output', '/tmp/x'] });
  assert.deepEqual(received, { output: '/tmp/x' });
  // Omitting the output is not an error: the application chooses a location that survives, because a
  // directory this command does not own can be cleaned up after DSH recorded it as the plugin's source.
  received = undefined;
  await route.run({ prepareDshPlugin: async (input: any) => { received = input; return { output: '/stable', status: 'prepared' }; } },
    { argv: ['node', 'buildr', 'runtime', 'dsh-plugin', 'prepare'] });
  assert.deepEqual(received, {});
});

test('preparation without an output writes where it survives and can be repeated', async t => {
  const { entryPath } = await machine(t);
  const { root, source } = await bundleFixture(t);
  const { registerDshPluginDelivery } = await import('../../src/modules/agent-assets/application/dsh-plugin-delivery.ts');
  const dataRoot = path.join(root, 'data');
  const application = registerDshPluginDelivery({
    productRoot: () => root,
    // The invocation carries the entry that answers `installation status --json`, as production does.
    currentProductInvocation: () => ({ command: process.execPath, argsPrefix: [entryPath] }),
    productDataRoot: () => dataRoot,
  });
  const first = await application.prepareDshPlugin({ bundleRoot: source });
  // Under Buildr's own data root, keyed by package, so DSH's recorded source cannot be cleaned away.
  assert.equal(first.output, path.join(dataRoot, 'dsh-plugin', '@buildr-ai/dsh-plugin'));
  await assert.doesNotReject(fs.access(first.archive));
  // Repeating replaces the previous result: preparation owns this directory and no user file is in it.
  const second = await application.prepareDshPlugin({ bundleRoot: source });
  assert.equal(second.archive, first.archive);
  await assert.doesNotReject(fs.access(second.archive));
});
