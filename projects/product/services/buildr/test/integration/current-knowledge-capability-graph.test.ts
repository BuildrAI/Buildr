import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import YAML from 'yaml';
import { createRuntime } from '../helpers/runtime-harness.ts';
import { resolveSkillCapabilityGraph } from '../../src/modules/agent-assets/persistence/capability-graph-repository.ts';

const serviceRoot = path.resolve(import.meta.dirname, '../..');
const capability = 'buildr.current-knowledge-maintenance';

function fixture(t: any) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-knowledge-graph-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  t.mock.method(console, 'log', () => {});
  const runtime = createRuntime();
  runtime.initBuildr(['--target', root, '--name', 'knowledge-graph', '--profile', 'personal']);
  return { root, runtime, file: path.join(root, 'skills/manifest.yml') };
}

test('内置知识消费者均解析 v4；缺少术语能力只降级相关专项', (t) => {
  const { root, file } = fixture(t);
  const manifest = YAML.parse(fs.readFileSync(file, 'utf8'));
  manifest.skills.find((item: any) => item.id === 'terminology-governance').state = 'uninstalled';
  fs.writeFileSync(file, YAML.stringify(manifest));
  const graph = resolveSkillCapabilityGraph(root, null, { runtime: 'codex' });
  const knowledge = graph.consumers.find((item: any) => item.consumer === 'current-knowledge-maintenance');
  assert.equal(knowledge.readiness, 'degraded');
  assert.equal(knowledge.dependencies[0].mode, 'optional');
  for (const id of ['task-triage', 'openspec-propose', 'openspec-update-change', 'openspec-apply-change']) {
    const consumer = graph.consumers.find((item: any) => item.consumer === id);
    const dependency = consumer.dependencies.find((item: any) => item.capability === capability);
    assert.equal(dependency.version, 4, id);
    assert.equal(dependency.readiness, 'ready', id);
    assert.equal(dependency.selectedProvider.id, 'current-knowledge-maintenance', id);
  }
});

test('升级移除可证明的旧默认约定，用户自有旧版本依赖不静默改绑', (t) => {
  const { root, runtime, file } = fixture(t);
  const manifest = YAML.parse(fs.readFileSync(file, 'utf8'));
  const packageManifest = YAML.parse(fs.readFileSync(path.join(serviceRoot, 'resources/manifest.yml'), 'utf8'));
  const replacement = packageManifest.capabilityContracts.find((item: any) => item.id === capability);
  for (const old of replacement.replaces) {
    const target = path.join(root, old.target);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, JSON.parse(fs.readFileSync(path.join(serviceRoot, `test/fixtures/legacy-current-knowledge-v${old.version}.json`), 'utf8')).content);
    manifest.contracts.push({ id: old.id, version: old.version, path: old.target.replace(/^skills\//, ''), description: old.description });
    manifest.bindings.push({ capability, version: old.version, provider: old.provider });
  }
  const ownDir = path.join(root, 'skills/local-reader');
  fs.mkdirSync(ownDir);
  fs.writeFileSync(path.join(ownDir, 'SKILL.md'), '---\nname: local-reader\ndescription: local fixture\n---\n\n读取已指定的知识结果。\n');
  manifest.skills.push({ id: 'local-reader', path: 'local-reader', enabled: true, assetIdentity: 'test:local-reader', sourceIdentity: 'workspace:local-reader', requires: [{ capability, version: 2, mode: 'required' }] });
  fs.writeFileSync(file, YAML.stringify(manifest));
  runtime.syncPackageBuiltins(root);
  const updated = YAML.parse(fs.readFileSync(file, 'utf8'));
  assert.deepEqual(updated.contracts.filter((item: any) => item.id === capability).map((item: any) => item.version), [3, 4]);
  assert.equal(updated.skills.find((item: any) => item.id === 'local-reader').requires[0].version, 2);
  for (const version of [1, 2]) assert.equal(fs.existsSync(path.join(root, `skills/contracts/buildr/current-knowledge-maintenance/v${version}.md`)), false);
  const graph = resolveSkillCapabilityGraph(root, null, { runtime: 'codex' });
  assert.equal(graph.consumers.find((item: any) => item.consumer === 'local-reader').readiness, 'blocked');
  assert.equal(graph.consumers.find((item: any) => item.consumer === 'task-finish').readiness, 'ready');
});

function addLocalSkill(root: string, manifest: any, id: string, declaration: any) {
  const directory = path.join(root, 'skills', id);
  fs.mkdirSync(directory);
  fs.writeFileSync(path.join(directory, 'SKILL.md'), `---\nname: ${id}\ndescription: local fixture\n---\n\n使用当前明确的协作能力。\n`);
  manifest.skills.push({ id, path: id, enabled: true, assetIdentity: `test:${id}`, sourceIdentity: `workspace:${id}`, ...declaration });
}

test('v3 内置提供者升级后不改绑用户旧依赖，缺口只影响真实旧消费者', (t) => {
  const { root, runtime, file } = fixture(t);
  const manifest = YAML.parse(fs.readFileSync(file, 'utf8'));
  const v3Path = path.join(root, 'skills/contracts/buildr/current-knowledge-maintenance/v3.md');
  const oldContract = fs.readFileSync(v3Path);
  const oldBinding = { capability, version: 3, provider: 'current-knowledge-maintenance' };
  manifest.bindings.push(oldBinding);
  const provider = manifest.skills.find((item: any) => item.id === 'current-knowledge-maintenance');
  provider.provides = [{ capability, version: 3 }];
  addLocalSkill(root, manifest, 'legacy-reader', { requires: [{ capability, version: 3, mode: 'required' }] });
  fs.writeFileSync(file, YAML.stringify(manifest));

  runtime.syncPackageBuiltins(root);
  const updated = YAML.parse(fs.readFileSync(file, 'utf8'));
  assert.deepEqual(fs.readFileSync(v3Path), oldContract);
  assert.deepEqual(updated.skills.find((item: any) => item.id === 'legacy-reader').requires, [{ capability, version: 3, mode: 'required' }]);
  assert.deepEqual(updated.bindings.find((item: any) => item.capability === capability && item.version === 3), oldBinding);
  assert.deepEqual(updated.skills.find((item: any) => item.id === 'current-knowledge-maintenance').provides, [{ capability, version: 4 }]);
  const graph = resolveSkillCapabilityGraph(root, null, { runtime: 'codex' });
  const legacy = graph.consumers.find((item: any) => item.consumer === 'legacy-reader');
  assert.equal(legacy.readiness, 'blocked');
  assert.equal(legacy.dependencies[0].contract.version, 3);
  for (const id of ['task-triage', 'openspec-propose', 'openspec-update-change', 'openspec-apply-change', 'task-finish']) {
    assert.equal(graph.consumers.find((item: any) => item.consumer === id).readiness, 'ready', id);
  }
});

test('用户自有 v3 提供者和绑定升级后仍能服务原依赖', (t) => {
  const { root, runtime, file } = fixture(t);
  const manifest = YAML.parse(fs.readFileSync(file, 'utf8'));
  addLocalSkill(root, manifest, 'local-v3-knowledge', { provides: [{ capability, version: 3 }] });
  addLocalSkill(root, manifest, 'local-v3-reader', { requires: [{ capability, version: 3, mode: 'required' }] });
  const oldBinding = { capability, version: 3, provider: 'local-v3-knowledge' };
  manifest.bindings.push(oldBinding);
  fs.writeFileSync(file, YAML.stringify(manifest));

  runtime.syncPackageBuiltins(root);
  const updated = YAML.parse(fs.readFileSync(file, 'utf8'));
  assert.deepEqual(updated.bindings.find((item: any) => item.capability === capability && item.version === 3), oldBinding);
  assert.deepEqual(updated.skills.find((item: any) => item.id === 'local-v3-knowledge').provides, [{ capability, version: 3 }]);
  const graph = resolveSkillCapabilityGraph(root, null, { runtime: 'codex' });
  const consumer = graph.consumers.find((item: any) => item.consumer === 'local-v3-reader');
  assert.equal(consumer.readiness, 'ready');
  assert.equal(consumer.dependencies[0].selectedProvider.id, 'local-v3-knowledge');
  assert.equal(consumer.dependencies[0].version, 3);
});
