import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { isSafeRuntimeStaleOnly, parseWorktreeList, resolveExecutionCliInvocation, resolveExecutionCliSource } from '../../src/application/worktree/worktree-application.mjs';

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
        findings: [{ code: 'runtime.codex_stale', userActionRequired: true }],
      },
      agent: 'codex',
      identity: { clean: true, branch: 'codex/demo', head: 'abc123' },
      expectedBranch: 'codex/demo',
      expectedHead: 'abc123',
    };
    assert.equal(isSafeRuntimeStaleOnly(base), true);
    assert.equal(isSafeRuntimeStaleOnly({ ...base, report: { ...base.report, findings: [{ code: 'commands.missing', userActionRequired: true }] } }), false);
    assert.equal(isSafeRuntimeStaleOnly({ ...base, report: { ...base.report, findings: [...base.report.findings, { code: 'runtime.codex_warning', userActionRequired: true }] } }), false);
    assert.equal(isSafeRuntimeStaleOnly({ ...base, identity: { ...base.identity, clean: false } }), false);
    assert.equal(isSafeRuntimeStaleOnly({ ...base, identity: { ...base.identity, head: 'changed' } }), false);
    assert.equal(isSafeRuntimeStaleOnly({ ...base, report: { ...base.report, mutations: { blocked: true } } }), false);
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
