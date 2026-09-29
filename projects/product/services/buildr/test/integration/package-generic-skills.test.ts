import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import YAML from 'yaml';
import { createRuntime } from '../helpers/runtime-harness.ts';
import { resolveSkills } from '../../src/modules/agent-assets/infrastructure/runtime/skills/sources.ts';
import { validatePackageSkillPublications } from '../../tools/verification/package-check/static-validation.ts';

const legacyRuntimes = ['claude-code', 'codex', 'cursor', 'qoder', 'trae', 'trae-work', 'workbuddy'];

test('通用包发布校验不因省略 runtimes 跳过 Codex 可选元数据，其他品牌不解释该文件', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-package-publication-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const skill = { id: 'demo' };
  assert.deepEqual(validatePackageSkillPublications(skill, root), []);
  fs.mkdirSync(path.join(root, 'agents'));
  const metadata = path.join(root, 'agents/openai.yaml');
  fs.writeFileSync(metadata, 'interface:\n  display_name: Demo\n');
  assert.match(validatePackageSkillPublications(skill, root).join('\n'), /short_description must be a non-empty string/);
  assert.match(validatePackageSkillPublications({ ...skill, runtimes: ['codex'] }, root).join('\n'), /default_prompt must be a non-empty string/);
  for (const runtimes of [['dsh'], ['new-host'], ['claude-code'], ['agents-standard']]) {
    assert.deepEqual(validatePackageSkillPublications({ ...skill, runtimes }, root), []);
  }
  fs.writeFileSync(metadata, 'interface:\n  display_name: Demo\n  short_description: 测试\n  default_prompt: 执行测试\n');
  assert.deepEqual(validatePackageSkillPublications(skill, root), []);
});

test('同步内置来源升级旧产品完整列表，保留用户范围、绑定与卸载状态并保持幂等', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-package-generic-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  t.mock.method(console, 'log', () => {});
  const runtime = createRuntime();
  runtime.initBuildr(['--source-only', '--target', root, '--name', 'generic-skills', '--profile', 'personal']);
  for (const runtimeId of [null, 'codex', 'dsh', 'new-host', 'claude-code']) {
    const resolved = resolveSkills(root, null, { runtime: runtimeId });
    for (const id of ['capability-adaptation', 'frontend-development', 'ui-prototype', 'ux-design-laws']) {
      assert.ok(resolved.some((entry: { id: string }) => entry.id === id), `${runtimeId}: ${id}`);
    }
  }
  const file = path.join(root, 'skills/manifest.yml');
  const manifest = YAML.parse(fs.readFileSync(file, 'utf8'));
  const skill = (id: string) => manifest.skills.find((entry: { id: string }) => entry.id === id);
  skill('task-manager').runtimes = [...legacyRuntimes];
  skill('task-review').runtimes = ['codex'];
  skill('openspec-apply-change').runtimes = [...legacyRuntimes];
  skill('openspec-explore').runtimes = ['dsh'];
  skill('code-map').runtimes = ['dsh'];
  skill('code-map').state = 'uninstalled';
  skill('code-map').enabled = false;
  manifest.skills.push({ id: 'local-reader', path: 'local-reader', enabled: true, assetIdentity: 'test:local-reader', sourceIdentity: 'workspace:local-reader', runtimes: [...legacyRuntimes] });
  const bindings = structuredClone(manifest.bindings);
  fs.writeFileSync(file, YAML.stringify(manifest));

  const before = fs.readFileSync(file, 'utf8');
  runtime.syncPackageBuiltins(root, { checkOnly: true });
  assert.equal(fs.readFileSync(file, 'utf8'), before, '检查模式不得改写旧声明');
  runtime.syncPackageBuiltins(root);
  assert.deepEqual(runtime.syncPackageComponents(root).errors, []);
  const updated = YAML.parse(fs.readFileSync(file, 'utf8'));
  const updatedSkill = (id: string) => updated.skills.find((entry: { id: string }) => entry.id === id);
  assert.equal(Object.hasOwn(updatedSkill('task-manager'), 'runtimes'), false);
  assert.deepEqual(updatedSkill('task-review').runtimes, ['codex']);
  assert.equal(Object.hasOwn(updatedSkill('openspec-apply-change'), 'runtimes'), false);
  assert.deepEqual(updatedSkill('openspec-explore').runtimes, ['dsh']);
  assert.deepEqual(updatedSkill('code-map').runtimes, ['dsh']);
  assert.equal(updatedSkill('code-map').state, 'uninstalled');
  assert.equal(updatedSkill('code-map').enabled, false);
  assert.deepEqual(updatedSkill('local-reader').runtimes, legacyRuntimes);
  assert.deepEqual(updated.bindings, bindings);
  const after = fs.readFileSync(file, 'utf8');
  runtime.syncPackageBuiltins(root);
  assert.deepEqual(runtime.syncPackageComponents(root).errors, []);
  assert.equal(fs.readFileSync(file, 'utf8'), after);
});
