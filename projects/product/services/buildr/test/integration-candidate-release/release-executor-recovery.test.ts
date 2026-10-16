import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createReleaseContext } from '../../tools/release/release-readiness.ts';
import { createReleaseTransactionEvidence } from '../../tools/release/release-transaction-evidence.ts';
import { assertReleaseExecutorSource, assertReleaseExecutorRecoveryEvidence, assertReleaseExecutorRecoverySource, createReleaseExecutorRecovery } from '../../tools/release/release-executor-recovery.ts';
import { runReleaseAuthorityOidcProbe } from '../../tools/release/release-authority-oidc-probe.ts';
import { checkReleaseConvergence } from '../../tools/release/release-convergence.ts';

function fixture(t: any) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-release-executor-'));
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));
  const git = (...args: string[]) => {
    const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr); return result.stdout.trim();
  };
  const write = (file: string, value: string) => { fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true }); fs.writeFileSync(path.join(repo, file), value); };
  const commit = () => { git('add', '.'); git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'fixture'); return git('rev-parse', 'HEAD'); };
  git('init', '-qb', 'main'); write('.github/workflows/publish.yml', 'name: old publisher\n'); write('projects/product/services/buildr/package.json', JSON.stringify({ version: '1.2.3' })); const originalCommit = commit();
  const sourceTree = git('rev-parse', 'HEAD^{tree}');
  const original = createReleaseContext({ release: { version: '1.2.3', sourceCommit: originalCommit, sourceTree },
    convergence: { mainCommit: originalCommit, mainTree: sourceTree, devCommit: originalCommit },
    workflow: { path: '.github/workflows/publish.yml', digest: `sha256-${'a'.repeat(64)}`, repository: 'BuildrAI/Buildr', environment: 'npm-production' } });
  const previous = createReleaseTransactionEvidence({ context: original, publish: { repository: 'BuildrAI/Buildr', workflow: '.github/workflows/publish.yml', runId: 42, runAttempt: 2,
    runUrl: 'https://github.com/BuildrAI/Buildr/actions/runs/42', headSha: originalCommit }, outcome: 'failed',
    publicFacts: { version: '1.2.3', tagCommit: originalCommit, registryPublished: false } });
  write('.github/workflows/publish.yml', 'name: repaired publisher\n'); const executionCommit = commit();
  const executorRecovery = createReleaseExecutorRecovery(original, { repo, sourceCommit: executionCommit, previousEvidence: previous });
  const { schemaVersion: _schema, identity: _identity, ...input } = original;
  const context = createReleaseContext({ ...input, executorRecovery });
  return { repo, git, write, commit, original, previous, originalCommit, executionCommit, context };
}

test('real Git permits only a descendant release-tool fix and retains the original evidence binding', t => {
  const f = fixture(t);
  assert.equal(assertReleaseExecutorRecoverySource(f.context, { repo: f.repo })?.sourceCommit, f.executionCommit);
  const run = { id: 42, run_attempt: 2, status: 'completed', conclusion: 'failure', repository: { full_name: 'BuildrAI/Buildr' }, event: 'workflow_dispatch', head_branch: 'main', head_sha: f.originalCommit, path: '.github/workflows/publish.yml' };
  assert.doesNotThrow(() => assertReleaseExecutorRecoveryEvidence(f.context, f.previous, run));
  for (const change of [{ conclusion: 'success' }, { status: 'in_progress' }, { run_attempt: 1 }, { head_sha: f.executionCommit }, { path: '.github/workflows/verify.yml' }]) {
    assert.throws(() => assertReleaseExecutorRecoveryEvidence(f.context, f.previous, { ...run, ...change }));
  }
  assert.throws(() => createReleaseExecutorRecovery(f.original, { repo: f.repo, sourceCommit: f.executionCommit, previousEvidence: { ...f.previous, status: 'passed' } }));
  assert.throws(() => assertReleaseExecutorRecoverySource({ ...f.context, executorRecovery: { ...f.context.executorRecovery, sourceTree: f.original.release.sourceTree } }, { repo: f.repo }), /tree or workflow/);
});

test('real Git rejects production, package, lock and unrelated tool changes and non-descendant histories', t => {
  const f = fixture(t);
  for (const file of ['projects/product/services/buildr/src/production.ts', 'projects/product/services/buildr/package.json', 'projects/product/services/buildr/package-lock.json', 'projects/product/services/buildr/tools/release/application-payload.ts', 'projects/product/services/buildr/tools/unrelated.ts']) {
    f.git('checkout', '--detach', f.executionCommit); f.write(file, 'changed\n'); const commit = f.commit();
    assert.throws(() => assertReleaseExecutorSource({ repo: f.repo, originalCommit: f.originalCommit, executionCommit: commit }), /outside/);
  }
  f.git('checkout', '--detach', f.executionCommit); fs.unlinkSync(path.join(f.repo, '.github/workflows/publish.yml')); fs.symlinkSync('/tmp/foreign-publisher', path.join(f.repo, '.github/workflows/publish.yml'));
  const linked = f.commit();
  assert.throws(() => assertReleaseExecutorSource({ repo: f.repo, originalCommit: f.originalCommit, executionCommit: linked }), /regular/);
  f.git('checkout', '--orphan', 'unrelated'); f.git('rm', '-rf', '.'); f.write('.github/workflows/publish.yml', 'name: unrelated\n'); const unrelated = f.commit();
  assert.throws(() => assertReleaseExecutorSource({ repo: f.repo, originalCommit: f.originalCommit, executionCommit: unrelated }), /Git identity/);
  assert.throws(() => assertReleaseExecutorSource({ repo: f.repo, originalCommit: f.originalCommit, executionCommit: f.originalCommit }), /strict descendant/);
});

test('authority identifies the real repaired executor and refuses to impersonate the original package source', async t => {
  const f = fixture(t); let requests = 0;
  const env = { GITHUB_REPOSITORY: 'BuildrAI/Buildr', GITHUB_WORKFLOW_REF: 'BuildrAI/Buildr/.github/workflows/publish.yml@refs/heads/main', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_SHA: f.executionCommit,
    GITHUB_RUN_ID: '43', GITHUB_RUN_ATTEMPT: '1', GITHUB_SERVER_URL: 'https://github.com', ACTIONS_ID_TOKEN_REQUEST_URL: 'https://actions.example/oidc', ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'fixture' };
  const options = { repo: f.repo, context: f.context, sourceCommit: f.executionCommit, workflowSha256: f.context.executorRecovery.workflowDigest.slice(7) };
  const fetchImpl = async () => { requests++; return { ok: true, status: requests % 2 ? 200 : 201, json: async () => requests % 2 ? { value: 'fixture' } : { token: 'fixture', token_type: 'oidc', created: '2026-10-16T00:00:00Z', expires: '2026-10-16T01:00:00Z' } }; };
  const result = await runReleaseAuthorityOidcProbe(options, { env, fetchImpl, now: () => '2026-10-16T00:05:00Z' });
  assert.equal(result.status, 'ready'); assert.equal(result.sourceCommit, f.executionCommit); assert.equal(result.github.headSha, f.executionCommit);
  await assert.rejects(runReleaseAuthorityOidcProbe(options, { env: { ...env, GITHUB_SHA: f.originalCommit }, fetchImpl }), /checkout does not match/);
  assert.equal(requests, 2);
  f.git('remote', 'add', 'origin', f.repo);
  f.git('update-ref', 'refs/remotes/origin/main', f.executionCommit);
  f.git('update-ref', 'refs/remotes/origin/dev', f.executionCommit);
  f.git('update-ref', 'refs/remotes/origin/release-1.2.3', f.originalCommit);
  f.git('tag', 'v1.2.3', f.originalCommit);
  const convergence = { repo: f.repo, version: '1.2.3', candidateBase: f.originalCommit, candidateTree: f.original.release.sourceTree,
    stage: 'pre-tag', fetch: false, publicationSourceCommit: f.originalCommit, releaseContext: f.context, nowMs: Date.parse('2026-10-16T00:05:00Z') };
  const passed = checkReleaseConvergence({ ...convergence, authorityEvidence: result });
  assert.deepEqual(passed.findings, []); assert.equal(passed.ok, true);
  const wrong = checkReleaseConvergence({ ...convergence, authorityEvidence: { ...result, sourceCommit: f.originalCommit } });
  assert.equal(wrong.ok, false); assert.equal(wrong.findings.some((finding: any) => finding.code === 'release_authority_source_commit_mismatch'), true);
  assert.equal(f.git('rev-parse', 'refs/tags/v1.2.3'), f.originalCommit);

});
