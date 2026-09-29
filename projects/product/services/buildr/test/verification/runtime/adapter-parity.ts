#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { getRuntimeAdapter, RUNTIME_ADAPTERS, runtimeAdapterImplementationMatrix, runtimeSkillPath } from '../../../src/modules/agent-assets/infrastructure/runtime/adapter-contract.ts';
import { parseSkillsManifest } from '../../../src/modules/agent-assets/persistence/skill-manifest.ts';
import { skillProjectionOwnershipReceiptTarget } from '../../../src/modules/agent-assets/infrastructure/runtime/skills/projection-files.ts';
import { digestRuntime, mapLimit, RuntimeVerificationHarness } from './fixture.ts';

const harness: any = new RuntimeVerificationHarness();
const MAX_PARALLEL_WORKSPACES: any = 3;

function prepareSeed(): any  {
  const seed: any = harness.initializeSeed('runtime-parity');
  fs.appendFileSync(path.join(seed, 'AGENTS.md'), '\nROOT_MARKER\n');
  harness.run(['project', 'create', 'scope-alpha', '--target', seed, '--description', 'scope alpha']);
  harness.run(['project', 'create', 'scope-beta', '--target', seed, '--description', 'scope beta']);

  const completeSkillSource: any = path.join(seed, '.fixture-source', 'complete-runtime-skill');
  for (const directory of ['agents', 'assets', 'examples', 'references', 'scripts', 'templates']) fs.mkdirSync(path.join(completeSkillSource, directory), { recursive: true });
  fs.writeFileSync(path.join(completeSkillSource, 'SKILL.md'), '---\nname: complete-runtime-skill\ndescription: complete runtime projection fixture\n---\n\n# Complete Runtime Skill\n');
  fs.writeFileSync(path.join(completeSkillSource, 'agents', 'openai.yaml'), 'interface:\n  display_name: Complete Runtime Skill\n');
  fs.writeFileSync(path.join(completeSkillSource, 'assets', 'sample.bin'), Buffer.from([0, 255, 16, 128]));
  fs.writeFileSync(path.join(completeSkillSource, 'examples', 'sample.md'), '# Example\n');
  fs.writeFileSync(path.join(completeSkillSource, 'references', 'guide.md'), '# Guide\n');
  fs.writeFileSync(path.join(completeSkillSource, 'scripts', 'run.sh'), '#!/bin/sh\necho complete\n');
  fs.chmodSync(path.join(completeSkillSource, 'scripts', 'run.sh'), 0o744);
  fs.writeFileSync(path.join(completeSkillSource, 'templates', 'template.txt'), 'template\n');
  const fixtureSourceRoot: any = path.dirname(completeSkillSource);
  assert.equal(spawnSync('git', ['init', '--quiet'], { cwd: fixtureSourceRoot }).status, 0);
  assert.equal(spawnSync('git', ['add', '--', 'complete-runtime-skill'], { cwd: fixtureSourceRoot }).status, 0);
  assert.equal(spawnSync('git', ['update-index', '--chmod=+x', '--', 'complete-runtime-skill/scripts/run.sh'], { cwd: fixtureSourceRoot }).status, 0);
  harness.run(['skills', 'add', '--source', completeSkillSource, '--scope', '.', '--target', seed]);
  fs.rmSync(path.join(seed, '.fixture-source'), { recursive: true, force: true });
  const canonicalSkillsRoot: any = path.join(seed, 'skills');
  assert.equal(spawnSync('git', ['init', '--quiet'], { cwd: canonicalSkillsRoot }).status, 0);
  assert.equal(spawnSync('git', ['add', '--', 'complete-runtime-skill'], { cwd: canonicalSkillsRoot }).status, 0);
  assert.equal(spawnSync('git', ['update-index', '--chmod=+x', '--', 'complete-runtime-skill/scripts/run.sh'], { cwd: canonicalSkillsRoot }).status, 0);

  fs.mkdirSync(path.join(seed, 'projects', 'scope-alpha', 'services', 'api'), { recursive: true });
  fs.mkdirSync(path.join(seed, 'projects', 'scope-alpha', 'services', 'web'), { recursive: true });
  fs.writeFileSync(path.join(seed, 'projects', 'scope-alpha', 'services', 'api', 'AGENTS.md'), '# API rules\nAPI_MARKER\n');
  fs.writeFileSync(path.join(seed, 'projects', 'scope-alpha', 'services', 'web', 'AGENTS.md'), '# Web rules\nWEB_MARKER\n');

  const rejectedProjectAdd: any = harness.run(['skills', 'add', 'beta-remote', '--remote-source', 'https://example.com/beta-remote', '--scope', 'projects/scope-beta', '--target', seed, '--description', 'beta remote'], { allowFailure: true });
  assert.notEqual(rejectedProjectAdd.status, 0, 'Legacy Project Skill source scope must be rejected');
  harness.run(['skills', 'add', 'beta-remote', '--remote-source', 'https://example.com/beta-remote', '--target', seed, '--description', 'beta remote']);
  return seed;
}

function assertCompleteSkillInventory(workspace: any, adapterId: any): any  {
  const adapter: any = getRuntimeAdapter(adapterId);
  const runtimeRoot: any = path.join(workspace, adapter.traits.skills.root);
  const skills: any = parseSkillsManifest(path.join(workspace, 'skills', 'manifest.yml'));
  const projectedSkills: any = skills.filter((skill: any) => skill.enabled !== false
    && skill.state !== 'uninstalled'
    && (!Array.isArray(skill.runtimes) || skill.runtimes.includes(adapterId))
    && typeof skill.path === 'string'
    && fs.existsSync(path.join(workspace, 'skills', skill.path)));
  for (const skill of projectedSkills) {
    const runtimePath: any = runtimeSkillPath(skill, null, adapterId);
    assert.ok(fs.existsSync(path.join(runtimeRoot, 'skills', ...runtimePath.split('/'), 'SKILL.md')), `${adapterId} must render ${skill.id}`);
    assert.ok(fs.existsSync(skillProjectionOwnershipReceiptTarget(workspace, 'workspace', adapterId, runtimePath)), `${adapterId} must record a projection ownership receipt for ${skill.id}`);
  }

  assert.ok(fs.existsSync(path.join(runtimeRoot, 'skills', 'task-manager', 'agents', 'openai.yaml')), `${adapterId} must preserve task-manager OpenAI vendor metadata`);
  assert.ok(fs.existsSync(path.join(runtimeRoot, 'skills', 'project-testing', 'references', 'testing-model-v1.md')), `${adapterId} must preserve project-testing reference`);
  const completeRuntime: any = path.join(runtimeRoot, 'skills', 'complete-runtime-skill');
  for (const relative of ['SKILL.md', 'agents/openai.yaml', 'examples/sample.md', 'references/guide.md', 'scripts/run.sh', 'templates/template.txt']) {
    assert.ok(fs.existsSync(path.join(completeRuntime, ...relative.split('/'))), `${adapterId} must render ${relative}`);
  }
  assert.deepEqual(fs.readFileSync(path.join(completeRuntime, 'assets', 'sample.bin')), Buffer.from([0, 255, 16, 128]), `${adapterId} must preserve binary bytes`);
  const completeReceipt: any = JSON.parse(fs.readFileSync(skillProjectionOwnershipReceiptTarget(workspace, 'workspace', adapterId, 'complete-runtime-skill'), 'utf8'));
  assert.equal(completeReceipt.files.find((file: any) => file.path === 'scripts/run.sh')?.executable, true, `${adapterId} must preserve executable intent in portable receipt evidence`);
  if (process.platform !== 'win32') assert.equal((fs.statSync(path.join(completeRuntime, 'scripts', 'run.sh')).mode & 0o100) === 0o100, true, `${adapterId} must preserve owner executable intent`);
}

function assertAdapterSpecificProjection(workspace: any, adapterId: any): any  {
  if (adapterId === 'agents-standard') {
    assert.ok(fs.existsSync(path.join(workspace, '.agents', 'skills', 'buildr', 'SKILL.md')));
    assert.ok(!fs.existsSync(path.join(workspace, '.agents', 'CLAUDE.md')));
  }
  if (adapterId === 'claude-code') {
    assert.ok(fs.existsSync(path.join(workspace, '.claude', 'skills', 'buildr', 'SKILL.md')));
    assert.ok(fs.readFileSync(path.join(workspace, 'CLAUDE.md'), 'utf8').includes('@AGENTS.md'));
  }
}

async function prepareAdapterContext(seed: any, adapterId: any, lifecycleAdapters: any): Promise<any>  {
  const workspace: any = harness.cloneWorkspace(seed, `buildr-runtime-adapter-${adapterId}-`);
  await harness.runAsync(['skill', 'install', adapterId, '--target', workspace]);
  await harness.runAsync(['render', adapterId, '--scope', '.', '--target', workspace]);
  assertCompleteSkillInventory(workspace, adapterId);
  assertAdapterSpecificProjection(workspace, adapterId);

  if (lifecycleAdapters.has(adapterId)) {
    const check: any = await harness.runAsync(['runtime', 'check', adapterId, '--scope', '.', '--target', workspace]);
    assert.match(check.stdout, /Activation: rules=/, `${adapterId} runtime check must report activation`);
    assert.doesNotMatch(check.stdout, /Environment:/, `${adapterId} runtime check must not report retired install or version probes`);
  }

  const doctor: any = JSON.parse((await harness.runAsync(['doctor', '--agent', adapterId, '--target', workspace, '--json', '--detail', 'full'])).stdout);
  assert.equal(doctor.agentRuntime.requested, adapterId, `${adapterId} doctor must inspect the requested adapter`);
  assert.equal(doctor.agentRuntime.supported, true, `${adapterId} doctor must recognize a supported adapter`);
  return { adapterId, workspace, doctor };
}

function scopedProjectionSnapshot(workspace: any, adapterId: any): any  {
  if (adapterId === 'claude-code') {
    const file: any = path.join(workspace, 'projects', 'scope-beta', 'CLAUDE.md');
    assert.ok(fs.existsSync(file), 'a nested Project AGENTS.md must own a nested reference bridge');
    return new Map([[file, fs.readFileSync(file, 'utf8')]]);
  }
  return null;
}

async function verifyLifecycle(context: any): Promise<any>  {
  const { adapterId, workspace }: any = context;
  const adapter: any = getRuntimeAdapter(adapterId);
  const runtimeRoot: any = path.join(workspace, adapter.traits.skills.root);

  fs.rmSync(path.join(workspace, 'skills', 'complete-runtime-skill', 'assets', 'sample.bin'));
  await harness.runAsync(['render', adapterId, '--scope', '.', '--target', workspace]);
  assert.equal(fs.existsSync(path.join(runtimeRoot, 'skills', 'complete-runtime-skill', 'assets', 'sample.bin')), false, `${adapterId} must safely remove a source-deleted managed asset`);

  await harness.runAsync(['builtin', 'uninstall', 'task-retrospective', '--target', workspace, '--reason', 'runtime lifecycle fixture']);
  await harness.runAsync(['render', adapterId, '--scope', '.', '--target', workspace]);
  assert.equal(fs.existsSync(path.join(runtimeRoot, 'skills', 'task-retrospective')), false, `${adapterId} must remove uninstalled task-retrospective`);
  assert.ok(fs.existsSync(path.join(runtimeRoot, 'skills', 'task-finish', 'SKILL.md')), `${adapterId} task-finish must remain after review uninstall`);

  await harness.runAsync(['builtin', 'restore', 'task-retrospective', '--target', workspace]);
  await harness.runAsync(['render', adapterId, '--scope', '.', '--target', workspace]);
  assert.ok(fs.existsSync(path.join(runtimeRoot, 'skills', 'task-retrospective', 'SKILL.md')), `${adapterId} must restore task-retrospective`);

  if (adapterId === 'agents-standard' || adapterId === 'claude-code') {
    const renderedFinish: any = fs.readFileSync(path.join(runtimeRoot, 'skills', 'task-finish', 'SKILL.md'), 'utf8');
    assert.ok(renderedFinish.includes('已有任务结果登记'));
    assert.ok(renderedFinish.includes('task complete --expected-record <recordDigest>'));
    assert.ok(renderedFinish.includes('没有匹配任务就交付实际成果，不补建记录'));
    assert.ok(renderedFinish.includes('复用已经成立的交付事实'));
    assert.ok(renderedFinish.includes('--expected-source'));
    assert.ok(renderedFinish.includes('--delivered-ref'));
    assert.ok(renderedFinish.includes('不因收尾、归档材料移动或提交编号变化重跑测试'));
    assert.ok(!renderedFinish.includes('preflight → prepare → verify → deliver → cleanup'));
    assert.ok(!renderedFinish.includes('task finish reconcile'));
    assert.ok(!renderedFinish.includes('buildr:contribution openspec#pre-spec-sync'));
  }

  const unrelatedProjection: any = scopedProjectionSnapshot(workspace, adapterId);
  if (unrelatedProjection) {
    await harness.runAsync(['rules', 'render', adapterId, '--scope', 'projects/scope-alpha', '--target', workspace]);
    for (const [file, content] of unrelatedProjection) {
      assert.equal(fs.readFileSync(file, 'utf8'), content, `${adapterId} Project-scoped Rules render must preserve unrelated projection`);
    }
  }

  const orphan: any = path.join(runtimeRoot, 'skills', 'runtime-orphan', 'SKILL.md');
  fs.mkdirSync(path.dirname(orphan), { recursive: true });
  fs.writeFileSync(orphan, '---\nname: runtime-orphan\n---\n<!-- Generated by Buildr. Hash: deadbeef. Do not edit. -->\n');
  const unprovenOrphan = await harness.runAsync(['render', adapterId, '--scope', '.', '--target', workspace], { allowFailure: true });
  assert.notEqual(unprovenOrphan.status, 0, `${adapterId} must not claim orphan ownership from a marker alone`);
  assert.equal(fs.existsSync(orphan), true, `${adapterId} must preserve unproven orphan bytes`);
  fs.rmSync(path.dirname(orphan), { recursive: true }); // Remove only this test-created unowned fixture.

  const before: any = digestRuntime(workspace);
  await harness.runAsync(['render', adapterId, '--scope', '.', '--target', workspace]);
  assert.equal(digestRuntime(workspace), before, `${adapterId} repeated render must be idempotent`);
}

async function verifySkillSymlinkGuard(seed: any): Promise<any>  {
  const workspace: any = harness.cloneWorkspace(seed, 'buildr-runtime-symlink-');
  const outside: any = harness.createTemporaryDirectory('buildr-runtime-outside-');
  fs.mkdirSync(path.join(workspace, '.agents'), { recursive: true });
  fs.symlinkSync(outside, path.join(workspace, '.agents', 'skills'), 'dir');
  const result: any = await harness.runAsync(['skill', 'install', 'codex', '--target', workspace], { allowFailure: true });
  assert.notEqual(result.status, 0, 'runtime install must reject a target path that crosses a symbolic link');
  assert.equal(fs.existsSync(path.join(outside, 'buildr', 'SKILL.md')), false, 'runtime install must not write outside the workspace through a symbolic link');
}

async function verifyRulesSymlinkGuard(seed: any): Promise<any>  {
  const workspace: any = harness.cloneWorkspace(seed, 'buildr-runtime-rules-symlink-');
  const outside: any = harness.createTemporaryDirectory('buildr-runtime-rules-outside-');
  // Managed-looking bytes matter: an unmanaged symlink target is rejected as a merge conflict before the
  // path guard runs, which would prove the wrong invariant.
  const outsideContent: any = '# CLAUDE.md\n\n<!-- BEGIN Buildr managed Claude Code rules bridge; type: reference; source: AGENTS.md -->\n@AGENTS.md\n<!-- END Buildr managed Claude Code rules bridge -->\n';
  fs.writeFileSync(path.join(outside, 'CLAUDE.md'), outsideContent);
  fs.symlinkSync(path.join(outside, 'CLAUDE.md'), path.join(workspace, 'CLAUDE.md'));
  const result: any = await harness.runAsync(['rules', 'render', 'claude-code', '--scope', '.', '--target', workspace], { allowFailure: true });
  assert.notEqual(result.status, 0, 'runtime rules render must reject a target path that crosses a symbolic link');
  assert.match(`${result.stdout}\n${result.stderr}`, /crosses a symbolic link/, 'the failure must name the symbolic link');
  assert.equal(fs.readFileSync(path.join(outside, 'CLAUDE.md'), 'utf8'), outsideContent, 'rules render must not write outside the workspace through a symbolic link');
  assert.equal(fs.lstatSync(path.join(workspace, 'CLAUDE.md')).isSymbolicLink(), true, 'rules render must not replace a symbolic link with a real file');
}

async function verifyGuardedOrphan(seed: any): Promise<any>  {
  const workspace: any = harness.cloneWorkspace(seed, 'buildr-runtime-guarded-orphan-');
  await harness.runAsync(['render', 'codex', '--scope', '.', '--target', workspace]);
  const orphanDirectory: any = path.join(workspace, '.agents', 'skills', 'task-retrospective');
  const userFile: any = path.join(orphanDirectory, 'user-notes.md');
  fs.writeFileSync(userFile, 'user-owned\n');
  const result: any = await harness.runAsync(['builtin', 'uninstall', 'task-retrospective', '--target', workspace, '--reason', 'guarded orphan fixture'], { allowFailure: true });
  assert.notEqual(result.status, 0, 'builtin uninstall must stop when a runtime Skill directory contains an unknown user file');
  assert.match(`${result.stdout}\n${result.stderr}`, /非 Buildr 管理的额外文件/);
  assert.equal(fs.readFileSync(userFile, 'utf8'), 'user-owned\n');
  assert.ok(fs.existsSync(path.join(orphanDirectory, 'SKILL.md')), 'conflicted orphan cleanup must preserve managed files too');
  assert.ok(fs.existsSync(path.join(workspace, 'skills', 'buildr', 'task-retrospective', 'SKILL.md')), 'failed uninstall must roll back source asset changes');
}

async function verifyRulesOrphanCleanup(seed: any): Promise<any>  {
  const workspace: any = harness.cloneWorkspace(seed, 'buildr-runtime-rules-orphan-');
  await harness.runAsync(['rules', 'render', 'claude-code', '--scope', '.', '--target', workspace]);
  const rootBridge: any = path.join(workspace, 'CLAUDE.md');
  const projectBridge: any = path.join(workspace, 'projects', 'scope-alpha', 'CLAUDE.md');
  assert.ok(fs.existsSync(rootBridge), 'the root AGENTS.md must own a reference bridge before orphan cleanup');
  assert.ok(fs.existsSync(projectBridge), 'a narrower Project AGENTS.md must own its own reference bridge');
  fs.rmSync(path.join(workspace, 'AGENTS.md'));
  await harness.runAsync(['rules', 'render', 'claude-code', '--scope', '.', '--target', workspace]);
  assert.equal(fs.existsSync(rootBridge), false, 'a deleted source must orphan-clean its own reference bridge');
  assert.ok(fs.existsSync(projectBridge), 'cleanup must preserve narrower Project and Service bridges');
  assert.match(fs.readFileSync(projectBridge, 'utf8'), /@AGENTS\.md/);
}

async function verifyGitBoundaryCleanup(seed: any): Promise<any>  {
  const workspace: any = harness.cloneWorkspace(seed, 'buildr-runtime-boundary-orphan-');
  const externalRepo: any = path.join(workspace, 'external-repo');
  fs.mkdirSync(path.join(externalRepo, '.git'), { recursive: true });
  fs.writeFileSync(path.join(externalRepo, '.git', 'HEAD'), 'ref: refs/heads/main\n');
  fs.writeFileSync(path.join(externalRepo, 'AGENTS.md'), 'EXTERNAL_REPO_RULE_MUST_NOT_BE_DISCOVERED\n');
  const externalBridge: any = path.join(externalRepo, 'CLAUDE.md');
  const externalBridgeContent: any = '# CLAUDE.md\n\n<!-- BEGIN Buildr managed Claude Code rules bridge; type: reference; source: AGENTS.md -->\n@AGENTS.md\n<!-- END Buildr managed Claude Code rules bridge -->\n';
  fs.writeFileSync(externalBridge, externalBridgeContent);
  await harness.runAsync(['rules', 'render', 'claude-code', '--scope', '.', '--target', workspace]);
  assert.ok(fs.existsSync(externalBridge), 'orphan cleanup must not cross an unregistered nested Git boundary');
  assert.equal(fs.readFileSync(externalBridge, 'utf8'), externalBridgeContent, 'an unregistered nested Git boundary must keep its bytes');
}

async function verifyRetiredIdentityUsesStandardAdapter(seed: any): Promise<any>  {
  const workspace: any = harness.cloneWorkspace(seed, 'buildr-runtime-retired-identity-');
  await harness.runAsync(['skill', 'install', 'agents-standard', '--target', workspace]);
  await harness.runAsync(['render', 'agents-standard', '--scope', '.', '--target', workspace]);
  for (const runtimeId of ['cursor', 'qoder', 'trae', 'trae-work', 'workbuddy', 'codex', 'dsh', 'agents-standard']) {
    const check: any = await harness.runAsync(['runtime', 'check', runtimeId, '--scope', '.', '--target', workspace]);
    assert.match(check.stdout, /Activation: rules=/, `${runtimeId} must be checked through the standard adapter instead of being rejected as an adapter id`);
    const rendered: any = await harness.runAsync(['skills', 'render', runtimeId, '--destination', 'workspace', '--target', workspace]);
    assert.equal(rendered.status, 0, `${runtimeId} skills render must succeed through the standard adapter`);
  }
  await harness.runAsync(['skill', 'install', 'cursor', '--target', workspace]);
  assert.ok(fs.existsSync(path.join(workspace, '.agents', 'skills', 'buildr', 'SKILL.md')), 'a retired identity must install the product Skill into the standard root');
  // Only an explicit --adapter may still fail, because that argument names a file convention rather than a host.
  const explicit: any = await harness.runAsync(['render', 'codex', '--adapter', 'cursor', '--target', workspace], { allowFailure: true });
  assert.notEqual(explicit.status, 0, 'an explicit retired --adapter must still fail');
  assert.match(`${explicit.stdout}\n${explicit.stderr}`, /Unsupported runtime adapter: cursor\. Supported adapters: claude-code, agents-standard\./);
}

async function verifyLegacySkillScope(seed: any): Promise<any>  {
  const workspace: any = harness.cloneWorkspace(seed, 'buildr-runtime-skill-scope-');
  await harness.runAsync(['skills', 'render', 'codex', '--destination', 'workspace', '--target', workspace]);
  const plan: any = path.join(workspace, '.agents', 'buildr', 'skill-install-plans', 'beta-remote.md');
  assert.ok(fs.existsSync(plan));
  const result: any = await harness.runAsync(['skills', 'render', 'codex', '--scope', 'projects/scope-alpha', '--target', workspace], { allowFailure: true });
  assert.notEqual(result.status, 0, 'Project-scoped Skill render must fail without automatic migration');
  assert.match(result.stderr, /Legacy Project Skill render scope is no longer supported/);
  assert.doesNotMatch(result.stderr, /migrate-project-assets/);
  assert.ok(fs.existsSync(plan), 'rejected Project-scoped render must not remove workspace install plans');
}

try {
  const seed: any = prepareSeed();
  const implementationMatrix: any = runtimeAdapterImplementationMatrix();
  assert.equal(implementationMatrix.entries.length, Object.keys(RUNTIME_ADAPTERS).length);
  const supportedAdapters: any = implementationMatrix.entries.map((entry: any) => entry.adapterId);
  const lifecycleAdapters: any = new Set(implementationMatrix.representatives.map((entry: any) => entry.adapterId));

  await mapLimit([
    verifySkillSymlinkGuard,
    verifyRulesSymlinkGuard,
    verifyGuardedOrphan,
    verifyRulesOrphanCleanup,
    verifyGitBoundaryCleanup,
    verifyRetiredIdentityUsesStandardAdapter,
    verifyLegacySkillScope,
  ], MAX_PARALLEL_WORKSPACES, (scenario: any) => scenario(seed));

  const contexts: any = await mapLimit(supportedAdapters, MAX_PARALLEL_WORKSPACES, (adapterId: any) => prepareAdapterContext(seed, adapterId, lifecycleAdapters));
  const codexDoctor: any = contexts.find((context: any) => context.adapterId === 'agents-standard').doctor;
  assert.equal(codexDoctor.runtime.claudeCode?.length ?? 0, 0);
  assert.ok(codexDoctor.runtime.agentsStandard.length > 0);

  await mapLimit(contexts.filter((context: any) => lifecycleAdapters.has(context.adapterId)), MAX_PARALLEL_WORKSPACES, verifyLifecycle);

  console.log(`runtime adapter parity implementation families: ${implementationMatrix.representatives.map((entry: any) => `${entry.family}=${entry.adapterId}`).join(', ')}`);
  console.log(`runtime adapter parity supported adapters: ${supportedAdapters.join(', ')}`);
  console.log(`runtime adapter parity command timings: ${harness.timingSummary()}`);
  console.log('runtime adapter parity verification passed');
} finally {
  harness.cleanup();
}
