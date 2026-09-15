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

test('内置知识消费者均解析 v3；缺少术语能力只降级相关专项', (t) => {
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
    assert.equal(dependency.version, 3, id);
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
  assert.deepEqual(updated.contracts.filter((item: any) => item.id === capability).map((item: any) => item.version), [3]);
  assert.equal(updated.skills.find((item: any) => item.id === 'local-reader').requires[0].version, 2);
  for (const version of [1, 2]) assert.equal(fs.existsSync(path.join(root, `skills/contracts/buildr/current-knowledge-maintenance/v${version}.md`)), false);
  const graph = resolveSkillCapabilityGraph(root, null, { runtime: 'codex' });
  assert.equal(graph.consumers.find((item: any) => item.consumer === 'local-reader').readiness, 'blocked');
  assert.equal(graph.consumers.find((item: any) => item.consumer === 'task-finish').readiness, 'ready');
});
