import assert from 'node:assert/strict';
import test from 'node:test';

import { convergenceDigest } from '../../src/task/openspec/application/convergence-model.ts';
import { runOpenSpecConvergencePreflight } from '../../src/task/openspec/application/openspec-convergence-preflight.ts';

const executableIdentity: any = { sourceKind: 'external-declared', reference: 'external:openspec', version: '1.6.0', sha256: 'fixture-executable' };
const requirement: any = (title: any, scenario: any = 'normal') => `### Requirement: ${title}\n系统 MUST 保持行为。\n\n#### Scenario: ${scenario}\n- **WHEN** 输入有效\n- **THEN** 系统 MUST 成功\n`;
const canonical: any = (...requirements: any[]) => `# demo Specification\n\n## Purpose\n\nFixture purpose provides enough detail for deterministic semantic readiness validation.\n\n## Requirements\n\n${requirements.join('\n')}`;

function delta(operations: any, hash: any = 'sha256-delta'): any  {
  return { hash, operations, capabilities: new Map([['demo', { operations }]]) };
}

function run({ before, operations, activeConflicts = [], activeChanges = [], validation = { status: 'passed', code: null, durationMs: 1, commandCount: 1 }, canonicalIdentity = 'sha256-canonical' }: any): any  {
  const context: any = { change: 'change-a', project: 'product', delta: delta(operations) };
  const canonicalFiles: any = new Map([['demo', { path: 'openspec/specs/demo/spec.md', exists: true, content: before }]]);
  return runOpenSpecConvergencePreflight({
    context,
    executableIdentity,
    capabilityPurposes: new Map(),
    activeConflicts,
    activeChanges: [{ change: 'change-a', status: 'current', deltaDigest: context.delta.hash, diagnosticCode: null }, ...activeChanges],
    canonicalFiles,
    canonicalObservation: { identity: canonicalIdentity, files: [{ path: 'openspec/specs/demo/spec.md', digest: convergenceDigest(before) }] },
    validateProjected: () => validation,
  });
}

test('semantic readiness preflight复用planner并只返回当前ready观察', () => {
  const before: any = canonical(requirement('Existing'));
  const operations: any[] = [{ type: 'ADDED', capability: 'demo', title: 'Added', requirement: requirement('Added') }];
  const first: any = run({ before, operations });
  const second: any = run({ before, operations });
  assert.equal(first.status, 'ready');
  assert.equal(first.readinessIdentity, second.readinessIdentity);
  assert.equal(first.planIdentity, second.planIdentity);
  assert.deepEqual(first.effects, []);
  assert.equal(first.commandCount, 1);
  assert.equal(first.operations[0].status, 'safe');
  assert.equal(first.canonicalObservation.fileCount, 1);
  assert.equal(first.canonicalFiles[0].path, 'openspec/specs/demo/spec.md');
});

test('semantic readiness preflight区分Scenario omission与rename identity conflict', () => {
  const existing: any = `${requirement('Existing')}\n#### Scenario: preserved\n- **WHEN** 条件成立\n- **THEN** 系统 MUST 保留\n`;
  const omission: any = run({
    before: canonical(existing),
    operations: [{ type: 'MODIFIED', capability: 'demo', title: 'Existing', requirement: requirement('Existing') }],
  });
  assert.equal(omission.status, 'blocked');
  assert.deepEqual(omission.blockers[0].omittedScenarioIdentities, ['preserved']);
  assert.equal(omission.blockers[0].category, 'scenario-omission');
  assert.equal(omission.validation, null);

  const rename: any = run({
    before: canonical(requirement('Existing'), requirement('Occupied')),
    operations: [{ type: 'RENAMED', capability: 'demo', from: 'Existing', to: 'Occupied' }],
  });
  assert.equal(rename.status, 'blocked');
  assert.equal(rename.blockers[0].category, 'identity-conflict');
  assert.equal(rename.blockers[0].code, 'rename-not-unique');
});

test('semantic readiness preflight区分active conflict与projected validation failure', () => {
  const before: any = canonical(requirement('Existing'));
  const operations: any[] = [{ type: 'ADDED', capability: 'demo', title: 'Added', requirement: requirement('Added') }];
  const active: any = run({
    before,
    operations,
    activeConflicts: [{ code: 'active-change-conflict', change: 'change-b', capability: 'demo', requirement: 'Added' }],
    activeChanges: [{ change: 'change-b', status: 'valid', deltaDigest: 'sha256-other', diagnosticCode: null }],
  });
  assert.equal(active.status, 'blocked');
  assert.equal(active.blockers[0].category, 'active-change-conflict');

  const invalid: any = run({
    before,
    operations,
    validation: { status: 'blocked', code: 'preflight-strict-validation-failed', durationMs: 1, commandCount: 1, diagnostic: { sha256: 'fixture' } },
  });
  assert.equal(invalid.status, 'blocked');
  assert.equal(invalid.blockers[0].category, 'projected-validation');
  assert.equal(invalid.blockers[0].code, 'preflight-strict-validation-failed');
});

test('readiness identity绑定canonical与全部active Change observations', () => {
  const before: any = canonical(requirement('Existing'));
  const operations: any[] = [{ type: 'ADDED', capability: 'demo', title: 'Added', requirement: requirement('Added') }];
  const baseline: any = run({ before, operations });
  const canonicalChanged: any = run({ before, operations, canonicalIdentity: 'sha256-new-canonical' });
  const activeChanged: any = run({
    before,
    operations,
    activeChanges: [{ change: 'disjoint', status: 'valid', deltaDigest: 'sha256-disjoint', diagnosticCode: null }],
  });
  assert.notEqual(canonicalChanged.readinessIdentity, baseline.readinessIdentity);
  assert.notEqual(activeChanged.readinessIdentity, baseline.readinessIdentity);
  assert.equal(canonicalChanged.planIdentity, baseline.planIdentity);
  assert.equal(activeChanged.planIdentity, baseline.planIdentity);
});
