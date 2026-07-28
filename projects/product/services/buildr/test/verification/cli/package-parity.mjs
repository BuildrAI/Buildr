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
  for (const relative of ['index.html', 'styles.css', 'app.js']) {
    assert.ok(fs.existsSync(path.join(prefix, 'node_modules', '@buildr-ai', 'buildr', 'src', 'interfaces', 'local-app', 'web', relative)), `packaged local app asset is missing: ${relative}`);
  }

  const runPackaged = (args) => spawn(packagedCli, args);
  for (const args of [
    [], ['--version'], ['-V'], ['version'], ['version', '--json'],
    ['help', 'doctor'], ['help', 'app'], ['help', 'init'], ['service', 'create'], ['doctr'], ['doctr', '--json'],
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
    const capability = (id) => ({
      id, title: id, command: { argv: [process.execPath, '-e', 'setTimeout(() => {}, 25)'], cwd: '.' },
      maturity: 'stable', stages: ['candidate'], enforcement: { candidate: 'required' },
      applicability: { paths: ['**'], risks: [] }, coverage: { kind: 'test', owns: [id] },
      environment: { requires: ['node'], services: [] }, effects: { level: 'local-temporary', writes: [], externalSystems: false },
      authorization: 'implicit', resourceClaims: ['task-temp'], dependsOn: [], supersedes: [], sources: ['package-parity'],
    });
    fs.writeFileSync(path.join(workspace, 'projects', 'demo', 'verification.yml'), `${JSON.stringify({
      schemaVersion: 'buildr.project-verification/v1', mode: 'authoritative',
      resources: [
        { id: 'task-temp', title: 'Task temp', strategy: 'isolated', cleanup: 'provider-owned', authorization: 'implicit' },
        { id: 'shared-slot', title: 'Shared slot', strategy: 'coordinated', capacity: 1, cleanup: 'provider-owned', authorization: 'implicit' },
      ],
      capabilities: [capability('demo.one'), capability('demo.two'), { ...capability('demo.shared'), resourceClaims: ['shared-slot'], command: { argv: [process.execPath, '-e', 'setTimeout(() => {}, 80)'], cwd: '.' } }],
    }, null, 2)}\n`);
    result = runner(['verification', 'run', '--project', 'demo', '--level', 'candidate', '--target', workspace, '--json']);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const verification = JSON.parse(result.stdout);
    assert.equal(verification.schemaVersion, 'buildr.verification-run/v1');
    assert.equal(verification.candidateCompleteness, 'confirmed');
    assert.deepEqual(verification.checks.map((check) => check.id), ['demo.one', 'demo.two', 'demo.shared']);
    assert.ok(Date.parse(verification.checks[0].startedAt) < Date.parse(verification.checks[1].finishedAt));
  }
  assert.deepEqual(normalizeWorkspaceSnapshot(snapshot(packagedWorkspace)), normalizeWorkspaceSnapshot(snapshot(checkoutWorkspace)));

  spawn('git', ['init', '--initial-branch=dev', packagedWorkspace]);
  spawn('git', ['-C', packagedWorkspace, 'config', 'user.email', 'buildr-test@example.com']);
  spawn('git', ['-C', packagedWorkspace, 'config', 'user.name', 'Buildr Test']);
  spawn('git', ['-C', packagedWorkspace, 'add', '.']);
  const committed = spawn('git', ['-C', packagedWorkspace, 'commit', '-m', 'packaged concurrent verification fixture']);
  assert.equal(committed.status, 0, committed.stderr);
  const taskIds = ['package-task-a', 'package-task-b'];
  const tasks = taskIds.map((taskId) => {
    const created = runPackaged(['worktree', 'create', taskId, '--agent', 'codex', '--branch', `codex/${taskId}`, '--start-point', 'dev', '--target', packagedWorkspace, '--json']);
    assert.equal(created.status, 0, created.stderr || created.stdout);
    return JSON.parse(created.stdout);
  });
  const concurrent = await Promise.all(tasks.map((task, index) => spawnAsync(task.cliInvocation.command, [
    ...task.cliInvocation.argsPrefix,
    'verification', 'run', '--project', 'demo', '--level', 'candidate', '--target', task.environment.root,
    '--environment', taskIds[index], '--owner', 'codex', '--json',
  ], { cwd: task.environment.root })));
  const summaries = concurrent.map((result, index) => {
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.schemaVersion, 'buildr.verification-run/v1');
    assert.equal(payload.environment.taskId, taskIds[index]);
    assert.equal(payload.candidateCompleteness, 'confirmed');
    assert.match(payload.evidenceIdentity, /^sha256-/);
    return payload;
  });
  assert.equal(summaries.some((summary) => summary.checks.find((check) => check.id === 'demo.shared').resourceCoordination.waitDurationMs > 20), true);
  for (const taskId of taskIds) {
    const cleaned = runPackaged(['worktree', 'cleanup', taskId, '--agent', 'codex', '--integrated-ref', 'workspace=dev', '--target', packagedWorkspace, '--json']);
    assert.equal(cleaned.status, 0, cleaned.stderr || cleaned.stdout);
  }

  console.log('CLI package parity verification passed: help, failures, JSON discovery, workspace mutations, generic Project verification, and packaged dual-task coordination match checkout and npm tarball entrypoints.');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
