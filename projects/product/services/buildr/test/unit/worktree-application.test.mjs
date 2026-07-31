import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  evaluateTaskEnvironmentDoctor,
  isSafeRuntimeStaleOnly,
  parseWorktreeList,
  resolveExecutionCliInvocation,
  resolveExecutionCliSource,
  syncSourcePlanRequiresCanonicalSync,
} from '../../src/application/worktree/worktree-application.mjs';

describe('worktree application', () => {
  test('parses porcelain worktree identity', () => {
    assert.deepEqual(parseWorktreeList([
      'worktree /workspace',
      'HEAD abc123',
      'branch refs/heads/main',
      '',
      'worktree /workspace/.worktrees/demo',
      'HEAD def456',
      'branch refs/heads/codex/demo',
      '',
    ].join('\n')), [
      { path: '/workspace', head: 'abc123', branchRef: 'refs/heads/main', branch: 'main' },
      { path: '/workspace/.worktrees/demo', head: 'def456', branchRef: 'refs/heads/codex/demo', branch: 'codex/demo' },
    ]);
  });

  test('automatic sync accepts only selected runtime stale with stable clean identity', () => {
    const base = {
      report: {
        ok: true,
        health: { workspaceValid: true },
        mutations: { blocked: false },
        findings: [{ status: 'warning', code: 'runtime.codex_stale', userActionRequired: true }],
      },
      agent: 'codex',
      identity: { clean: true, branch: 'codex/demo', head: 'abc123' },
      expectedBranch: 'codex/demo',
      expectedHead: 'abc123',
    };
    assert.equal(isSafeRuntimeStaleOnly(base), true);
    assert.equal(isSafeRuntimeStaleOnly({ ...base, report: { ...base.report, findings: [{ status: 'warning', code: 'commands.missing', userActionRequired: true }] } }), false);
    assert.equal(isSafeRuntimeStaleOnly({ ...base, report: { ...base.report, findings: [...base.report.findings, { status: 'warning', code: 'runtime.codex_warning', userActionRequired: true }] } }), false);
    assert.equal(isSafeRuntimeStaleOnly({ ...base, identity: { ...base.identity, clean: false } }), false);
    assert.equal(isSafeRuntimeStaleOnly({ ...base, identity: { ...base.identity, head: 'changed' } }), false);
    assert.equal(isSafeRuntimeStaleOnly({ ...base, report: { ...base.report, mutations: { blocked: true } } }), false);
  });

  test('classifies omitted repositories and receipt task branches as contextual findings', () => {
    const report = {
      health: { workspaceValid: true },
      findings: [
        { status: 'warning', code: 'service.git.missing', path: 'projects/app/services/worker' },
        { status: 'warning', code: 'service.branch_mismatch', path: 'projects/app/services/api', actual: 'tasks/demo' },
        { status: 'warning', code: 'runtime.codex_stale', path: '.', userActionRequired: true },
      ],
    };
    const evaluation = evaluateTaskEnvironmentDoctor({
      report,
      repositories: [
        { entityType: 'workspace', sourcePath: '.', branch: 'tasks/demo' },
        { entityType: 'service', sourcePath: 'projects/app/services/api', branch: 'tasks/demo' },
      ],
    });
    assert.equal(evaluation.ready, false);
    assert.deepEqual(evaluation.contextualFindings.map((item) => item.reason), ['repository-not-selected', 'receipt-task-branch']);
    assert.deepEqual(evaluation.actionableFindings.map((item) => item.code), ['runtime.codex_stale']);

    const drifted = evaluateTaskEnvironmentDoctor({
      report: { ...report, findings: [{ ...report.findings[1], actual: 'tasks/other' }] },
      repositories: [{ entityType: 'service', sourcePath: 'projects/app/services/api', branch: 'tasks/demo' }],
    });
    assert.equal(drifted.ready, false);
    assert.deepEqual(drifted.actionableFindings.map((item) => item.code), ['service.branch_mismatch']);
  });

  test('requires canonical sync when the source plan would converge managed source assets', () => {
    const aligned = {
      workspace: { required: false },
      projects: { required: false },
      builtins: { findings: [{ status: 'installed', converge: false }] },
      components: { errors: [], plans: [{ record: { definition: { id: 'base' } }, plan: { existingEntry: {}, oldDefinition: { id: 'base' }, restoring: false } }] },
    };
    assert.equal(syncSourcePlanRequiresCanonicalSync(aligned), false);
    assert.equal(syncSourcePlanRequiresCanonicalSync({ ...aligned, builtins: { findings: [{ status: 'installed', converge: true }] } }), true);
    assert.equal(syncSourcePlanRequiresCanonicalSync({ ...aligned, workspace: { required: true } }), true);
    assert.equal(syncSourcePlanRequiresCanonicalSync({ ...aligned, components: { errors: [], plans: [{ record: { definition: { id: 'new' } }, plan: { existingEntry: {}, oldDefinition: { id: 'old' }, restoring: false } }] } }), true);
  });

  test('binds self-hosted environments to their local CLI and consumers to the external product CLI', () => {
    assert.deepEqual(resolveExecutionCliSource({
      workspaceRoot: '/workspace',
      environmentRoot: '/workspace/.worktrees/demo',
      productRoot: '/workspace/projects/product/services/buildr',
    }), {
      sourceRoot: '/workspace/.worktrees/demo/projects/product/services/buildr',
      sourceKind: 'environment-local',
    });
    assert.deepEqual(resolveExecutionCliSource({
      workspaceRoot: '/workspace',
      environmentRoot: '/workspace/.worktrees/demo',
      productRoot: '/workspace/.worktrees/demo/projects/product/services/buildr',
    }), {
      sourceRoot: '/workspace/.worktrees/demo/projects/product/services/buildr',
      sourceKind: 'environment-local',
    });
    assert.deepEqual(resolveExecutionCliSource({
      workspaceRoot: '/consumer',
      environmentRoot: '/consumer/.worktrees/demo',
      productRoot: '/opt/buildr',
    }), {
      sourceRoot: '/opt/buildr',
      sourceKind: 'external-product',
    });
  });

  test('returns cwd-independent invocations for self-hosted and external products', () => {
    assert.deepEqual(resolveExecutionCliInvocation({
      sourceRoot: '/workspace/.worktrees/demo/projects/product/services/buildr',
      sourceKind: 'environment-local',
      nodeExecutable: '/ignored/node',
    }), {
      command: '/workspace/.worktrees/demo/projects/product/buildr',
      argsPrefix: [],
    });
    assert.deepEqual(resolveExecutionCliInvocation({
      sourceRoot: '/opt/arbitrary/buildr',
      sourceKind: 'external-product',
      nodeExecutable: '/opt/node/bin/node',
    }), {
      command: '/opt/node/bin/node',
      argsPrefix: ['/opt/arbitrary/buildr/bin/buildr.mjs'],
    });
  });
});
