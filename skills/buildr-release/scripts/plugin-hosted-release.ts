/** Thin GitHub adapter. Plugin candidate bytes and publication journals remain owned by DSH tools. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { releaseContextIdentity } from './release-readiness.ts';
import { spawnSync } from 'node:child_process';
import { readReleaseCandidate, sourceSdkIdentityFromFiles, SOURCE_SDK_MANIFEST, PLUGIN_SERVICE_PATH } from './dsh-plugin/release-candidate.ts';
import { artifactFromTarball } from './package-artifact-observation.ts';
import { assertBoundPluginVerification } from '../../../projects/product/services/buildr/test/verification/release/verify-pr-candidate.ts';
import { assertPluginCandidateAdoption, PLUGIN_CANDIDATE_ADOPTION_FILE } from './dsh-plugin/candidate-adoption.ts';
import { parseCompatibilityArtifact } from './package-compatibility.ts';
import { releaseCommandDiagnostic, releaseDispatchRejected } from './release-failure.ts';

const repository = 'BuildrAI/Buildr';
const workflow = 'publish-dsh-plugin.yml';
const workflowPath = `.github/workflows/${workflow}`;
const sourceHash = /^[a-f0-9]{40}$/u;
const defaultExecute = (command: string, args: string[], options: any) => spawnSync(command, args, { ...options, encoding: 'utf8', timeout: options.timeout ?? 30_000 });


function singleFile(root: string, filename: string, optional = false): string {
  const matches: string[] = [];
  const visit = (directory: string) => {
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, item.name);
      if (item.isSymbolicLink()) throw new Error('Plugin artifact readback refuses symbolic links.');
      if (item.isDirectory()) visit(full);
      else if (item.isFile() && item.name === filename) matches.push(full);
    }
  };
  visit(root);
  if (matches.length === 0 && optional) return '';
  if (matches.length !== 1) throw new Error(`Plugin artifact requires one ${filename}.`);
  return matches[0]!;
}

function tools(options: any, dependencies: any): any {
  const execute = dependencies.execute ?? defaultExecute;
  const call = (command: string, args: string[], timeout = 30_000) => {
    const result = execute(command, args, { cwd: options.repo, timeout, maxBuffer: 8 * 1024 * 1024 });
    if (result.status !== 0 || result.error) {
      const diagnostic = releaseCommandDiagnostic(command, args, result);
      throw Object.assign(new Error(`${command} ${args[0]} failed during plugin workflow readback: ${diagnostic.stderr || diagnostic.message || diagnostic.exitCode}`), { diagnostic });
    }
    return command === 'git' ? String(result.stdout ?? '') : String(result.stdout ?? '').trim();
  };
  return { gh: (args: string[], timeout?: number) => call(options.ghCommand ?? 'gh', args, timeout), git: (args: string[]) => call('git', args) };
}

export function validatePluginHostedRun(run: any, options: { operation: 'prepare' | 'publish'; version: string; sourceCommit: string; runId?: number }): void {
  if (run?.repository?.full_name !== repository || run.path?.split('@')[0] !== workflowPath || run.event !== 'workflow_dispatch'
      || run.head_branch !== 'main' || run.head_sha !== options.sourceCommit || !sourceHash.test(options.sourceCommit)
      || run.display_title !== `DSH ${options.operation} ${options.version}` || !Number.isSafeInteger(run.id) || run.id < 1
      || (options.runId && run.id !== options.runId) || run.run_attempt !== 1) throw new Error('Plugin workflow run identity differs from its original request.');
}

export const pluginNoWriteProofSchema = 'buildr.plugin-publication-no-write/v1';

function createPluginNoWriteProof(run: any, jobs: any[], options: { runId: number; version: string; sourceCommit: string }): any {
  validatePluginHostedRun(run, { operation: 'publish', ...options });
  if (run.status !== 'completed' || run.conclusion !== 'failure' || !Array.isArray(jobs) || !jobs.length || jobs.length > 100
    || new Set(jobs.map(job => job?.id)).size !== jobs.length) throw new Error('Plugin no-write proof requires a complete terminal failed run.');
  const projected = jobs.map(job => {
    if (!Number.isSafeInteger(job?.id) || job.id < 1 || job.run_id !== run.id || job.head_sha !== run.head_sha || job.status !== 'completed'
      || typeof job.name !== 'string' || !job.name || job.name.length > 256 || typeof job.conclusion !== 'string'
      || !Array.isArray(job.steps) || job.steps.length > 100 || new Set(job.steps.map((step: any) => step?.number)).size !== job.steps.length) throw new Error('Plugin no-write job evidence is incomplete.');
    const steps = job.steps.map((step: any) => {
      if (!Number.isSafeInteger(step?.number) || step.number < 1 || typeof step.name !== 'string' || !step.name || step.name.length > 256
        || step.status !== 'completed' || typeof step.conclusion !== 'string') throw new Error('Plugin no-write step evidence is incomplete.');
      return { number: step.number, name: step.name, status: step.status, conclusion: step.conclusion };
    });
    return { id: job.id, run_id: job.run_id, head_sha: job.head_sha, name: job.name, status: job.status, conclusion: job.conclusion, steps };
  });
  const publish = projected.filter(job => job.name === 'publish');
  const upload = projected.flatMap(job => job.steps).filter((step: any) => step.name === 'Publish immutable plugin');
  if (publish.length !== 1 || publish[0].conclusion !== 'failure' || upload.length !== 1 || !publish[0].steps.includes(upload[0]) || upload[0].conclusion !== 'skipped') throw new Error('Plugin no-write proof requires the unique immutable publication step to be explicitly skipped.');
  const value = { schemaVersion: pluginNoWriteProofSchema, version: options.version,
    run: { id: run.id, repository: { full_name: run.repository.full_name }, path: run.path, event: run.event, head_branch: run.head_branch,
      head_sha: run.head_sha, display_title: run.display_title, run_attempt: run.run_attempt, status: run.status, conclusion: run.conclusion }, jobs: projected };
  return { ...value, identity: releaseContextIdentity(value) };
}

export function validatePluginNoWriteProof(proof: any, expected: { runId?: number; version?: string; sourceCommit?: string } = {}): any {
  const options = { runId: expected.runId ?? proof?.run?.id, version: expected.version ?? proof?.version, sourceCommit: expected.sourceCommit ?? proof?.run?.head_sha };
  const recreated = createPluginNoWriteProof(proof?.run, proof?.jobs, options);
  if (proof?.schemaVersion !== pluginNoWriteProofSchema || !isDeepStrictEqual(proof, recreated)) throw new Error('Plugin no-write proof identity changed.');
  return recreated;
}

/** Positive official jobs evidence, not a fabricated publication journal. Any missing or executed upload refuses. */
export function readHostedPluginNoWriteProof(options: { repo: string; runId: number; version: string; sourceCommit: string; ghCommand?: string }, dependencies: any = {}): any {
  const { gh } = tools(options, dependencies);
  const run = JSON.parse(gh(['api', `repos/${repository}/actions/runs/${options.runId}`]));
  validatePluginHostedRun(run, { operation: 'publish', ...options });
  const response = JSON.parse(gh(['api', `repos/${repository}/actions/runs/${options.runId}/attempts/1/jobs?per_page=100`]));
  if (!Array.isArray(response.jobs) || !Number.isSafeInteger(response.total_count) || response.total_count !== response.jobs.length) throw new Error('Plugin no-write jobs history is incomplete.');
  return createPluginNoWriteProof(run, response.jobs, options);
}

function locateRun(gh: any, options: any, operation: string): any {
  const runs = JSON.parse(gh(['run', 'list', '--repo', repository, '--workflow', workflow, '--event', 'workflow_dispatch', '--branch', 'main', '--limit', '100', '--json', 'databaseId,displayTitle,headSha,status,conclusion']));
  if (!Array.isArray(runs)) throw new Error('Plugin workflow history is unknown.');
  const matches = runs.filter(run => run.displayTitle === `DSH ${operation} ${options.version}` && run.headSha === options.sourceCommit);
  // A recovery request is newer than its recorded predecessor. Never silently
  // select among ambiguous unrelated/manual requests after a lost response.
  const current = matches.filter(run => !options.pointer?.previousRunIds?.includes(run.databaseId));
  if (current.length > 1) throw new Error('Plugin workflow request is ambiguous; retain its original pointers.');
  return current[0] ?? null;
}

/** Replace only an observed failed prepare request; publication remains a separate owner. */
export function reconcilePluginPreparationPointer(options: any, dependencies: any = {}): any {
  const pointer = options.pointer;
  const changed = pointer && ((pointer.sourceCommit !== undefined && pointer.sourceCommit !== options.sourceCommit)
    || (pointer.version !== undefined && pointer.version !== options.version)
    || (pointer.sourceCandidate && (pointer.sourceCandidate.runId !== options.sourceCandidateRunId
      || pointer.sourceCandidate.commit !== options.candidateSourceCommit || pointer.sourceCandidate.selectionIdentity !== options.selectionIdentity)));
  if (!changed) return { pointer, effects: [] };
  if (options.allowReplacement !== true) throw new Error('Plugin preparation replacement requires no publication authorization or request.');
  if (options.operation !== 'prepare' || pointer.requested !== true || pointer.version !== options.version
    || !sourceHash.test(pointer.sourceCommit ?? '') || !Number.isSafeInteger(pointer.sourceCandidate?.runId) || pointer.sourceCandidate.runId < 1
    || !sourceHash.test(pointer.sourceCandidate?.commit ?? '') || !/^(?:sha256-)?[a-f0-9]{64}$/u.test(pointer.sourceCandidate?.selectionIdentity ?? '')) {
    throw new Error('Original plugin preparation identity is incomplete or differs from the selected version.');
  }
  const peer = parseCompatibilityArtifact(options.peer);
  if (!sourceHash.test(options.sourceCommit ?? '') || !Number.isSafeInteger(options.sourceCandidateRunId) || options.sourceCandidateRunId < 1
    || !sourceHash.test(options.candidateSourceCommit ?? '') || !/^(?:sha256-)?[a-f0-9]{64}$/u.test(options.selectionIdentity ?? '')
    || peer.packageName !== '@buildr-ai/buildr' || (peer.origin === 'candidate' && (!Number.isSafeInteger(options.buildrCandidateRunId) || options.buildrCandidateRunId < 1))) {
    throw new Error('New plugin preparation requires its exact selected source and peer.');
  }
  const { gh } = tools(options, dependencies);
  const found = pointer.runId == null ? locateRun(gh, { ...options, version: pointer.version, sourceCommit: pointer.sourceCommit }, 'prepare') : { databaseId: pointer.runId };
  if (!found || !Number.isSafeInteger(found.databaseId) || found.databaseId < 1) throw new Error('Original plugin preparation request is still unconfirmed.');
  const run = JSON.parse(gh(['api', `repos/${repository}/actions/runs/${found.databaseId}`]));
  validatePluginHostedRun(run, { operation: 'prepare', version: pointer.version, sourceCommit: pointer.sourceCommit, runId: found.databaseId });
  if (run.status !== 'completed' || run.conclusion !== 'failure') throw new Error('Original plugin preparation is not an observed terminal failure.');
  return {
    pointer: {},
    previousPointer: { ...structuredClone(pointer), runId: run.id },
    failure: { runId: run.id, runAttempt: run.run_attempt, repository: run.repository.full_name, workflow: run.path,
      sourceCommit: run.head_sha, status: run.status, conclusion: run.conclusion },
    effects: [{ type: 'plugin-failed-preparation-replaced', previousRunId: run.id, previousSourceCommit: pointer.sourceCommit, sourceCommit: options.sourceCommit }],
  };
}

export function readHostedPluginCandidate(options: any, dependencies: any = {}): any {
  if (dependencies.readCandidate) return dependencies.readCandidate(options);
  const { gh, git } = tools(options, dependencies);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-hosted-plugin-candidate-'));
  try {
    gh(['run', 'download', String(options.runId), '--repo', repository, '--name', `plugin-candidate-v${options.version}`, '--dir', path.join(root, 'candidate')], 120_000);
    const committed = (file: string) => Buffer.from(git(['show', `${options.sourceCommit}:${PLUGIN_SERVICE_PATH}/${file}`, '--']));
    const sourceSdk = sourceSdkIdentityFromFiles(committed(SOURCE_SDK_MANIFEST), committed('sdk-patches/dsh-v0.2.0-rc.2-event-sources-settings.patch'));
    gh(['run', 'download', String(options.runId), '--repo', repository, '--name', 'plugin-candidate-aggregate', '--dir', path.join(root, 'verification')], 60_000);
    const adoptionFile = singleFile(path.join(root, 'verification'), PLUGIN_CANDIDATE_ADOPTION_FILE, true);
    const adoption = adoptionFile ? JSON.parse(fs.readFileSync(adoptionFile, 'utf8')) : null;
    const candidateSourceCommit = adoption?.source?.commit ?? options.sourceCommit;
    const owned = readReleaseCandidate(singleFile(path.join(root, 'candidate'), 'candidate.json'), { version: options.version, sourceCommit: candidateSourceCommit, sourceTree: options.sourceTree, sourceSdk });
    if (adoption) {
      assertPluginCandidateAdoption(adoption, owned.manifest, { commit: options.sourceCommit, tree: git(['rev-parse', `${options.sourceCommit}^{tree}`]).trim(),
        parents: git(['rev-list', '--parents', '-n', '1', options.sourceCommit]).trim().split(/\s/u).slice(1), serviceTree: options.sourceTree });
      if (git(['rev-parse', `${candidateSourceCommit}^{tree}`]).trim() !== adoption.source.tree
        || options.selectionIdentity && adoption.source.selectionIdentity !== options.selectionIdentity
        || options.candidateSourceCommit && candidateSourceCommit !== options.candidateSourceCommit
        || options.sourceCandidateRunId && adoption.source.runId !== options.sourceCandidateRunId) throw new Error('Plugin source adoption differs from the frozen selection.');
    }
    const tarballBytes = fs.readFileSync(owned.tarball);
    const artifact = artifactFromTarball(tarballBytes, { origin: 'candidate', packageName: '@buildr-ai/buildr-dsh-plugin', version: options.version,
      integrity: owned.manifest.integrity, sourceCommit: candidateSourceCommit });
    const verification = JSON.parse(fs.readFileSync(singleFile(path.join(root, 'verification'), 'plugin-full-verification.json'), 'utf8'));
    assertBoundPluginVerification({ sourceCommit: candidateSourceCommit, serviceTree: owned.manifest.sourceTree,
      expectedPeer: options.peer, peerSourceCommit: options.peer?.sourceCommit ?? verification.peer?.sourceCommit,
      selection: { packages: verification.peer?.origin === 'candidate' ? ['buildr'] : [] } }, owned.manifest, verification);
    return { artifact, candidate: owned.manifest, tarballBytes, verification, ...(adoption ? { adoption } : {}) };
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

/** Source admission is separate from the main-only public Candidate. */
export function readPluginSourceCandidate(options: any, dependencies: any = {}): any {
  if (dependencies.readSourceCandidate) return dependencies.readSourceCandidate(options);
  const { gh, git } = tools(options, dependencies), plan = options.plan;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-plugin-source-candidate-'));
  try {
    gh(['run', 'download', String(options.runId), '--repo', repository, '--name', `plugin-candidate-v${plan.pluginVersion}`, '--dir', path.join(root, 'candidate')], 120_000);
    gh(['run', 'download', String(options.runId), '--repo', repository, '--name', 'plugin-candidate-aggregate', '--dir', path.join(root, 'aggregate')], 60_000);
    const committed = (file: string) => Buffer.from(git(['show', `${plan.sourceCommit}:${PLUGIN_SERVICE_PATH}/${file}`, '--']));
    const sourceSdk = sourceSdkIdentityFromFiles(committed(SOURCE_SDK_MANIFEST), committed('sdk-patches/dsh-v0.2.0-rc.2-event-sources-settings.patch'));
    const owned = readReleaseCandidate(singleFile(path.join(root, 'candidate'), 'candidate.json'), { version: plan.pluginVersion, sourceCommit: plan.sourceCommit, sourceTree: plan.serviceTree, sourceSdk });
    const filename = singleFile(path.join(root, 'aggregate'), 'plugin-candidate-ci-aggregate.json');
    if (fs.statSync(filename).size > 4 * 1024 * 1024) throw new Error('Plugin source aggregate exceeds its byte budget.');
    const aggregate = JSON.parse(fs.readFileSync(filename, 'utf8'));
    if (aggregate.candidate.integrity !== owned.manifest.integrity || aggregate.candidate.sha256 !== owned.manifest.sha256) throw new Error('Plugin source aggregate differs from original Candidate archive.');
    return { aggregate, candidate: owned.manifest };
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

export function readHostedPluginJournal(options: any, dependencies: any = {}): any {
  if (dependencies.readJournal) return dependencies.readJournal(options);
  const { gh } = tools(options, dependencies);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-hosted-plugin-publication-'));
  try {
    gh(['run', 'download', String(options.runId), '--repo', repository, '--name', `plugin-publication-v${options.version}`, '--dir', root], 60_000);
    const filename = singleFile(root, 'publication.json');
    if (fs.statSync(filename).size > 1024 * 1024) throw new Error('Plugin publication journal exceeds its byte budget.');
    return JSON.parse(fs.readFileSync(filename, 'utf8'));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

/** Persist intent before the request; a lost response never permits a second request. */
export function runPluginHostedOperation(options: any, dependencies: any = {}): any {
  if (!['prepare', 'publish'].includes(options.operation) || !sourceHash.test(options.sourceCommit ?? '') || !/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/u.test(options.version ?? '')) throw new Error('Plugin hosted operation inputs are invalid.');
  const { gh } = tools(options, dependencies);
  const pointer = options.pointer;
  if (!pointer || typeof pointer !== 'object') throw new Error('Plugin operation requires its existing orchestration pointer.');
  if ((pointer.sourceCommit !== undefined && pointer.sourceCommit !== options.sourceCommit) || (pointer.version !== undefined && pointer.version !== options.version)
      || ((pointer.requested || pointer.runId) && (!pointer.sourceCommit || !pointer.version))) throw new Error('Plugin operation pointer identity changed or is incomplete.');
  if (options.operation === 'prepare' && pointer.sourceCandidate && (pointer.sourceCandidate.runId !== options.sourceCandidateRunId
    || pointer.sourceCandidate.commit !== options.candidateSourceCommit || pointer.sourceCandidate.selectionIdentity !== options.selectionIdentity)) throw new Error('Plugin source Candidate request identity changed.');
  if (options.operation === 'publish' && (!options.authorized || !Number.isSafeInteger(options.candidateRunId) || options.candidateRunId < 1)) return { status: 'authorization-required', effects: [] };
  if (options.operation === 'prepare') {
    const peer = parseCompatibilityArtifact(options.peer);
    if (peer.packageName !== '@buildr-ai/buildr' || (peer.origin === 'candidate' && (!Number.isSafeInteger(options.buildrCandidateRunId) || options.buildrCandidateRunId < 1))) throw new Error('Plugin preparation requires its exact peer and original Candidate run.');
    if (!pointer.requested && !pointer.runId && (!Number.isSafeInteger(options.sourceCandidateRunId) || options.sourceCandidateRunId < 1
      || !sourceHash.test(options.candidateSourceCommit ?? '') || !/^(?:sha256-)?[a-f0-9]{64}$/u.test(options.selectionIdentity ?? ''))) throw new Error('Plugin adoption requires the original verified source Candidate.');
  }
  const effects: any[] = [];
  let found: any;
  try { found = pointer.runId ? { databaseId: pointer.runId } : locateRun(gh, options, options.operation); }
  catch (error: any) {
    if (!error.diagnostic) throw error;
    return { status: 'readback-required', effects, diagnostic: error.diagnostic, dispatch: pointer.dispatch ?? null,
      nextActions: ['修复原请求的运行查询；保留已有候选及请求身份，不重新验证或派发。'] };
  }
  if (!found && pointer.requested && pointer.dispatch?.state === 'rejected') {
    pointer.requested = false;
    dependencies.onPointer?.(pointer);
  }
  if (!found && !pointer.requested) {
    Object.assign(pointer, { requested: true, version: options.version, sourceCommit: options.sourceCommit, runId: null });
    if (options.operation === 'prepare') pointer.sourceCandidate = { runId: options.sourceCandidateRunId, commit: options.candidateSourceCommit, selectionIdentity: options.selectionIdentity };
    dependencies.onPointer?.(pointer);
    const effect = { type: `plugin-${options.operation}-dispatched`, sourceCommit: options.sourceCommit, version: options.version, state: 'unknown' };
    effects.push(effect);
    const fields = options.operation === 'prepare'
      ? [`buildr_peer_origin=${options.peer.origin}`, `buildr_peer_version=${options.peer.version}`, `buildr_peer_integrity=${options.peer.integrity}`,
        `source_candidate_run_id=${options.sourceCandidateRunId}`, `source_commit=${options.candidateSourceCommit}`, `selection_identity=${options.selectionIdentity}`,
        ...(options.peer.origin === 'candidate' ? [`buildr_candidate_run_id=${options.buildrCandidateRunId}`] : [])]
      : [`candidate_run_id=${options.candidateRunId}`, ...(options.originalSourceCommit && options.originalSourceCommit !== options.sourceCommit ? [`publication_source_commit=${options.originalSourceCommit}`] : []), ...(pointer.recoveryRunId ? [`recovery_run_id=${pointer.recoveryRunId}`] : [])];
    try {
      gh(['workflow', 'run', workflow, '--repo', repository, '--ref', 'main', '-f', `operation=${options.operation}`, '-f', `version=${options.version}`, ...fields.flatMap(field => ['-f', field])]);
      effect.state = 'confirmed';
      pointer.dispatch = { state: 'accepted', diagnostic: null };
    } catch (error: any) {
      const diagnostic = error.diagnostic ?? { code: 'plugin-dispatch-unknown', message: String(error.message).slice(-8192) };
      pointer.dispatch = { state: releaseDispatchRejected(diagnostic) ? 'rejected' : 'unknown', diagnostic };
      if (pointer.dispatch.state === 'rejected') effect.state = 'not-applied';
    }
    pointer.dispatchHistory = [...(pointer.dispatchHistory ?? []), { ...pointer.dispatch, observedAt: new Date().toISOString() }];
    dependencies.onPointer?.(pointer);
    try { found = locateRun(gh, options, options.operation); }
    catch (error: any) {
      return { status: 'readback-required', effects, diagnostic: error.diagnostic ?? { code: 'plugin-readback-unknown', message: String(error.message).slice(-8192) },
        dispatch: pointer.dispatch, nextActions: ['回读原请求；查询尚未完成，不重新派发。'] };
    }
    if (!found && pointer.dispatch.state === 'rejected') {
      // Persist the rejected attempt before allowing a later explicit resume.
      pointer.requested = false;
      dependencies.onPointer?.(pointer);
      return { status: 'dispatch-rejected', effects, diagnostic: pointer.dispatch.diagnostic,
        nextActions: ['修复明确拒绝的请求条件后继续同一操作；复用候选与原包。'] };
    }
  }
  if (!found) return { status: 'dispatch-unconfirmed', effects, diagnostic: pointer.dispatch?.diagnostic ?? null, nextActions: ['回读同一插件运行请求；响应未知时不再次派发。'] };
  Object.assign(pointer, { requested: true, version: options.version, sourceCommit: options.sourceCommit, runId: Number(found.databaseId) });
  dependencies.onPointer?.(pointer);
  const run = JSON.parse(gh(['api', `repos/${repository}/actions/runs/${pointer.runId}`]));
  validatePluginHostedRun(run, { operation: options.operation, version: options.version, sourceCommit: options.sourceCommit, runId: pointer.runId });
  if (run.status !== 'completed') return { status: 'running', run, effects, nextActions: ['等待同一插件运行终态，再继续原操作。'] };
  if (options.operation === 'prepare') {
    if (run.conclusion !== 'success') return { status: 'blocked', run, effects, nextActions: ['诊断原插件准备运行；不派发公开发布。'] };
    const candidate = readHostedPluginCandidate({ ...options, runId: run.id }, dependencies);
    return { status: 'passed', run, effects, ...candidate };
  }
  let journal: any;
  try { journal = readHostedPluginJournal({ ...options, runId: run.id }, dependencies); }
  catch (error: any) { return { status: 'readback-required', run, effects, diagnostic: error.diagnostic ?? { code: 'plugin-journal-unavailable', message: String(error.message).slice(-8192) }, nextActions: ['原运行日志未知；保留请求，不重新发布。'] }; }
  return { status: run.conclusion === 'success' && journal.status === 'passed' ? 'passed' : 'blocked', run, journal, effects,
    nextActions: run.conclusion === 'success' && journal.status === 'passed' ? [] : ['核对原插件日志与准确公开字节，恢复尚未完成事项。'] };
}
