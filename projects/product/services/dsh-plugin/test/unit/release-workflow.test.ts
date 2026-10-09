import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { BUILDR_CANDIDATE_WORKFLOW, githubReader, publicationMayHaveStarted, PUBLISH_STEP, REPOSITORY, validateBuildrPeerCandidateRun, validateCandidateRun, validateWorkflowInput, verifyBuildrPeerCandidate, verifyPublishRuns, WORKFLOW } from '../../tools/release-workflow.ts';

const commit = 'a'.repeat(40), version = '0.1.0-rc.1';
const base = `/repos/${REPOSITORY}/actions`;
const env = { GITHUB_REPOSITORY: REPOSITORY, GITHUB_SERVER_URL: 'https://github.com', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: 'refs/heads/main', GITHUB_WORKFLOW_REF: `${REPOSITORY}/${WORKFLOW}@refs/heads/main`, GITHUB_SHA: commit, GITHUB_RUN_ID: '50', GITHUB_RUN_ATTEMPT: '1', PLUGIN_OPERATION: 'publish', PLUGIN_VERSION: version, PLUGIN_CANDIDATE_RUN_ID: '10' };
function run(id: number, operation: string, overrides: Record<string, unknown> = {}) {
  return { id, workflow_id: 7, path: WORKFLOW, event: 'workflow_dispatch', head_branch: 'main', head_sha: commit, status: 'completed', conclusion: 'success', display_title: `DSH ${operation} ${version}`, run_attempt: 1, run_number: id, repository: { full_name: REPOSITORY }, ...overrides };
}
function jobs(conclusion = 'success') { return [{ name: 'publish', status: 'completed', conclusion, steps: [{ name: PUBLISH_STEP, status: 'completed', conclusion }] }]; }
function api(history: any[] = [], attempts: Record<string, any[]> = {}) {
  const visited: string[] = [];
  const read = async (path: string) => {
    visited.push(path);
    if (path === `${base}/workflows/publish-dsh-plugin.yml`) return { id: 7, path: WORKFLOW };
    if (path === `${base}/runs/50`) return run(50, 'publish', { status: 'in_progress', conclusion: null });
    if (path === `${base}/runs/10`) return run(10, 'prepare');
    if (path.startsWith(`${base}/workflows/publish-dsh-plugin.yml/runs?`)) return { total_count: history.length, workflow_runs: history };
    const match = path.match(/\/runs\/(\d+)\/attempts\/(\d+)\/jobs\?/);
    if (match) { const value = attempts[`${match[1]}:${match[2]}`] ?? jobs(); return { total_count: value.length, jobs: value }; }
    throw new Error('unexpected API call');
  };
  return { read, visited };
}
const input = () => validateWorkflowInput(env, { commit, version });
const peerVersion = '0.1.0-rc.38', peerIntegrity = `sha512-${Buffer.alloc(64, 1).toString('base64')}`;
const prepareEnv = { ...env, PLUGIN_OPERATION: 'prepare', PLUGIN_CANDIDATE_RUN_ID: '', PLUGIN_BUILDR_PEER_ORIGIN: 'registry', PLUGIN_BUILDR_PEER_VERSION: peerVersion, PLUGIN_BUILDR_PEER_INTEGRITY: peerIntegrity };

test('manual version/source/main inputs are checked before remote reads', () => {
  assert.deepEqual(input(), { operation: 'publish', version, candidateRunId: '10', recoveryRunId: undefined });
  for (const change of [{ PLUGIN_VERSION: '$(touch unexpected)' }, { PLUGIN_VERSION: '0.1.1' }, { GITHUB_SHA: 'b'.repeat(40) }, { GITHUB_REF: 'refs/heads/dev' }, { GITHUB_REPOSITORY: 'other/repo' }, { GITHUB_RUN_ATTEMPT: '2' }, { PLUGIN_CANDIDATE_RUN_ID: '50' }, { PLUGIN_CANDIDATE_RUN_ID: '' }, { PLUGIN_CANDIDATE_RUN_ID: '1\n2' }]) assert.throws(() => validateWorkflowInput({ ...env, ...change }, { commit, version }));
});
test('preparation has no publication or recovery identity', () => {
  assert.deepEqual(validateWorkflowInput(prepareEnv, { commit, version }).buildrPeer, { origin: 'registry', version: peerVersion, integrity: peerIntegrity });
  assert.throws(() => validateWorkflowInput({ ...prepareEnv, PLUGIN_CANDIDATE_RUN_ID: '10' }, { commit, version }), /prepare-cannot-consume-publication/);
  assert.throws(() => validateWorkflowInput({ ...prepareEnv, PLUGIN_RECOVERY_RUN_ID: '20' }, { commit, version }), /prepare-cannot-consume-publication/);
});
test('preparation freezes an exact peer independently of plugin version', () => {
  for (const changed of [
    { PLUGIN_BUILDR_PEER_ORIGIN: '' }, { PLUGIN_BUILDR_PEER_ORIGIN: 'checkout' },
    { PLUGIN_BUILDR_PEER_VERSION: 'latest' }, { PLUGIN_BUILDR_PEER_VERSION: '^0.1.0' }, { PLUGIN_BUILDR_PEER_VERSION: '' },
    { PLUGIN_BUILDR_PEER_INTEGRITY: '' }, { PLUGIN_BUILDR_PEER_INTEGRITY: 'sha512-Zm9v' },
    { PLUGIN_BUILDR_CANDIDATE_RUN_ID: '11' },
  ]) assert.throws(() => validateWorkflowInput({ ...prepareEnv, ...changed }, { commit, version }));
  const candidate = { ...prepareEnv, PLUGIN_BUILDR_PEER_ORIGIN: 'candidate', PLUGIN_BUILDR_CANDIDATE_RUN_ID: '11' };
  assert.deepEqual(validateWorkflowInput(candidate, { commit, version }).buildrPeer, { origin: 'candidate', version: peerVersion, integrity: peerIntegrity, candidateRunId: '11' });
  for (const runId of ['', '50', '1\n2']) assert.throws(() => validateWorkflowInput({ ...candidate, PLUGIN_BUILDR_CANDIDATE_RUN_ID: runId }, { commit, version }));
});
test('publication cannot select a new peer or replace prepared compatibility evidence', () => {
  for (const name of ['PLUGIN_BUILDR_PEER_ORIGIN', 'PLUGIN_BUILDR_PEER_VERSION', 'PLUGIN_BUILDR_PEER_INTEGRITY', 'PLUGIN_BUILDR_CANDIDATE_RUN_ID']) {
    assert.throws(() => validateWorkflowInput({ ...env, [name]: 'replacement' }, { commit, version }), /publish-cannot-replace-peer/);
  }
});
test('joint peer uses the frozen run and exact protected merge rather than the main commit as candidate source', () => {
  const candidateCommit = 'f'.repeat(40), tree = 'c'.repeat(40);
  const peer = { origin: 'candidate' as const, version: peerVersion, integrity: peerIntegrity, candidateRunId: '11' };
  const source = { mainCommit: commit, candidateCommit, mainParents: ['b'.repeat(40), candidateCommit], mainTree: tree, candidateTree: tree, workflowId: 9 };
  const candidate = run(11, 'prepare', { workflow_id: 9, path: BUILDR_CANDIDATE_WORKFLOW, head_branch: 'release-source', head_sha: candidateCommit, run_attempt: 2 });
  validateBuildrPeerCandidateRun(candidate, peer, source);
  for (const changed of [{ head_sha: commit }, { path: WORKFLOW }, { repository: { full_name: 'other/repo' } }, { event: 'push' }, { conclusion: 'failure' }, { workflow_id: 7 }]) {
    assert.throws(() => validateBuildrPeerCandidateRun({ ...candidate, ...changed }, peer, source), /candidate-run-mismatch/);
  }
  for (const changed of [{ mainParents: [candidateCommit] }, { mainParents: [candidateCommit, 'b'.repeat(40)] }, { mainParents: ['b'.repeat(40), candidateCommit, tree] }, { mainTree: 'd'.repeat(40) }]) {
    assert.throws(() => validateBuildrPeerCandidateRun(candidate, peer, { ...source, ...changed }), /protected-merge-mismatch/);
  }
});
test('joint artifact identity mismatch is refused before remote reads or byte execution', async () => {
  const selected = validateWorkflowInput({ ...prepareEnv, PLUGIN_BUILDR_PEER_ORIGIN: 'candidate', PLUGIN_BUILDR_CANDIDATE_RUN_ID: '11' }, { commit, version });
  const manifest = { schemaVersion: 'buildr.release-artifact/v1', packageName: '@buildr-ai/buildr', version: peerVersion, integrity: peerIntegrity, sourceCommit: 'f'.repeat(40) };
  let reads = 0;
  for (const changed of [{ schemaVersion: 'other' }, { packageName: '@buildr-ai/buildr-dsh-plugin' }, { version: '0.1.0-rc.39' }, { integrity: `sha512-${Buffer.alloc(64, 2).toString('base64')}` }, { sourceCommit: '' }]) {
    await assert.rejects(verifyBuildrPeerCandidate(selected, commit, { ...manifest, ...changed }, async () => { reads++; throw new Error('must not read'); }), /artifact-mismatch/);
  }
  assert.equal(reads, 0);
});
test('candidate requires successful exact workflow, source, version and first attempt', () => {
  validateCandidateRun(run(10, 'prepare'), '10', commit, version, 7);
  for (const changed of [{ head_sha: 'b'.repeat(40) }, { head_branch: 'dev' }, { workflow_id: 8 }, { display_title: `DSH publish ${version}` }, { conclusion: 'failure' }, { run_attempt: 2 }, { path: '.github/workflows/publish.yml' }]) assert.throws(() => validateCandidateRun(run(10, 'prepare', changed), '10', commit, version, 7));
});
test('a new publication consumes the checked successful candidate', async () => {
  const fake = api([run(50, 'publish', { status: 'in_progress' }), run(10, 'prepare')]);
  assert.deepEqual(await verifyPublishRuns(input(), commit, '50', fake.read), { candidateRunId: '10' });
});
test('known skipped publication step permits a fresh attempt', async () => {
  const fake = api([run(20, 'publish', { conclusion: 'failure' })], { '20:1': jobs('skipped') });
  assert.deepEqual(await verifyPublishRuns(input(), commit, '50', fake.read), { candidateRunId: '10' });
});
test('entered, cancelled or missing publication step requires evidence even without recovery input', async () => {
  for (const previousJobs of [jobs(), jobs('failure'), jobs('cancelled'), [], [{ name: 'publish', status: 'completed', conclusion: 'cancelled', steps: [] }], [{ name: 'publish', status: 'completed', conclusion: 'failure', steps: [{ name: PUBLISH_STEP, status: 'in_progress', conclusion: null }] }]]) {
    const fake = api([run(20, 'publish', { conclusion: 'cancelled' })], { '20:1': previousJobs });
    await assert.rejects(verifyPublishRuns(input(), commit, '50', fake.read), /previous-publication-evidence-required/);
  }
});
test('changing run identity cannot bypass a previous possible request', async () => {
  const fake = api([run(20, 'publish')]);
  await assert.rejects(verifyPublishRuns({ ...input(), recoveryRunId: '19' }, commit, '50', fake.read));
  assert.deepEqual(await verifyPublishRuns({ ...input(), recoveryRunId: '20' }, commit, '50', fake.read), { candidateRunId: '10', recoveryRunId: '20' });
});
test('recovery requires the latest possible request and rejects wrong source', async () => {
  const fake = api([run(20, 'publish'), run(30, 'publish')]);
  await assert.rejects(verifyPublishRuns({ ...input(), recoveryRunId: '20' }, commit, '50', fake.read));
  assert.equal((await verifyPublishRuns({ ...input(), recoveryRunId: '30' }, commit, '50', fake.read)).recoveryRunId, '30');
  const changed = api([run(20, 'publish', { head_sha: 'b'.repeat(40) })]);
  await assert.rejects(verifyPublishRuns({ ...input(), recoveryRunId: '20' }, commit, '50', changed.read), /recovery-source/);
});
test('all attempts are inspected; a later skipped attempt cannot erase an earlier request', async () => {
  const fake = api([run(20, 'publish', { run_attempt: 2 })], { '20:1': jobs('cancelled'), '20:2': jobs('skipped') });
  await assert.rejects(verifyPublishRuns(input(), commit, '50', fake.read));
  assert.ok(fake.visited.some(path => path.includes('/attempts/1/jobs')));
  assert.ok(fake.visited.some(path => path.includes('/attempts/2/jobs')));
});
test('unfinished previous run or unavailable evidence is blocked', async () => {
  await assert.rejects(verifyPublishRuns(input(), commit, '50', api([run(20, 'publish', { status: 'waiting' })]).read), /still-active/);
  const fake = api([run(20, 'publish')]);
  await assert.rejects(verifyPublishRuns(input(), commit, '50', async path => { if (path.includes('/jobs?')) throw new Error('unavailable'); return fake.read(path); }));
});
test('irrelevant version and known no-dispatch run do not demand recovery', async () => {
  const fake = api([run(20, 'publish', { display_title: 'DSH publish 0.1.2' })]);
  await verifyPublishRuns(input(), commit, '50', fake.read);
  await assert.rejects(verifyPublishRuns({ ...input(), recoveryRunId: '20' }, commit, '50', fake.read), /no-publication/);
});
test('history pagination is consumed fully and bounded incomplete history is rejected', async () => {
  const fake = api(); let secondPage = false;
  const read = async (path: string) => {
    if (path.includes('/runs?') && new URL(path, 'https://api.github.com').searchParams.get('page') === '1') return { total_count: 101, workflow_runs: Array.from({ length: 100 }, (_, i) => run(100 + i, 'prepare')) };
    if (path.includes('/runs?') && new URL(path, 'https://api.github.com').searchParams.get('page') === '2') { secondPage = true; return { total_count: 101, workflow_runs: [run(20, 'publish')] }; }
    return fake.read(path);
  };
  await assert.rejects(verifyPublishRuns(input(), commit, '50', read), /evidence-required/);
  assert.equal(secondPage, true);
  await assert.rejects(verifyPublishRuns(input(), commit, '50', async path => path.includes('/runs?') ? { total_count: 1001, workflow_runs: [] } : fake.read(path)), /history-incomplete/);
});
test('job evidence has to identify exactly the real publication step', () => {
  assert.equal(publicationMayHaveStarted(jobs('skipped')), false);
  assert.equal(publicationMayHaveStarted([{ ...jobs('skipped')[0]!, name: 'prepare' }]), true);
  assert.equal(publicationMayHaveStarted([...jobs('skipped'), ...jobs('skipped')]), true);
});
test('GitHub reader stays on the repository read endpoint and hides error response bodies', async () => {
  let calls = 0;
  const reader = githubReader('test-access', (async () => { calls++; return new Response('private response', { status: 403 }); }) as typeof fetch);
  await assert.rejects(reader('/repos/other/repo/actions/runs'), /github-read-path/);
  assert.equal(calls, 0);
  await assert.rejects(reader(`${base}/runs/20`), error => error instanceof Error && !error.message.includes('private response'));
});
test('workflow declares the same publication step and default preparation without commit triggers', () => {
  const path = fileURLToPath(new URL('../../../../../../.github/workflows/publish-dsh-plugin.yml', import.meta.url));
  const workflow = readFileSync(path, 'utf8');
  assert.ok(workflow.includes(`- name: ${PUBLISH_STEP}\n`));
  assert.ok(workflow.includes('default: prepare'));
  assert.equal((workflow.match(/id-token: write/g) ?? []).length, 1);
  assert.ok(workflow.indexOf('id-token: write') > workflow.indexOf('\n  publish:'));
  assert.ok(!/^  (push|pull_request|release):/m.test(workflow));
  assert.ok(workflow.includes('persist-credentials: false'));
});

test('plugin preparation verifies frozen original peer bytes and preserves its compatibility aggregate', () => {
  const path = fileURLToPath(new URL('../../../../../../.github/workflows/publish-dsh-plugin.yml', import.meta.url));
  const workflow = readFileSync(path, 'utf8');
  const prepare = workflow.slice(workflow.indexOf('\n  prepare:'), workflow.indexOf('\n  publish:'));
  const tooling = prepare.indexOf('- name: Install isolated fixed preparation tooling');
  const peer = prepare.indexOf('- name: Freeze the exact Buildr peer input');
  const candidate = prepare.indexOf('- name: Verify the Buildr candidate and protected merge');
  const sdk = prepare.indexOf('- name: Prepare fixed source SDK');
  const verify = prepare.indexOf('- name: Verify both plugin variants and real loaders');
  const pack = prepare.indexOf('- name: Prepare immutable plugin candidate');
  const bind = prepare.indexOf('- name: Bind compatibility proof to the final candidate bytes');
  const upload = prepare.indexOf('- name: Upload the original candidate bytes');
  assert.ok(tooling >= 0 && candidate > tooling && peer > candidate && sdk > peer && verify > sdk);
  assert.ok(pack > verify && bind > pack && upload > bind);
  assert.ok(prepare.includes('name: candidate-package'));
  assert.ok(prepare.includes('run-id: ${{ inputs.buildr_candidate_run_id }}'));
  const frozen = prepare.slice(peer, sdk);
  assert.equal((frozen.match(/package-artifact-observation\.ts --package buildr/g) ?? []).length, 2);
  assert.equal((frozen.match(/--integrity "\$\{PLUGIN_BUILDR_PEER_INTEGRITY\}"/g) ?? []).length, 2);
  assert.ok(frozen.includes('--candidate-manifest "${RUNNER_TEMP}/buildr-candidate/release-artifact.json"'));
  assert.ok(prepare.includes('--buildr-peer "${RUNNER_TEMP}/buildr-peer/input.json"'));
  assert.ok(prepare.includes('--output "${RUNNER_TEMP}/plugin-full-verification.json"'));
  assert.ok(prepare.includes('name: plugin-candidate-aggregate'));
  assert.equal((prepare.match(/--npm "\$\{RUNNER_TEMP\}\/tooling\/node_modules\/npm\/bin\/npm-cli\.js"/g) ?? []).length, 2);
  assert.ok(prepare.includes('--candidate "build/release-candidates/${PLUGIN_VERSION}/candidate.json"'));
  assert.doesNotMatch(prepare, /Install locked Buildr CLI dependencies|working-directory: projects\/product\/services\/buildr\n|npm-cli\.js" ci|id-token: write/);
  const publish = workflow.slice(workflow.indexOf('\n  publish:'));
  assert.ok(publish.includes('PLUGIN_BUILDR_PEER_INTEGRITY: ${{ inputs.buildr_peer_integrity }}'));
  assert.ok(publish.includes('- name: Download the original prepare compatibility evidence\n        continue-on-error: true'));
  assert.ok(publish.includes('name: plugin-candidate-aggregate'));
  assert.ok(publish.includes('--verification "${RUNNER_TEMP}/verification/plugin-full-verification.json"'));
  assert.doesNotMatch(publish, /--buildr-peer|package-artifact-observation\.ts/);
});
