import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createReleaseExecutionBinding } from '../../tools/release/release-execution-binding.ts';
import { createReleaseSelection, freezeReleaseSelection, inspectReleaseSelection, reconcileReleaseSelectionWithMain, reopenReleaseSelection, selectReleaseCommit } from '../../tools/release/release-selection.ts';

const digest: any = (value: any) => `sha256-${String(value).padStart(64, '0')}`;

function git(repo: any, ...args: any[]): any  {
  const result: any = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
  assert.equal(result.status, 0, `git ${args.join(' ')}\n${result.stderr}`);
  return result.stdout.trim();
}

function fixture(version: any): any  {
  const root: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-release-selection-'));
  const remote: any = path.join(root, 'remote.git');
  git(root, 'init', '--bare', remote);
  git(root, 'clone', remote, 'retained');
  const retained: any = path.join(root, 'retained');
  git(retained, 'checkout', '-b', 'dev');
  git(retained, 'config', 'user.name', 'Buildr Test');
  git(retained, 'config', 'user.email', 'buildr@example.com');
  fs.mkdirSync(path.join(retained, 'projects/product'), { recursive: true });
  fs.writeFileSync(path.join(retained, 'projects/product/version.txt'), 'baseline\n');
  git(retained, 'add', '.'); git(retained, 'commit', '-m', 'baseline');
  const baseline: any = git(retained, 'rev-parse', 'HEAD');
  fs.writeFileSync(path.join(retained, 'projects/product/version.txt'), 'dev selected\n');
  git(retained, 'commit', '-am', 'selected dev content');
  const source: any = git(retained, 'rev-parse', 'HEAD');
  git(retained, 'push', '-u', 'origin', 'dev');
  const repo: any = path.join(root, 'task-worktree');
  const taskBranch: any = `codex/release-${version}`;
  git(retained, 'worktree', 'add', '-b', taskBranch, repo, baseline);
  git(repo, 'config', 'user.name', 'Buildr Test');
  git(repo, 'config', 'user.email', 'buildr@example.com');
  const providerEvidence: any = path.join(root, 'provider.json');
  fs.writeFileSync(providerEvidence, `${JSON.stringify({
    schemaVersion: 'buildr.git-worktree-evidence/v1', taskId: `release-${version}`, workspaceRoot: retained, branch: taskBranch,
    planDigest: digest('1'), status: 'ready', repositories: [{ selector: 'workspace', checkoutPath: repo, branch: taskBranch }], effects: [], updatedAt: '2026-08-28T00:00:00.000Z',
  }, null, 2)}\n`);
  const task: any = { taskId: `release-${version}`, status: 'active' };
  const binding: any = () => {
    const head: any = git(repo, 'rev-parse', 'HEAD');
    const repository: any = { selector: 'workspace', checkoutPath: repo, branch: taskBranch, head, state: 'ready' };
    return createReleaseExecutionBinding({ version, task, workspaceRoot: retained, repo, worktreeResult: { status: 'ready', taskId: task.taskId, evidencePath: providerEvidence, repositories: [repository] } });
  };
  return { root, retained, repo, version, baseline, source, binding };
}

const create: any = (data: any) => createReleaseSelection({ repo: data.repo, version: data.version, baseline: data.baseline, devRef: 'dev', executionBinding: data.binding() });
const select: any = (data: any) => selectReleaseCommit({ repo: data.repo, version: data.version, source: data.source, devRef: 'dev', executionBinding: data.binding() });
const freeze: any = (data: any) => freezeReleaseSelection({ repo: data.repo, version: data.version, devRef: 'dev', executionBinding: data.binding() });

test('selection mutates only the bound Task branch and formal release ref', (t: any) => {
  const data: any = fixture('0.1.0-rc.1'); t.after(() => fs.rmSync(data.root, { recursive: true, force: true }));
  assert.equal(create(data).status, 'passed');
  const selected: any = select(data);
  assert.equal(selected.status, 'passed', JSON.stringify(selected));
  assert.equal(git(data.repo, 'branch', '--show-current'), 'codex/release-0.1.0-rc.1');
  assert.equal(git(data.repo, 'rev-parse', 'HEAD'), selected.releaseHead);
  assert.equal(git(data.repo, 'rev-parse', 'release-0.1.0-rc.1'), selected.releaseHead);
  assert.equal(selected.selectionChain[0].sourceDevCommit, data.source);
  assert.equal(freeze(data).freeze.state, 'frozen');
});

test('retained primary worktree and stale binding fail before mutation', (t: any) => {
  const data: any = fixture('0.1.0-rc.2'); t.after(() => fs.rmSync(data.root, { recursive: true, force: true }));
  const binding: any = data.binding();
  const retainedBranch: any = git(data.retained, 'branch', '--show-current');
  const wrongRoot: any = createReleaseSelection({ repo: data.retained, version: data.version, baseline: data.baseline, devRef: 'dev', executionBinding: binding });
  assert.equal(wrongRoot.status, 'blocked');
  assert.equal(git(data.retained, 'branch', '--show-current'), retainedBranch);
  assert.equal(createReleaseSelection({ repo: data.repo, version: data.version, baseline: data.baseline, devRef: 'dev', executionBinding: binding }).status, 'passed');
  fs.writeFileSync(path.join(data.repo, 'local.txt'), 'advance\n'); git(data.repo, 'add', 'local.txt'); git(data.repo, 'commit', '-m', 'advance bound checkout');
  const stale: any = freezeReleaseSelection({ repo: data.repo, version: data.version, devRef: 'dev', executionBinding: binding });
  assert.equal(stale.status, 'blocked');
  assert.match(stale.diagnostic.message, /drifted/);
});

test('main-only product content blocks reconciliation with zero Git writes', (t: any) => {
  const data: any = fixture('0.1.0-rc.3'); t.after(() => fs.rmSync(data.root, { recursive: true, force: true }));
  create(data); select(data); const frozen: any = freeze(data);
  git(data.retained, 'checkout', '-b', 'main', data.baseline);
  fs.writeFileSync(path.join(data.retained, 'projects/product/main-only.txt'), 'not delivered to dev\n');
  git(data.retained, 'add', '.'); git(data.retained, 'commit', '-m', 'main-only product content'); git(data.retained, 'push', 'origin', 'main');
  const before: any = git(data.repo, 'rev-parse', 'HEAD');
  const blocked: any = reconcileReleaseSelectionWithMain({ repo: data.repo, version: data.version, devRef: 'dev', mainRef: 'origin/main', confirm: true, reason: 'pre-Candidate convergence', executionBinding: data.binding() });
  assert.equal(blocked.status, 'blocked');
  assert.equal(blocked.diagnostic.code, 'release_main_coverage_incomplete');
  assert.deepEqual(blocked.diagnostic.details.uncoveredPaths, ['projects/product/main-only.txt']);
  assert.equal(git(data.repo, 'rev-parse', 'HEAD'), before);
  assert.equal(inspectReleaseSelection({ repo: data.repo, version: data.version, devRef: 'dev' }).releaseHead, frozen.releaseHead);
});

test('covered main history creates a two-parent commit without changing the release tree', (t: any) => {
  const data: any = fixture('0.1.0-rc.4'); t.after(() => fs.rmSync(data.root, { recursive: true, force: true }));
  create(data); select(data); const frozen: any = freeze(data);
  git(data.retained, 'checkout', '-b', 'main', data.baseline);
  fs.writeFileSync(path.join(data.retained, 'projects/product/version.txt'), 'older published value\n');
  git(data.retained, 'commit', '-am', 'published main value');
  const mainCommit: any = git(data.retained, 'rev-parse', 'HEAD'); git(data.retained, 'push', 'origin', 'main');
  const reconciled: any = reconcileReleaseSelectionWithMain({ repo: data.repo, version: data.version, devRef: 'dev', mainRef: 'origin/main', confirm: true, reason: 'pre-Candidate convergence', executionBinding: data.binding() });
  assert.equal(reconciled.status, 'passed', JSON.stringify(reconciled));
  assert.equal(reconciled.releaseTree, frozen.releaseTree);
  assert.equal(git(data.repo, 'rev-parse', 'HEAD^{tree}'), frozen.releaseTree);
  assert.deepEqual(git(data.repo, 'rev-list', '--parents', '-n', '1', reconciled.releaseHead).split(' ').slice(1), [frozen.releaseHead, mainCommit]);
  assert.deepEqual(reconciled.reconciliationChain[0].changedPaths, []);
  assert.match(reconciled.reconciliationChain[0].coverageIdentity, /^sha256-/u);
  const repeated: any = reconcileReleaseSelectionWithMain({ repo: data.repo, version: data.version, devRef: 'dev', mainRef: 'origin/main', confirm: true, reason: 'same inputs', executionBinding: data.binding() });
  assert.equal(repeated.action, 'already-converged'); assert.deepEqual(repeated.effects, []);

  git(data.retained, 'checkout', 'dev');
  fs.writeFileSync(path.join(data.retained, 'projects/product/followup.txt'), 'Candidate follow-up\n');
  git(data.retained, 'add', '.'); git(data.retained, 'commit', '-m', 'Candidate follow-up');
  const followup: any = git(data.retained, 'rev-parse', 'HEAD');
  const reopened: any = reopenReleaseSelection({ repo: data.repo, version: data.version, confirm: true, reason: 'Candidate follow-up.', executionBinding: data.binding() });
  assert.equal(reopened.status, 'passed');
  assert.equal(selectReleaseCommit({ repo: data.repo, version: data.version, source: followup, devRef: 'dev', executionBinding: data.binding() }).status, 'passed');
  freeze(data);
  const resumed: any = reconcileReleaseSelectionWithMain({ repo: data.repo, version: data.version, devRef: 'dev', mainRef: 'origin/main', confirm: true, reason: 'main is already covered', executionBinding: data.binding() });
  assert.equal(resumed.action, 'already-converged');
  assert.equal(resumed.releaseHead, git(data.repo, 'rev-parse', 'HEAD'));
  assert.deepEqual(resumed.effects, []);
});

test('reopen preserves old freeze history and forms a new generation', (t: any) => {
  const data: any = fixture('0.1.0-rc.5'); t.after(() => fs.rmSync(data.root, { recursive: true, force: true }));
  create(data); freeze(data);
  const reopened: any = reopenReleaseSelection({ repo: data.repo, version: data.version, confirm: true, reason: 'Candidate predates final convergence.', executionBinding: data.binding() });
  assert.equal(reopened.status, 'passed'); assert.equal(reopened.freeze.state, 'open'); assert.equal(reopened.freezeHistory[0].commit, data.baseline);
  assert.equal(select(data).status, 'passed');
  assert.deepEqual(freeze(data).freezeHistory.map((entry: any) => entry.generation), [0, 1]);
});
