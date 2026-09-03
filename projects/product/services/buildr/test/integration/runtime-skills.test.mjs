import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import {
  parseInstallClaudeCodeBuildrSkillArgs,
  parseRenderClaudeCodeArgs,
} from '../../src/agent-assets/infrastructure/runtime/skills/arguments.ts';
import { parseSkillsManifest } from '../../src/agent-assets/infrastructure/runtime/skills/manifests.ts';
import {
  normalizeRelativePath,
  resolveSkillScope,
} from '../../src/agent-assets/infrastructure/runtime/skills/primitives.ts';
import {
  applySkillRenderPlan,
  buildAgentInstallPlanContent,
  buildSkillRenderPlan,
  buildRuntimeSkillTarget,
  hasManagedSkillMarker,
} from '../../src/agent-assets/infrastructure/runtime/skills/render-plan.ts';
import { REQUIRED_RENDER_CAPABILITIES, RUNTIME_ADAPTERS, SUPPORTED_AGENT_IDS, createRuntimePlan, getRuntimeAdapter, reconcileRuntimePlan, skillDestinationRoot } from '../../src/agent-assets/infrastructure/runtime/adapter-contract.ts';
import { buildEffectiveSkillInventory, classifySkillCandidate } from '../../src/agent-assets/infrastructure/runtime/skills/inventory.ts';
import {
  legacySkillProjectionOwnershipReceiptTarget,
  runtimeWriteModeMatches,
  skillProjectionOwnershipReceiptTarget,
} from '../../src/agent-assets/infrastructure/runtime/skills/projection-files.ts';

test('Windows runtime 文件一致性忽略 POSIX executable bit', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-runtime-mode-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, 'run.sh');
  fs.writeFileSync(file, '#!/bin/sh\n', { mode: 0o600 });
  const write = { targetFile: file, mode: 0o100 };
  assert.equal(runtimeWriteModeMatches(file, write, 'win32'), true);
  if (process.platform !== 'win32') assert.equal(runtimeWriteModeMatches(file, write, process.platform), false);
});

test('runtime ownership receipt stale 诊断报告字段级差异和双侧摘要', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-runtime-receipt-diff-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const targetFile = path.join(root, '.agents', 'receipt.json');
  fs.mkdirSync(path.dirname(targetFile), { recursive: true });
  fs.writeFileSync(targetFile, '{"sourceDigest":"sha256-current"}\n');
  const plan = createRuntimePlan({
    adapterId: 'codex',
    targetRoot: root,
    scope: '.',
    writes: [{
      targetFile,
      content: '{"sourceDigest":"sha256-expected"}\n',
      kind: 'skill-projection-receipt',
      source: 'workspace:demo',
      diagnostic: { label: 'demo receipt', codes: { stale: 'runtime.demo_stale' }, repair: 'skills-render' },
    }],
    capabilityEvidence: REQUIRED_RENDER_CAPABILITIES.map((capability) => ({ capability, supported: true, adapterId: 'codex' })),
  });
  const finding = reconcileRuntimePlan(plan, { compareOnly: true }).findings[0];
  assert.equal(finding.status, 'stale');
  assert.match(finding.message, /Receipt differences: sourceDigest/);
  assert.match(finding.message, /current=sha256-[a-f0-9]{64} expected=sha256-[a-f0-9]{64}/);
});

test('runtime ownership receipt stale 诊断列出具体文件差异', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-runtime-receipt-file-diff-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const targetFile = path.join(root, '.agents', 'receipt.json');
  fs.mkdirSync(path.dirname(targetFile), { recursive: true });
  const current = { files: [{ path: 'scripts/run.sh', integrity: 'sha256-a', executable: true }] };
  const expected = { files: [{ path: 'scripts/run.sh', integrity: 'sha256-a', executable: false }] };
  fs.writeFileSync(targetFile, `${JSON.stringify(current)}\n`);
  const plan = createRuntimePlan({
    adapterId: 'codex', targetRoot: root, scope: '.',
    writes: [{ targetFile, content: `${JSON.stringify(expected)}\n`, kind: 'skill-projection-receipt', source: 'workspace:demo', diagnostic: { label: 'demo receipt', repair: 'skills-render' } }],
    capabilityEvidence: REQUIRED_RENDER_CAPABILITIES.map((capability) => ({ capability, supported: true, adapterId: 'codex' })),
  });
  const finding = reconcileRuntimePlan(plan, { compareOnly: true }).findings[0];
  assert.match(finding.message, /File differences: scripts\/run\.sh/);
  assert.match(finding.message, /"executable":true.*"executable":false/);
});

test('render 参数解析拒绝未知和缺失参数', (t) => {
  t.mock.method(console, 'error', () => {});
  assert.deepEqual(parseRenderClaudeCodeArgs(['--scope', '.', '--target', 'tmp']), { scope: '.', target: 'tmp' });
  assert.deepEqual(parseInstallClaudeCodeBuildrSkillArgs(['--target', 'tmp']), { target: 'tmp' });
  assert.throws(() => parseRenderClaudeCodeArgs(['--scope', '.'], 'buildr render'), /Missing required arguments/);
  assert.throws(() => parseRenderClaudeCodeArgs(['--scope', '.', '--target', 'tmp', '--extra'], 'buildr render'), /Unknown argument/);
});

test('scope 和相对路径解析保持在 workspace 内', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-runtime-scope-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'projects', 'demo'), { recursive: true });

  assert.equal(normalizeRelativePath('./projects/demo'), path.join('projects', 'demo'));
  assert.throws(() => normalizeRelativePath('../outside'), /stay inside repository/);
  assert.deepEqual(resolveSkillScope(root, '.'), { scope: '.', organizationRoot: root, projectRoot: null });
  assert.equal(resolveSkillScope(root, 'projects/demo').projectRoot, path.join(root, 'projects', 'demo'));
  assert.throws(() => resolveSkillScope(root, 'services/api'), /Unsupported scope/);
});

test('Skills manifest parser 保留本地、远端和 runtime 字段', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-skills-manifest-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const manifest = path.join(root, 'manifest.yml');
  fs.writeFileSync(manifest, [
    'schemaVersion: buildr.skills/v1',
    'skills:',
    '  - id: local-review',
    '    path: local-review',
    '    enabled: true',
    '    runtimes: ["codex", "claude-code"]',
    '  - id: remote-review',
    '    source:',
    '      kind: url',
    '      url: https://example.com/review',
    '    resolved:',
    '      kind: skill-url',
    '      url: https://example.com/SKILL.md',
    '      integrity: sha256-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    '',
  ].join('\n'));

  const skills = parseSkillsManifest(manifest);
  assert.equal(skills.length, 2);
  assert.deepEqual(skills[0].runtimes, ['codex', 'claude-code']);
  assert.equal(skills[0].enabled, true);
  assert.equal(skills[1].source.kind, 'url');
  assert.equal(skills[1].resolved.kind, 'skill-url');
});

test('runtime target、managed marker 和 Agent install plan 可独立验证', () => {
  const target = buildRuntimeSkillTarget('/tmp/workspace', { id: 'review', runtimePath: 'team/review' }, 'codex');
  assert.equal(target, path.join('/tmp/workspace', '.agents', 'skills', 'team', 'review', 'SKILL.md'));
  assert.equal(hasManagedSkillMarker('---\nname: review\n---\n<!-- Generated by Buildr. Hash: x. Do not edit. -->\n'), true);
  assert.equal(hasManagedSkillMarker('---\nname: review\n---\nUser content\n'), false);

  const plan = buildAgentInstallPlanContent({
    id: 'remote-review',
    source: { kind: 'url', url: 'https://example.com/review' },
    resolved: { kind: 'skill-url', url: 'https://example.com/SKILL.md', version: '1.0.0' },
  });
  assert.match(plan, /Buildr Skill Install Plan: remote-review/);
  assert.match(plan, /https:\/\/example.com\/SKILL.md/);
  assert.match(plan, /skills add <id> --resolved-source/);
});

test('完整 Skill 目录跨 adapter 投射字节、权限、回执与 stale 清理', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-complete-skill-'));
  const sourceDir = path.join(root, 'source');
  const targetRoot = path.join(root, 'target');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(sourceDir, 'assets'), { recursive: true });
  fs.mkdirSync(path.join(sourceDir, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(sourceDir, 'agents'), { recursive: true });
  fs.mkdirSync(targetRoot, { recursive: true });
  const sourceFile = path.join(sourceDir, 'SKILL.md');
  fs.writeFileSync(sourceFile, '---\nname: complete-demo\ndescription: complete demo\n---\n\n# Complete Demo\n');
  fs.writeFileSync(path.join(sourceDir, 'assets', 'sample.bin'), Buffer.from([0, 255, 16, 128]));
  fs.writeFileSync(path.join(sourceDir, 'scripts', 'run.sh'), '#!/bin/sh\necho demo\n');
  fs.chmodSync(path.join(sourceDir, 'scripts', 'run.sh'), 0o744);
  fs.writeFileSync(path.join(sourceDir, 'agents', 'openai.yaml'), 'interface:\n  display_name: Complete Demo\n');
  assert.equal(spawnSync('git', ['init', '--quiet'], { cwd: root }).status, 0);
  assert.equal(spawnSync('git', ['add', '--', 'source'], { cwd: root }).status, 0);
  assert.equal(spawnSync('git', ['update-index', '--chmod=+x', '--', 'source/scripts/run.sh'], { cwd: root }).status, 0);
  const skill = { id: 'complete-demo', sourceDir, sourceFile, origin: 'workspace', runtimePath: 'team/complete-demo', declaredScope: '.' };

  for (const adapterId of SUPPORTED_AGENT_IDS) {
    const projection = buildSkillRenderPlan(root, targetRoot, [skill], adapterId);
    const relativeTargets = projection.writes.map((item) => path.relative(targetRoot, item.targetFile).split(path.sep).join('/'));
    const runtimeRoot = getRuntimeAdapter(adapterId).traits.skills.root;
    for (const relative of ['SKILL.md', 'agents/openai.yaml', 'assets/sample.bin', 'scripts/run.sh']) {
      assert.ok(relativeTargets.includes(`${runtimeRoot}/skills/team/complete-demo/${relative}`), `${adapterId} missing ${relative}`);
    }
    assert.ok(relativeTargets.includes(`.buildr/agent-runtime/workspace/${adapterId}/skill-projection-ownership-receipts/team/complete-demo.json`));
  }

  const first = buildSkillRenderPlan(root, targetRoot, [skill], 'codex');
  assert.equal(first.writes.find((item) => item.targetFile.endsWith(path.join('scripts', 'run.sh')))?.mode, 0o100, 'render plan must preserve executable intent on every platform');
  applySkillRenderPlan(first, targetRoot);
  const runtimeDir = path.join(targetRoot, '.agents', 'skills', 'team', 'complete-demo');
  assert.deepEqual(fs.readFileSync(path.join(runtimeDir, 'assets', 'sample.bin')), Buffer.from([0, 255, 16, 128]));
  if (process.platform !== 'win32') assert.equal((fs.statSync(path.join(runtimeDir, 'scripts', 'run.sh')).mode & 0o100) === 0o100, true);
  const ownershipReceipt = JSON.parse(fs.readFileSync(skillProjectionOwnershipReceiptTarget(targetRoot, 'workspace', 'codex', 'team/complete-demo'), 'utf8'));
  assert.equal(ownershipReceipt.files.find((file) => file.path === 'scripts/run.sh')?.executable, true, 'receipt must preserve executable intent on every platform');
  assert.match(fs.readFileSync(path.join(runtimeDir, 'SKILL.md'), 'utf8'), /Generated by Buildr/);

  const second = buildSkillRenderPlan(root, targetRoot, [skill], 'codex');
  assert.doesNotThrow(() => applySkillRenderPlan(second, targetRoot));
  fs.rmSync(path.join(sourceDir, 'assets', 'sample.bin'));
  const stale = buildSkillRenderPlan(root, targetRoot, [skill], 'codex');
  assert.equal(stale.removals.length, 1);
  applySkillRenderPlan(stale, targetRoot);
  assert.equal(fs.existsSync(path.join(runtimeDir, 'assets', 'sample.bin')), false);
});

test('Skill 投射所有权回执按 destination 与 adapter 隔离，并保留嵌套 runtime path', () => {
  const workspace = '/tmp/buildr-workspace';
  assert.equal(
    skillProjectionOwnershipReceiptTarget(workspace, 'workspace', 'codex', 'team/review'),
    path.join(workspace, '.buildr', 'agent-runtime', 'workspace', 'codex', 'skill-projection-ownership-receipts', 'team', 'review.json'),
  );
  assert.equal(
    skillProjectionOwnershipReceiptTarget(workspace, 'user', 'codex', 'team/review'),
    path.join(workspace, '.buildr', 'agent-runtime', 'user', 'codex', 'skill-projection-ownership-receipts', 'team', 'review.json'),
  );
  assert.notEqual(
    skillProjectionOwnershipReceiptTarget(workspace, 'workspace', 'codex', 'review'),
    skillProjectionOwnershipReceiptTarget(workspace, 'user', 'codex', 'review'),
  );
});

test('旧 Skill 投射回执只在仍能证明 runtime 文件时迁移', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-receipt-migration-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sourceDir = path.join(root, 'source');
  fs.mkdirSync(sourceDir, { recursive: true });
  fs.writeFileSync(path.join(sourceDir, 'SKILL.md'), '---\nname: demo\ndescription: demo\n---\n');
  const skill = { id: 'demo', sourceDir, sourceFile: path.join(sourceDir, 'SKILL.md'), origin: 'workspace', runtimePath: 'team/demo', declaredScope: '.' };
  applySkillRenderPlan(buildSkillRenderPlan(root, root, [skill], 'codex'), root);
  const canonical = skillProjectionOwnershipReceiptTarget(root, 'workspace', 'codex', 'team/demo');
  const legacy = legacySkillProjectionOwnershipReceiptTarget(root, '.agents', 'codex', 'team/demo');
  fs.mkdirSync(path.dirname(legacy), { recursive: true });
  fs.renameSync(canonical, legacy);

  const migration = buildSkillRenderPlan(root, root, [skill], 'codex');
  assert.ok(migration.writes.some((item) => item.targetFile === canonical));
  assert.ok(migration.removals.some((item) => item.targetFile === legacy));
  applySkillRenderPlan(migration, root);
  assert.equal(fs.existsSync(canonical), true);
  assert.equal(fs.existsSync(legacy), false);

  fs.mkdirSync(path.dirname(legacy), { recursive: true });
  const reordered = Object.fromEntries(Object.entries(JSON.parse(fs.readFileSync(canonical, 'utf8'))).reverse());
  fs.writeFileSync(legacy, `${JSON.stringify(reordered)}\n`);
  const dualEquivalent = buildSkillRenderPlan(root, root, [skill], 'codex');
  assert.ok(dualEquivalent.removals.some((item) => item.targetFile === legacy && item.removeLast === true));
  applySkillRenderPlan(dualEquivalent, root);
  assert.equal(fs.existsSync(canonical), true);
  assert.equal(fs.existsSync(legacy), false);

  fs.mkdirSync(path.dirname(legacy), { recursive: true });
  fs.writeFileSync(legacy, fs.readFileSync(canonical));
  fs.writeFileSync(path.join(root, '.agents', 'skills', 'team', 'demo', 'SKILL.md'), 'modified');
  fs.rmSync(canonical);
  assert.throws(() => buildSkillRenderPlan(root, root, [skill], 'codex'), /cannot prove the current runtime files/);
});

test('canonical 与旧 Skill 投射所有权回执不一致时零写入停止', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-receipt-conflict-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sourceDir = path.join(root, 'source');
  fs.mkdirSync(sourceDir, { recursive: true });
  fs.writeFileSync(path.join(sourceDir, 'SKILL.md'), '---\nname: demo\ndescription: demo\n---\n');
  const skill = { id: 'demo', sourceDir, sourceFile: path.join(sourceDir, 'SKILL.md'), origin: 'workspace', runtimePath: 'demo', declaredScope: '.' };
  applySkillRenderPlan(buildSkillRenderPlan(root, root, [skill], 'codex'), root);
  const canonical = skillProjectionOwnershipReceiptTarget(root, 'workspace', 'codex', 'demo');
  const legacy = legacySkillProjectionOwnershipReceiptTarget(root, '.agents', 'codex', 'demo');
  const receipt = JSON.parse(fs.readFileSync(canonical, 'utf8'));
  receipt.sourceIdentity = 'different-owner';
  fs.mkdirSync(path.dirname(legacy), { recursive: true });
  fs.writeFileSync(legacy, `${JSON.stringify(receipt, null, 2)}\n`);
  assert.throws(() => buildSkillRenderPlan(root, root, [skill], 'codex'), /canonical and legacy receipts differ/);
});

test('旧回执迁移提交失败时恢复 runtime 文件与旧 ownership receipt', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-receipt-rollback-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sourceDir = path.join(root, 'source');
  const sourceFile = path.join(sourceDir, 'SKILL.md');
  fs.mkdirSync(sourceDir, { recursive: true });
  fs.writeFileSync(sourceFile, '---\nname: demo\ndescription: before\n---\n');
  const skill = { id: 'demo', sourceDir, sourceFile, origin: 'workspace', runtimePath: 'demo', declaredScope: '.' };
  applySkillRenderPlan(buildSkillRenderPlan(root, root, [skill], 'codex'), root);
  const canonical = skillProjectionOwnershipReceiptTarget(root, 'workspace', 'codex', 'demo');
  const legacy = legacySkillProjectionOwnershipReceiptTarget(root, '.agents', 'codex', 'demo');
  fs.mkdirSync(path.dirname(legacy), { recursive: true });
  fs.renameSync(canonical, legacy);
  const runtimeFile = path.join(root, '.agents', 'skills', 'demo', 'SKILL.md');
  const before = fs.readFileSync(runtimeFile);
  fs.writeFileSync(sourceFile, '---\nname: demo\ndescription: after\n---\n');
  const plan = buildSkillRenderPlan(root, root, [skill], 'codex');
  const originalWrite = fs.writeFileSync.bind(fs);
  t.mock.method(fs, 'writeFileSync', (file, ...args) => {
    if (path.resolve(file) === path.resolve(canonical)) throw new Error('injected canonical receipt failure');
    return originalWrite(file, ...args);
  });
  assert.throws(() => applySkillRenderPlan(plan, root), /injected canonical receipt failure/);
  assert.deepEqual(fs.readFileSync(runtimeFile), before);
  assert.equal(fs.existsSync(legacy), true);
  assert.equal(fs.existsSync(canonical), false);
});

test('完整 Skill 投射拒绝 source symlink 与已修改受管资源', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-complete-skill-conflict-'));
  const sourceDir = path.join(root, 'source');
  const targetRoot = path.join(root, 'target');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(sourceDir, 'assets'), { recursive: true });
  fs.mkdirSync(targetRoot, { recursive: true });
  const sourceFile = path.join(sourceDir, 'SKILL.md');
  fs.writeFileSync(sourceFile, '---\nname: guarded-demo\ndescription: guarded demo\n---\n');
  fs.writeFileSync(path.join(sourceDir, 'assets', 'template.txt'), 'source\n');
  const skill = { id: 'guarded-demo', sourceDir, sourceFile, origin: 'workspace', runtimePath: 'guarded-demo', declaredScope: '.' };
  applySkillRenderPlan(buildSkillRenderPlan(root, targetRoot, [skill], 'codex'), targetRoot);
  const runtimeAsset = path.join(targetRoot, '.agents', 'skills', 'guarded-demo', 'assets', 'template.txt');
  fs.writeFileSync(runtimeAsset, 'user edit\n');
  fs.writeFileSync(path.join(sourceDir, 'assets', 'template.txt'), 'new source\n');
  assert.throws(() => applySkillRenderPlan(buildSkillRenderPlan(root, targetRoot, [skill], 'codex'), targetRoot), /no files were changed/);
  assert.equal(fs.readFileSync(runtimeAsset, 'utf8'), 'user edit\n');

  fs.rmSync(path.join(sourceDir, 'assets', 'template.txt'));
  fs.symlinkSync(sourceFile, path.join(sourceDir, 'assets', 'linked.md'));
  assert.throws(() => buildSkillRenderPlan(root, targetRoot, [skill], 'codex'), /must not contain symbolic links/);
});

test('adapter 明确声明 user/workspace destination 与 partial inventory evidence', () => {
  for (const adapter of Object.values(RUNTIME_ADAPTERS)) {
    const destinations = adapter.traits.skills.destinations;
    assert.equal(destinations.workspace.supported, true);
    assert.equal(destinations.user.supported, true);
    assert.equal(destinations.discovery.evidence, 'partial');
    assert.ok(skillDestinationRoot(adapter, 'workspace', '/tmp/workspace').endsWith(adapter.traits.skills.root));
  }
});

test('effective inventory 只读汇总外部 Skill 并稳定分类', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-skill-inventory-'));
  const userHome = path.join(root, 'user');
  const skillDir = path.join(root, '.agents', 'skills', 'demo');
  const unrelatedDir = path.join(root, '.agents', 'skills', 'unrelated');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(skillDir, { recursive: true });
  fs.mkdirSync(unrelatedDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: demo\ndescription: demo\n---\nbody\n');
  fs.writeFileSync(path.join(unrelatedDir, 'SKILL.md'), '---\nname: unrelated\ndescription: unrelated\n---\nbody\n');
  const before = fs.statSync(path.join(skillDir, 'SKILL.md')).mtimeMs;
  const inventory = buildEffectiveSkillInventory({ adapterId: 'codex', workspaceRoot: root, userHome, candidateIds: ['demo'] });
  assert.equal(inventory.entries.length, 1);
  assert.equal(inventory.entries.some((entry) => entry.skillId === 'unrelated'), false);
  assert.equal(inventory.entries[0].sourceCategory, 'external-filesystem');
  const equivalent = classifySkillCandidate({ skillId: 'demo', assetIdentity: 'workspace:x:skill:demo', renderDigest: inventory.entries[0].renderDigest }, inventory, 'workspace');
  assert.equal(equivalent.status, 'equivalent_external');
  assert.equal(equivalent.blocking, true);
  const conflict = classifySkillCandidate({ skillId: 'demo', assetIdentity: 'workspace:x:skill:demo', renderDigest: `sha256-${'0'.repeat(64)}` }, inventory, 'workspace');
  assert.equal(conflict.status, 'name_conflict');
  const absent = classifySkillCandidate({ skillId: 'other', assetIdentity: 'workspace:x:skill:other', renderDigest: `sha256-${'0'.repeat(64)}` }, inventory, 'workspace');
  assert.equal(absent.status, 'visibility_partial');
  assert.equal(fs.statSync(path.join(skillDir, 'SKILL.md')).mtimeMs, before);
});

test('Skill conflict classifier 覆盖受管、外部、跨 owner 与 user satisfaction 状态', () => {
  const candidate = { skillId: 'demo', assetIdentity: 'asset:demo', sourceWorkspaceId: 'workspace:a', renderDigest: `sha256-${'1'.repeat(64)}` };
  const classify = (entries, destination = 'workspace', evidence = 'complete') => classifySkillCandidate(candidate, { entries, evidence }, destination).status;
  assert.equal(classify([]), 'absent');
  assert.equal(classify([], 'workspace', 'partial'), 'visibility_partial');
  assert.equal(classify([{ skillId: 'demo', destination: 'workspace', assetIdentity: 'asset:demo', renderDigest: candidate.renderDigest, receipt: {} }]), 'already_projected');
  assert.equal(classify([{ skillId: 'demo', destination: 'workspace', assetIdentity: 'asset:demo', renderDigest: `sha256-${'2'.repeat(64)}`, receipt: {} }]), 'update');
  assert.equal(classify([{ skillId: 'demo', destination: 'workspace', assetIdentity: null, renderDigest: candidate.renderDigest, receipt: null }]), 'equivalent_external');
  assert.equal(classify([{ skillId: 'demo', destination: 'workspace', assetIdentity: null, renderDigest: `sha256-${'2'.repeat(64)}`, receipt: null }]), 'name_conflict');
  assert.equal(classify([{ skillId: 'demo', destination: 'workspace', assetIdentity: 'asset:other', renderDigest: candidate.renderDigest, receipt: { schemaVersion: 'buildr.skill-projection/v2' } }]), 'foreign_owner');
  assert.equal(classify([{ skillId: 'demo', destination: 'user', assetIdentity: 'asset:demo', sourceWorkspaceId: 'workspace:b', renderDigest: `sha256-${'2'.repeat(64)}`, receipt: { schemaVersion: 'buildr.skill-projection/v2' } }], 'user'), 'foreign_owner');
  assert.equal(classify([{ skillId: 'demo', destination: 'user', assetIdentity: 'asset:demo', sourceWorkspaceId: 'workspace:a', renderDigest: `sha256-${'2'.repeat(64)}`, receipt: { schemaVersion: 'buildr.skill-projection/v2' } }], 'user'), 'update');
  assert.equal(classify([{ skillId: 'demo', destination: 'user', assetIdentity: 'asset:demo', renderDigest: candidate.renderDigest, receipt: { schemaVersion: 'buildr.skill-projection/v2' } }]), 'satisfied_by_user');
});
