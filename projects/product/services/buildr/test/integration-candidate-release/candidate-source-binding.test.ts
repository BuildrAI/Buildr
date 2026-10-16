import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import test from 'node:test';
import { createCandidateSourceBinding, assertCandidateSourceBinding, candidateCheckInputIdentity, readGitSourceInventory, verificationOnlyPath, releaseExecutionSource, assertReleaseExecutionCheckout } from '../../../../../../skills/buildr-release/scripts/candidate-source-binding.ts';
import { createReleaseContext, validateReleaseContext } from '../../../../../../skills/buildr-release/scripts/release-readiness.ts';
import { assertReleaseExecutorSource, releaseExecutorRecoverySchema } from '../../../../../../skills/buildr-release/scripts/release-executor-recovery.ts';
import { continueCandidateRepair } from '../../../../../../skills/buildr-release/scripts/candidate-repair-operation.ts';
import { createCandidateRepairPlan, candidateProofDefinition, reusedCandidateProofResult, validateCandidateRepairProof, candidateRepairShardPlan } from '../verification/candidate-repair.ts';
import { candidateProofDescriptors, assertCandidateRepairPlan } from '../verification/candidate-repair.ts';
import { prepareCandidateRepair, materializeCandidateRepair } from '../verification/candidate-repair-cli.ts';
import { createReleaseArtifactFixture } from '../helpers/release-artifact-fixture.ts';
import { createCandidateCiEvidence, candidateCiRegistryIdentity, aggregateCandidateCiEvidence, readCandidateCiEvidenceFiles } from '../verification/candidate-ci-evidence.ts';
import { createVerificationSourceInputReader } from '../verification/verification-source-inputs.ts';

test('real source binding preserves producer identity for test repair and rejects product, dependency and packaging changes', t => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'candidate-source-binding-'));
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));
  const git = (...args: string[]) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const prefix = 'projects/product/services/buildr/';
  const write = (name: string, text: string) => { const file = path.join(repo, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); };
  const commit = () => { git('add', '.'); git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.com', '-c', 'commit.gpgSign=false', 'commit', '-m', 'fixture'); return git('rev-parse', 'HEAD'); };
  git('init', '--initial-branch=main');
  write(prefix + 'package.json', '{"name":"@buildr-ai/buildr","version":"1.0.0"}\n');
  write(prefix + 'src/index.ts', 'export const value = 1;\n');
  write(prefix + 'test/first.test.ts', 'const value = 1;\n');
  write(prefix + 'test/second.test.ts', 'const value = 1;\n');
  const original = commit();
  write(prefix + 'test/second.test.ts', 'const repaired = 2;\n');
  write(prefix + '../../../../skills/buildr-release/scripts/plugin-hosted-release.ts', 'export const repaired = true;\n');
  const repaired = commit();
  const binding = createCandidateSourceBinding(repo, original, repaired);
  assert.equal(binding.productSource, original); assert.equal(binding.verificationSource, repaired);
  assert.notEqual(binding.productTree, binding.verificationTree);
  assert.doesNotThrow(() => assertCandidateSourceBinding(repo, binding));
  assert.throws(() => assertCandidateSourceBinding(repo, { ...binding, buildInputsIdentity: 'forged' }));
  const context = createReleaseContext({ release: { version: '1.0.0', sourceCommit: original, sourceTree: binding.productTree },
    artifact: { sourceCommit: original }, convergence: { mainCommit: original }, verification: binding });
  assert.deepEqual(validateReleaseContext(context), context);
  assert.equal(releaseExecutionSource(repo, context), original, 'verification source cannot select the protected publisher');
  assert.throws(() => assertReleaseExecutionCheckout(repo, context), /executor checkout/u);
  git('checkout', '--detach', original);
  assert.doesNotThrow(() => assertReleaseExecutionCheckout(repo, context));
  git('checkout', '--detach', repaired);
  const step = (file: string) => ({ id: file, executor: { type: 'node-test', files: [file] } });
  assert.equal(candidateCheckInputIdentity(repo, original, step('test/first.test.ts')), candidateCheckInputIdentity(repo, repaired, step('test/first.test.ts')));
  assert.notEqual(candidateCheckInputIdentity(repo, original, step('test/second.test.ts')), candidateCheckInputIdentity(repo, repaired, step('test/second.test.ts')));
  for (const file of ['src/index.ts', 'package-lock.json', 'test/context/public.ts', '../../../../skills/buildr-release/scripts/release-artifact.ts', '../../../../skills/buildr-release/scripts/application-payload.ts']) {
    write(prefix + file, 'changed build input\n'); const changed = commit();
    assert.throws(() => createCandidateSourceBinding(repo, repaired, changed), (error: any) => error.code === 'candidate-build-inputs-changed' && error.changedPaths.includes(path.posix.normalize(prefix + file)));
    git('revert', '--no-commit', changed); commit();
  }
});

test('candidate repair provenance coexists with protected publisher recovery without granting verifier authority', t => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'candidate-publisher-binding-'));
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));
  const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const write = (file: string, value: string) => { const target = path.join(repo, file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, value); };
  const commit = () => { git('add', '.'); git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.com', '-c', 'commit.gpgSign=false', 'commit', '-m', 'fixture'); return git('rev-parse', 'HEAD'); };
  const prefix = 'projects/product/services/buildr/';
  git('init', '--initial-branch=main');
  write(prefix + 'package.json', '{"version":"1.0.0"}\n');
  write('.github/workflows/publish.yml', 'name: protected\n');
  const original = commit();
  write(prefix + 'test/first.test.ts', '// repaired check\n');
  const verifier = commit(), binding = createCandidateSourceBinding(repo, original, verifier);
  const base = { release: { version: '1.0.0', sourceCommit: original, sourceTree: binding.productTree },
    artifact: { sourceCommit: original }, convergence: { mainCommit: original }, verification: binding };
  const context = createReleaseContext(base);
  git('checkout', '--detach', original);
  write(prefix + '../../../../skills/buildr-release/scripts/plugin-hosted-release.ts', '// publisher repair\n');
  const executor = commit();
  const recovery = { schemaVersion: releaseExecutorRecoverySchema,
    ...assertReleaseExecutorSource({ repo, originalCommit: original, executionCommit: executor }),
    originalContextIdentity: context.identity, previousRunId: 17, previousRunAttempt: 1, previousEvidenceIdentity: 'sha256-' + 'a'.repeat(64) };
  const recovered = createReleaseContext({ ...base, executorRecovery: recovery });
  assert.deepEqual(validateReleaseContext(recovered), recovered);
  assert.equal(releaseExecutionSource(repo, recovered), executor);
  assert.doesNotThrow(() => assertReleaseExecutionCheckout(repo, recovered));
  git('checkout', '--detach', verifier);
  assert.throws(() => assertReleaseExecutionCheckout(repo, recovered), /protected publisher/u);
  assert.throws(() => createReleaseContext({ ...base, verification: createCandidateSourceBinding(repo, original, original), executorRecovery: recovery }), /exact original context/u);
});

test('unknown and plugin build inputs remain conservative instead of being treated as test-only by filename', () => {
  for (const file of ['unknown-input.txt', 'projects/product/services/buildr-web/vite.config.ts',
    'projects/product/services/dsh-plugin/sdk-patches/host.patch', 'projects/product/services/buildr/tools/build/artifact-set.ts']) {
    assert.equal(verificationOnlyPath(file), false, file);
  }
});

test('runtime-discovered integration and system tests revoke proof on addition, deletion or content changes', t => {
  const prefix = 'projects/product/services/buildr/';
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'candidate-input-discovery-'));
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));
  fs.mkdirSync(path.join(repo, prefix), { recursive: true });
  for (const family of ['integration', 'system']) {
    const step = { id: family, executor: { type: 'node', file: `test/verification/${family}.ts`, args: ['--owner', 'example'] } };
    const reader = {
      inventory(commit: string) {
        return ['package.json', `test/verification/${family}.ts`, ...(commit === 'removed' ? [] : [`test/${family}/example.test.ts`]),
          ...(commit === 'added' ? [`test/${family}/added.test.ts`] : [])]
          .map(file => ({ path: prefix + file, mode: '100644', kind: 'blob', object: commit === 'changed' && file.endsWith('example.test.ts') ? 'changed' : file }));
      },
      blob(commit: string, file: string) { return file.endsWith(`${family}.ts`) ? "import fs from 'node:fs'; fs.readdirSync('test');"
        : commit === 'changed' && file.endsWith('example.test.ts') ? '// changed test' : '// discovered test'; },
    };
    const original = candidateCheckInputIdentity(repo, 'original', step, reader);
    for (const changed of ['changed', 'added', 'removed']) assert.notEqual(candidateCheckInputIdentity(repo, changed, step, reader), original, `${family}:${changed}`);
    assert.equal(candidateCheckInputIdentity(repo, 'unchanged', step, reader), original);
  }
});

test('formal repair retains the producer and unaffected check while a changed assertion is selected once', t => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'candidate-repair-plan-'));
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));
  const git = (...args: string[]) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const prefix = 'projects/product/services/buildr/';
  const write = (file: string, value: string) => { const target = path.join(repo, prefix, file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, value); };
  const commit = () => { git('add', '.'); git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.com', '-c', 'commit.gpgSign=false', 'commit', '-m', 'fixture'); return git('rev-parse', 'HEAD'); };
  git('init', '--initial-branch=main'); write('package.json', '{"version":"1.0.0"}\n');
  write('test/first.test.ts', '// first\n'); write('test/second.test.ts', '// second\n');
  write('test/verification/verification-reuse.ts', '// old result validator\n');
  write('../../../../skills/buildr-release/SKILL.md', '# original release method\n');
  const source = commit(), tree = git('rev-parse', 'HEAD^{tree}');
  const first = { id: 'first', executor: { type: 'node-test', files: ['test/first.test.ts'] }, dependsOn: [] };
  const second = { id: 'second', executor: { type: 'node-test', files: ['test/second.test.ts'] }, dependsOn: ['first'] };
  const producer = { id: 'candidate-tarball', executor: { type: 'candidate-artifact' } };
  const descriptors = [{ id: 'artifact-macos', kind: 'shard', runner: 'macos', producesArtifact: true, steps: [producer] },
    { id: 'source-macos', kind: 'shard', runner: 'macos', steps: [first, second] }];
  const artifact = { sourceCommit: source, filename: 'package.tgz', size: 12, sha256: 'a'.repeat(64), integrity: 'sha512-test', applicationPayloadDigest: 'sha256-test' };
  const run = { id: 42, repository: { full_name: 'BuildrAI/Buildr' }, path: '.github/workflows/verify.yml', event: 'workflow_dispatch', status: 'completed', conclusion: 'failure', head_sha: source, run_attempt: 1 };
  const evidence = descriptors.map(descriptor => ({ schemaVersion: 'buildr.candidate-ci-evidence/v2', id: descriptor.id, kind: 'shard',
    workflow: { runId: '42', runAttempt: '1' }, sourceCommit: source, sourceTree: tree, purpose: 'candidate', rehearsalIdentity: null,
    status: 'passed', runner: { os: 'macos', platform: 'darwin', arch: 'arm64', nodeVersion: '24.15.0' },
    artifact: descriptor.producesArtifact ? artifact : null,
    checkInputs: Object.fromEntries(descriptor.steps.map(step => [step.id, candidateCheckInputIdentity(repo, source, candidateProofDefinition(step))])),
    results: descriptor.steps.map(step => ({ id: step.id, status: 'passed', exitCode: 0, durationMs: 1500, processCleanup: { status: 'clean' } })) }));
  write('test/second.test.ts', '// repaired assertion\n');
  write('test/verification/verification-reuse.ts', '// repaired result validator\n');
  const verificationSource = commit();
  const input = { repo, repository: 'BuildrAI/Buildr', originalRun: run, artifact, verificationSource, evidence, registryIdentity: 'registry' };
  const plan = createCandidateRepairPlan(input, { descriptors });
  assert.deepEqual(plan.checks.map((check: any) => check.steps.map((step: any) => step.disposition)), [['reuse'], ['reuse', 'execute']]);
  const definition = candidateProofDefinition(first);
  assert.equal(candidateCheckInputIdentity(repo, source, { ...definition, executionProfile: { ...definition.executionProfile, global: 99, capacities: {} } }), evidence[1]!.checkInputs.first,
    'queue-only limits cannot revoke the check proof');
  assert.notEqual(candidateCheckInputIdentity(repo, source, { ...definition, resourceDemand: { workers: 4, processes: 4 } }), evidence[1]!.checkInputs.first,
    'an actual inner worker grant remains a check input');
  const originalInputs = createVerificationSourceInputReader(repo, path.join(repo, prefix), source).inputs({ ...first, reuse: { scope: 'repository' } }, true);
  const previousV3 = { version: 3, descriptor: { id: first.id, executor: first.executor, dependsOn: first.dependsOn,
    executionProfile: definition.executionProfile, scope: 'repository' }, inputs: originalInputs };
  const v3Evidence = structuredClone(evidence);
  v3Evidence[1]!.checkInputs.first = 'sha256-' + crypto.createHash('sha256').update(JSON.stringify(previousV3)).digest('hex');
  const adoptedV3 = createCandidateRepairPlan({ ...input, evidence: v3Evidence }, { descriptors });
  assert.equal(adoptedV3.checks[1].steps[0].disposition, 'reuse', 'the prior full-profile v3 digest is authenticated before current applicability');
  assert.deepEqual(adoptedV3.checks[1].original, v3Evidence[1]);
  // Historical v2 bound the result validator globally, although first.test.ts
  // never executed it. Authenticate those bytes before applying the shared policy.
  const legacyEvidence = structuredClone(evidence);
  const legacyInput = { version: 2, discoveredMembers: [], descriptor: { id: first.id, executor: first.executor,
    dependsOn: first.dependsOn, executionProfile: candidateProofDefinition(first).executionProfile },
    entries: readGitSourceInventory(repo, source).filter(entry => [prefix + 'package.json', prefix + 'test/first.test.ts', prefix + 'test/verification/verification-reuse.ts', 'skills/buildr-release/SKILL.md'].includes(entry.path)) };
  legacyEvidence[1]!.checkInputs.first = 'sha256-' + crypto.createHash('sha256').update(JSON.stringify(legacyInput)).digest('hex');
  const migrated = createCandidateRepairPlan({ ...input, evidence: legacyEvidence }, { descriptors });
  assert.equal(migrated.checks[1].steps[0].disposition, 'reuse', 'authenticated old evidence survives the input-model upgrade');
  assert.deepEqual(migrated.checks[1].original, legacyEvidence[1], 'migration preserves the original record');
  assert.notEqual(migrated.checks[1].steps[0].inputIdentity, legacyEvidence[1]!.checkInputs.first);
  legacyEvidence[1]!.checkInputs.first = 'sha256-' + '0'.repeat(64);
  assert.equal(createCandidateRepairPlan({ ...input, evidence: legacyEvidence }, { descriptors }).checks[1].steps[0].disposition, 'execute', 'unknown old identities cannot authorize reuse');
  for (const policy of [true, 'comparison']) {
    const gitFirst = { ...first, reuse: { scope: 'repository', git: policy } };
    const gitDescriptors = [descriptors[0]!, { ...descriptors[1]!, steps: [gitFirst, second] }];
    const gitEvidence = structuredClone(evidence);
    gitEvidence[1]!.checkInputs.first = candidateCheckInputIdentity(repo, source, candidateProofDefinition(gitFirst));
    const gitPlan = createCandidateRepairPlan({ ...input, evidence: gitEvidence }, { descriptors: gitDescriptors,
      inputIdentity: (commit, step) => candidateCheckInputIdentity(repo, commit, step) });
    assert.equal(gitPlan.checks[1].steps[0].reason, 'current-git-state-required', String(policy));
    assert.equal(gitPlan.checks[1].steps[0].disposition, 'execute', String(policy));
  }
  const reused = reusedCandidateProofResult(plan.checks[1].steps[0].proof);
  assert.equal(reused.durationMs, 0); assert.equal(reused.reusedFrom.durationMs, 1500);
  assert.equal(validateCandidateRepairProof(reused, 'source-macos', plan), true);
  assert.equal(validateCandidateRepairProof({ ...reused, candidateProof: { ...reused.candidateProof, inputIdentity: 'forged' } }, 'source-macos', plan), false);
  assert.deepEqual(candidateRepairShardPlan(plan, 'source-macos', { steps: [first, second] }).steps.map((step: any) => ({ id: step.id, dependsOn: step.dependsOn })), [{ id: 'second', dependsOn: [] }]);
  const wrongPlatform = structuredClone(evidence); wrongPlatform[1]!.runner.os = 'windows';
  assert.ok(createCandidateRepairPlan({ ...input, evidence: wrongPlatform }, { descriptors }).checks[1].steps.every((step: any) => step.disposition === 'execute'));
  const wrongPackage = structuredClone(evidence); wrongPackage[0]!.artifact!.sha256 = 'b'.repeat(64);
  assert.throws(() => createCandidateRepairPlan({ ...input, evidence: wrongPackage }, { descriptors }), /different package/u);
  assert.throws(() => createCandidateRepairPlan({ ...input, originalRun: { ...run, event: 'pull_request' } }, { descriptors }), /controlled/u);
  const duplicate = structuredClone(evidence); duplicate[1]!.results.push(duplicate[1]!.results[0]!);
  assert.throws(() => createCandidateRepairPlan({ ...input, evidence: duplicate }, { descriptors }), /ambiguous results/u);
  git('update-ref', 'refs/remotes/origin/dev', verificationSource);
  const candidate: any = { runId: 42, sourceCommit: source, branch: 'codex/release-main-fixture-g1' };
  const snapshots: any[] = []; let requests = 0, lists = 0, carrierWrites = 0;
  const scope = { git: (args: string[]) => git(...args), save: () => snapshots.push(structuredClone(candidate)), ensureCarrier: () => { carrierWrites++; },
    gh(args: string[]) {
      if (args[0] === 'api') return JSON.stringify(run);
      if (args[0] === 'workflow') { requests++; throw new Error('response lost'); }
      if (args[0] === 'run') return JSON.stringify(++lists >= 3 ? [{ databaseId: 52, headSha: source, displayTitle: 'Candidate repair 42 ' + verificationSource }] : []);
      throw new Error('Unexpected request');
    } };
  const operation = { repo, candidate, verificationSource, fields: [] };
  assert.equal(continueCandidateRepair(operation, scope).status, 'candidate-repair-dispatch-unconfirmed');
  assert.equal(candidate.runId, 42, 'a lost response cannot discard the original candidate');
  assert.ok(snapshots.some(value => value.repair?.requested && value.repair.runId === null));
  assert.equal(continueCandidateRepair(operation, scope).status, 'adopted');
  assert.equal(candidate.runId, 52); assert.equal(candidate.sourceCommit, source);
  assert.equal(requests, 1); assert.equal(carrierWrites, 1);
  assert.equal(continueCandidateRepair(operation, scope).status, 'adopted');
  assert.equal(requests, 1, 'repeated preparation does not create another repair');
});

test('default repair preparation verifies real package bytes, retains partial progress and closes the actual required coverage', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'candidate-repair-entry-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const repo = path.join(root, 'repo'); fs.mkdirSync(repo);
  const git = (...args: string[]) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const prefix = 'projects/product/services/buildr/';
  const write = (file: string, value: string) => { const target = path.join(repo, prefix, file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, value); };
  const commit = () => { git('add', '.'); git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.com', '-c', 'commit.gpgSign=false', 'commit', '-m', 'fixture'); return git('rev-parse', 'HEAD'); };
  git('init', '--initial-branch=dev'); write('package.json', '{"name":"@buildr-ai/buildr","version":"1.0.0"}\n');
  const source = commit(), tree = git('rev-parse', 'HEAD^{tree}');
  const built = await createReleaseArtifactFixture(path.join(root, 'artifact'), source);
  const artifact = Object.fromEntries(['sourceCommit', 'filename', 'size', 'sha256', 'integrity', 'applicationPayloadDigest'].map(key => [key, built.manifest[key]]));
  const run = { id: 42, repository: { full_name: 'BuildrAI/Buildr' }, path: '.github/workflows/verify.yml', event: 'workflow_dispatch', status: 'completed', conclusion: 'failure', head_sha: source, run_attempt: 1 };
  const registryIdentity = candidateCiRegistryIdentity(), descriptors = candidateProofDescriptors();
  const evidence = descriptors.map(check => createCandidateCiEvidence({ kind: check.kind, id: check.id,
    sourceCommit: source, sourceTree: tree, purpose: 'candidate', workflow: { runId: '42', runAttempt: 1 }, registryIdentity,
    platform: check.runner === 'macos' ? 'darwin' : check.runner === 'windows' ? 'win32' : 'linux', requestedNode: check.requestedNode,
    primaryStepIds: check.kind === 'shard' ? check.steps.map((step: any) => step.id) : [], status: 'passed', cleanupClean: true,
    startedAt: '2026-01-01T00:00:00Z', finishedAt: '2026-01-01T00:00:01Z', durationMs: 1000,
    artifact: check.requiresArtifact || check.producesArtifact ? artifact : null,
    checkInputs: Object.fromEntries(check.steps.map((step: any) => [step.id, candidateCheckInputIdentity(repo, source, candidateProofDefinition(step))])),
    results: check.steps.map((step: any) => ({ id: step.id, status: 'passed', exitCode: 0, durationMs: 1,
      phases: step.id === 'artifact-browser-core' ? ['artifact-unpack', 'artifact-verify', 'browser:core', 'artifact-cleanup'].map(id => ({ scope: 'candidate-browser-core', id, status: 'passed' })) : [] })) }));
  const failedShard = evidence.find((item: any) => item.id === 'release-infrastructure-macos');
  failedShard.status = 'failed'; failedShard.results[0].status = 'failed'; failedShard.results[0].exitCode = 1;
  const output = path.join(root, 'repair');
  const call = (args: string[]) => {
    if (args[0] === 'api') return JSON.stringify(run);
    assert.deepEqual(args.slice(0, 3), ['run', 'download', '42']);
    const destination = args[args.indexOf('--dir') + 1]!;
    if (args.includes('candidate-package')) fs.cpSync(path.dirname(built.manifestPath), destination, { recursive: true });
    else { fs.mkdirSync(destination, { recursive: true }); evidence.forEach((value: any) => fs.writeFileSync(path.join(destination, 'candidate-ci-evidence-' + value.id + '.json'), JSON.stringify(value))); }
    return '';
  };
  const prepared = prepareCandidateRepair({ repo, output, runId: '42', productSource: source, verificationSource: source, repository: 'BuildrAI/Buildr' }, { call });
  assertCandidateRepairPlan(prepared.plan, repo, registryIdentity);
  const partial = prepared.plan.checks.find((check: any) => check.id === failedShard.id);
  assert.equal(partial.steps[0].disposition, 'execute');
  assert.ok(partial.steps.some((step: any) => step.disposition === 'reuse'), 'a failed shard retains its other complete checks');
  const workflow = { runId: '52', runAttempt: 1 };
  const matrices = materializeCandidateRepair(prepared.plan, path.join(output, 'reused'), workflow);
  assert.ok(matrices.source.some((item: any) => item.shard === failedShard.id));
  assert.equal(matrices.artifact.length, 0, 'passing original package consumers do not execute again');
  assert.ok(matrices.host.length > 0, 'host environments still require fresh observations');
  assert.equal(matrices.host.find((item: any) => item.id === 'host-minimum-macos').preparation, 'publisher');
  assert.ok(matrices.host.every((item: any) => !item.id.includes('linux')), 'repair follows current supported hosts');
  const retained = readCandidateCiEvidenceFiles(path.join(output, 'reused'));
  const binding = prepared.plan.sourceBinding;
  for (const check of prepared.plan.checks.filter((item: any) => item.steps.some((step: any) => step.disposition === 'execute'))) {
    retained.push(createCandidateCiEvidence({ ...check.original, workflow, verificationSource: source, sourceBinding: binding,
      platform: check.original.runner.platform, arch: check.original.runner.arch, status: 'passed',
      results: check.steps.map((step: any) => step.disposition === 'reuse' ? reusedCandidateProofResult(step.proof)
        : { ...check.original.results.find((result: any) => result.id === step.id), status: 'passed', exitCode: 0 }) }));
  }
  const context = { purpose: 'candidate', sourceCommit: source, sourceTree: tree, verificationSource: source, sourceBinding: binding, rehearsalIdentity: null };
  const aggregate = aggregateCandidateCiEvidence(retained, context, workflow, { validateCandidateProof: (result: any, id: string) => validateCandidateRepairProof(result, id, prepared.plan) });
  assert.equal(aggregate.status, 'passed', JSON.stringify(aggregate.findings));
  assert.equal(aggregate.artifact.sha256, artifact.sha256);
  assert.equal(aggregateCandidateCiEvidence(retained.slice(1), context, workflow).status, 'failed', 'missing retained proof cannot close coverage');
  fs.appendFileSync(built.tarball, 'changed');
  assert.throws(() => prepareCandidateRepair({ repo, output: path.join(root, 'corrupt'), runId: '42', productSource: source, verificationSource: source, repository: 'BuildrAI/Buildr' }, { call }), /mismatch|integrity|size/u);
});

test('actual Candidate plan schedules no Linux and retains publisher preparation on minimum macOS', () => {
  const cli = path.resolve(import.meta.dirname, '../verification/candidate-ci.ts');
  const env = { ...process.env, GITHUB_OUTPUT: undefined, BUILDR_SOURCE_VERIFICATION: undefined };
  const planned = spawnSync(process.execPath, [cli, 'plan'], { env, encoding: 'utf8', timeout: 20_000, maxBuffer: 2 * 1024 * 1024 });
  assert.equal(planned.status, 0, planned.stderr);
  const plan = JSON.parse(planned.stdout);
  assert.equal(plan.matrices.host.length, 4);
  for (const matrix of Object.values(plan.matrices) as any[]) for (const row of matrix) assert.match(row.os, /^(?:macos-|windows-)/u);
  assert.deepEqual(plan.matrices.host.find((row: any) => row.id === 'host-minimum-macos'), {
    id: 'host-minimum-macos', os: 'macos-15', node: '24.15.0', preparation: 'publisher',
  });
  const refused = spawnSync(process.execPath, [cli, 'host', 'host-minimum-linux'], { env, encoding: 'utf8', timeout: 20_000 });
  assert.notEqual(refused.status, 0); assert.match(refused.stderr, /Unknown Candidate Host Node tuple: host-minimum-linux/u);
});
