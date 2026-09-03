import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import YAML from 'yaml';

import {
  CANDIDATE_CI_SHARDS,
  INTEGRATION_PRIMARY_SLICES,
  verificationSteps,
} from '../../test/verification/registry.mjs';
import { createVerificationPlan, validateCandidateCiCoverage } from '../../test/verification/planner.mjs';

const serviceRoot = path.resolve(import.meta.dirname, '../..');
const repositoryRoot = path.resolve(serviceRoot, '../../../..');
const read = (relative) => fs.readFileSync(path.join(serviceRoot, relative), 'utf8');

const governanceInvariants = Object.freeze([
  { id: 'action-local-doctor-readiness', owner: 'integration-declarations', files: ['test/integration/core-diagnostics-and-package.test.mjs'] },
  { id: 'task-read-model-independence', owner: 'integration-task-read-models', files: ['test/integration/task-review-repository.test.ts'] },
  { id: 'parent-contribution-read-model', owner: 'integration-task-coordination', files: ['test/integration/parent-coordination-application.test.ts'] },
]);

test('前序治理结果由现有最低充分 Integration owner 集中覆盖', () => {
  const slices = new Map(INTEGRATION_PRIMARY_SLICES.map((slice) => [slice.id, slice]));
  const fileOwners = new Map();
  for (const slice of INTEGRATION_PRIMARY_SLICES) {
    for (const file of slice.files) fileOwners.set(file, [...(fileOwners.get(file) ?? []), slice.id]);
  }
  for (const invariant of governanceInvariants) {
    const owner = slices.get(invariant.owner);
    assert.ok(owner, `${invariant.id} owner must exist`);
    for (const file of invariant.files) {
      assert.equal(fs.statSync(path.join(serviceRoot, file), { throwIfNoEntry: false })?.isFile(), true, file);
      assert.ok(owner.files.includes(file), `${file} must belong to ${owner.id}`);
      assert.deepEqual(fileOwners.get(file), [owner.id], `${file} must have one primary Integration owner`);
    }
  }
});

test('Affected反馈与完整Candidate保持不同范围且每个step只出现一次', () => {
  const affected = createVerificationPlan({ paths: ['resources/workspace/skills/buildr/task-finish/SKILL.md'] });
  const candidate = createVerificationPlan({ profiles: ['candidate'] });
  const affectedIds = affected.steps.map((step) => step.id);
  const candidateIds = candidate.steps.map((step) => step.id);
  assert.equal(affected.scope.mode, 'affected');
  assert.equal(candidate.scope.mode, 'full');
  assert.ok(affectedIds.length < candidateIds.length);
  assert.equal(new Set(affectedIds).size, affectedIds.length);
  assert.equal(new Set(candidateIds).size, candidateIds.length);
  assert.equal(candidate.steps.filter((step) => step.executor.type === 'candidate-artifact').length, 1);
});

test('分布式Candidate只有一个artifact producer且所有consumer显式依赖artifact', () => {
  assert.deepEqual(validateCandidateCiCoverage(verificationSteps, CANDIDATE_CI_SHARDS).findings, []);
  assert.equal(CANDIDATE_CI_SHARDS.filter((shard) => shard.producesArtifact).length, 1);
  const byId = new Map(verificationSteps.map((step) => [step.id, step]));
  for (const shard of CANDIDATE_CI_SHARDS) {
    const consumesArtifact = shard.stepIds.some((id) => byId.get(id)?.executor?.consumesArtifact);
    if (consumesArtifact) assert.equal(shard.requiresArtifact, true, shard.id);
  }
});

test('正式Release消费冻结artifact且不重跑完整Product Candidate', () => {
  const workflow = YAML.parse(fs.readFileSync(path.join(repositoryRoot, '.github/workflows/publish.yml'), 'utf8'));
  const allRuns = Object.values(workflow.jobs)
    .flatMap((job) => job.steps ?? [])
    .map((step) => step.run)
    .filter((value) => typeof value === 'string')
    .join('\n');
  assert.doesNotMatch(allRuns, /test:candidate|verify-buildr-product(?:-ci)?/u);
  assert.equal(allRuns.includes('application-payload.mjs build'), false);
  assert.equal(allRuns.includes('npm pack'), false);
  assert.equal(workflow.jobs.candidate.steps.filter((step) => step.name === 'Download the matching Candidate aggregate').length, 1);
  assert.equal(workflow.jobs.candidate.steps.filter((step) => step.name === 'Download the single frozen Candidate package').length, 1);
  assert.deepEqual(workflow.jobs.release.needs, ['contract', 'candidate', 'host-node', 'launcher']);
  assert.equal(workflow.jobs.release.environment, 'npm-production');
  assert.equal(workflow.jobs.release.permissions['id-token'], 'write');
  for (const name of [
    'Revalidate frozen bytes before any public mutation',
    'Confirm official Registry integrity and both dist-tags',
    'Ensure GitHub Release notes without binary Assets',
    'Smoke exact package from the official Registry',
  ]) assert.ok(workflow.jobs.release.steps.some((step) => step.name === name), name);
});

test('治理质量contract不再用Skill篇幅或章节位置冒充行为证据', () => {
  const source = read('test/contract/direct-git-closeout.test.mjs');
  assert.doesNotMatch(source, /SKILL\.md['"]\),\s*['"]utf8|\.length\s*[<>]=?|indexOf\(['"]##/u);
  for (const retired of [
    'test/contract/collaborator-workspace-sync-routing.test.mjs',
    'test/contract/routine-task-execution-guidance.test.mjs',
    'test/contract/task-finish-preflight-and-change-bind-order.test.mjs',
  ]) assert.equal(fs.existsSync(path.join(serviceRoot, retired)), false, retired);
});
