import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { closeoutReleaseGitResources, convergenceFixture, git, inactiveGithub, multiGenerationCloseout } from './helpers.ts';

test('v2 cleans every proved generation, keeps other versions, and reconstructs ownership after local selection cleanup', t => {
  const data = convergenceFixture(true, true);
  t.after(() => fs.rmSync(data.root, { recursive: true, force: true }));
  const { earlier, current, options } = multiGenerationCloseout(data);
  const unrelated = 'codex/release-main-0.1.0-rc.50-g1';
  git(data.controller, 'push', 'origin', `${data.previousReleaseCommit}:refs/heads/${unrelated}`);
  const tagBefore = git(data.controller, 'ls-remote', 'origin', 'refs/tags/v0.1.0-rc.5');
  const cleaned = closeoutReleaseGitResources(options);
  assert.equal(cleaned.status, 'passed', JSON.stringify(cleaned));
  assert.equal(cleaned.branches.find((item: any) => item.ref === `refs/heads/${earlier}`).expectedCommit, data.previousReleaseCommit);
  for (const branch of [earlier, current, 'release-0.1.0-rc.5']) assert.equal(git(data.controller, 'ls-remote', 'origin', `refs/heads/${branch}`), '');
  assert.notEqual(git(data.controller, 'ls-remote', 'origin', `refs/heads/${unrelated}`), '');
  assert.equal(git(data.controller, 'ls-remote', 'origin', 'refs/tags/v0.1.0-rc.5'), tagBefore);
  assert.equal(git(data.controller, 'for-each-ref', '--format=%(refname)', 'refs/buildr/release/0.1.0-rc.5/'), '');
  // Simulate a remote deletion response that was lost before the caller saw it.
  git(data.controller, 'push', 'origin', `${data.previousReleaseCommit}:refs/heads/${earlier}`);
  const resumed = closeoutReleaseGitResources(options);
  assert.equal(resumed.status, 'passed', JSON.stringify(resumed));
  assert.equal(git(data.controller, 'ls-remote', 'origin', `refs/heads/${earlier}`), '');
  const repeated = closeoutReleaseGitResources(options);
  assert.equal(repeated.action, 'already-cleaned');
  assert.deepEqual(repeated.effects, []);
  assert.ok(repeated.branches.every((item: any) => item.disposition === 'already-cleaned'));
});

test('v1 keeps earlier generations and continues to accept a CLI string generation', t => {
  const data = convergenceFixture(true, true);
  t.after(() => fs.rmSync(data.root, { recursive: true, force: true }));
  const { earlier, current, options } = multiGenerationCloseout(data, 'delete-owned-release-branches/v1');
  const cleaned = closeoutReleaseGitResources({ ...options, generation: String(options.generation) });
  assert.equal(cleaned.status, 'passed', JSON.stringify(cleaned));
  assert.notEqual(git(data.controller, 'ls-remote', 'origin', `refs/heads/${earlier}`), '');
  assert.equal(git(data.controller, 'ls-remote', 'origin', `refs/heads/${current}`), '');
  assert.equal(cleaned.resources.carriers, undefined, 'a v1 result cannot claim all generations are absent');
});

test('v2 retains only a drifted, active, unknown, or failed generation and reports recoverable partial effects', async t => {
  for (const failure of ['drift', 'head-pr', 'base-pr', 'run', 'query', 'malformed-pr', 'incomplete-runs', 'delete-failure']) {
    await t.test(failure, child => {
      const data = convergenceFixture(true, true);
      child.after(() => fs.rmSync(data.root, { recursive: true, force: true }));
      const { earlier, current, options } = multiGenerationCloseout(data);
      if (failure === 'drift') git(data.controller, 'push', '--force', 'origin', `${data.devCommit}:refs/heads/${earlier}`);
      const execute = (command: string, args: string[], execOptions: any): any => {
        const endpoint = args[3] ?? '';
        const body = (value: any) => ({ status: 0, stdout: JSON.stringify(value) });
        if (command === 'gh' && endpoint.includes('/pulls?')) {
          if (failure === 'head-pr' || failure === 'base-pr') return body([[], [{ number: 99, state: 'open',
            head: { ref: failure === 'head-pr' ? earlier : 'another-branch', repo: { full_name: 'BuildrAI/Buildr' } },
            base: { ref: failure === 'base-pr' ? earlier : 'main' } }]]);
          // An invalid identity is unknown for every branch, so inject it only
          // while inspecting the old generation (identified below via a hook).
        }
        if (command === 'gh' && endpoint.includes(`branch=${encodeURIComponent(earlier)}&`)) {
          if (failure === 'run') return body([{ total_count: 1, workflow_runs: [] }, { total_count: 1, workflow_runs: [{ id: 8, head_branch: earlier, status: 'in_progress' }] }]);
          if (failure === 'query') return { status: 1, stderr: 'GitHub unavailable' };
          if (failure === 'incomplete-runs') return body([{ total_count: 2, workflow_runs: [] }]);
        }
        if (failure === 'delete-failure' && command === 'git' && args[0] === 'push' && args.includes(`:refs/heads/${earlier}`)) return { status: 1, stderr: 'injected push failure' };
        return inactiveGithub(command, args, execOptions);
      };
      let inspectedBranch = '';
      const dependencies = { execute: (command: string, args: string[], execOptions: any) => {
        // Branch iteration reads PRs before runs. The deterministic branch list
        // starts with the earlier carrier, letting this response exercise an
        // invalid PR identity without making unrelated reads unavailable.
        if (command === 'gh' && args[3]?.includes('/pulls?')) {
          inspectedBranch = inspectedBranch ? 'later' : earlier;
          if (failure === 'malformed-pr' && inspectedBranch === earlier) return { status: 0, stdout: JSON.stringify([[{ number: 99, state: 'open', head: { ref: earlier, repo: {} }, base: { ref: 'main' } }]]) };
        }
        return execute(command, args, execOptions);
      } };
      const partial = closeoutReleaseGitResources(options, dependencies);
      assert.equal(partial.status, 'blocked', `${failure}: ${JSON.stringify(partial)}`);
      assert.equal(partial.diagnostic.code, 'release-cleanup-partial');
      assert.notEqual(git(data.controller, 'ls-remote', 'origin', `refs/heads/${earlier}`), '');
      assert.equal(git(data.controller, 'ls-remote', 'origin', `refs/heads/${current}`), '');
      assert.equal(git(data.controller, 'ls-remote', 'origin', 'refs/heads/release-0.1.0-rc.5'), '');
      assert.equal(partial.branches.find((item: any) => item.ref === `refs/heads/${earlier}`).disposition, 'retained');
      assert.ok(partial.effects.some((item: any) => item.type === 'remote-release-branch-deleted'));
      if (failure === 'delete-failure') assert.ok(partial.effects.some((item: any) => item.ref === `refs/heads/${earlier}` && item.state === 'not-applied'));
      if (failure === 'drift') git(data.controller, 'push', '--force', 'origin', `${data.previousReleaseCommit}:refs/heads/${earlier}`);
      const resumed = closeoutReleaseGitResources(options);
      assert.equal(resumed.status, 'passed', JSON.stringify(resumed));
      assert.equal(git(data.controller, 'ls-remote', 'origin', `refs/heads/${earlier}`), '');
    });
  }
});
