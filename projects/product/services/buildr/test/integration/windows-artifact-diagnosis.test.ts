import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { createVerificationExecutor } from '../verification/executor.ts';
import { runWindowsArtifactDiagnosis } from '../verification/release/windows-artifact-diagnosis.ts';

test('source-only diagnosis suppresses inherited artifact variables through the real executor merge', async () => {
  const keys = ['BUILDR_CANDIDATE_TARBALL', 'BUILDR_CANDIDATE_PACK_METADATA', 'BUILDR_CANDIDATE_RELEASE_MANIFEST', 'BUILDR_RELEASE_ARTIFACT_MANIFEST', 'BUILDR_RELEASE_PACKAGE_SPEC'];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const oldSource = 'a'.repeat(40), checkSource = 'b'.repeat(40), tree = 'c'.repeat(40);
  const serviceRoot = path.resolve(import.meta.dirname, '../..');
  try {
    for (const key of keys) process.env[key] = `/absent-inherited-artifact/${key}`;
    const env = { DIAGNOSTIC_CANDIDATE_RUN_ID: '1', DIAGNOSTIC_CANDIDATE_SOURCE: oldSource, EXPECTED_SOURCE_TREE: tree,
      DIAGNOSTIC_SCENARIO: 'worktree-windows', DIAGNOSTIC_RUN_JSON: '/run.json', DIAGNOSTIC_ARTIFACT_DIR: '/old-package',
      DIAGNOSTIC_OUTPUT: '/unused-diagnosis', GITHUB_SHA: checkSource, GITHUB_REPOSITORY: 'BuildrAI/Buildr' };
    let constructed = false;
    const summary = await runWindowsArtifactDiagnosis({ productRoot: serviceRoot, env }, {
      platform: 'win32', readRun: () => ({ id: 1, path: '.github/workflows/verify.yml', event: 'workflow_dispatch', repository: { full_name: 'BuildrAI/Buildr' }, head_sha: oldSource }),
      readGitFacts: () => ({ head: checkSource, tree, dirty: false, changedPaths: [] }), writeSummary: () => {},
      readArtifact: () => ({ tarball: '/old-package/original.tgz', metadataPath: '/old-package/npm-pack.json', manifestPath: '/old-package/release-artifact.json', identity: { sourceCommit: oldSource, sha256: 'd'.repeat(64) } }),
      execute: async (plan, options) => {
        const deleted = { ...options.env };
        for (const key of keys) delete deleted[key];
        assert.throws(() => createVerificationExecutor({ productRoot: serviceRoot, projectRoot: path.resolve(serviceRoot, '../..'), env: deleted }), /shared candidate tarball is missing/u, 'deleting overrides reproduces the inherited-package read');
        createVerificationExecutor({ productRoot: serviceRoot, projectRoot: path.resolve(serviceRoot, '../..'), env: options.env });
        constructed = true;
        return { passed: true, results: plan.steps.map((step: any) => ({ id: step.id, status: 'passed', exitCode: 0, durationMs: 0 })) };
      },
    });
    assert.equal(constructed, true, JSON.stringify(summary.failure));
    assert.equal(summary.status, 'passed'); assert.equal(summary.artifactConsumed, false);
  } finally {
    for (const key of keys) if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key];
  }
});
