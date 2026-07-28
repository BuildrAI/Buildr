import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { createTaskFinishProductHandlers } from '../../src/application/task-finish/task-finish-product-executor.mjs';
import { createFinishRun, executeFinishRun } from '../../src/application/task-finish/task-finish-run.mjs';

function command(cwd, executable, args) {
  const result = spawnSync(executable, args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, `${executable} ${args.join(' ')}\n${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

function writeExecutable(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  fs.chmodSync(file, 0o755);
}

const fakeBuildr = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const args = process.argv.slice(2);
const option = (name) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : null; };
const output = (value) => process.stdout.write(JSON.stringify(value) + '\\n');
if (args[0] === 'version') output({ schemaVersion: 'buildr.version/v1', version: '2.0.0-test' });
else if (args[0] === 'openspec' && args[1] === 'audit') output({ schemaVersion: 'buildr.openspec-audit/v1', status: 'passed' });
else if (args[0] === 'openspec' && args[1] === 'converge') {
  const target = option('--target');
  const active = path.join(target, 'projects', 'product', 'openspec', 'changes', args[2]);
  const archived = path.join(target, 'projects', 'product', 'openspec', 'changes', 'archive', args[2]);
  fs.mkdirSync(path.dirname(archived), { recursive: true });
  fs.renameSync(active, archived);
  output({ schemaVersion: 'buildr.openspec-converge/v1', status: 'passed', receipt: path.join(archived, '.buildr-convergence.yml') });
} else if (args[0] === 'sync') process.exit(0);
else if (args[0] === 'worktree' && args[1] === 'create') output({ schemaVersion: 'buildr.worktree-create/v2', state: 'reused', ready: true, executionReady: true });
else if (args[0] === 'verification' && args[1] === 'run') {
  const fingerprint = option('--candidate-fingerprint');
  output({
    schemaVersion: 'buildr.verification-run/v1', status: 'passed', level: option('--level'),
    requiredAssurance: option('--level'), source: { candidateFingerprint: fingerprint },
    workspaceNode: { identity: { digest: 'sha256-workspace-node', version: '22.4.1' } },
    evidenceIdentity: 'evidence-' + fingerprint, evidenceReference: null, totalDurationMs: 7,
  });
} else if (args[0] === 'doctor') output({ schemaVersion: 'buildr.doctor/v1', health: { ready: true }, findings: [] });
else if (args[0] === 'worktree' && args[1] === 'cleanup') {
  const retained = option('--target');
  const environment = path.join(retained, '.worktrees', args[2]);
  const removed = spawnSync('git', ['worktree', 'remove', '--force', environment], { cwd: retained, encoding: 'utf8' });
  if (removed.status !== 0) { process.stderr.write(removed.stderr); process.exit(removed.status || 1); }
  output({ schemaVersion: 'buildr.worktree-cleanup/v1', status: 'removed', task: args[2], environmentRoot: environment });
} else { process.stderr.write('unsupported fake Buildr invocation: ' + args.join(' ')); process.exit(2); }
`;

const fakeOpenSpec = `#!/usr/bin/env node
process.stdout.write(JSON.stringify({ summary: { passed: 1, failed: 0 } }) + '\\n');
`;

test('真实产品执行器单次完成 commit、push、retained transition 与 task cleanup', async (t) => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-task-finish-journey-'));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  const seed = path.join(fixture, 'seed');
  const remote = path.join(fixture, 'remote.git');
  const retained = path.join(fixture, 'workspace');
  fs.mkdirSync(seed);
  command(seed, 'git', ['init', '-b', 'dev']);
  command(seed, 'git', ['config', 'user.name', 'Buildr Journey']);
  command(seed, 'git', ['config', 'user.email', 'journey@example.com']);
  fs.writeFileSync(path.join(seed, '.gitignore'), '/.buildr/\n/.worktrees/\n');
  writeExecutable(path.join(seed, 'projects', 'product', 'buildr'), fakeBuildr);
  const changeRoot = path.join(seed, 'projects', 'product', 'openspec', 'changes', 'finish-journey');
  fs.mkdirSync(path.join(changeRoot, '.buildr'), { recursive: true });
  fs.writeFileSync(path.join(changeRoot, '.openspec.yaml'), 'schema: spec-driven\n');
  fs.writeFileSync(path.join(changeRoot, 'tasks.md'), '- [x] implementation complete\n');
  fs.writeFileSync(path.join(changeRoot, '.buildr', 'knowledge-impact.yml'), 'schemaVersion: buildr.knowledge-impact/v1\nimpacts: []\nunresolvedItems: []\n');
  fs.writeFileSync(path.join(seed, 'projects', 'product', 'verification.yml'), 'schemaVersion: buildr.project-verification/v1\ncapabilities:\n  - id: product.affected\n');
  fs.writeFileSync(path.join(seed, 'README.md'), '# Task Finish journey\n');
  command(seed, 'git', ['add', '-A']);
  command(seed, 'git', ['commit', '-m', 'baseline']);
  command(fixture, 'git', ['init', '--bare', remote]);
  command(seed, 'git', ['remote', 'add', 'origin', remote]);
  command(seed, 'git', ['push', '-u', 'origin', 'dev']);
  command(fixture, 'git', ['clone', '--branch', 'dev', remote, retained]);
  command(retained, 'git', ['config', 'user.name', 'Buildr Journey']);
  command(retained, 'git', ['config', 'user.email', 'journey@example.com']);

  const task = 'finish-journey-task';
  const environmentRoot = path.join(retained, '.worktrees', task);
  command(retained, 'git', ['worktree', 'add', '-b', `codex/${task}`, environmentRoot, 'dev']);
  fs.writeFileSync(path.join(environmentRoot, 'feature.txt'), 'finished candidate\n');
  command(environmentRoot, 'git', ['add', 'feature.txt']);
  command(environmentRoot, 'git', ['commit', '-m', 'implement candidate']);

  const openspec = path.join(fixture, 'bin', 'openspec');
  writeExecutable(openspec, fakeOpenSpec);
  const hostileBin = path.join(fixture, 'hostile-bin');
  writeExecutable(path.join(hostileBin, 'node'), '#!/bin/sh\necho "unexpected incompatible Node" >&2\nexit 91\n');
  const originalPath = process.env.PATH;
  process.env.PATH = `${hostileBin}${path.delimiter}${originalPath || ''}`;
  t.after(() => { process.env.PATH = originalPath; });
  const runtime = {
    resolveTaskEnvironmentContext: () => ({
      taskId: task,
      owner: 'codex',
      executionReady: true,
      environmentRoot,
      workspaceRoot: retained,
      environmentEvidence: { receipt: 'fixture-receipt', cli: 'fixture-cli' },
      membership: { checkoutPath: environmentRoot, selector: 'workspace' },
      repositories: [{ selector: 'workspace', branch: `codex/${task}`, remote: 'origin', startPoint: 'dev' }],
      cliInvocation: { command: path.join(environmentRoot, 'projects', 'product', 'buildr'), argsPrefix: [] },
    }),
    readProjectRegistryPersistence: () => ({ registry: { projects: { product: { source: { path: 'projects/product' } } } } }),
    parseOpenSpecChangeDelta: () => ({ capabilities: new Map() }),
    parseOpenSpecProposalCapabilities: () => ({ modified: new Set(['task-finish-execution']), new: new Set() }),
    createOpenSpecContractResult: () => ({ findings: [], conflicts: [] }),
    detectOpenSpecActiveConflicts: () => {},
    validateOpenSpecProposalAlignment: () => {},
    finishOpenSpecContractResult: (result) => ({ ...result, ok: true }),
    workspaceNodeExecution: () => ({ ready: true, status: 'ready', identity: { digest: 'sha256-workspace-node', version: '22.4.1' }, executable: process.execPath }),
  };
  const run = createFinishRun({
    root: environmentRoot,
    runId: 'product-journey',
    identity: {
      task,
      change: 'finish-journey',
      project: 'product',
      agent: 'codex',
      targetBranch: 'dev',
      remote: 'origin',
      environmentRoot,
      workspaceRoot: retained,
      requiredAssurance: 'affected',
      workspaceNodeIdentity: 'sha256-workspace-node',
    },
  });
  const handlers = createTaskFinishProductHandlers({ runtime, root: environmentRoot, openspecCommand: openspec });
  const activeChange = path.join(environmentRoot, 'projects', 'product', 'openspec', 'changes', 'finish-journey');
  const archivedChange = path.join(environmentRoot, 'projects', 'product', 'openspec', 'changes', 'archive', '2026-07-28-finish-journey');
  fs.mkdirSync(path.dirname(archivedChange), { recursive: true });
  fs.renameSync(activeChange, archivedChange);
  const archivedPreflight = await handlers.preflight({ run });
  assert.equal(archivedPreflight.status, 'passed', JSON.stringify(archivedPreflight, null, 2));
  fs.renameSync(archivedChange, activeChange);
  const result = await executeFinishRun({ root: environmentRoot, run, handlers });

  assert.equal(result.status, 'complete', JSON.stringify(result, null, 2));
  assert.deepEqual(result.phases.map(({ id, status }) => [id, status]), [
    ['preflight', 'passed'], ['prepare', 'passed'], ['verify', 'passed'], ['deliver', 'passed'], ['cleanup', 'passed'],
  ]);
  assert.equal(result.metrics.canonicalCliInvocations, 1);
  assert.equal(result.metrics.agentProviderCompletions, 0);
  assert.equal(result.metrics.manualRecoveryManifests, 0);
  assert.equal(result.metrics.formalVerificationExecutions, 1);
  assert.equal(fs.existsSync(environmentRoot), false);
  assert.equal(fs.existsSync(path.join(retained, 'projects', 'product', 'openspec', 'changes', 'finish-journey')), false);
  assert.equal(fs.existsSync(path.join(retained, 'projects', 'product', 'openspec', 'changes', 'archive', 'finish-journey')), true);
  assert.equal(command(retained, 'git', ['rev-parse', 'HEAD']), result.candidate.head);
  assert.equal(command(retained, 'git', ['ls-remote', '--heads', 'origin', 'dev']).split(/\s+/)[0], result.candidate.head);
  assert.equal(fs.existsSync(result.completion.receipt), true);
});
