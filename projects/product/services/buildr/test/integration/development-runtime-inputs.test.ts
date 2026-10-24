import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { isDevelopmentRuntimeInput, readDevelopmentRuntimeIdentity } from '../../src/modules/installation/infrastructure/development-runtime-inputs.ts';
import { developmentInstanceMatchesInstallation } from '../../src/modules/installation/infrastructure/current-product-identity.ts';
import { readCurrentInstallationOrigin } from '../../src/modules/installation/infrastructure/installation-origin.ts';

const service = 'projects/product/services/buildr';
const frontend = 'projects/product/services/buildr-web';
const agent = 'projects/product/services/buildr-agent';
function fixture(t: any) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-runtime-inputs-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (name: string, value: string) => { const file = path.join(root, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, value); };
  const git = (...args: string[]) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  write(`${service}/package.json`, '{"name":"@buildr-ai/buildr","version":"1.2.3"}\n');
  write(`${service}/src/index.ts`, 'export const version = 1;\n');
  write('.gitignore', 'node_modules/\nweb-dist/\nbuild/\n');
  git('init', '-q'); git('config', 'user.name', 'Buildr Fixture'); git('config', 'user.email', 'fixture@example.invalid');
  const commit = () => { git('add', '.'); git('commit', '--allow-empty', '-qm', 'fixture change'); };
  commit();
  const product = path.join(root, service);
  const identity = () => readDevelopmentRuntimeIdentity(product, root);
  return { root, product, write, git, commit, identity };
}

test('documentation, test and independent plugin commits preserve running development identity', t => {
  const f = fixture(t);
  const initial = readCurrentInstallationOrigin(f.product);
  const running = { ...initial, installationIdentity: initial.ownershipIdentity };
  for (const name of ['README.md', `${agent}/README.md`, `${agent}/test/core.test.ts`, `${service}/docs/start.md`, `${service}/tools/verification/package-check/bootstrap.yml`, `${service}/test/example.test.ts`, `${frontend}/test/example.test.ts`, 'projects/product/services/dsh-plugin/plugin/bridge.ts']) {
    f.write(name, 'changed\n'); f.commit();
    const current = readCurrentInstallationOrigin(f.product);
    assert.notEqual(current.sourceCommit, initial.sourceCommit);
    assert.notEqual(current.ownershipIdentity, initial.ownershipIdentity, 'precise origin remains truthful');
    assert.equal(current.developmentRuntimeIdentity, initial.developmentRuntimeIdentity);
    assert.equal(developmentInstanceMatchesInstallation(current, running), true, name);
    assert.equal(isDevelopmentRuntimeInput(name), false, name);
  }
});

for (const name of [`${service}/src/index.ts`, `${agent}/src/index.ts`, `${agent}/package-lock.json`, `${agent}/build/index.js`, `${service}/node_modules/@buildr-ai/buildr-agent/build/index.js`, `${service}/node_modules/@buildr-ai/buildr-agent/package.json`, `${service}/package-lock.json`, `${frontend}/src/App.tsx`, `${frontend}/vite.config.ts`, `${frontend}/package-lock.json`, `${service}/tools/development/run-development-cli`, `${service}/tools/development/resolve-development-node`, 'projects/product/.node-version', `${service}/tools/codegen/contracts/task-dto.ts`, `${service}/web-dist/index.html`]) {
  test(`runtime input ${name} changes identity before a commit`, t => {
    const f = fixture(t), initial = f.identity();
    assert.match(initial!, /^sha256-[a-f0-9]{64}$/);
    const commit = f.git('rev-parse', 'HEAD');
    f.write(name, 'updated runtime\n');
    assert.equal(isDevelopmentRuntimeInput(name), true);
    assert.notEqual(f.identity(), initial);
    assert.equal(f.git('rev-parse', 'HEAD'), commit);
    const updated = f.identity();
    f.commit();
    assert.equal(f.identity(), updated, 'committing the same bytes does not change runtime identity');
  });
}

test('deleted runtime input and another source checkout cannot match', t => {
  const f = fixture(t), other = fixture(t), initial = f.identity();
  assert.notEqual(other.identity(), initial, 'canonical source roots stay independent');
  fs.unlinkSync(path.join(f.product, 'src/index.ts'));
  assert.notEqual(f.identity(), initial);
});

test('content proof matches independently of commit while legacy receipts keep exact matching', t => {
  const f = fixture(t), origin = readCurrentInstallationOrigin(f.product);
  const running = { ...origin, installationIdentity: origin.ownershipIdentity };
  assert.equal(developmentInstanceMatchesInstallation(origin, { ...running, sourceCommit: 'a'.repeat(40), installationIdentity: 'sha256-' + 'b'.repeat(64) }), true);
  assert.equal(developmentInstanceMatchesInstallation(origin, { ...running, sourceRoot: '/other/source' }), false);
  assert.equal(developmentInstanceMatchesInstallation(origin, { ...running, developmentRuntimeIdentity: 'sha256-' + 'c'.repeat(64) }), false);
  assert.equal(developmentInstanceMatchesInstallation(origin, { ...running, developmentRuntimeIdentity: null }), null);
  const legacy = { ...running }; delete legacy.developmentRuntimeIdentity;
  assert.equal(developmentInstanceMatchesInstallation(origin, legacy), true);
  assert.equal(developmentInstanceMatchesInstallation(origin, { ...legacy, sourceCommit: 'a'.repeat(40) }), false);
  assert.equal(developmentInstanceMatchesInstallation({ ...origin, developmentRuntimeIdentity: null }, legacy), null);
});
