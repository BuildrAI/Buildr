import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import YAML from 'yaml';

import { createRuntime } from '../../src/application/compose-runtime.mjs';
import { taskDevelopmentDigest } from '../../src/domain/task-development/task-development.mjs';

function declaration() {
  return {
    schemaVersion: 'buildr.project-verification/v2',
    resources: [],
    capabilities: [{
      id: 'docs.check',
      title: 'Documentation check',
      scope: { project: 'docs', services: ['guide'] },
      invocation: { kind: 'command', argv: ['sh', '-c', 'test -s README.md'], cwd: 'services/guide' },
      applicability: { paths: ['services/guide/**'], conditions: [] },
      proves: ['The guide has non-empty documentation.'],
      requiredForDelivery: true,
      environment: { requires: ['sh'] },
      effects: { writes: [], externalSystems: [], authorization: 'implicit' },
      resourceClaims: [],
    }],
  };
}

test('非 product、non-Git、code-only Workspace 完成 Development 到 Finish carrier 全流程', (t) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-task-development-generic-'));
  const root = path.join(base, 'workspace');
  const source = path.join(base, 'guide-source');
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, 'README.md'), '# Portable guide\n');

  const runtime = createRuntime();
  runtime.initBuildr(['--target', root, '--name', 'portable-docs', '--description', 'Generic Task Development fixture', '--profile', 'team']);
  runtime.createProject(['docs', '--target', root, '--name', 'Docs', '--description', 'Documentation project']);
  runtime.createService(['docs/guide', source, '--target', root, '--name', 'Guide', '--description', 'Documentation service', '--type', 'documentation']);
  fs.writeFileSync(path.join(root, 'projects', 'docs', 'verification.yml'), YAML.stringify(declaration()));
  runtime.createTaskRecord(root, {
    taskId: 'publish-guide',
    title: 'Publish guide',
    intent: 'Deliver the current portable guide.',
    projects: ['docs'],
    services: ['docs/guide'],
    changes: [],
  });

  assert.equal(fs.existsSync(path.join(root, '.git')), false);
  const taskContext = runtime.readTaskRecordPersistence(root, 'publish-guide');
  const declarationContext = runtime.observeTaskVerificationDeclarations(root, 'publish-guide', root);
  runtime.readTaskRecordPersistence = (_targetRoot, taskId) => {
    assert.equal(taskId, 'publish-guide');
    return taskContext;
  };
  runtime.observeTaskVerificationDeclarations = (_targetRoot, taskId) => {
    assert.equal(taskId, 'publish-guide');
    return declarationContext;
  };
  runtime.resolveTaskEnvironmentExecution = (_workspace, taskId) => ({
    ready: true,
    taskId,
    receiptSchema: 'buildr.task-environment-receipt/v2',
    workspaceRoot: root,
    environmentRoot: root,
    validationRoot: root,
    scopes: [
      { selector: 'workspace', kind: 'workspace', sourcePath: '.', executionRoot: root },
      { selector: 'project:docs', kind: 'project', sourcePath: 'projects/docs', executionRoot: path.join(root, 'projects', 'docs') },
      { selector: 'service:docs/guide', kind: 'service', sourcePath: 'projects/docs/services/guide', executionRoot: path.join(root, 'projects', 'docs', 'services', 'guide') },
    ],
  });
  runtime.observeTaskContentComponents = (scopes) => scopes.map((scope) => ({
    selector: scope.selector,
    kind: scope.kind,
    sourcePath: scope.sourcePath,
    observer: 'buildr.filesystem-content-observer/v1',
    identity: taskDevelopmentDigest(`generic-journey:${scope.selector}`),
  })).sort((left, right) => left.selector.localeCompare(right.selector));
  const planningTargetIdentity = taskDevelopmentDigest('publish-guide-plan-v1');
  runtime.recordTaskReview(root, 'publish-guide', {
    reviewType: 'planning',
    targetIdentity: planningTargetIdentity,
    method: 'self',
    reviewed: ['Task intent', 'docs/guide scope', 'declared documentation check'],
    uncovered: [],
    findings: [],
    conclusion: { outcome: 'ready', summary: 'The code-only documentation task is bounded and ready.' },
  });

  let development = runtime.observeTaskDevelopment(root, 'publish-guide', { changeDispositions: [], planningTargetIdentity });
  assert.equal(development.development.receipt.taskContext.changes.length, 0);
  assert.ok(development.development.receipt.contentTarget.components.every((item) => item.observer === 'buildr.filesystem-content-observer/v1'));
  development = runtime.recordTaskDevelopmentPolicy(root, 'publish-guide', {
    capabilities: [{ project: 'docs', capability: 'docs.check', required: true }],
    coverageGaps: [],
    overrides: [],
  });
  const targetIdentity = development.development.receipt.contentTarget.identity;

  const check = spawnSync('sh', ['-c', 'test -s README.md'], { cwd: path.join(root, 'projects', 'docs', 'services', 'guide'), encoding: 'utf8' });
  assert.equal(check.status, 0, check.stderr);
  runtime.recordTaskVerification(root, 'publish-guide', {
    targetIdentity,
    targetSummary: 'Portable documentation Content Target',
    capabilities: [{ project: 'docs', capability: 'docs.check', outcome: 'passed', facts: ['The guide documentation is non-empty.'] }],
    coverageGaps: [],
    conclusion: { outcome: 'passed', summary: 'The declared documentation check passed.' },
    declarationRoot: root,
  });

  development = runtime.freezeTaskDevelopmentCandidate(root, 'publish-guide');
  assert.equal(development.status, 'frozen');
  assert.equal(development.development.receipt.generation, 1);
  const candidate = development.development.receipt.candidate;
  runtime.recordTaskReview(root, 'publish-guide', {
    reviewType: 'completion',
    targetIdentity: candidate.identity,
    method: 'self',
    reviewed: ['Task Candidate', 'Content Target', 'verification policy and facts'],
    uncovered: [],
    findings: [],
    conclusion: { outcome: 'ready', summary: 'The Candidate satisfies the Task intent.' },
  });
  development = runtime.decideTaskDevelopment(root, 'publish-guide', { outcome: 'proceed', summary: 'All current gates are positive.', risks: [] });
  assert.equal(development.development.receipt.decision.candidateIdentity, candidate.identity);
  development = runtime.createTaskDevelopmentHandoff(root, 'publish-guide');
  assert.equal(development.development.receipt.handoffs.length, 1);
  assert.equal(development.development.applicability.handoff, 'current');

  assert.throws(
    () => runtime.assertTaskDevelopmentCarrier(root, 'publish-guide'),
    (error) => error.code === 'task_development_field_invalid' && error.details?.field === 'handoffIdentity',
  );
  const frozenIdentity = {
    handoffIdentity: development.development.receipt.handoffs[0].identity,
    candidateIdentity: candidate.identity,
    candidateGeneration: candidate.generation,
    contentTargetIdentity: candidate.contentTargetIdentity,
  };
  const finishAdapter = runtime.assertTaskDevelopmentCarrier(root, 'publish-guide', frozenIdentity);
  assert.equal(finishAdapter.status, 'equivalent');
  assert.deepEqual(finishAdapter.effects, []);
  const historical = runtime.assertTaskDevelopmentCarrier(root, 'publish-guide', { ...frozenIdentity, handoffIdentity: 'sha256-historical-handoff' });
  assert.equal(historical.status, 'stale');
  assert.equal(historical.diagnostic.code, 'task_development_carrier_identity_mismatch');
  assert.deepEqual(historical.diagnostic.details.mismatches, ['handoffIdentity']);
  const portable = JSON.stringify(finishAdapter.development.receipt);
  assert.doesNotMatch(portable, /node_modules|npm|OpenSpec|git-worktree|\/private\//i);
  assert.equal(finishAdapter.development.receipt.handoffs[0].candidate.contentTargetIdentity, targetIdentity);
});
