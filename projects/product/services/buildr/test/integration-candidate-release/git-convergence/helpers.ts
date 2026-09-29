import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  closeoutReleaseGitResources as closeoutReleaseGitResourcesActual,
  cleanupRemoteReleaseBranch as cleanupRemoteReleaseBranchActual,
  releaseCarrierBranchFor,
} from '../../../tools/release/release-git-convergence.ts';
import { createReleaseContext } from '../../../tools/release/release-readiness.ts';
import {
  createReleaseSelection,
  freezeReleaseSelection,
  selectReleaseCommit,
} from '../../../tools/release/release-selection.ts';
import { createReleaseTransactionEvidence } from '../../../tools/release/release-transaction-evidence.ts';
import { createReleaseExecutionBinding } from '../../../tools/release/release-execution-binding.ts';
import { runReleaseOrchestration as runReleaseOrchestrationActual } from '../../../tools/release/release-orchestration-runner.ts';

export const digest: any = (value: any) => `sha256-${String(value).padStart(64, '0')}`;

export function inactiveGithub(command: string, args: string[], options: any): any {
  if (command === 'git' && args[0] === 'remote' && args[1] === 'get-url') return { status: 0, stdout: 'https://github.com/BuildrAI/Buildr.git\n' };
  if (command !== 'gh') return spawnSync(command, args, { ...options, encoding: 'utf8' });
  assert.deepEqual(args.slice(0, 3), ['api', '--paginate', '--slurp']);
  const endpoint = args[3];
  assert.match(endpoint, /^repos\/BuildrAI\/Buildr\/(?:pulls\?|actions\/runs\?)/u);
  return { status: 0, stdout: JSON.stringify(endpoint.includes('/pulls?') ? [[]] : [{ total_count: 0, workflow_runs: [] }]) };
}

export function closeoutReleaseGitResources(options: any, dependencies: any = {}): any {
  return closeoutReleaseGitResourcesActual(options, { execute: inactiveGithub, ...dependencies });
}

export function cleanupRemoteReleaseBranch(options: any, dependencies: any = {}): any {
  return cleanupRemoteReleaseBranchActual(options, { execute: inactiveGithub, ...dependencies });
}

export function runReleaseOrchestration(options: any, dependencies: any = {}): any {
  return runReleaseOrchestrationActual(options, { ...dependencies, gitDependencies: { execute: inactiveGithub, ...dependencies.gitDependencies } });
}

export function git(cwd: any, ...args: any[]): any  {
  const result: any = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, `git ${args.join(' ')}\n${result.stderr}`);
  return result.stdout.trim();
}

export function write(cwd: any, file: any, value: any): any  {
  const target: any = path.join(cwd, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, value);
}

export function commit(cwd: any, message: any, files: any): any  {
  for (const [file, value] of Object.entries(files)) write(cwd, file, value);
  git(cwd, 'add', '.');
  git(cwd, 'commit', '-m', message);
  return git(cwd, 'rev-parse', 'HEAD');
}

export function configure(cwd: any): any  {
  git(cwd, 'config', 'user.name', 'Buildr Test');
  git(cwd, 'config', 'user.email', 'buildr@example.com');
}

export function releaseWorktree(root: any, remote: any, baseline: any, version: any = '0.1.0-rc.5'): any  {
  const controller: any = path.join(root, 'controller');
  const work: any = path.join(root, 'work');
  git(root, 'clone', '--branch', 'dev', remote, controller);
  configure(controller);
  git(controller, 'worktree', 'add', '-b', `codex/release-${version}`, work, baseline);
  configure(work);
  const providerEvidence: any = path.join(root, 'provider.json');
  fs.writeFileSync(providerEvidence, JSON.stringify({ schemaVersion: 'buildr.git-worktree-evidence/v1', taskId: `release-${version}`, workspaceRoot: controller, branch: `codex/release-${version}`, planDigest: digest('1'), status: 'ready', repositories: [{ selector: 'workspace', checkoutPath: work, branch: `codex/release-${version}` }], effects: [], updatedAt: '2026-08-28T00:00:00.000Z' }));
  const task: any = { taskId: `release-${version}`, status: 'active' };
  return { controller, work, binding: () => {
    const head: any = git(work, 'rev-parse', 'HEAD');
    const repository: any = { selector: 'workspace', checkoutPath: work, branch: `codex/release-${version}`, head, state: 'ready' };
    return createReleaseExecutionBinding({ version, task, workspaceRoot: controller, repo: work, worktreeResult: { status: 'ready', taskId: task.taskId, evidencePath: providerEvidence, repositories: [repository] } });
  } };
}

export function convergenceFixture(preserveSource = true, previousGeneration = false): any  {
  const root: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-release-git-convergence-'));
  const remote: any = path.join(root, 'remote.git');
  const seed: any = path.join(root, 'seed');
  const work: any = path.join(root, 'work');
  git(root, 'init', '--bare', remote);
  fs.mkdirSync(seed);
  git(seed, 'init', '-b', 'dev');
  configure(seed);
  const packageFile: any = 'projects/product/services/buildr/package.json';
  const base: any = commit(seed, 'base', {
    'candidate.txt': 'base\n',
    [packageFile]: '{"name":"@buildr-ai/buildr","version":"0.1.0-rc.4"}\n',
  });
  git(seed, 'branch', 'main', base);
  const earlier = previousGeneration ? commit(seed, 'earlier release source on dev', {
    'candidate.txt': 'earlier release\n',
    [packageFile]: '{"name":"@buildr-ai/buildr","version":"0.1.0-rc.5"}\n',
  }) : null;
  const selected: any = commit(seed, 'release source on dev', {
    'candidate.txt': 'release\n',
    [packageFile]: '{"name":"@buildr-ai/buildr","version":"0.1.0-rc.5"}\n',
  });
  const selectedTree: any = git(seed, 'rev-parse', `${selected}^{tree}`);
  const devCommit: any = commit(seed, 'continue dev', { 'dev-only.txt': 'keep me\n' });
  const devTree: any = git(seed, 'rev-parse', `${devCommit}^{tree}`);
  git(seed, 'checkout', 'main');
  git(seed, 'checkout', selected, '--', '.');
  let mainCommit: any = commit(seed, 'squash release', {});
  git(seed, 'tag', '-a', 'v0.1.0-rc.5', mainCommit, '-m', 'release 0.1.0-rc.5');
  git(seed, 'remote', 'add', 'origin', remote);
  git(seed, 'push', 'origin', 'dev', 'main', 'refs/tags/v0.1.0-rc.5');
  const release: any = releaseWorktree(root, remote, base);
  const created: any = createReleaseSelection({ version: '0.1.0-rc.5', repo: release.work, devRef: 'origin/dev', baseline: base, executionBinding: release.binding() });
  assert.equal(created.status, 'passed', JSON.stringify(created));
  let previousReleaseCommit: string | null = null;
  if (earlier) {
    const previous = selectReleaseCommit({ version: '0.1.0-rc.5', repo: release.work, devRef: 'origin/dev', source: earlier, executionBinding: release.binding() });
    assert.equal(previous.status, 'passed', JSON.stringify(previous));
    previousReleaseCommit = previous.releaseHead;
  }
  const updated: any = selectReleaseCommit({ version: '0.1.0-rc.5', repo: release.work, devRef: 'origin/dev', source: selected, executionBinding: release.binding() });
  assert.equal(updated.status, 'passed', JSON.stringify(updated));
  const frozen: any = freezeReleaseSelection({ version: '0.1.0-rc.5', repo: release.work, devRef: 'origin/dev', executionBinding: release.binding() });
  assert.equal(frozen.status, 'passed', JSON.stringify(frozen));
  const releaseCommit: any = frozen.releaseHead;
  const releaseTree: any = frozen.releaseTree;
  assert.equal(releaseTree, selectedTree);
  git(release.work, 'push', 'origin', `${releaseCommit}:refs/heads/release-0.1.0-rc.5`);
  if (preserveSource) {
    git(seed, 'fetch', 'origin', 'release-0.1.0-rc.5');
    git(seed, 'merge', '--no-ff', releaseCommit, '-m', 'preserve release source');
    mainCommit = git(seed, 'rev-parse', 'HEAD');
    git(seed, 'tag', '-f', '-a', 'v0.1.0-rc.5', mainCommit, '-m', 'release 0.1.0-rc.5');
    git(seed, 'push', 'origin', 'main', '+refs/tags/v0.1.0-rc.5');
    git(release.work, 'fetch', 'origin', 'main', '+refs/tags/v0.1.0-rc.5:refs/tags/v0.1.0-rc.5');
  }
  const context: any = createReleaseContext({
    selection: {
      identity: frozen.selectionIdentity,
      version: frozen.version,
      branch: frozen.branch,
      releaseHead: frozen.releaseHead,
      releaseTree: frozen.releaseTree,
      generation: frozen.generation,
      status: 'frozen',
    },
    release: { version: '0.1.0-rc.5', sourceCommit: releaseCommit, sourceTree: releaseTree },
    convergence: { mainCommit, mainTree: releaseTree, devCommit, devTree },
  });
  const publicationEvidence: any = createReleaseTransactionEvidence({
    context,
    publish: {
      repository: 'BuildrAI/Buildr',
      workflow: '.github/workflows/publish.yml',
      runId: 42,
      runAttempt: 1,
      runUrl: 'https://github.com/BuildrAI/Buildr/actions/runs/42',
      headSha: mainCommit,
    },
    outcome: 'passed',
    publicFacts: {
      version: '0.1.0-rc.5',
      tagCommit: mainCommit,
      npmDistTag: 'next',
      registryPublished: true,
      registryIntegrity: 'sha512-YnVpbGRy',
      githubRelease: 'https://github.com/BuildrAI/Buildr/releases/tag/v0.1.0-rc.5',
      registrySmoke: 'passed',
    },
  });
  return { root, remote, seed, controller: release.controller, work: release.work, binding: release.binding, base, selected, frozen, releaseCommit, releaseTree, previousReleaseCommit, mainCommit, devCommit, publicationEvidence };
}

export function multiGenerationCloseout(data: any, policy = 'delete-owned-release-branches/v2'): any {
  const version = '0.1.0-rc.5';
  const earlier = releaseCarrierBranchFor(version, data.frozen.generation - 1);
  const current = releaseCarrierBranchFor(version, data.frozen.generation);
  for (const [branch, commit] of [[earlier, data.previousReleaseCommit], [current, data.releaseCommit]]) {
    git(data.controller, 'push', 'origin', `${commit}:refs/heads/${branch}`);
    git(data.controller, 'branch', branch, commit);
  }
  return { earlier, current, options: { repo: data.controller, version, generation: data.frozen.generation,
    expectedCommit: data.releaseCommit, publicationEvidence: data.publicationEvidence, cleanupPolicy: policy,
    authorizeCarrierCleanup: true, authorizeLocalSelectionCleanup: true, authorizeRemoteDelete: true } };
}
