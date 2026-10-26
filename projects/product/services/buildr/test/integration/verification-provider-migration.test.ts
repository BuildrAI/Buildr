import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import YAML from 'yaml';
import { createRuntime } from '../helpers/runtime-harness.ts';
import { resolveSkills } from '../../src/modules/agent-assets/infrastructure/runtime/skills/sources.ts';

const capability = 'buildr.task-verification';
const previousId = 'task-verification';
const nextId = 'project-verification';
const digest = (bytes: string | Buffer) => `sha256-${crypto.createHash('sha256').update(bytes).digest('hex')}`;

function fixture(t: TestContext, options: { shared?: boolean; modified?: boolean; customized?: boolean; customBinding?: boolean } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-verification-provider-'));
  const root = path.join(directory, 'workspace');
  fs.mkdirSync(root);
  const environment = { BUILDR_PRODUCT_DATA_DIR: process.env.BUILDR_PRODUCT_DATA_DIR, BUILDR_APP_DATA_DIR: process.env.BUILDR_APP_DATA_DIR };
  process.env.BUILDR_PRODUCT_DATA_DIR = path.join(directory, 'product-data');
  process.env.BUILDR_APP_DATA_DIR = path.join(directory, 'app-data');
  t.after(() => {
    for (const [key, value] of Object.entries(environment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fs.rmSync(directory, { recursive: true, force: true });
  });
  t.mock.method(console, 'log', () => {});
  const runtime = createRuntime();
  runtime.initBuildr(['--source-only', '--target', root, '--name', 'provider-migration', '--profile', 'personal']);
  const manifestFile = path.join(root, 'skills/manifest.yml');
  const receiptFile = path.join(root, '.buildr/builtin-receipts.json');
  const manifest = YAML.parse(fs.readFileSync(manifestFile, 'utf8'));
  const entry = manifest.skills.find((item: any) => item.id === nextId);
  const installed = resolveSkills(root, null, { runtime: 'codex' }).find((item: any) => item.id === nextId);
  assert.ok(installed);
  const predecessorDirectory = path.join(root, 'skills/buildr', previousId);
  const olderSource = options.shared ? path.join(directory, 'old-package-source') : predecessorDirectory;
  fs.cpSync(installed.sourceDir, olderSource, { recursive: true });
  const source = path.join(olderSource, 'SKILL.md');
  fs.writeFileSync(source, fs.readFileSync(source, 'utf8').replace(/^name: project-verification$/m, 'name: task-verification'));
  const inventory: string[] = [];
  const collect = (current: string) => {
    for (const item of fs.readdirSync(current, { withFileTypes: true })) {
      const target = path.join(current, item.name);
      if (item.isDirectory()) collect(target);
      else inventory.push(target);
    }
  };
  collect(olderSource);
  const files = inventory.sort().map(file => ({ path: path.relative(olderSource, file).replaceAll('\\', '/'), integrity: digest(fs.readFileSync(file)) }));
  Object.assign(entry, {
    id: previousId, assetIdentity: `buildr:skill:${previousId}`, sourceIdentity: `package:skills/buildr/${previousId}`,
    path: `buildr/${previousId}`, runtimePath: previousId,
  });
  if (options.shared) entry.resource = `resources/workspace/skills/buildr/${previousId}`;
  else delete entry.resource;
  if (options.customized) {
    entry.source = 'workspace';
    entry.customizedFrom = previousId;
    delete entry.resource;
  }
  const binding = manifest.bindings.find((item: any) => item.capability === capability && item.version === 4);
  assert.ok(binding);
  binding.provider = options.customBinding ? 'local-verifier' : previousId;
  if (options.customBinding) {
    const customDirectory = path.join(root, 'skills/local-verifier');
    fs.mkdirSync(customDirectory);
    fs.writeFileSync(path.join(customDirectory, 'SKILL.md'), '---\nname: local-verifier\ndescription: 用户自有验证方法\n---\n');
    manifest.skills.push({ id: 'local-verifier', assetIdentity: 'test:local-verifier', sourceIdentity: 'workspace:skills/local-verifier', source: 'workspace', path: 'local-verifier', enabled: true, provides: [{ capability, version: 4 }] });
  }
  fs.writeFileSync(manifestFile, YAML.stringify(manifest));
  const receipts = JSON.parse(fs.readFileSync(receiptFile, 'utf8'));
  const oldReceipt = receipts.builtins.find((item: any) => item.type === 'skill' && item.id === nextId);
  assert.ok(oldReceipt);
  Object.assign(oldReceipt, { id: previousId, target: `skills/buildr/${previousId}`, files, integrity: digest(JSON.stringify(files)) });
  fs.writeFileSync(receiptFile, `${JSON.stringify(receipts)}\n`);
  if (options.modified) fs.appendFileSync(source, '\n用户保留的修改。\n');
  return { runtime, root, manifestFile, receiptFile, source, predecessorDirectory,
    read: () => YAML.parse(fs.readFileSync(manifestFile, 'utf8')) };
}

test('受管旧验证提供者成功迁移时同步原能力绑定，检查模式零写入并保持幂等', t => {
  const f = fixture(t);
  const before = [fs.readFileSync(f.manifestFile, 'utf8'), fs.readFileSync(f.receiptFile, 'utf8'), fs.readFileSync(f.source, 'utf8')];
  f.runtime.syncPackageBuiltins(f.root, { checkOnly: true });
  assert.deepEqual([fs.readFileSync(f.manifestFile, 'utf8'), fs.readFileSync(f.receiptFile, 'utf8'), fs.readFileSync(f.source, 'utf8')], before);
  f.runtime.syncPackageBuiltins(f.root);
  const updated = f.read();
  assert.equal(updated.skills.some((item: any) => item.id === previousId), false);
  assert.ok(updated.skills.some((item: any) => item.id === nextId));
  assert.equal(updated.bindings.find((item: any) => item.capability === capability && item.version === 4).provider, nextId);
  assert.equal(fs.existsSync(f.predecessorDirectory), false);
  assert.ok(resolveSkills(f.root, null, { runtime: 'codex' }).some((item: any) => item.id === nextId));
  const after = fs.readFileSync(f.manifestFile, 'utf8');
  f.runtime.syncPackageBuiltins(f.root);
  assert.equal(fs.readFileSync(f.manifestFile, 'utf8'), after);
});

test('旧共享资源引用在本地无副本时按受管身份迁移，不要求已退役的共享文件', t => {
  const f = fixture(t, { shared: true });
  assert.equal(fs.existsSync(f.predecessorDirectory), false);
  const oldBytes = fs.readFileSync(f.source, 'utf8');
  f.runtime.syncPackageBuiltins(f.root);
  const updated = f.read();
  assert.equal(updated.skills.find((item: any) => item.id === nextId).resource, 'resources/workspace/skills/buildr/project-verification');
  assert.equal(updated.bindings.find((item: any) => item.capability === capability && item.version === 4).provider, nextId);
  assert.equal(fs.existsSync(f.predecessorDirectory), false);
  assert.equal(fs.readFileSync(f.source, 'utf8'), oldBytes, '不得写入或删除其他共享来源');
});

test('用户选择的自有提供者绑定不会因为同能力同版本被官方重命名覆盖', t => {
  const f = fixture(t, { customBinding: true });
  const custom = path.join(f.root, 'skills/local-verifier/SKILL.md');
  const bytes = fs.readFileSync(custom, 'utf8');
  f.runtime.syncPackageBuiltins(f.root);
  assert.equal(f.read().bindings.find((item: any) => item.capability === capability && item.version === 4).provider, 'local-verifier');
  assert.equal(fs.readFileSync(custom, 'utf8'), bytes);
});

for (const [name, options] of [['修改过的旧官方内容', { modified: true }], ['用户自有旧提供者', { customized: true }]] as const) {
  test(`${name}保持原文件、原身份及绑定，不能假装替换成功`, t => {
    const f = fixture(t, options);
    const bytes = fs.readFileSync(f.source, 'utf8');
    f.runtime.syncPackageBuiltins(f.root);
    const current = f.read();
    assert.equal(current.bindings.find((item: any) => item.capability === capability && item.version === 4).provider, previousId);
    assert.ok(current.skills.some((item: any) => item.id === previousId));
    assert.equal(current.skills.some((item: any) => item.id === nextId), false);
    assert.equal(fs.readFileSync(f.source, 'utf8'), bytes);
  });
}

for (const modified of [false, true]) {
  test(`退役声明接入技能保留用户数据：${modified ? '本地修改保留' : '共享引用安全移除'}`, t => {
    const f = fixture(t, { shared: true });
    const oldId = 'declaration-intake';
    const target = `skills/buildr/${oldId}`;
    const bytes = '---\nname: declaration-intake\ndescription: 旧声明方法\n---\n';
    const manifest = f.read();
    manifest.skills.push({ id: oldId, assetIdentity: `buildr:skill:${oldId}`, sourceIdentity: `package:${target}`,
      source: 'buildr', path: `buildr/${oldId}`, runtimePath: oldId, state: 'installed', enabled: true,
      ...(!modified ? { resource: `resources/workspace/${target}` } : {}) });
    fs.writeFileSync(f.manifestFile, YAML.stringify(manifest));
    const files = [{ path: 'SKILL.md', integrity: digest(bytes) }];
    const receipts = JSON.parse(fs.readFileSync(f.receiptFile, 'utf8'));
    receipts.builtins.push({ type: 'skill', id: oldId, target, files, integrity: digest(JSON.stringify(files)) });
    fs.writeFileSync(f.receiptFile, `${JSON.stringify(receipts)}\n`);
    const local = path.join(f.root, target, 'SKILL.md');
    if (modified) { fs.mkdirSync(path.dirname(local), { recursive: true }); fs.writeFileSync(local, bytes + '用户必须保留的说明。\n'); }
    f.runtime.syncPackageBuiltins(f.root, { checkOnly: true });
    assert.ok(f.read().skills.some((item: any) => item.id === oldId), '检查模式不退役元数据');
    f.runtime.syncPackageBuiltins(f.root);
    assert.equal(f.read().skills.some((item: any) => item.id === oldId), modified);
    assert.equal(JSON.parse(fs.readFileSync(f.receiptFile, 'utf8')).builtins.some((item: any) => item.id === oldId), modified);
    if (modified) assert.equal(fs.readFileSync(local, 'utf8'), bytes + '用户必须保留的说明。\n');
    else assert.equal(fs.existsSync(path.dirname(local)), false);
  });
}
