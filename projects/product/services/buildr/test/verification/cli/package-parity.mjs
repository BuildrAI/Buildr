#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn as spawnChild, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readSharedCandidatePackage } from '../release/candidate-package.mjs';

const productRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const checkoutCli = path.join(productRoot, 'bin', 'buildr.mjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-cli-parity-'));

function spawn(command, args, options = {}) {
  return spawnSync(command, args, { cwd: options.cwd || productRoot, encoding: 'utf8', env: process.env });
}

function spawnAsync(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawnChild(command, args, { cwd: options.cwd || productRoot, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (status, signal) => resolve({ status, signal, stdout, stderr }));
  });
}

function runCheckout(args) {
  return spawn(process.execPath, [checkoutCli, ...args]);
}

function snapshot(directory) {
  const result = {};
  const visit = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else result[path.relative(directory, absolute).split(path.sep).join('/')] = fs.readFileSync(absolute, 'utf8');
    }
  };
  visit(directory);
  return result;
}

function normalizeWorkspaceSnapshot(value) {
  const workspaceId = value['.buildr/workspace.yml']?.match(/^id:\s*([0-9a-f-]{36})$/m)?.[1];
  const skillsWorkspaceId = value['skills/manifest.yml']?.match(/^workspaceId:\s*([0-9a-f-]{36})$/m)?.[1];
  assert.ok(workspaceId, 'Workspace metadata must contain a UUID');
  assert.equal(skillsWorkspaceId, workspaceId, 'Workspace and Skills manifests must share one UUID');
  const projectIds = [...(value['projects/manifest.yml'] || '').matchAll(/^    id:\s*([0-9a-f-]{36})$/gm)].map((match) => match[1]);
  return Object.fromEntries(Object.entries(value).map(([file, content]) => {
    let normalized = content.replaceAll(workspaceId, '<workspace-id>');
    projectIds.forEach((projectId, index) => { normalized = normalized.replaceAll(projectId, `<project-id-${index + 1}>`); });
    return [file, normalized];
  }));
}

try {
  const packDir = path.join(root, 'pack');
  const prefix = path.join(root, 'prefix');
  fs.mkdirSync(packDir, { recursive: true });
  const shared = readSharedCandidatePackage();
  let tarball = shared?.tarball;
  if (!tarball) {
    const packed = spawn('npm', ['pack', '--json', '--pack-destination', packDir]);
    assert.equal(packed.status, 0, packed.stderr);
    tarball = path.join(packDir, JSON.parse(packed.stdout)[0].filename);
  }
  const installed = spawn('npm', ['install', '--prefix', prefix, tarball]);
  assert.equal(installed.status, 0, installed.stderr);
  const packagedCli = path.join(prefix, 'node_modules', '.bin', 'buildr');
  for (const relative of ['index.html', 'styles.css', 'app.js', 'features/tasks.js', 'features/task-detail.js']) {
    assert.ok(fs.existsSync(path.join(prefix, 'node_modules', '@buildr-ai', 'buildr', 'src', 'interfaces', 'local-app', 'web', relative)), `packaged local app asset is missing: ${relative}`);
  }

  const runPackaged = (args) => spawn(packagedCli, args);
  for (const args of [
    [], ['--version'], ['-V'], ['version'], ['version', '--json'],
    ['help', 'doctor'], ['help', 'app'], ['help', 'init'], ['help', 'task'], ['help', 'task', 'review'], ['help', 'task', 'review', 'inspect'], ['help', 'task', 'review', 'record'], ['help', 'task', 'verification'], ['help', 'task', 'verification', 'inspect'], ['help', 'task', 'verification', 'record'], ['task', 'create', '--json'], ['task', 'review', 'inspect', '--json'], ['task', 'verification', 'inspect', '--json'], ['service', 'create'], ['doctr'], ['doctr', '--json'],
    ['runtime', 'list', '--json'],
  ]) {
    const checkout = runCheckout(args);
    const packaged = runPackaged(args);
    assert.equal(packaged.status, checkout.status, `exit status differs: ${args.join(' ')}`);
    assert.equal(packaged.stdout, checkout.stdout, `stdout differs: ${args.join(' ')}`);
    assert.equal(packaged.stderr, checkout.stderr, `stderr differs: ${args.join(' ')}`);
  }

  const checkoutWorkspace = path.join(root, 'checkout-workspace');
  const packagedWorkspace = path.join(root, 'packaged-workspace');
  for (const [runner, workspace] of [[runCheckout, checkoutWorkspace], [runPackaged, packagedWorkspace]]) {
    let result = runner(['init', '--agent', 'codex', '--target', workspace, '--name', 'parity', '--description', 'Package parity workspace', '--profile', 'team']);
    assert.equal(result.status, 0, result.stderr);
    result = runner(['project', 'create', 'demo', '--target', workspace, '--name', 'Demo', '--description', 'Package parity Project']);
    assert.equal(result.status, 0, result.stderr);
    result = runner(['sync', 'codex', '--target', workspace]);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(fs.existsSync(path.join(workspace, 'skills', 'buildr', 'task-manager', 'SKILL.md')), 'sync must install task-manager source');
    assert.ok(fs.existsSync(path.join(workspace, '.agents', 'skills', 'task-manager', 'SKILL.md')), 'sync must project task-manager into Codex runtime');
    assert.ok(fs.existsSync(path.join(workspace, 'skills', 'buildr', 'task-review', 'SKILL.md')), 'sync must install task-review source');
    assert.ok(fs.existsSync(path.join(workspace, '.agents', 'skills', 'task-review', 'SKILL.md')), 'sync must project task-review into Codex runtime');
    assert.ok(fs.existsSync(path.join(workspace, 'skills', 'buildr', 'project-testing', 'SKILL.md')), 'sync must install project-testing source');
    assert.ok(fs.existsSync(path.join(workspace, '.agents', 'skills', 'project-testing', 'SKILL.md')), 'sync must project project-testing into Codex runtime');
    assert.ok(fs.existsSync(path.join(workspace, '.agents', 'skills', 'project-testing', 'references', 'testing-model-v1.md')), 'sync must preserve project-testing reference');
    assert.ok(fs.existsSync(path.join(workspace, 'skills', 'buildr', 'task-verification', 'SKILL.md')), 'sync must install task-verification source');
    assert.ok(fs.existsSync(path.join(workspace, '.agents', 'skills', 'task-verification', 'SKILL.md')), 'sync must project task-verification into Codex runtime');
    const renderedTriage = fs.readFileSync(path.join(workspace, '.agents', 'skills', 'task-triage', 'SKILL.md'), 'utf8');
    assert.match(renderedTriage, /`buildr\.task-record@1`/);
    assert.match(renderedTriage, /selected provider: `task-manager`/);
    result = runner(['doctor', '--agent', 'codex', '--target', workspace, '--json']);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(JSON.parse(result.stdout).health.ready, true);
    const capability = (id) => ({
      id, title: id,
      scope: { project: 'demo', services: [] },
      invocation: { kind: 'command', argv: [process.execPath, '-e', 'setTimeout(() => {}, 25)'], cwd: '.' },
      applicability: { paths: ['**'], conditions: [] }, proves: [id], requiredForDelivery: true,
      environment: { requires: ['node'] }, effects: { writes: [], externalSystems: [], authorization: 'implicit' },
      resourceClaims: [],
    });
    fs.writeFileSync(path.join(workspace, 'projects', 'demo', 'verification.yml'), `${JSON.stringify({
      schemaVersion: 'buildr.project-verification/v2',
      resources: [
        { id: 'shared-slot', title: 'Shared slot', strategy: 'coordinated', capacity: 1, authorization: 'implicit' },
      ],
      capabilities: [capability('demo.one'), capability('demo.two'), { ...capability('demo.shared'), resourceClaims: ['shared-slot'], invocation: { kind: 'command', argv: [process.execPath, '-e', 'setTimeout(() => {}, 80)'], cwd: '.' } }],
    }, null, 2)}\n`);
    result = runner(['verification', 'run', '--project', 'demo', '--capability', 'demo.one', '--capability', 'demo.two', '--capability', 'demo.shared', '--target-identity', 'target:package-parity', '--target', workspace, '--json']);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const verification = JSON.parse(result.stdout);
    assert.equal(verification.schemaVersion, 'buildr.verification-execution/v1');
    assert.match(verification.executionIdentity, /^sha256-/);
    assert.deepEqual(verification.checks.map((check) => check.id), ['demo.one', 'demo.two', 'demo.shared']);
    assert.ok(Date.parse(verification.checks[0].startedAt) < Date.parse(verification.checks[1].finishedAt));
  }
  assert.deepEqual(normalizeWorkspaceSnapshot(snapshot(packagedWorkspace)), normalizeWorkspaceSnapshot(snapshot(checkoutWorkspace)));

  const normalizeTaskPayload = (payload, workspace) => ({
    ...payload,
    path: payload.path ? path.relative(workspace, payload.path).split(path.sep).join('/') : null,
    recordDigest: payload.recordDigest ? '<record-digest>' : null,
    record: payload.record ? { ...payload.record, createdAt: '<time>', updatedAt: '<time>' } : null,
    diagnostic: payload.diagnostic?.details
      ? { ...payload.diagnostic, details: {
        ...payload.diagnostic.details,
        ...(payload.diagnostic.details.currentRecordDigest ? { currentRecordDigest: '<record-digest>' } : {}),
        ...(path.isAbsolute(payload.diagnostic.details.path || '') ? { path: path.relative(workspace, payload.diagnostic.details.path).split(path.sep).join('/') } : {}),
      } }
      : payload.diagnostic,
  });
  const normalizeReviewPayload = (payload, workspace) => ({
    ...payload,
    slots: Object.fromEntries(Object.entries(payload.slots).map(([reviewType, slot]) => [reviewType, {
      ...slot,
      path: path.isAbsolute(slot.path || '') ? path.relative(workspace, slot.path).split(path.sep).join('/') : slot.path,
      resultDigest: slot.resultDigest ? '<result-digest>' : null,
      result: slot.result ? { ...slot.result, completedAt: '<time>' } : null,
    }])),
    diagnostic: payload.diagnostic?.details
      ? { ...payload.diagnostic, details: {
        ...payload.diagnostic.details,
        ...(path.isAbsolute(payload.diagnostic.details.path || '') ? { path: path.relative(workspace, payload.diagnostic.details.path).split(path.sep).join('/') } : {}),
      } }
      : payload.diagnostic,
  });
  const normalizeVerificationPayload = (payload, workspace) => ({
    ...payload,
    slot: {
      ...payload.slot,
      path: path.isAbsolute(payload.slot?.path || '') ? path.relative(workspace, payload.slot.path).split(path.sep).join('/') : payload.slot?.path,
      resultDigest: payload.slot?.resultDigest ? '<result-digest>' : null,
      result: payload.slot?.result ? {
        ...payload.slot.result,
        declarations: payload.slot.result.declarations.map((item) => ({ ...item, identity: item.identity === 'absent' ? 'absent' : '<declaration-digest>' })),
        completedAt: '<time>',
      } : null,
      applicability: payload.slot?.applicability ? {
        ...payload.slot.applicability,
        target: { ...payload.slot.applicability.target },
        reasons: payload.slot.applicability.reasons.map((reason) => ({ ...reason, message: reason.code === 'target-identity-changed' ? '<target-changed>' : reason.message })),
      } : null,
    },
  });
  const taskParity = [];
  for (const [runner, workspace] of [[runCheckout, checkoutWorkspace], [runPackaged, packagedWorkspace]]) {
    const results = [];
    for (const args of [
      ['task', 'create', 'parity-task', '--title', 'Parity Task', '--intent', '验证 checkout/npm Task Record parity', '--project', 'demo', '--target', workspace, '--json'],
      ['task', 'inspect', 'parity-task', '--target', workspace, '--json'],
      ['task', 'update', 'parity-task', '--intent', '已更新', '--target', workspace, '--json'],
    ]) {
      const execution = runner(args); assert.equal(execution.status, 0, execution.stderr || execution.stdout); results.push(normalizeTaskPayload(JSON.parse(execution.stdout), workspace));
    }
    let review = runner(['task', 'review', 'record', 'parity-task', '--type', 'planning', '--target-identity', 'plan:parity-v1', '--method', 'self', '--reviewed', 'task intent', '--outcome', 'ready', '--summary', 'Plan ready', '--target', workspace, '--json']);
    assert.equal(review.status, 0, review.stderr || review.stdout); results.push(normalizeReviewPayload(JSON.parse(review.stdout), workspace));
    review = runner(['task', 'review', 'inspect', 'parity-task', '--planning-target', 'plan:parity-v2', '--target', workspace, '--json']);
    assert.equal(review.status, 0, review.stderr || review.stdout); results.push(normalizeReviewPayload(JSON.parse(review.stdout), workspace));
    review = runner(['task', 'review', 'record', 'parity-task', '--type', 'completion', '--method', 'self', '--reviewed', 'candidate', '--outcome', 'ready', '--summary', 'Candidate ready', '--target', workspace, '--json']);
    assert.equal(review.status, 1, review.stderr || review.stdout); results.push(normalizeReviewPayload(JSON.parse(review.stdout), workspace));
    let verificationResult = runner(['task', 'verification', 'record', 'parity-task', '--target-identity', 'delivery:parity-v1', '--target-summary', 'Parity delivery target', '--capability', 'demo/demo.one::passed::Demo one passed', '--outcome', 'passed', '--summary', 'Parity verification passed', '--target', workspace, '--json']);
    assert.equal(verificationResult.status, 0, verificationResult.stderr || verificationResult.stdout); results.push(normalizeVerificationPayload(JSON.parse(verificationResult.stdout), workspace));
    verificationResult = runner(['task', 'verification', 'inspect', 'parity-task', '--target-identity', 'delivery:parity-v2', '--target', workspace, '--json']);
    assert.equal(verificationResult.status, 0, verificationResult.stderr || verificationResult.stdout); results.push(normalizeVerificationPayload(JSON.parse(verificationResult.stdout), workspace));
    let execution = runner(['task', 'complete', 'parity-task', '--summary', '无需交付变更', '--no-change', '--target', workspace, '--json']);
    assert.equal(execution.status, 0, execution.stderr || execution.stdout); results.push(normalizeTaskPayload(JSON.parse(execution.stdout), workspace));
    const blocked = runner(['task', 'update', 'parity-task', '--title', '不可重开', '--target', workspace, '--json']); assert.equal(blocked.status, 1, blocked.stderr || blocked.stdout); results.push(normalizeTaskPayload(JSON.parse(blocked.stdout), workspace));
    const duplicate = runner(['task', 'create', 'parity-task', '--title', '重复', '--intent', '不得覆盖', '--target', workspace, '--json']); assert.equal(duplicate.status, 1, duplicate.stderr || duplicate.stdout); results.push(normalizeTaskPayload(JSON.parse(duplicate.stdout), workspace));
    const invalidReference = runner(['task', 'create', 'invalid-reference-task', '--title', '无效引用', '--intent', '项目不存在', '--project', 'missing', '--target', workspace, '--json']); assert.equal(invalidReference.status, 1, invalidReference.stderr || invalidReference.stdout); results.push(normalizeTaskPayload(JSON.parse(invalidReference.stdout), workspace));
    const occupiedDirectory = path.join(workspace, '.buildr', 'tasks', 'occupied-parity-task'); fs.mkdirSync(occupiedDirectory); fs.writeFileSync(path.join(occupiedDirectory, 'review.yml'), 'owner: user-defined-sibling\n');
    const occupied = runner(['task', 'create', 'occupied-parity-task', '--title', '路径占用', '--intent', '不得覆盖 sibling', '--target', workspace, '--json']); assert.equal(occupied.status, 1, occupied.stderr || occupied.stdout); results.push(normalizeTaskPayload(JSON.parse(occupied.stdout), workspace)); assert.equal(fs.readFileSync(path.join(occupiedDirectory, 'review.yml'), 'utf8'), 'owner: user-defined-sibling\n');
    let corrupt = runner(['task', 'create', 'corrupt-parity-task', '--title', '损坏记录', '--intent', '验证 fail closed', '--target', workspace, '--json']); assert.equal(corrupt.status, 0, corrupt.stderr || corrupt.stdout);
    fs.appendFileSync(path.join(workspace, '.buildr', 'tasks', 'corrupt-parity-task', 'task.yml'), 'revision: 1\n');
    corrupt = runner(['task', 'inspect', 'corrupt-parity-task', '--target', workspace, '--json']); assert.equal(corrupt.status, 1, corrupt.stderr || corrupt.stdout); results.push(normalizeTaskPayload(JSON.parse(corrupt.stdout), workspace));
    execution = runner(['task', 'create', 'abandoned-parity-task', '--title', 'Abandoned Task', '--intent', '验证放弃 parity', '--target', workspace, '--json']); assert.equal(execution.status, 0, execution.stderr || execution.stdout);
    execution = runner(['task', 'abandon', 'abandoned-parity-task', '--reason', '目标取消', '--target', workspace, '--json']); assert.equal(execution.status, 0, execution.stderr || execution.stdout); results.push(normalizeTaskPayload(JSON.parse(execution.stdout), workspace));
    assert.doesNotMatch(fs.readFileSync(path.join(workspace, '.buildr', 'tasks', 'parity-task', 'task.yml'), 'utf8'), /recordDigest|revision|workspaceId/);
    taskParity.push(results);
  }
  assert.deepEqual(taskParity[1], taskParity[0]);

  spawn('git', ['init', '--initial-branch=dev', packagedWorkspace]);
  spawn('git', ['-C', packagedWorkspace, 'config', 'user.email', 'buildr-test@example.com']);
  spawn('git', ['-C', packagedWorkspace, 'config', 'user.name', 'Buildr Test']);
  spawn('git', ['-C', packagedWorkspace, 'add', '.']);
  const committed = spawn('git', ['-C', packagedWorkspace, 'commit', '-m', 'packaged concurrent verification fixture']);
  assert.equal(committed.status, 0, committed.stderr);
  const taskIds = ['package-task-a', 'package-task-b'];
  const tasks = taskIds.map((taskId) => {
    const record = runPackaged(['task', 'create', taskId, '--title', taskId, '--intent', '验证 packaged Task Environment 并发', '--project', 'demo', '--target', packagedWorkspace, '--json']);
    assert.equal(record.status, 0, record.stderr || record.stdout);
    const prepared = runPackaged(['task', 'environment', 'prepare', taskId, '--agent', 'codex', '--branch', `codex/${taskId}`, '--start-point', 'dev', '--target', packagedWorkspace, '--json']);
    assert.equal(prepared.status, 0, prepared.stderr || prepared.stdout);
    const payload = JSON.parse(prepared.stdout);
    assert.equal(payload.status, 'ready');
    assert.equal(payload.execution.ready, true);
    return payload;
  });
  const concurrent = await Promise.all(tasks.map((task, index) => spawnAsync(task.execution.cliInvocation.command, [
    ...task.execution.cliInvocation.argsPrefix,
    'verification', 'run', '--project', 'demo', '--capability', 'demo.one', '--capability', 'demo.two', '--capability', 'demo.shared',
    '--target-identity', `target:${taskIds[index]}`, '--target', task.execution.workdir,
    '--environment', taskIds[index], '--workspace', packagedWorkspace, '--json',
  ], { cwd: task.execution.workdir })));
  const summaries = concurrent.map((result, index) => {
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.schemaVersion, 'buildr.verification-execution/v1');
    assert.equal(payload.environment.taskId, taskIds[index]);
    assert.match(payload.executionIdentity, /^sha256-/);
    return payload;
  });
  summaries.forEach((summary, index) => {
    const coordination = summary.checks.find((check) => check.id === 'demo.shared').resourceCoordination;
    assert.equal(coordination.claims.some((claim) => claim.resource === 'shared-slot'
      && claim.strategy === 'coordinated'
      && claim.slot === 0
      && claim.status === 'acquired'
      && claim.owner.taskId === taskIds[index]), true);
    assert.equal(coordination.release.some((claim) => claim.resource === 'shared-slot'
      && claim.slot === 0
      && claim.status === 'released'), true);
  });
  for (const taskId of taskIds) {
    const abandoned = runPackaged(['task', 'abandon', taskId, '--reason', 'package parity fixture complete', '--target', packagedWorkspace, '--json']);
    assert.equal(abandoned.status, 0, abandoned.stderr || abandoned.stdout);
    const cleaned = runPackaged(['task', 'environment', 'cleanup', taskId, '--target', packagedWorkspace, '--json']);
    assert.equal(cleaned.status, 0, cleaned.stderr || cleaned.stdout);
    assert.equal(JSON.parse(cleaned.stdout).status, 'cleaned');
  }

  console.log('CLI package parity verification passed: help, failures, JSON discovery, workspace mutations, generic Project verification, and packaged dual-task coordination match checkout and npm tarball entrypoints.');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
