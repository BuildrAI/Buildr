import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

import { CANDIDATE_CI_AGGREGATE_SCHEMA } from '../../tools/release/candidate-ci-contract.ts';
import {
  cleanupReleaseRehearsal,
  prepareReleaseRehearsal,
  promoteReleaseRehearsal,
  RELEASE_REHEARSAL_EVIDENCE_SCHEMA,
} from '../../tools/release/release-rehearsal.ts';

const version = '1.2.3-rc.1';
const git = (repo: string, args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
const digest = (value: unknown) => `sha256-${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;

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

test('release rehearsal builds a prospective -x chain without moving the formal release', (t) => {
  const { repo, base, source } = fixture(t);
  const binding: any = { version, head: base };
  const prepared: any = prepareReleaseRehearsal({ version, repo, sourceDevCommits: [source], executionBinding: binding }, { validateExecutionBinding: () => binding });
  assert.equal(prepared.status, 'prepared');
  assert.equal(git(repo, ['rev-parse', `release-${version}`]), base);
  assert.equal(git(repo, ['rev-parse', `refs/buildr/release/${version}/frozen`]), base);
  assert.match(git(repo, ['show', '-s', '--format=%B', prepared.prospective.commit]), new RegExp(`cherry picked from commit ${source}`, 'u'));
  assert.equal(git(repo, ['ls-remote', 'origin', `refs/heads/${prepared.carrier.branch}`]).split(/\s+/u)[0], prepared.prospective.commit);
});

test('passed rehearsal promotes the exact commit and cleanup removes only rehearsal refs', (t) => {
  const { repo, base, source } = fixture(t);
  const initialBinding: any = { version, head: base };
  const prepared: any = prepareReleaseRehearsal({ version, repo, sourceDevCommits: [source], executionBinding: initialBinding }, { validateExecutionBinding: () => initialBinding });
  git(repo, ['switch', '-c', `codex/release-${version}`, base]);
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
  const promoted: any = promoteReleaseRehearsal(evidence, { repo, executionBinding: binding, confirm: true, reason: 'verified rehearsal' }, {
    validateExecutionBinding: () => binding,
    inspectRehearsal: () => evidence,
    assertUnpublished: () => {},
  });
  assert.equal(promoted.status, 'passed');
  assert.equal(promoted.releaseHead, prepared.prospective.commit);
  assert.equal(promoted.releaseTree, prepared.prospective.tree);
  assert.equal(git(repo, ['rev-parse', `release-${version}`]), prepared.prospective.commit);
  assert.equal(git(repo, ['rev-parse', `refs/buildr/release/${version}/frozen`]), prepared.prospective.commit);
  assert.equal(git(repo, ['rev-parse', `refs/buildr/release/${version}/freezes/0`]), base);
  assert.equal(git(repo, ['rev-parse', `refs/buildr/release/${version}/freezes/1`]), prepared.prospective.commit);
  const cleaned: any = cleanupReleaseRehearsal(prepared, { repo, confirm: true });
  assert.equal(cleaned.status, 'cleaned');
  assert.equal(git(repo, ['rev-parse', `release-${version}`]), prepared.prospective.commit);
  assert.equal(git(repo, ['ls-remote', 'origin', `refs/heads/${prepared.carrier.branch}`]), '');
});
