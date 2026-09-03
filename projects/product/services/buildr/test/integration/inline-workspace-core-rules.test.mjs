import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import YAML from 'yaml';
import { registerWorkspaceInfrastructure } from '../../src/infrastructure/filesystem/index.ts';
import { buildApplicationPayload } from '../../tools/release/application-payload.mjs';
import { createReleaseArtifact } from '../../tools/release/release-artifact.mjs';
import { createGeneratedReleaseInputs } from '../helpers/generated-release-inputs.mjs';

const service = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = fs.readFileSync(path.join(service, 'resources/workspace/AGENTS.md'), 'utf8');
const block = source.match(/<!-- buildr:required begin -->[\s\S]*?<!-- buildr:required end -->/)[0];
const principles = ['以目标驱动协作', '以真实工作现场为中心', '提供确定性能力，开放组合方式', '多种入口共享同一当前事实', '约束局部化，失败影响隔离', '以可信完成目标的效率衡量性能'];
const hash = (bytes) => `sha256-${crypto.createHash('sha256').update(bytes).digest('hex')}`;

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-inline-core-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const workspace = path.join(root, 'workspace');
  fs.mkdirSync(workspace);
  const env = { ...process.env, BUILDR_APP_DATA_DIR: path.join(root, 'app-data'), BUILDR_PRODUCT_DATA_DIR: path.join(root, 'product-data') };
  const run = (args, cli = path.join(service, 'bin/buildr.mjs')) => {
    const result = spawnSync(process.execPath, [cli, ...args], { cwd: service, env, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 60000 });
    assert.equal(result.status, 0, `${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
    return result.stdout;
  };
  return { root, workspace, run, env };
}

function assertInline(workspace) {
  const actual = fs.readFileSync(path.join(workspace, 'AGENTS.md'), 'utf8');
  assert.ok(actual.includes(block));
  for (const principle of principles) assert.ok(actual.includes(principle), principle);
  return actual;
}

function legacy(workspace, { receipt = true, modified = false, foreign = false, missing = false } = {}) {
  const target = 'rules/buildr/core.md';
  const old = '# Legacy official core\n';
  const rulesPath = path.join(workspace, 'rules/manifest.yml');
  const manifest = YAML.parse(fs.readFileSync(rulesPath, 'utf8'));
  manifest.rules.push({ id: 'buildr-core', source: foreign ? 'workspace' : 'buildr', path: target, description: 'legacy required core', enabled: true, required: true, state: 'installed' });
  fs.writeFileSync(rulesPath, YAML.stringify(manifest));
  fs.mkdirSync(path.join(workspace, 'rules/buildr'), { recursive: true });
  if (!missing) fs.writeFileSync(path.join(workspace, target), modified ? old + 'user changes\n' : old);
  if (receipt) {
    const file = path.join(workspace, '.buildr/builtin-receipts.json');
    const receipts = JSON.parse(fs.readFileSync(file, 'utf8'));
    const files = [{ path: 'core.md', integrity: hash(old) }];
    receipts.builtins.push({ type: 'rule', id: 'buildr-core', target, files, integrity: hash(JSON.stringify(files)) });
    fs.writeFileSync(file, JSON.stringify(receipts));
  }
  fs.writeFileSync(path.join(workspace, 'AGENTS.md'), 'USER PREFIX\n<!-- buildr:required begin -->\n请读取 rules/buildr/core.md\n<!-- buildr:required end -->\nUSER SUFFIX');
}

test('managed block upgrades, detects drift, repairs markers and preserves outside bytes', (t) => {
  const { workspace } = fixture(t);
  const runtime = {};
  registerWorkspaceInfrastructure(runtime);
  const start = '<!-- buildr:required begin -->';
  const end = '<!-- buildr:required end -->';
  for (const [before, after] of [
    ['  user\n\n', block + '\n  user\n\n'],
    [`pre\n${start}old${end}\npost`, `pre\n${block}\npost`],
    [`pre${start}one${end}mid${start}two${end}post`, `pre${block}midpost`],
    [`pre${start}unknown\npost`, block + '\npreunknown\npost'],
    [`pre${end}post`, block + '\nprepost'],
  ]) {
    fs.writeFileSync(path.join(workspace, 'AGENTS.md'), before);
    assert.equal(runtime.rootRequiredBlockStatus(workspace).valid, false);
    assert.equal(runtime.ensureRootRequiredBlock(workspace), true);
    assert.equal(fs.readFileSync(path.join(workspace, 'AGENTS.md'), 'utf8'), after);
    assert.equal(runtime.rootRequiredBlockStatus(workspace).valid, true);
    assert.equal(runtime.ensureRootRequiredBlock(workspace), false);
  }
  fs.writeFileSync(path.join(workspace, 'AGENTS.md'), block.replace(principles[0], 'drift'));
  assert.equal(runtime.rootRequiredBlockStatus(workspace).valid, false);
});

test('new workspace and receipt-owned upgrade deliver all principles without a Core file', (t) => {
  const { workspace, run } = fixture(t);
  const readRules = () => YAML.parse(fs.readFileSync(path.join(workspace, 'rules/manifest.yml'), 'utf8'));
  run(['init', '--target', workspace, '--name', 'inline', '--profile', 'personal']);
  assertInline(workspace);
  assert.equal(fs.existsSync(path.join(workspace, 'rules/buildr/core.md')), false);
  legacy(workspace);
  fs.writeFileSync(path.join(workspace, 'rules/specialist.md'), '# Specialist\nOnly for relevant work.\n');
  run(['rules', 'add', 'specialist', '--description', 'specialist work', '--target', workspace]);
  run(['sync', 'codex', '--target', workspace]);
  assert.equal(assertInline(workspace), `USER PREFIX\n${block}\nUSER SUFFIX`);
  const disabled = readRules();
  disabled.rules.find((r) => r.id === 'specialist').enabled = false;
  fs.writeFileSync(path.join(workspace, 'rules/manifest.yml'), YAML.stringify(disabled));
  run(['sync', 'codex', '--target', workspace]);
  assert.equal(readRules().rules.find((r) => r.id === 'specialist').enabled, false);
  disabled.rules.find((r) => r.id === 'specialist').enabled = true;
  fs.writeFileSync(path.join(workspace, 'rules/manifest.yml'), YAML.stringify(disabled));
  assert.equal(fs.existsSync(path.join(workspace, 'rules/buildr/core.md')), false);
  assert.equal(readRules().rules.some((r) => r.id === 'buildr-core'), false);
  assert.ok(readRules().rules.some((r) => r.id === 'specialist'));
  assert.equal(JSON.parse(fs.readFileSync(path.join(workspace, '.buildr/builtin-receipts.json'), 'utf8')).builtins.some((r) => r.id === 'buildr-core'), false);
  run(['sync', 'codex', '--target', workspace]);
  assert.equal(assertInline(workspace), `USER PREFIX\n${block}\nUSER SUFFIX`);
  run(['rules', 'render', 'claude-code', '--target', workspace]);
  assert.ok(fs.readFileSync(path.join(workspace, 'CLAUDE.md'), 'utf8').includes('AGENTS.md'));
  run(['rules', 'remove', 'specialist', '--keep-file', '--target', workspace]);
  assert.equal(readRules().rules.some((r) => r.id === 'specialist'), false);
  assert.ok(fs.existsSync(path.join(workspace, 'rules/specialist.md')));
});

test('modified, unreceipted, foreign and symlink legacy files survive sync without global failure', async (t) => {
  for (const options of [{ modified: true }, { receipt: false }, { foreign: true }, { symlink: true }, { missing: true }, { unregistered: true, receipt: false }]) {
    await t.test(JSON.stringify(options), (t) => {
      const { root, workspace, run } = fixture(t);
      run(['init', '--target', workspace, '--name', 'preserve', '--profile', 'personal']);
      legacy(workspace, options);
      if (options.unregistered) {
        const rulesPath = path.join(workspace, 'rules/manifest.yml');
        const manifest = YAML.parse(fs.readFileSync(rulesPath, 'utf8'));
        manifest.rules = manifest.rules.filter((r) => r.id !== 'buildr-core');
        fs.writeFileSync(rulesPath, YAML.stringify(manifest));
      }
      const file = path.join(workspace, 'rules/buildr/core.md');
      if (options.symlink) {
        fs.unlinkSync(file);
        fs.writeFileSync(path.join(root, 'outside.md'), 'outside user content');
        fs.symlinkSync(path.join(root, 'outside.md'), file);
      }
      const before = options.missing ? null : fs.readFileSync(file, 'utf8');
      run(['sync', 'codex', '--target', workspace]);
      assertInline(workspace);
      const entry = YAML.parse(fs.readFileSync(path.join(workspace, 'rules/manifest.yml'), 'utf8')).rules.find((r) => r.id === 'buildr-core');
      if (options.missing) {
        assert.equal(entry, undefined);
        return;
      }
      assert.equal(fs.readFileSync(file, 'utf8'), before);
      if (options.symlink) assert.equal(fs.lstatSync(file).isSymbolicLink(), true);
      if (options.unregistered) assert.equal(entry, undefined);
      else if (options.foreign) assert.equal(entry.source, 'workspace');
      else {
        assert.equal(entry.required, false);
        assert.equal(entry.enabled, false);
      }
      const doctor = JSON.parse(run(['doctor', '--agent', 'codex', '--target', workspace, '--json']));
      assert.ok(doctor.findings.some((f) => f.code === 'rules.legacy_core'));
      assert.equal(doctor.findings.some((f) => f.code === 'rules.buildr_unregistered' && f.path === 'rules/buildr/core.md'), false);
      assert.equal(doctor.findings.some((f) => f.code === 'rules.required_block_invalid'), false);
      run(['sync', 'codex', '--target', workspace]);
      assert.equal(fs.readFileSync(file, 'utf8'), before);
    });
  }
});

test('packed artifact contains the sole inline source and initializes and upgrades workspaces', async (t) => {
  const { root, workspace, run } = fixture(t);
  // Exercise the actual payload/package builder, not a raw checkout npm pack.
  const generated = createGeneratedReleaseInputs(path.join(root, 'generated'), 'b'.repeat(40));
  const payload = await buildApplicationPayload(path.join(root, 'payload'), 'b'.repeat(40), { generatedArtifactManifest: generated.manifest, webDistRoot: generated.webDistRoot });
  const artifact = createReleaseArtifact(payload.root, path.join(root, 'artifact'), { testContextRoot: generated.testContextRoot });
  assert.equal(payload.manifest.files.some((f) => f.path.endsWith('/rules/buildr/core.md')), false);
  assert.equal(payload.manifest.files.some((f) => f.path.endsWith('/workspace/AGENTS.md')), true);
  const extracted = spawnSync('tar', ['-xzf', artifact.tarball, '-C', root], { encoding: 'utf8', timeout: 60000 });
  assert.equal(extracted.status, 0, extracted.stderr);
  assert.equal(fs.readFileSync(path.join(root, 'package/payload/product/resources/workspace/AGENTS.md'), 'utf8'), source);
  const cli = path.join(root, 'package/bin/buildr.mjs');
  run(['init', '--target', workspace, '--name', 'packed', '--profile', 'personal'], cli);
  assertInline(workspace);
  legacy(workspace);
  run(['sync', 'codex', '--target', workspace], cli);
  assert.equal(assertInline(workspace), `USER PREFIX\n${block}\nUSER SUFFIX`);
  assert.equal(fs.existsSync(path.join(workspace, 'rules/buildr/core.md')), false);
});

test('failed migration restores the old entry, registration, receipt and file together', (t) => {
  const { workspace, run, env } = fixture(t);
  run(['init', '--target', workspace, '--name', 'rollback', '--profile', 'personal']);
  legacy(workspace);
  const paths = ['AGENTS.md', 'rules/manifest.yml', 'rules/buildr/core.md', '.buildr/builtin-receipts.json'];
  const before = paths.map((p) => fs.readFileSync(path.join(workspace, p)));
  for (const failAfter of ['1', '2', '3', '4']) {
    const result = spawnSync(process.execPath, [path.join(service, 'bin/buildr.mjs'), 'sync', 'codex', '--target', workspace], {
      cwd: service, env: { ...env, BUILDR_FAULT_AFTER_MUTATION_WRITE: failAfter }, encoding: 'utf8', timeout: 60000,
    });
    assert.notEqual(result.status, 0, 'fault must interrupt migration');
    for (const [i, p] of paths.entries()) assert.deepEqual(fs.readFileSync(path.join(workspace, p)), before[i], p);
  }
  run(['sync', 'codex', '--target', workspace]);
  assertInline(workspace);
  assert.equal(fs.existsSync(path.join(workspace, 'rules/buildr/core.md')), false);
});
