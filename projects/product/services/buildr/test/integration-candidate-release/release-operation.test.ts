import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { reconcilePublicationAfterPreparedContext, runReleaseOperation } from '../../tools/release/release-orchestration-runner.ts';
import { createReleaseArtifactFixture } from '../helpers/release-artifact-fixture.ts';
import { aggregateCandidateCiEvidence, candidateCiRegistryIdentity, createCandidateCiEvidence } from '../verification/candidate-ci-evidence.ts';
import { CANDIDATE_CI_SHARDS, CANDIDATE_CI_HOST_NODE_TUPLES } from '../verification/registry.ts';

const sourceRoot = path.resolve(import.meta.dirname, '../..');
function git(repo: string, args: string[]) {
  const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

test('reprepare releases only a terminal failed Publication pointer for a new unpublished context', () => {
  const publication = { requested: true, contextIdentity: 'sha256-old', runId: 41 };
  const context = { identity: 'sha256-new' };
  const released = reconcilePublicationAfterPreparedContext(publication, context, { id: 41, status: 'completed', conclusion: 'failure' });
  assert.equal(released.publication, null);
  assert.deepEqual(released.effect, {
    type: 'stale-publication-pointer-released',
    previousRunId: 41,
    previousContextIdentity: 'sha256-old',
    currentContextIdentity: 'sha256-new',
    previousConclusion: 'failure',
    publicState: 'unpublished',
  });
  assert.equal(reconcilePublicationAfterPreparedContext(publication, { identity: 'sha256-old' }, null).publication, publication);
  assert.throws(() => reconcilePublicationAfterPreparedContext(publication, context, { id: 41, status: 'in_progress', conclusion: null }), /still active/u);
  assert.throws(() => reconcilePublicationAfterPreparedContext(publication, context, { id: 41, status: 'completed', conclusion: 'success' }), /succeeded/u);
});

test('prepare creates one isolated release, validates before main, and reuses the same Candidate after unrelated dev and Task changes', async t => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-release-operation-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const workspace = path.join(root, 'workspace');
  const remote = path.join(root, 'remote.git');
  const version = JSON.parse(fs.readFileSync(path.join(sourceRoot, 'package.json'), 'utf8')).version;
  const taskId = `release-${version}`;
  const branch = `codex/${taskId}`;
  const repo = path.join(workspace, '.worktrees', taskId);
  const packageFile = 'projects/product/services/buildr/package.json';
  fs.mkdirSync(path.join(workspace, path.dirname(packageFile)), { recursive: true });
  fs.mkdirSync(path.join(workspace, '.github/workflows'), { recursive: true });
  fs.writeFileSync(path.join(workspace, packageFile), JSON.stringify({ name: '@buildr-ai/buildr', version: '0.0.0' }));
  fs.writeFileSync(path.join(workspace, 'projects/product/.node-version'), `${process.versions.node}\n`);
  fs.copyFileSync(path.resolve(sourceRoot, '../../../../.github/workflows/publish.yml'), path.join(workspace, '.github/workflows/publish.yml'));
  git(workspace, ['init', '-b', 'dev']); git(workspace, ['config', 'user.name', 'Buildr Test']); git(workspace, ['config', 'user.email', 'buildr@example.com']);
  git(workspace, ['add', '.']); git(workspace, ['commit', '-m', 'base']); git(workspace, ['branch', 'main']);
  fs.writeFileSync(path.join(workspace, packageFile), JSON.stringify({ name: '@buildr-ai/buildr', version }));
  git(workspace, ['commit', '-am', 'version materials']);
  const sourceCommit = git(workspace, ['rev-parse', 'HEAD']);
  const sourceTree = git(workspace, ['rev-parse', 'HEAD^{tree}']);
  git(workspace, ['init', '--bare', remote]); git(workspace, ['remote', 'add', 'origin', remote]); git(workspace, ['push', '-u', 'origin', 'dev', 'main']);
  const artifact = await createReleaseArtifactFixture(path.join(root, 'artifact'), sourceCommit);
  const artifactIdentity = Object.fromEntries(['sourceCommit', 'filename', 'size', 'sha256', 'integrity', 'applicationPayloadDigest'].map(key => [key, artifact.manifest[key]]));
  const execution = { purpose: 'candidate', sourceCommit, sourceTree, rehearsalIdentity: null };
  const workflow = { runId: '700', runAttempt: 1 };
  const evidence = [
    ...CANDIDATE_CI_SHARDS.map((shard: any) => createCandidateCiEvidence({ ...execution, workflow, kind: 'shard', id: shard.id, platform: shard.runner === 'macos' ? 'darwin' : 'win32', registryIdentity: candidateCiRegistryIdentity(),
      artifact: shard.requiresArtifact || shard.producesArtifact ? artifactIdentity : null, primaryStepIds: shard.stepIds, status: 'passed', startedAt: '2026-01-01T00:00:00Z', finishedAt: '2026-01-01T00:00:01Z', durationMs: 1000,
      results: shard.stepIds.map((id: string) => ({ id, status: 'passed', exitCode: 0, durationMs: 1 })) })),
    ...CANDIDATE_CI_HOST_NODE_TUPLES.map((tuple: any) => createCandidateCiEvidence({ ...execution, workflow, kind: 'host-node', id: tuple.id, platform: tuple.runner === 'macos' ? 'darwin' : tuple.runner === 'windows' ? 'win32' : 'linux', registryIdentity: candidateCiRegistryIdentity(),
      artifact: artifactIdentity, primaryStepIds: [], requestedNode: tuple.requestedNode, status: 'passed', startedAt: '2026-01-01T00:00:00Z', finishedAt: '2026-01-01T00:00:01Z', durationMs: 1000,
      results: [{ id: 'host-node-compatibility', status: 'passed', exitCode: 0, durationMs: 1 }] })),
  ];
  const aggregate = aggregateCandidateCiEvidence(evidence, execution, workflow);
  assert.equal(aggregate.status, 'passed');
  let task: any = null;
  let worktreeCreated = false;
  let dispatched = 0;
  let merges = 0;
  let candidateComplete = false;
  let pr: any = null;
  const providerFile = path.join(workspace, '.git/buildr/task-worktrees', `${taskId}.json`);
  const runtime = {
    inspectTask: (target: string, id: string) => {
      assert.equal(target, workspace, 'Task records always belong to the canonical Workspace');
      assert.equal(id, taskId);
      if (!task) throw Object.assign(new Error('Task is absent'), { code: 'task_record_not_found' });
      return { record: task, recordDigest: `sha256-${'1'.repeat(64)}` };
    },
    inspectGitWorktrees: ({ workspaceRoot, taskId: id }: any) => {
      assert.equal(workspaceRoot, workspace); assert.equal(id, taskId);
      return worktreeCreated ? { status: 'ready', taskId, evidencePath: providerFile, repositories: [{ selector: 'workspace', checkoutPath: repo, branch, head: git(repo, ['rev-parse', 'HEAD']), state: 'ready' }] } : { status: 'absent' };
    },
  };
  const server = http.createServer((req, res) => {
    res.writeHead(req.url === '/repos/BuildrAI/Buildr' || req.url?.includes('/actions/') ? 200 : 404, { 'content-type': 'application/json' });
    res.end(JSON.stringify(req.url === '/repos/BuildrAI/Buildr' ? { full_name: 'BuildrAI/Buildr', private: false } : { workflow_runs: [] }));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }));
  const api = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const execute = (command: string, args: string[], options: any) => {
    if (command !== 'gh') return spawnSync(command, args, { ...options, encoding: 'utf8' });
    const body = (value: unknown) => ({ status: 0, stdout: JSON.stringify(value) });
    if (args[0] === 'auth') return { status: 0, stdout: 'local-test-service' };
    if (args[0] === 'workflow') { dispatched++; return { status: 1, stderr: 'injected lost dispatch response' }; }
    if (args[0] === 'run' && args[1] === 'list') return body(dispatched ? [{ databaseId: 700, headSha: sourceCommit, status: candidateComplete ? 'completed' : 'queued', conclusion: candidateComplete ? 'success' : null }] : []);
    if (args[0] === 'api') return body({ id: 700, head_sha: sourceCommit, run_attempt: 1, path: '.github/workflows/verify.yml', repository: { full_name: 'BuildrAI/Buildr' }, event: 'workflow_dispatch', status: candidateComplete ? 'completed' : 'queued', conclusion: candidateComplete ? 'success' : null });
    if (args[0] === 'pr' && args[1] === 'list') return body(pr ? [pr] : []);
    if (args[0] === 'pr' && args[1] === 'create') {
      pr = { number: 1, state: 'OPEN', headRefOid: sourceCommit, headRefName: args[args.indexOf('--head') + 1], baseRefName: 'main', url: 'https://github.com/BuildrAI/Buildr/pull/1' };
      return { status: 0, stdout: pr.url };
    }
    if (args[0] === 'pr' && args[1] === 'merge') {
      merges++;
      const merger = path.join(root, 'merge-main');
      git(workspace, ['worktree', 'add', '--detach', merger, 'origin/main']);
      git(merger, ['merge', '--no-ff', sourceCommit, '-m', 'release merge']);
      const merged = git(merger, ['rev-parse', 'HEAD']);
      git(merger, ['push', 'origin', 'HEAD:main']); git(workspace, ['worktree', 'remove', merger]);
      pr = { ...pr, state: 'MERGED', mergedAt: new Date().toISOString(), mergeCommit: { oid: merged } };
      return { status: 0, stdout: '' };
    }
    return { status: 1, stderr: `unexpected local service command ${args.join(' ')}` };
  };
  const candidateEvidence = { aggregate, manifest: artifact.manifest };
  const dependencies = { execute, runtime, observationOptions: { githubApi: api, registry: api }, candidateDependencies: { candidateEvidence },
    resolveRetainedController: () => ({ workspaceRoot: workspace }),
    invokeRetainedController: (_controller: any, args: string[]) => {
      if (args[0] === 'task' && args[1] === 'create') { task = { taskId, title: 'Release fixture', status: 'active' }; return { status: 'created', record: task, effects: [{ type: 'task-created' }] }; }
      if (args[0] === 'worktree' && args[1] === 'create') {
        git(workspace, ['worktree', 'add', '-b', branch, repo, sourceCommit]);
        fs.mkdirSync(path.dirname(providerFile), { recursive: true });
        fs.writeFileSync(providerFile, JSON.stringify({ schemaVersion: 'buildr.git-worktree-evidence/v1', taskId, workspaceRoot: workspace, branch, planDigest: `sha256-${'2'.repeat(64)}`, status: 'ready', repositories: [{ selector: 'workspace', checkoutPath: repo, branch }], effects: [] }));
        worktreeCreated = true;
        return runtime.inspectGitWorktrees({ workspaceRoot: workspace, taskId });
      }
      assert.fail(`unexpected controller action ${args.join(' ')}`);
    },
    orchestrationDependencies: { transactionDependencies: { execute, runtime, candidateEvidence } },
  };
  const options = { action: 'prepare', workspace, version };
  const first = await runReleaseOperation(options, dependencies);
  assert.equal(first.status, 'candidate-running', JSON.stringify(first));
  assert.equal(dispatched, 1, 'lost responses must not dispatch twice');
  candidateComplete = true;
  aggregate.sourceCommit = 'f'.repeat(40);
  const invalid = await runReleaseOperation(options, dependencies);
  assert.equal(invalid.status, 'blocked');
  assert.equal(merges, 0, 'artifact/Candidate mismatch is rejected before main mutation');
  assert.equal(pr, null);
  aggregate.sourceCommit = sourceCommit;
  const ready = await runReleaseOperation(options, dependencies);
  assert.equal(ready.status, 'awaiting-publication-authorization', JSON.stringify(ready));
  assert.equal(merges, 1); assert.equal(dispatched, 1);
  task.title = 'Unrelated Task title update';
  fs.writeFileSync(path.join(workspace, 'unrelated.txt'), 'later dev content');
  git(workspace, ['add', 'unrelated.txt']); git(workspace, ['commit', '-m', 'later dev']); git(workspace, ['push', 'origin', 'dev']);
  const repeated = await runReleaseOperation(options, dependencies);
  assert.equal(repeated.status, 'awaiting-publication-authorization', JSON.stringify(repeated));
  assert.equal(repeated.contextIdentity, ready.contextIdentity);
  assert.equal(repeated.sourceCommit, sourceCommit);
  assert.equal(dispatched, 1); assert.equal(merges, 1);
  const record = JSON.parse(fs.readFileSync(path.join(workspace, '.git/buildr/release-operations', `${version}.json`), 'utf8'));
  assert.equal(record.candidate.runId, 700);
  assert.equal(record.sources.length, 0);
});
