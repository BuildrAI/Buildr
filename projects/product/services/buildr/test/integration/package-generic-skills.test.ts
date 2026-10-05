import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import YAML from 'yaml';
import { createRuntime } from '../helpers/runtime-harness.ts';
import { resolveSkills } from '../../src/modules/agent-assets/infrastructure/runtime/skills/sources.ts';
import { assembleRuntimeProjection } from '../../src/modules/agent-assets/infrastructure/runtime/projection.ts';
import { reconcileRuntimePlan } from '../../src/modules/agent-assets/infrastructure/runtime/runtime-reconciler.ts';
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

test('任务技能的自然意图描述从包同步到发现入口，升级不修改已有任务', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-task-discovery-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  t.mock.method(console, 'log', () => {});
  const runtime = createRuntime();
  runtime.initBuildr(['--source-only', '--target', root, '--name', 'task-discovery', '--profile', 'personal']);
  const existing = runtime.createTask(root, { taskId: 'existing-fix', title: '继续修复', intent: '保留已开始的目标', projects: [], services: [], changes: [] });
  const sources = new Map<string, string>();
  const receiptFile = path.join(root, '.buildr/builtin-receipts.json');
  const receipts = JSON.parse(fs.readFileSync(receiptFile, 'utf8'));
  const digest = (value: string) => `sha256-${crypto.createHash('sha256').update(value).digest('hex')}`;
  for (const id of ['task-manager', 'task-triage']) {
    const entry = resolveSkills(root, null, { runtime: 'codex' }).find((skill: { id: string }) => skill.id === id);
    assert.ok(entry);
    sources.set(id, entry.sourceFile);
    // Simulate an installed older builtin, rather than checking only product source text.
    fs.writeFileSync(entry.sourceFile, fs.readFileSync(entry.sourceFile, 'utf8').replace(/^description:.*$/m, 'description: 旧任务管理入口'));
    // The receipt must describe that old installed version; a user override must be preserved.
    const receipt = receipts.builtins.find((item: any) => item.type === 'skill' && item.id === id);
    receipt.files.find((item: any) => item.path === 'SKILL.md').integrity = digest(fs.readFileSync(entry.sourceFile, 'utf8'));
    receipt.integrity = digest(JSON.stringify(receipt.files));
  }
  fs.writeFileSync(receiptFile, JSON.stringify(receipts));
  runtime.syncPackageBuiltins(root);
  for (const runtimeId of ['codex', 'dsh']) {
    const { plan } = assembleRuntimeProjection({ repoRoot: root, runtimeId, selection: { productSkill: true, workspaceSkills: true } });
    reconcileRuntimePlan(plan);
    for (const [id, sourceFile] of sources) {
      const source = fs.readFileSync(sourceFile, 'utf8');
      const projected = fs.readFileSync(path.join(root, '.agents/skills', id, 'SKILL.md'), 'utf8');
      const frontmatter = (text: string) => YAML.parse(text.split('---')[1]);
      assert.deepEqual(frontmatter(projected), frontmatter(source));
      for (const intent of ['授权', '修复', '优化', '继续', '任务']) {
        assert.ok(frontmatter(projected).description.includes(intent), `${runtimeId}/${id}: missing discovery intent ${intent}`);
      }
      assert.doesNotMatch(projected, /旧任务管理入口/);
    }
    const consumer = fs.readFileSync(path.join(root, '.agents/skills/task-triage/SKILL.md'), 'utf8');
    assert.match(consumer, /buildr\.task-record@4.*mode `optional`/);
    assert.match(consumer, /provider: `task-manager`/);
    assert.equal(runtime.inspectTask(root, 'existing-fix').recordDigest, existing.recordDigest);
    assert.deepEqual(runtime.queryTasks(root, { status: 'all' }).tasks.map((item: any) => item.record.taskId), ['existing-fix']);
  }
});
