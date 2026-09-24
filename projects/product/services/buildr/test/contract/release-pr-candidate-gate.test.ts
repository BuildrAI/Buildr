import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyReleasePullRequestCandidate } from '../../tools/release/verify-pr-candidate.ts';

const repository = 'BuildrAI/Buildr';
const branch = 'codex/release-main-0.1.0-rc.36-g3';
const sourceCommit = 'd70a89840820e32634146b614e7979fecfde239a';
const runId = 35994036028;

function fixture(overrides: any = {}) {
  const event = { pull_request: { base: { ref: 'main' }, head: { ref: branch, sha: sourceCommit }, body: `Release 0.1.0-rc.36.\n\nCandidate run ID: ${runId}`, ...overrides.event } };
  const responses: Record<string, any> = {
    [`repos/${repository}/actions/runs/${runId}`]: { id: runId, repository: { full_name: repository }, event: 'workflow_dispatch', path: '.github/workflows/verify.yml', head_sha: sourceCommit, head_branch: branch, status: 'completed', conclusion: 'success', ...overrides.run },
    [`repos/${repository}/actions/runs/${runId}/jobs?per_page=100`]: { total_count: 1, jobs: [{ name: 'Candidate gate', conclusion: 'success' }], ...overrides.jobs },
    [`repos/${repository}/actions/runs/${runId}/artifacts?per_page=100`]: { total_count: 2, artifacts: [
      { name: 'candidate-package', expired: false, size_in_bytes: 100 },
      { name: 'candidate-aggregate', expired: false, size_in_bytes: 100 },
    ], ...overrides.artifacts },
  };
  return { event, requestJson: async (endpoint: string) => responses[endpoint] };
}

test('release PR gate reuses the exact successful Candidate and its two artifacts', async () => {
  const { event, requestJson } = fixture();
  assert.deepEqual(await verifyReleasePullRequestCandidate(event, repository, requestJson), { status: 'passed', runId, sourceCommit, branch });
});

test('release PR gate rejects source drift, missing run identity and expired artifact', async () => {
  const drift = fixture({ run: { head_sha: 'a'.repeat(40) } });
  await assert.rejects(verifyReleasePullRequestCandidate(drift.event, repository, drift.requestJson), /source differs/u);
  const missingId = fixture({ event: { body: 'Release without a Candidate pointer.' } });
  await assert.rejects(verifyReleasePullRequestCandidate(missingId.event, repository, missingId.requestJson), /identify one Candidate run/u);
  const expired = fixture({ artifacts: { total_count: 2, artifacts: [
    { name: 'candidate-package', expired: true, size_in_bytes: 100 },
    { name: 'candidate-aggregate', expired: false, size_in_bytes: 100 },
  ] } });
  await assert.rejects(verifyReleasePullRequestCandidate(expired.event, repository, expired.requestJson), /candidate-package is unavailable/u);
});
