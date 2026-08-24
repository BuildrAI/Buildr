#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { getRuntimeAdapter, RUNTIME_ADAPTERS, runtimeAdapterImplementationMatrix } from '../../../src/agent-assets/infrastructure/runtime/adapter-contract.mjs';
import { parseSkillsManifest } from '../../../src/agent-assets/infrastructure/runtime/skills/manifests.mjs';
import { skillProjectionOwnershipReceiptTarget } from '../../../src/agent-assets/infrastructure/runtime/skills/projection-files.mjs';
import { findExecutableOnPath } from '../../../src/infrastructure/process.mjs';
import { digestRuntime, mapLimit, RuntimeVerificationHarness } from './fixture.mjs';

const harness = new RuntimeVerificationHarness();
const MAX_PARALLEL_WORKSPACES = 3;

function prepareSeed() {
  const seed = harness.initializeSeed('runtime-parity');
  fs.appendFileSync(path.join(seed, 'AGENTS.md'), '\nROOT_MARKER\n');
  harness.run(['project', 'create', 'scope-alpha', '--target', seed, '--description', 'scope alpha']);
  harness.run(['project', 'create', 'scope-beta', '--target', seed, '--description', 'scope beta']);

  const completeSkillSource = path.join(seed, '.fixture-source', 'complete-runtime-skill');
  for (const directory of ['agents', 'assets', 'examples', 'references', 'scripts', 'templates']) fs.mkdirSync(path.join(completeSkillSource, directory), { recursive: true });
  fs.writeFileSync(path.join(completeSkillSource, 'SKILL.md'), '---\nname: complete-runtime-skill\ndescription: complete runtime projection fixture\n---\n\n# Complete Runtime Skill\n');
  fs.writeFileSync(path.join(completeSkillSource, 'agents', 'openai.yaml'), 'interface:\n  display_name: Complete Runtime Skill\n');
  fs.writeFileSync(path.join(completeSkillSource, 'assets', 'sample.bin'), Buffer.from([0, 255, 16, 128]));
  fs.writeFileSync(path.join(completeSkillSource, 'examples', 'sample.md'), '# Example\n');
  fs.writeFileSync(path.join(completeSkillSource, 'references', 'guide.md'), '# Guide\n');
  fs.writeFileSync(path.join(completeSkillSource, 'scripts', 'run.sh'), '#!/bin/sh\necho complete\n');
  fs.chmodSync(path.join(completeSkillSource, 'scripts', 'run.sh'), 0o744);
  fs.writeFileSync(path.join(completeSkillSource, 'templates', 'template.txt'), 'template\n');
  const fixtureSourceRoot = path.dirname(completeSkillSource);
  assert.equal(spawnSync('git', ['init', '--quiet'], { cwd: fixtureSourceRoot }).status, 0);
  assert.equal(spawnSync('git', ['add', '--', 'complete-runtime-skill'], { cwd: fixtureSourceRoot }).status, 0);
  assert.equal(spawnSync('git', ['update-index', '--chmod=+x', '--', 'complete-runtime-skill/scripts/run.sh'], { cwd: fixtureSourceRoot }).status, 0);
  harness.run(['skills', 'add', '--source', completeSkillSource, '--scope', '.', '--target', seed]);
  fs.rmSync(path.join(seed, '.fixture-source'), { recursive: true, force: true });
  const canonicalSkillsRoot = path.join(seed, 'skills');
  assert.equal(spawnSync('git', ['init', '--quiet'], { cwd: canonicalSkillsRoot }).status, 0);
  assert.equal(spawnSync('git', ['add', '--', 'complete-runtime-skill'], { cwd: canonicalSkillsRoot }).status, 0);
  assert.equal(spawnSync('git', ['update-index', '--chmod=+x', '--', 'complete-runtime-skill/scripts/run.sh'], { cwd: canonicalSkillsRoot }).status, 0);

  fs.mkdirSync(path.join(seed, 'projects', 'scope-alpha', 'services', 'api'), { recursive: true });
  fs.mkdirSync(path.join(seed, 'projects', 'scope-alpha', 'services', 'web'), { recursive: true });
  fs.writeFileSync(path.join(seed, 'projects', 'scope-alpha', 'services', 'api', 'AGENTS.md'), '# API rules\nAPI_MARKER\n');
  fs.writeFileSync(path.join(seed, 'projects', 'scope-alpha', 'services', 'web', 'AGENTS.md'), '# Web rules\nWEB_MARKER\n');

  const rejectedProjectAdd = harness.run(['skills', 'add', 'beta-remote', '--remote-source', 'https://example.com/beta-remote', '--scope', 'projects/scope-beta', '--target', seed, '--description', 'beta remote'], { allowFailure: true });
  assert.notEqual(rejectedProjectAdd.status, 0, 'Legacy Project Skill source scope must be rejected');
  harness.run(['skills', 'add', 'beta-remote', '--remote-source', 'https://example.com/beta-remote', '--target', seed, '--description', 'beta remote']);
  return seed;
}

function assertCompleteSkillInventory(workspace, adapterId) {
  const adapter = getRuntimeAdapter(adapterId);
  const runtimeRoot = path.join(workspace, adapter.traits.skills.root);
  const skills = parseSkillsManifest(path.join(workspace, 'skills', 'manifest.yml'));
  const projectedSkills = skills.filter((skill) => skill.enabled !== false
    && skill.state !== 'uninstalled'
    && (!Array.isArray(skill.runtimes) || skill.runtimes.includes(adapterId))
    && typeof skill.path === 'string'
    && fs.existsSync(path.join(workspace, 'skills', skill.path)));
  for (const skill of projectedSkills) {
    const runtimePath = skill.runtimePath || skill.id;
    assert.ok(fs.existsSync(path.join(runtimeRoot, 'skills', ...runtimePath.split('/'), 'SKILL.md')), `${adapterId} must render ${skill.id}`);
    assert.ok(fs.existsSync(skillProjectionOwnershipReceiptTarget(workspace, 'workspace', adapterId, runtimePath)), `${adapterId} must record a projection ownership receipt for ${skill.id}`);
  }

  assert.ok(fs.existsSync(path.join(runtimeRoot, 'skills', 'task-manager', 'agents', 'openai.yaml')), `${adapterId} must preserve task-manager OpenAI vendor metadata`);
  assert.ok(fs.existsSync(path.join(runtimeRoot, 'skills', 'project-testing', 'references', 'testing-model-v1.md')), `${adapterId} must preserve project-testing reference`);
  const completeRuntime = path.join(runtimeRoot, 'skills', 'complete-runtime-skill');
  for (const relative of ['SKILL.md', 'agents/openai.yaml', 'examples/sample.md', 'references/guide.md', 'scripts/run.sh', 'templates/template.txt']) {
    assert.ok(fs.existsSync(path.join(completeRuntime, ...relative.split('/'))), `${adapterId} must render ${relative}`);
  }
  assert.deepEqual(fs.readFileSync(path.join(completeRuntime, 'assets', 'sample.bin')), Buffer.from([0, 255, 16, 128]), `${adapterId} must preserve binary bytes`);
  const completeReceipt = JSON.parse(fs.readFileSync(skillProjectionOwnershipReceiptTarget(workspace, 'workspace', adapterId, 'complete-runtime-skill'), 'utf8'));
  assert.equal(completeReceipt.files.find((file) => file.path === 'scripts/run.sh')?.executable, true, `${adapterId} must preserve executable intent in portable receipt evidence`);
  if (process.platform !== 'win32') assert.equal((fs.statSync(path.join(completeRuntime, 'scripts', 'run.sh')).mode & 0o100) === 0o100, true, `${adapterId} must preserve owner executable intent`);
}

function assertAdapterSpecificProjection(workspace, adapterId) {
  if (adapterId === 'codex') {
    assert.ok(fs.existsSync(path.join(workspace, '.agents', 'skills', 'buildr', 'SKILL.md')));
    assert.ok(!fs.existsSync(path.join(workspace, '.agents', 'CLAUDE.md')));
  }
  if (adapterId === 'claude-code') {
    assert.ok(fs.existsSync(path.join(workspace, '.claude', 'skills', 'buildr', 'SKILL.md')));
    assert.ok(fs.readFileSync(path.join(workspace, 'CLAUDE.md'), 'utf8').includes('@AGENTS.md'));
  }
  if (adapterId === 'cursor') {
    assert.ok(fs.readFileSync(path.join(workspace, '.cursor', 'rules', 'buildr.mdc'), 'utf8').includes('ROOT_MARKER'));
    assert.ok(fs.readFileSync(path.join(workspace, 'projects', 'scope-alpha', 'services', 'api', '.cursor', 'rules', 'buildr.mdc'), 'utf8').includes('API_MARKER'));
    assert.ok(fs.readFileSync(path.join(workspace, 'projects', 'scope-alpha', 'services', 'web', '.cursor', 'rules', 'buildr.mdc'), 'utf8').includes('WEB_MARKER'));
  }
  if (adapterId === 'qoder') {
    assert.ok(fs.readdirSync(path.join(workspace, '.qoder', 'rules', 'buildr')).some((file) => file.endsWith('.md')));
    assert.ok(fs.existsSync(path.join(workspace, '.qoder', 'skills', 'buildr', 'SKILL.md')));
  }
  if (adapterId === 'workbuddy') {
    assert.ok(fs.readFileSync(path.join(workspace, 'CODEBUDDY.md'), 'utf8').includes('不得读取不相关兄弟目录'));
    assert.ok(fs.existsSync(path.join(workspace, '.codebuddy', 'skills', 'buildr', 'SKILL.md')));
  }
}

async function prepareAdapterContext(seed, adapterId, lifecycleAdapters) {
  const workspace = harness.cloneWorkspace(seed, `buildr-runtime-adapter-${adapterId}-`);
  await harness.runAsync(['skill', 'install', adapterId, '--target', workspace]);
  await harness.runAsync(['render', adapterId, '--scope', '.', '--target', workspace]);
  assertCompleteSkillInventory(workspace, adapterId);
  assertAdapterSpecificProjection(workspace, adapterId);

  if (lifecycleAdapters.has(adapterId)) {
    const check = await harness.runAsync(['runtime', 'check', adapterId, '--scope', '.', '--target', workspace]);
    assert.match(check.stdout, /Environment:/, `${adapterId} runtime check must report environment probes`);
    assert.match(check.stdout, /Activation: rules=/, `${adapterId} runtime check must report activation`);
    if (adapterId === 'cursor') assert.match(check.stdout, /installation: manual \(manual\)/);
    if (adapterId === 'qoder') assert.match(check.stdout, /Reload: Run \/skills reload/);
    if (adapterId === 'workbuddy') assert.doesNotMatch(check.stdout, /runtime\.workbuddy_reference_smoke_pending|reference traversal cannot be proven/);
  }

  const doctor = JSON.parse((await harness.runAsync(['doctor', '--agent', adapterId, '--target', workspace, '--json', '--detail', 'full'])).stdout);
  assert.equal(doctor.agentRuntime.requested, adapterId, `${adapterId} doctor must inspect the requested adapter`);
  assert.equal(doctor.agentRuntime.supported, true, `${adapterId} doctor must recognize a supported adapter`);
  return { adapterId, workspace, doctor };
}

function scopedProjectionSnapshot(workspace, adapterId) {
  if (adapterId === 'cursor') {
    const file = path.join(workspace, 'projects', 'scope-beta', '.cursor', 'rules', 'buildr.mdc');
    return new Map([[file, fs.readFileSync(file, 'utf8')]]);
  }
  if (adapterId === 'qoder') {
    const directory = path.join(workspace, '.qoder', 'rules', 'buildr');
    const file = fs.readdirSync(directory)
      .map((entry) => path.join(directory, entry))
      .find((entry) => fs.readFileSync(entry, 'utf8').includes('source: projects/scope-beta/AGENTS.md'));
    assert.ok(file, 'Qoder must render a managed rule for scope-beta');
    return new Map([[file, fs.readFileSync(file, 'utf8')]]);
  }
  if (adapterId === 'workbuddy') {
    const file = path.join(workspace, 'CODEBUDDY.md');
    return new Map([[file, fs.readFileSync(file, 'utf8')]]);
  }
  return null;
}

async function verifyLifecycle(context) {
  const { adapterId, workspace } = context;
  const adapter = getRuntimeAdapter(adapterId);
  const runtimeRoot = path.join(workspace, adapter.traits.skills.root);

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

  if (adapterId === 'codex' || adapterId === 'claude-code') {
    const renderedFinish = fs.readFileSync(path.join(runtimeRoot, 'skills', 'task-finish', 'SKILL.md'), 'utf8');
    assert.ok(renderedFinish.includes('preflight → prepare → verify → deliver → cleanup'));
    assert.ok(renderedFinish.includes('不把 Buildr 自动 Finish 变成唯一通道'));
    assert.ok(renderedFinish.includes('task finish reconcile'));
    assert.ok(renderedFinish.includes('交付对账（Delivery Reconciliation）'));
    assert.ok(renderedFinish.includes('不接受调用方提交“已成功”'));
    assert.ok(renderedFinish.includes('只有 Delivery 决定业务任务是否已交付'));
    assert.ok(renderedFinish.includes('Activation、Cleanup、Task 登记或 Buildr 内部派生证据失败只能形成 `attention`'));
    assert.ok(!renderedFinish.includes('buildr:contribution openspec#pre-spec-sync'));
  }

  const unrelatedProjection = scopedProjectionSnapshot(workspace, adapterId);
  if (unrelatedProjection) {
    await harness.runAsync(['rules', 'render', adapterId, '--scope', 'projects/scope-alpha', '--target', workspace]);
    for (const [file, content] of unrelatedProjection) {
      assert.equal(fs.readFileSync(file, 'utf8'), content, `${adapterId} Project-scoped Rules render must preserve unrelated projection`);
    }
  }

  const orphan = path.join(runtimeRoot, 'skills', 'runtime-orphan', 'SKILL.md');
  fs.mkdirSync(path.dirname(orphan), { recursive: true });
  fs.writeFileSync(orphan, '---\nname: runtime-orphan\n---\n<!-- Generated by Buildr. Hash: deadbeef. Do not edit. -->\n');
  await harness.runAsync(['render', adapterId, '--scope', '.', '--target', workspace]);
  assert.equal(fs.existsSync(path.dirname(orphan)), false, `${adapterId} must remove a managed runtime orphan`);

  const before = digestRuntime(workspace);
  await harness.runAsync(['render', adapterId, '--scope', '.', '--target', workspace]);
  assert.equal(digestRuntime(workspace), before, `${adapterId} repeated render must be idempotent`);
}

async function verifySkillSymlinkGuard(seed) {
  const workspace = harness.cloneWorkspace(seed, 'buildr-runtime-symlink-');
  const outside = harness.createTemporaryDirectory('buildr-runtime-outside-');
  fs.mkdirSync(path.join(workspace, '.agents'), { recursive: true });
  fs.symlinkSync(outside, path.join(workspace, '.agents', 'skills'), 'dir');
  const result = await harness.runAsync(['skill', 'install', 'codex', '--target', workspace], { allowFailure: true });
  assert.notEqual(result.status, 0, 'runtime install must reject a target path that crosses a symbolic link');
  assert.equal(fs.existsSync(path.join(outside, 'buildr', 'SKILL.md')), false, 'runtime install must not write outside the workspace through a symbolic link');
}

async function verifyRulesSymlinkGuard(seed) {
  const workspace = harness.cloneWorkspace(seed, 'buildr-runtime-rules-symlink-');
  const outside = harness.createTemporaryDirectory('buildr-runtime-rules-outside-');
  fs.symlinkSync(outside, path.join(workspace, '.cursor'), 'dir');
  const result = await harness.runAsync(['rules', 'render', 'cursor', '--scope', '.', '--target', workspace], { allowFailure: true });
  assert.notEqual(result.status, 0, 'runtime rules render must reject a target path that crosses a symbolic link');
  assert.equal(fs.existsSync(path.join(outside, 'rules', 'buildr.mdc')), false, 'rules render must not write outside the workspace through a symbolic link');
}

async function verifyGuardedOrphan(seed) {
  const workspace = harness.cloneWorkspace(seed, 'buildr-runtime-guarded-orphan-');
  await harness.runAsync(['render', 'codex', '--scope', '.', '--target', workspace]);
  const orphanDirectory = path.join(workspace, '.agents', 'skills', 'task-retrospective');
  const userFile = path.join(orphanDirectory, 'user-notes.md');
  fs.writeFileSync(userFile, 'user-owned\n');
  const result = await harness.runAsync(['builtin', 'uninstall', 'task-retrospective', '--target', workspace, '--reason', 'guarded orphan fixture'], { allowFailure: true });
  assert.notEqual(result.status, 0, 'builtin uninstall must stop when a runtime Skill directory contains an unknown user file');
  assert.match(`${result.stdout}\n${result.stderr}`, /非 Buildr 管理的额外文件/);
  assert.equal(fs.readFileSync(userFile, 'utf8'), 'user-owned\n');
  assert.ok(fs.existsSync(path.join(orphanDirectory, 'SKILL.md')), 'conflicted orphan cleanup must preserve managed files too');
  assert.ok(fs.existsSync(path.join(workspace, 'skills', 'buildr', 'task-retrospective', 'SKILL.md')), 'failed uninstall must roll back source asset changes');
}

async function verifyRulesOrphanCleanup(seed) {
  const workspace = harness.cloneWorkspace(seed, 'buildr-runtime-rules-orphan-');
  for (const adapterId of ['cursor', 'qoder', 'workbuddy']) await harness.runAsync(['rules', 'render', adapterId, '--scope', '.', '--target', workspace]);
  const qoderDirectory = path.join(workspace, '.qoder', 'rules', 'buildr');
  const rootQoderRule = fs.readdirSync(qoderDirectory)
    .map((entry) => path.join(qoderDirectory, entry))
    .find((entry) => fs.readFileSync(entry, 'utf8').includes('source: AGENTS.md'));
  assert.ok(rootQoderRule, 'Qoder must render the root AGENTS.md before orphan cleanup');
  fs.rmSync(path.join(workspace, 'AGENTS.md'));
  for (const adapterId of ['cursor', 'qoder', 'workbuddy']) await harness.runAsync(['rules', 'render', adapterId, '--scope', '.', '--target', workspace]);
  assert.equal(fs.existsSync(path.join(workspace, '.cursor', 'rules', 'buildr.mdc')), false);
  assert.equal(fs.existsSync(rootQoderRule), false);
  assert.ok(fs.readdirSync(qoderDirectory).length > 0, 'Qoder cleanup must preserve narrower Project and Service rules');
  const workbuddyIndex = fs.readFileSync(path.join(workspace, 'CODEBUDDY.md'), 'utf8');
  assert.doesNotMatch(workbuddyIndex, /^- \[AGENTS\.md\]\(AGENTS\.md\)$/m);
  assert.match(workbuddyIndex, /projects\/scope-alpha\/AGENTS\.md/);
}

async function verifyGitBoundaryCleanup(seed) {
  const workspace = harness.cloneWorkspace(seed, 'buildr-runtime-boundary-orphan-');
  const externalRepo = path.join(workspace, 'external-repo');
  fs.mkdirSync(path.join(externalRepo, '.git'), { recursive: true });
  fs.writeFileSync(path.join(externalRepo, '.git', 'HEAD'), 'ref: refs/heads/main\n');
  fs.writeFileSync(path.join(externalRepo, 'AGENTS.md'), 'EXTERNAL_REPO_RULE_MUST_NOT_BE_DISCOVERED\n');
  const externalCursorRule = path.join(externalRepo, '.cursor', 'rules', 'buildr.mdc');
  const externalTraeRule = path.join(externalRepo, '.trae', 'rules', 'buildr.md');
  fs.mkdirSync(path.dirname(externalCursorRule), { recursive: true });
  fs.mkdirSync(path.dirname(externalTraeRule), { recursive: true });
  fs.writeFileSync(externalCursorRule, '<!-- Generated by Buildr. Agent adapter: cursor; boundary fixture. -->\n');
  fs.writeFileSync(externalTraeRule, '<!-- Generated by Buildr. Agent adapter: trae; boundary fixture. -->\n');
  await harness.runAsync(['rules', 'render', 'cursor', '--scope', '.', '--target', workspace]);
  await harness.runAsync(['rules', 'render', 'trae', '--scope', '.', '--target', workspace]);
  assert.ok(fs.existsSync(externalCursorRule), 'orphan cleanup must not cross an unregistered nested Git boundary');
  assert.ok(fs.existsSync(externalTraeRule), 'orphan cleanup must not cross an unregistered nested Git boundary');
}

async function verifyLegacySkillScope(seed) {
  const workspace = harness.cloneWorkspace(seed, 'buildr-runtime-skill-scope-');
  await harness.runAsync(['skills', 'render', 'codex', '--destination', 'workspace', '--target', workspace]);
  const plan = path.join(workspace, '.agents', 'buildr', 'skill-install-plans', 'beta-remote.md');
  assert.ok(fs.existsSync(plan));
  const result = await harness.runAsync(['skills', 'render', 'codex', '--scope', 'projects/scope-alpha', '--target', workspace], { allowFailure: true });
  assert.notEqual(result.status, 0, 'Project-scoped Skill render must fail without automatic migration');
  assert.match(result.stderr, /Legacy Project Skill render scope is no longer supported/);
  assert.doesNotMatch(result.stderr, /migrate-project-assets/);
  assert.ok(fs.existsSync(plan), 'rejected Project-scoped render must not remove workspace install plans');
}

try {
  const seed = prepareSeed();
  const implementationMatrix = runtimeAdapterImplementationMatrix();
  assert.equal(implementationMatrix.entries.length, Object.keys(RUNTIME_ADAPTERS).length);
  const supportedAdapters = implementationMatrix.entries.map((entry) => entry.adapterId);
  const lifecycleAdapters = new Set(implementationMatrix.representatives.map((entry) => entry.adapterId));

  await mapLimit([
    verifySkillSymlinkGuard,
    verifyRulesSymlinkGuard,
    verifyGuardedOrphan,
    verifyRulesOrphanCleanup,
    verifyGitBoundaryCleanup,
    verifyLegacySkillScope,
  ], MAX_PARALLEL_WORKSPACES, (scenario) => scenario(seed));

  const contexts = await mapLimit(supportedAdapters, MAX_PARALLEL_WORKSPACES, (adapterId) => prepareAdapterContext(seed, adapterId, lifecycleAdapters));
  const qoder = contexts.find((context) => context.adapterId === 'qoder');
  const gitExecutable = findExecutableOnPath('git');
  assert.ok(gitExecutable, 'runtime parity requires Git while isolating the Qoder installation probe');
  const missingQoderEnvironment = await harness.runAsync(['runtime', 'check', 'qoder', '--scope', '.', '--target', qoder.workspace], { env: { PATH: path.dirname(gitExecutable) } });
  assert.match(missingQoderEnvironment.stdout, /\[warning\] \. - Qoder installation probe failed\./);
  assert.match(missingQoderEnvironment.stdout, /installation: missing \(command\)/);

  const codexDoctor = contexts.find((context) => context.adapterId === 'codex').doctor;
  assert.equal(codexDoctor.runtime.claudeCode.length, 0);
  assert.ok(codexDoctor.runtime.codex.length > 0);

  await mapLimit(contexts.filter((context) => lifecycleAdapters.has(context.adapterId)), MAX_PARALLEL_WORKSPACES, verifyLifecycle);

  console.log(`runtime adapter parity implementation families: ${implementationMatrix.representatives.map((entry) => `${entry.family}=${entry.adapterId}`).join(', ')}`);
  console.log(`runtime adapter parity supported adapters: ${supportedAdapters.join(', ')}`);
  console.log(`runtime adapter parity command timings: ${harness.timingSummary()}`);
  console.log('runtime adapter parity verification passed');
} finally {
  harness.cleanup();
}
