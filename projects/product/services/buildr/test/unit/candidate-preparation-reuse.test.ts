import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { createCandidatePreparationReuse, preparationContentDigest } from '../../tools/verification/candidate-preparation-reuse.ts';

function fixture() {
  const receipts = new Map<string, any>();
  const content: Record<string, string | null> = { input: 'sha256-input', output: 'sha256-output' };
  const options = { fingerprint: (_item: any, role: string) => content[role], read: (id: string) => receipts.get(id), write: (id: string, value: any) => receipts.set(id, value), remove: (id: string) => receipts.delete(id) };
  const item = { id: 'buildr-dependencies' };
  const controller = (extra = {}) => createCandidatePreparationReuse({ serviceRoot: '/fixture', webRoot: '/web' }, {}, { ...options, ...extra });
  return { receipts, content, item, controller };
}

test('prepared operations reuse only complete successful receipts with unchanged input and actual output', () => {
  const f = fixture();
  const first = f.controller();
  const snapshot = first.inspect(f.item);
  assert.equal(snapshot.reusable, false);
  first.complete(f.item, snapshot, '2026-10-15T00:00:00.000Z');
  assert.equal(f.controller().inspect(f.item).reusable, true);
  f.content.input = 'sha256-new-lock-or-node-or-recipe';
  assert.equal(f.controller().inspect(f.item).reusable, false);
  f.content.input = 'sha256-input';
  f.content.output = 'sha256-mutated-module';
  assert.equal(f.controller().inspect(f.item).reusable, false);
  f.content.output = null;
  assert.equal(f.controller().inspect(f.item).reusable, false);
});

test('in-flight input drift, missing output and forced rerun never retain the previous pass', () => {
  const f = fixture();
  const first = f.controller();
  const snapshot = first.inspect(f.item);
  f.content.input = 'sha256-drift';
  first.complete(f.item, snapshot, '2026-10-15T00:00:00.000Z');
  assert.equal(f.receipts.size, 0);
  f.content.input = 'sha256-input';
  first.complete(f.item, first.inspect(f.item), '2026-10-15T00:00:00.000Z');
  const forced = f.controller({ force: true });
  assert.equal(forced.inspect(f.item).reusable, false);
  forced.invalidate(f.item);
  assert.equal(f.controller().inspect(f.item).reusable, false);
  first.complete(f.item, first.inspect(f.item), '2026-10-15T00:00:00.000Z');
  f.receipts.get(f.item.id).status = 'failed';
  assert.equal(f.controller().inspect(f.item).reusable, false);
});

test('npm preparation environment changes invalidate receipts without storing environment values', () => {
  const f = fixture();
  const production = f.controller({ env: { NODE_ENV: 'production', npm_config_omit: 'dev', npm_config_token: 'secret-fixture' } });
  production.complete(f.item, production.inspect(f.item), '2026-10-15T00:00:00.000Z');
  assert.equal(f.controller({ env: { NODE_ENV: 'production', npm_config_omit: 'dev', npm_config_token: 'secret-fixture' } }).inspect(f.item).reusable, true);
  assert.equal(f.controller({ env: { NODE_ENV: 'development', npm_config_omit: '', npm_config_token: 'secret-fixture' } }).inspect(f.item).reusable, false);
  assert.equal(JSON.stringify([...f.receipts.values()]).includes('secret-fixture'), false);
});

function scopedFixture() {
  const backend = '/fixture/buildr', web = '/fixture/buildr-web';
  const files = new Map<string, string>();
  for (const file of ['src/dto.ts', 'tools/codegen/contracts/dto.ts', 'tools/testing/test-context-build.ts',
    'tools/build/generated-artifacts.ts', 'tools/build/web-dist.ts', 'tools/development/prepare-development-web.ts',
    'package.json', 'package-lock.json', 'tsconfig.json', 'tsconfig.test-context.json', 'node_modules/.package-lock.json',
    'build/generated/task-dto.ts', 'build/test-context/public.js', 'web-dist/index.html']) files.set(`${backend}/${file}`, 'initial');
  for (const file of ['src/app.tsx', 'index.html', 'vite.config.ts', 'tsconfig.json', 'tsconfig.app.json', 'tsconfig.node.json',
    'package.json', 'package-lock.json', 'node_modules/.package-lock.json', 'build/generated/task-dto.ts']) files.set(`${web}/${file}`, 'initial');
  const receipts = new Map<string, any>();
  const contentDigest = (paths: string[], options: any = {}) => {
    const entries: any[] = [];
    for (const selected of paths) {
      const root = selected.replaceAll('\\', '/');
      const matched = [...files].filter(([file]) => file === root || file.startsWith(`${root}/`)).sort(([left], [right]) => left.localeCompare(right));
      if (matched.length === 0 && !options.optional) return null;
      entries.push([root, matched.length ? matched : 'absent']);
    }
    return JSON.stringify(entries);
  };
  const create = () => createCandidatePreparationReuse({ serviceRoot: backend, webRoot: web }, { version: '24.21.0' }, {
    npmIdentity: 'fixture-npm', env: {}, contentDigest, exists: (file: string) => files.has(file.replaceAll('\\', '/')),
    read: (id: string) => receipts.get(id), write: (id: string, value: any) => receipts.set(id, value), remove: (id: string) => receipts.delete(id),
  });
  const run = () => {
    const controller = create();
    return ['buildr-dependencies', 'buildr-web-dependencies', 'generated-contracts-and-test-context', 'buildr-web-source-runtime'].map(id => {
      const item = { id }, before = controller.inspect(item);
      if (before.reusable) return 'reused';
      controller.invalidate(item); controller.complete(item, before, '2026-10-16T00:00:00.000Z');
      return 'executed';
    });
  };
  return { backend, web, files, receipts, create, run };
}

test('backend test, documentation and unrelated tooling edits reuse generated inputs and Web preparation', () => {
  const f = scopedFixture();
  assert.deepEqual(f.run(), ['executed', 'executed', 'executed', 'executed']);
  assert.deepEqual(f.run(), ['reused', 'reused', 'reused', 'reused']);
  f.files.set(`${f.backend}/test/unit/example.test.ts`, 'new assertion');
  f.files.set(`${f.backend}/docs/example.md`, 'new prose');
  f.files.set(`${f.backend}/tools/release/example.ts`, 'unrelated tool');
  assert.deepEqual(f.run(), ['reused', 'reused', 'reused', 'reused']);
});

test('actual frontend, DTO and build recipe input changes invalidate the relevant preparation only', () => {
  for (const [scope, file, expected] of [
    ['web', 'src/app.tsx', ['reused', 'reused', 'reused', 'executed']],
    ['web', 'vite.config.ts', ['reused', 'reused', 'reused', 'executed']],
    ['web', 'tsconfig.app.json', ['reused', 'reused', 'reused', 'executed']],
    ['backend', 'src/dto.ts', ['reused', 'reused', 'executed', 'executed']],
    ['backend', 'tools/codegen/contracts/dto.ts', ['reused', 'reused', 'executed', 'executed']],
    ['backend', 'tools/testing/test-context-build.ts', ['reused', 'reused', 'executed', 'reused']],
    ['backend', 'tools/build/generated-artifacts.ts', ['reused', 'reused', 'executed', 'reused']],
    ['backend', 'tools/build/web-dist.ts', ['reused', 'reused', 'reused', 'executed']],
    ['backend', 'tools/development/prepare-development-web.ts', ['reused', 'reused', 'reused', 'executed']],
  ] as const) {
    const f = scopedFixture(); f.run();
    f.files.set(`${f[scope]}/${file}`, 'changed');
    assert.deepEqual(f.run(), expected, file);
  }
});

test('optional Web inputs bind absence, present bytes and dependency output changes; unknown preparation stays uncached', () => {
  const f = scopedFixture(); f.run();
  f.files.set(`${f.web}/public/icon.svg`, 'new public input');
  assert.deepEqual(f.run(), ['reused', 'reused', 'reused', 'executed']);
  f.files.set(`${f.web}/.env.production`, 'VITE_FIXTURE=true');
  assert.deepEqual(f.run(), ['reused', 'reused', 'reused', 'executed']);
  f.files.delete(`${f.web}/.env.production`);
  assert.deepEqual(f.run(), ['reused', 'reused', 'reused', 'executed']);
  f.files.set(`${f.backend}/node_modules/.package-lock.json`, 'different dependency bytes');
  assert.deepEqual(f.run(), ['executed', 'reused', 'executed', 'executed']);
  const controller = f.create(), item = { id: 'new-unknown-operation' }, before = controller.inspect(item);
  assert.equal(before.reusable, false); controller.complete(item, before, '2026-10-16T00:00:00.000Z');
  assert.equal(f.receipts.has(item.id), false);
});

test('Web dependency identity excludes only its two declared build-info files and an otherwise empty container', () => {
  const normalize = (file: string) => file.replaceAll('\\', '/');
  const root = normalize(path.resolve('/fixture/node_modules'));
  const files = new Map<string, string>([[`${root}/.package-lock.json`, 'locked'], [`${root}/typescript/index.js`, 'real module']]);
  const directories = new Set([root, `${root}/typescript`]);
  const io: any = {
    existsSync: (file: string) => files.has(normalize(file)) || directories.has(normalize(file)),
    lstatSync: (selected: string) => {
      const file = normalize(selected);
      if (!files.has(file) && !directories.has(file)) throw new Error('missing fixture entry');
      return { mode: 0o755, size: Buffer.byteLength(files.get(file) ?? ''), isSymbolicLink: () => false,
        isFile: () => files.has(file), isDirectory: () => directories.has(file) };
    },
    readFileSync: (file: string) => Buffer.from(files.get(normalize(file))!),
    readdirSync: (selected: string) => {
      const file = normalize(selected);
      return [...new Set([...files.keys(), ...directories].filter(entry => entry.startsWith(`${file}/`)).map(entry => entry.slice(file.length + 1).split('/')[0]))];
    },
  };
  const read = (webDependencyCache = true) => preparationContentDigest([root], { webDependencyCache, io });
  const stable = read(); assert.ok(stable);
  directories.add(`${root}/.tmp`);
  assert.equal(read(), stable, 'empty tool cache container adds no installed dependency');
  files.set(`${root}/.tmp/tsconfig.app.tsbuildinfo`, 'compile cache v1');
  files.set(`${root}/.tmp/tsconfig.node.tsbuildinfo`, 'compile cache v1');
  assert.equal(read(), stable);
  const strict = read(false);
  files.set(`${root}/.tmp/tsconfig.app.tsbuildinfo`, 'compile cache v2');
  assert.equal(read(), stable);
  assert.notEqual(read(false), strict, 'backend and ordinary content inventories still bind these bytes');
  files.delete(`${root}/.tmp/tsconfig.app.tsbuildinfo`); files.delete(`${root}/.tmp/tsconfig.node.tsbuildinfo`);
  assert.equal(read(), stable);
  files.set(`${root}/.tmp/unknown.bin`, 'unrecognized bytes');
  const unknown = read(); assert.notEqual(unknown, stable);
  files.set(`${root}/.tmp/unknown.bin`, 'changed unrecognized bytes');
  assert.notEqual(read(), unknown);
  files.delete(`${root}/.tmp/unknown.bin`);
  directories.add(`${root}/.tmp/tsconfig.app.tsbuildinfo`);
  files.set(`${root}/.tmp/tsconfig.app.tsbuildinfo/module.js`, 'unknown directory content');
  assert.notEqual(read(), stable, 'a directory using an allowed filename remains owned content');
  files.delete(`${root}/.tmp/tsconfig.app.tsbuildinfo/module.js`); directories.delete(`${root}/.tmp/tsconfig.app.tsbuildinfo`);
  directories.add(`${root}/.vite-temp`);
  assert.equal(read(), stable, 'an empty Vite config container adds no installed dependency');
  files.set(`${root}/.vite-temp/unknown.mjs`, 'unrecognized Vite directory content');
  assert.notEqual(read(), stable, 'nonempty Vite directory content remains in the dependency identity');
  files.delete(`${root}/.vite-temp/unknown.mjs`);
  assert.equal(read(), stable);
  files.set(`${root}/typescript/index.js`, 'changed real module');
  assert.notEqual(read(), stable);
});
