import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import test from 'node:test';

import { CANDIDATE_CI_AGGREGATE_SCHEMA } from '../verification/release/candidate-ci-contract.ts';
import {
  assertNoConflictingPublicationRuns,
  cleanupReleaseRehearsal,
  dispatchReleaseRehearsal,
  prepareReleaseRehearsal,
  promoteReleaseRehearsal,
  RELEASE_REHEARSAL_EVIDENCE_SCHEMA,
  writeReleaseRehearsalPreparation,
} from '../../../../../../skills/buildr-release/scripts/release-rehearsal.ts';

const version = '1.2.3-rc.1';
const git = (repo: string, args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
const digest = (value: unknown) => `sha256-${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;

test('publication recovery permits only completed unsuccessful runs when public facts remain absent', () => {
  assert.doesNotThrow(() => assertNoConflictingPublicationRuns([
    { displayTitle: 'Release 1.2.3-rc.1 (failed)', status: 'completed', conclusion: 'failure' },
    { displayTitle: 'Release 1.2.3-rc.1 (cancelled)', status: 'completed', conclusion: 'cancelled' },
  ], version));
  assert.throws(() => assertNoConflictingPublicationRuns([
    { displayTitle: 'Release 1.2.3-rc.1 (active)', status: 'in_progress', conclusion: '' },
  ], version), /active protected publication run/u);
  assert.doesNotThrow(() => assertNoConflictingPublicationRuns([
    { displayTitle: 'Release 1.2.3-rc.1 (passed)', status: 'completed', conclusion: 'success' },
  ], version));
});

function fixture(t: any) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-release-rehearsal-test-'));
  const repo = path.join(root, 'repo');
  const remote = path.join(root, 'remote.git');
  fs.mkdirSync(repo);
  git(repo, ['init', '-b', 'dev']);
  git(repo, ['config', 'user.name', 'Buildr Test']);
  git(repo, ['config', 'user.email', 'buildr@example.com']);
  fs.writeFileSync(path.join(repo, 'value.txt'), 'base\n');
  git(repo, ['add', 'value.txt']);
  git(repo, ['commit', '-m', 'base']);
  const base = git(repo, ['rev-parse', 'HEAD']);
  fs.writeFileSync(path.join(repo, 'value.txt'), 'candidate\n');
  git(repo, ['commit', '-am', 'candidate fix']);
  const source = git(repo, ['rev-parse', 'HEAD']);
  execFileSync('git', ['init', '--bare', remote]);
  git(repo, ['remote', 'add', 'origin', remote]);
  git(repo, ['branch', `release-${version}`, base]);
  git(repo, ['update-ref', `refs/buildr/release/${version}/baseline`, base]);
  git(repo, ['update-ref', `refs/buildr/release/${version}/frozen`, base]);
  git(repo, ['update-ref', `refs/buildr/release/${version}/freezes/0`, base]);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { repo, base, source };
}

test('release rehearsal builds a prospective -x chain without moving the formal release', async (t) => {
  const { repo, base, source } = fixture(t);
  const binding: any = { version, head: base };
  const prepared: any = prepareReleaseRehearsal({ version, repo, sourceDevCommits: [source], executionBinding: binding }, { validateExecutionBinding: () => binding });
  assert.equal(prepared.status, 'prepared');
  assert.equal(git(repo, ['rev-parse', `release-${version}`]), base);
  assert.equal(git(repo, ['rev-parse', `refs/buildr/release/${version}/frozen`]), base);
  assert.match(git(repo, ['show', '-s', '--format=%B', prepared.prospective.commit]), new RegExp(`cherry picked from commit ${source}`, 'u'));
  assert.equal(git(repo, ['ls-remote', 'origin', `refs/heads/${prepared.carrier.branch}`]).split(/\s+/u)[0], prepared.prospective.commit);
});

test('passed rehearsal promotes the exact commit with the prepared dev ref and cleanup removes only rehearsal refs', async (t) => {
  const { repo, base, source } = fixture(t);
  const initialBinding: any = { version, head: base };
  git(repo, ['update-ref', 'refs/remotes/origin/dev', source]);
  const prepared: any = prepareReleaseRehearsal({ version, repo, sourceDevCommits: [source], devRef: 'origin/dev', executionBinding: initialBinding }, { validateExecutionBinding: () => initialBinding });
  assert.equal(prepared.devRef, 'origin/dev');
  git(repo, ['switch', '-c', `codex/release-${version}`, base]);
  git(repo, ['branch', '-f', 'dev', base]);
  const aggregate: any = {
    schemaVersion: CANDIDATE_CI_AGGREGATE_SCHEMA,
    status: 'passed',
    purpose: 'release-rehearsal',
    sourceCommit: prepared.prospective.commit,
    sourceTree: prepared.prospective.tree,
    rehearsalIdentity: prepared.identity,
  };
  const evidence: any = {
    schemaVersion: RELEASE_REHEARSAL_EVIDENCE_SCHEMA,
    status: 'passed',
    preparation: prepared,
    workflow: { runId: 42, runAttempt: 1, headSha: prepared.prospective.commit, status: 'completed', conclusion: 'success' },
    aggregate,
    findings: [],
    effects: [],
  };
  evidence.identity = digest(evidence);
  const binding: any = { version, branch: `codex/release-${version}`, head: base, identity: `sha256-${'1'.repeat(64)}` };
  const promoted: any = await promoteReleaseRehearsal(evidence, { repo, executionBinding: binding, confirm: true, reason: 'verified rehearsal' }, {
    validateExecutionBinding: () => binding,
    inspectRehearsal: () => evidence,
    assertUnpublished: () => {},
  });
  assert.equal(promoted.status, 'passed');
  assert.equal(promoted.releaseHead, prepared.prospective.commit);
  assert.equal(promoted.releaseTree, prepared.prospective.tree);
  assert.equal(git(repo, ['ls-remote', 'origin', `refs/heads/release-${version}`]).split(/\s+/u)[0], prepared.prospective.commit);
  assert.equal(git(repo, ['rev-parse', `release-${version}`]), prepared.prospective.commit);
  assert.equal(git(repo, ['rev-parse', `refs/buildr/release/${version}/frozen`]), prepared.prospective.commit);
  assert.equal(git(repo, ['rev-parse', `refs/buildr/release/${version}/freezes/0`]), base);
  assert.equal(git(repo, ['rev-parse', `refs/buildr/release/${version}/freezes/1`]), prepared.prospective.commit);
  const cleaned: any = cleanupReleaseRehearsal(prepared, { repo, confirm: true });
  assert.equal(cleaned.status, 'cleaned');
  assert.equal(git(repo, ['rev-parse', `release-${version}`]), prepared.prospective.commit);
  assert.equal(git(repo, ['ls-remote', 'origin', `refs/heads/${prepared.carrier.branch}`]), '');
});

test('rehearsal cleanup preserves a real remote carrier advanced after its observation', (t) => {
  const { repo, base, source } = fixture(t);
  const binding: any = { version, head: base };
  const prepared: any = prepareReleaseRehearsal({ version, repo, sourceDevCommits: [source], executionBinding: binding }, { validateExecutionBinding: () => binding });
  const ref = `refs/heads/${prepared.carrier.branch}`;
  const remote = git(repo, ['remote', 'get-url', 'origin']);
  const advanced = git(repo, ['commit-tree', prepared.prospective.tree, '-p', prepared.prospective.commit, '-m', 'concurrent carrier advance']);
  git(repo, ['push', 'origin', `${advanced}:refs/buildr/test/concurrent-carrier`]);
  let deletionRequests = 0;
  assert.throws(() => cleanupReleaseRehearsal(prepared, { repo, confirm: true }, {
    execute: (command: string, args: string[], options: any) => {
      if (command === 'git' && args[0] === 'push') {
        deletionRequests += 1;
        assert.equal(args.includes(`--force-with-lease=${ref}:${prepared.prospective.commit}`), true);
        assert.equal(args.includes(`:${ref}`), true);
        // The initial ls-remote has already returned the original commit.
        git(remote, ['update-ref', ref, advanced, prepared.prospective.commit]);
      }
      return spawnSync(command, args, { ...options, encoding: 'utf8' });
    },
  }), /stale info|failed|requested state/u);
  assert.equal(deletionRequests, 1);
  assert.equal(git(repo, ['ls-remote', 'origin', ref]).split(/\s+/u)[0], advanced);
  assert.equal(git(repo, ['rev-parse', prepared.carrier.localRef]), prepared.prospective.commit);
  assert.equal(git(repo, ['rev-parse', `release-${version}`]), base);
});

function dispatchFixture(t: any) {
  const { repo, base, source } = fixture(t), binding: any = { version, head: base };
  const prepared: any = prepareReleaseRehearsal({ version, repo, sourceDevCommits: [source], executionBinding: binding }, { validateExecutionBinding: () => binding });
  const preparationPath = path.join(repo, 'prepared.json');
  writeReleaseRehearsalPreparation(preparationPath, prepared);
  const run: any = { id: 701, repository: { full_name: 'BuildrAI/Buildr' }, path: '.github/workflows/verify.yml', event: 'workflow_dispatch',
    head_branch: prepared.carrier.branch, head_sha: prepared.prospective.commit, run_attempt: 1, status: 'in_progress', conclusion: null };
  return { repo, prepared, preparationPath, run };
}

test('rehearsal dispatch retains a lost response across zero, single and ambiguous readbacks and repeated prepare', (t) => {
  const { repo, prepared, preparationPath, run } = dispatchFixture(t);
  let requests = 0, runs: any[] = [];
  const dependencies = { execute: (command: string, args: string[]) => {
    assert.equal(command, 'gh');
    if (args[0] === 'api') return { status: 0, stdout: JSON.stringify({ total_count: runs.length, workflow_runs: runs }) };
    assert.deepEqual(args.slice(0, 3), ['workflow', 'run', 'verify.yml']);
    const saved = JSON.parse(fs.readFileSync(preparationPath, 'utf8'));
    assert.equal(saved.effects.at(-1).state, 'unknown', 'durable intent precedes the only request');
    requests += 1;
    return { status: 1, stdout: '', error: Object.assign(new Error('response lost'), { code: 'ETIMEDOUT' }) };
  } };
  const dispatch = () => dispatchReleaseRehearsal(prepared, { repo, preparationPath, confirm: true }, dependencies);
  assert.equal(dispatch().status, 'readback-required');
  assert.equal(dispatch().status, 'readback-required');
  assert.equal(requests, 1);
  const retained = writeReleaseRehearsalPreparation(preparationPath, prepared);
  assert.equal(retained.effects.at(-1).state, 'unknown');
  assert.equal(dispatch().status, 'readback-required');
  assert.equal(requests, 1, 'rewriting prepare output cannot reset the unknown request');
  runs = [run];
  assert.equal(dispatch().status, 'running');
  assert.equal(JSON.parse(fs.readFileSync(preparationPath, 'utf8')).effects.at(-1).runId, run.id);
  runs = [];
  assert.equal(dispatch().status, 'readback-required');
  runs = [{ ...run, status: 'completed', conclusion: 'success' }];
  assert.equal(dispatch().status, 'inspect-required', 'a run success does not replace the existing aggregate/identity inspection');
  runs = [run, { ...run, id: 702 }];
  assert.equal(dispatch().status, 'readback-required');
  assert.equal(requests, 1);
});

test('rehearsal dispatch keeps v1 and missing durable input read-only and rejects mismatched remote identities', (t) => {
  const { repo, prepared, preparationPath, run } = dispatchFixture(t);
  let requests = 0, runs: any[] = [];
  const dependencies = { execute: (_command: string, args: string[]) => {
    if (args[0] !== 'api') { requests += 1; throw new Error('read-only preparation must not dispatch'); }
    return { status: 0, stdout: JSON.stringify({ total_count: runs.length, workflow_runs: runs }) };
  } };
  assert.equal(dispatchReleaseRehearsal(prepared, { repo, confirm: true }, dependencies).status, 'readback-required');
  const { identity: _identity, effects: _effects, ...projection } = prepared;
  const legacy: any = { ...projection, schemaVersion: 'buildr.release-rehearsal-preparation/v1', effects: [{ type: 'github-release-rehearsal-dispatched', branch: prepared.carrier.branch }] };
  legacy.identity = digest(legacy);
  const legacyPath = path.join(repo, 'legacy-prepared.json');
  writeReleaseRehearsalPreparation(legacyPath, legacy);
  assert.equal(dispatchReleaseRehearsal(legacy, { repo, preparationPath: legacyPath, confirm: true }, dependencies).status, 'readback-required');
  runs = [run];
  assert.equal(dispatchReleaseRehearsal(legacy, { repo, preparationPath: legacyPath, confirm: true }, dependencies).status, 'running');
  assert.deepEqual(JSON.parse(fs.readFileSync(legacyPath, 'utf8')), legacy);
  for (const replacement of [{ head_sha: 'f'.repeat(40) }, { head_branch: 'other' }, { path: '.github/workflows/other.yml' }, { event: 'push' }, { repository: { full_name: 'Other/Repo' } }]) {
    runs = [{ ...run, ...replacement }];
    assert.equal(dispatchReleaseRehearsal(prepared, { repo, preparationPath, confirm: true }, dependencies).status, 'readback-required');
  }
  runs = [run];
  assert.equal(dispatchReleaseRehearsal(prepared, { repo, preparationPath, confirm: true }, dependencies).status, 'running');
  runs = [];
  assert.equal(dispatchReleaseRehearsal(prepared, { repo, preparationPath, confirm: true }, dependencies).status, 'readback-required', 'an observed existing request is retained before its later disappearance');
  assert.equal(requests, 0);
});

test('rehearsal dispatch refuses a preparation changed after observation before sending any request', (t) => {
  const { repo, prepared, preparationPath } = dispatchFixture(t);
  let requests = 0;
  assert.throws(() => dispatchReleaseRehearsal(prepared, { repo, preparationPath, confirm: true }, {
    execute: (_command: string, args: string[]) => {
      if (args[0] !== 'api') { requests += 1; throw new Error('must not send after drift'); }
      fs.writeFileSync(preparationPath, JSON.stringify({ ...prepared, effects: [{ type: 'concurrent-history' }] }));
      return { status: 0, stdout: JSON.stringify({ total_count: 0, workflow_runs: [] }) };
    },
  }), /preparation changed/u);
  assert.equal(requests, 0);
  assert.deepEqual(JSON.parse(fs.readFileSync(preparationPath, 'utf8')).effects, [{ type: 'concurrent-history' }]);
  assert.throws(() => writeReleaseRehearsalPreparation(preparationPath, { ...prepared, identity: `sha256-${'0'.repeat(64)}` }), /identity/u);
});
