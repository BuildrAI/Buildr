import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  cleanupRemoteReleaseBranch,
  closeoutReleaseGitResources,
  convergenceFixture,
  git,
  inactiveGithub,
  multiGenerationCloseout,
  runReleaseOrchestration,
} from './helpers.ts';

test('root preservation or repository mismatch prevents all generation deletions', async t => {
  for (const failure of ['missing-tag', 'repository', 'remote-fetch', 'remote-push']) await t.test(failure, child => {
    const data = convergenceFixture(true, true);
    child.after(() => fs.rmSync(data.root, { recursive: true, force: true }));
    const { earlier, current, options } = multiGenerationCloseout(data);
    if (failure === 'missing-tag') git(data.controller, 'push', 'origin', ':refs/tags/v0.1.0-rc.5');
    if (failure === 'repository') options.repository = 'someone/else';
    const blocked = closeoutReleaseGitResources(options, { execute: (command: string, args: string[], execOptions: any) => {
      if (command === 'git' && args[0] === 'remote' && args[1] === 'get-url'
          && ((failure === 'remote-push' && args.includes('--push')) || (failure === 'remote-fetch' && !args.includes('--push')))) {
        return { status: 0, stdout: 'git@github.com:someone/else.git\n' };
      }
      return inactiveGithub(command, args, execOptions);
    } });
    assert.equal(blocked.status, 'blocked', JSON.stringify(blocked));
    assert.deepEqual(blocked.effects, []);
    for (const branch of [earlier, current, 'release-0.1.0-rc.5']) assert.notEqual(git(data.controller, 'ls-remote', 'origin', `refs/heads/${branch}`), '');
  });
});

test('v1 and narrow formal cleanup retain branches with active uses', t => {
  const data = convergenceFixture(true, true);
  t.after(() => fs.rmSync(data.root, { recursive: true, force: true }));
  const { current, options } = multiGenerationCloseout(data, 'delete-owned-release-branches/v1');
  const execute = (command: string, args: string[], execOptions: any): any => {
    if (command === 'gh' && args[3]?.includes('/pulls?')) return { status: 0, stdout: JSON.stringify([[{ number: 99, state: 'open',
      head: { ref: current, repo: { full_name: 'BuildrAI/Buildr' } }, base: { ref: 'release-0.1.0-rc.5' } }]]) };
    return inactiveGithub(command, args, execOptions);
  };
  const broad = closeoutReleaseGitResources(options, { execute });
  const narrow = cleanupRemoteReleaseBranch(options, { execute });
  assert.equal(broad.status, 'blocked', JSON.stringify(broad));
  assert.equal(narrow.status, 'blocked', JSON.stringify(narrow));
  assert.deepEqual(broad.effects, []);
  assert.deepEqual(narrow.effects, []);
});

test('orchestration isolates a drifted formal branch while cleaning safe carriers', async t => {
  const data = convergenceFixture(true, true);
  t.after(() => fs.rmSync(data.root, { recursive: true, force: true }));
  const { earlier, current, options } = multiGenerationCloseout(data);
  git(data.controller, 'push', '--force', 'origin', `${data.devCommit}:refs/heads/release-0.1.0-rc.5`);
  const partial = await runReleaseOrchestration({ ...options, action: 'closeout', releaseTask: 'release-0.1.0-rc.5', publishRunId: 42 }, {
    inspectHostedReleaseTransaction: async () => ({ status: 'passed', evidence: data.publicationEvidence }),
  });
  assert.equal(partial.status, 'blocked', JSON.stringify(partial));
  assert.equal(partial.outcomes.publication, 'passed');
  assert.equal(partial.cleanup.branches.find((item: any) => item.ref === 'refs/heads/release-0.1.0-rc.5').disposition, 'retained');
  for (const branch of [earlier, current]) assert.equal(git(data.controller, 'ls-remote', 'origin', `refs/heads/${branch}`), '');
  assert.ok(git(data.controller, 'ls-remote', 'origin', 'refs/heads/release-0.1.0-rc.5').startsWith(data.devCommit));
});
