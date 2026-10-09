import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { githubReader, publicationMayHaveStarted, PUBLISH_STEP, REPOSITORY, validateCandidateRun, validateWorkflowInput, verifyPublishRuns, WORKFLOW } from '../../tools/release-workflow.ts';

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

test('manual version/source/main inputs are checked before remote reads', () => {
  assert.deepEqual(input(), { operation: 'publish', version, candidateRunId: '10', recoveryRunId: undefined });
  for (const change of [{ PLUGIN_VERSION: '$(touch unexpected)' }, { PLUGIN_VERSION: '0.1.1' }, { GITHUB_SHA: 'b'.repeat(40) }, { GITHUB_REF: 'refs/heads/dev' }, { GITHUB_REPOSITORY: 'other/repo' }, { GITHUB_RUN_ATTEMPT: '2' }, { PLUGIN_CANDIDATE_RUN_ID: '50' }, { PLUGIN_CANDIDATE_RUN_ID: '' }, { PLUGIN_CANDIDATE_RUN_ID: '1\n2' }]) assert.throws(() => validateWorkflowInput({ ...env, ...change }, { commit, version }));
});
test('preparation has no publication or recovery identity', () => {
  assert.equal(validateWorkflowInput({ ...env, PLUGIN_OPERATION: 'prepare', PLUGIN_CANDIDATE_RUN_ID: '' }, { commit, version }).operation, 'prepare');
  assert.throws(() => validateWorkflowInput({ ...env, PLUGIN_OPERATION: 'prepare' }, { commit, version }));
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

test('plugin preparation installs locked current Buildr CLI dependencies before the SDK and complete verification', () => {
  const path = fileURLToPath(new URL('../../../../../../.github/workflows/publish-dsh-plugin.yml', import.meta.url));
  const workflow = readFileSync(path, 'utf8');
  const prepare = workflow.slice(workflow.indexOf('\n  prepare:'), workflow.indexOf('\n  publish:'));
  const tooling = prepare.indexOf('- name: Install isolated fixed preparation tooling');
  const cli = prepare.indexOf('- name: Install locked Buildr CLI dependencies');
  const sdk = prepare.indexOf('- name: Prepare fixed source SDK');
  const verify = prepare.indexOf('- name: Verify both plugin variants and real loaders');
  assert.ok(tooling >= 0 && cli > tooling && sdk > cli && verify > sdk);
  const dependencies = prepare.slice(cli, sdk);
  assert.ok(dependencies.includes('working-directory: projects/product/services/buildr'));
  assert.match(dependencies, /env -i PATH=/);
  for (const config of ['user', 'global']) {
    assert.ok(dependencies.includes(`: > "${'${RUNNER_TEMP}'}/buildr-cli-dependencies/${config}.npmrc"`));
    assert.ok(dependencies.includes(`NPM_CONFIG_${config.toUpperCase()}CONFIG="${'${RUNNER_TEMP}'}/buildr-cli-dependencies/${config}.npmrc"`));
  }
  assert.ok(dependencies.includes('node "${RUNNER_TEMP}/tooling/node_modules/npm/bin/npm-cli.js" ci --omit=dev --ignore-scripts'));
  assert.ok(dependencies.includes('--registry=https://registry.npmjs.org/'));
  assert.ok(dependencies.includes('--cache "${RUNNER_TEMP}/buildr-cli-dependencies/npm-cache"'));
  assert.doesNotMatch(dependencies, /npm (?:publish|version)|release\.ts|--global/);
  assert.ok(!workflow.slice(workflow.indexOf('\n  publish:')).includes('Install locked Buildr CLI dependencies'));
});
