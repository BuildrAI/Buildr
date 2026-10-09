/** Thin GitHub adapter. Plugin candidate bytes and publication journals remain owned by DSH tools. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { readReleaseCandidate, sourceSdkIdentityFromFiles, SOURCE_SDK_MANIFEST, PLUGIN_SERVICE_PATH } from '../../../dsh-plugin/tools/release-candidate.ts';
import { artifactFromTarball } from './package-artifact-observation.ts';
import { assertBoundPluginVerification } from './verify-pr-candidate.ts';
import { parseCompatibilityArtifact } from './package-compatibility.ts';

const repository = 'BuildrAI/Buildr';
const workflow = 'publish-dsh-plugin.yml';
const workflowPath = `.github/workflows/${workflow}`;
const sourceHash = /^[a-f0-9]{40}$/u;
const defaultExecute = (command: string, args: string[], options: any) => spawnSync(command, args, { ...options, encoding: 'utf8', timeout: options.timeout ?? 30_000 });

function singleFile(root: string, filename: string): string {
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
  if (matches.length !== 1) throw new Error(`Plugin artifact requires one ${filename}.`);
  return matches[0]!;
}

function tools(options: any, dependencies: any): any {
  const execute = dependencies.execute ?? defaultExecute;
  const call = (command: string, args: string[], timeout = 30_000) => {
    const result = execute(command, args, { cwd: options.repo, timeout, maxBuffer: 8 * 1024 * 1024 });
    if (result.status !== 0) throw new Error(`${command} ${args[0]} failed during plugin workflow readback.`);
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

export function readHostedPluginCandidate(options: any, dependencies: any = {}): any {
  if (dependencies.readCandidate) return dependencies.readCandidate(options);
  const { gh, git } = tools(options, dependencies);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-hosted-plugin-candidate-'));
  try {
    gh(['run', 'download', String(options.runId), '--repo', repository, '--name', `plugin-candidate-v${options.version}`, '--dir', path.join(root, 'candidate')], 120_000);
    const committed = (file: string) => Buffer.from(git(['show', `${options.sourceCommit}:${PLUGIN_SERVICE_PATH}/${file}`, '--']));
    const sourceSdk = sourceSdkIdentityFromFiles(committed(SOURCE_SDK_MANIFEST), committed('sdk-patches/dsh-v0.2.0-rc.2-event-sources-settings.patch'));
    const owned = readReleaseCandidate(singleFile(path.join(root, 'candidate'), 'candidate.json'), { version: options.version, sourceCommit: options.sourceCommit, sourceTree: options.sourceTree, sourceSdk });
    const tarballBytes = fs.readFileSync(owned.tarball);
    const artifact = artifactFromTarball(tarballBytes, { origin: 'candidate', packageName: '@buildr-ai/buildr-dsh-plugin', version: options.version,
      integrity: owned.manifest.integrity, sourceCommit: options.sourceCommit });
    gh(['run', 'download', String(options.runId), '--repo', repository, '--name', 'plugin-candidate-aggregate', '--dir', path.join(root, 'verification')], 60_000);
    const verification = JSON.parse(fs.readFileSync(singleFile(path.join(root, 'verification'), 'plugin-full-verification.json'), 'utf8'));
    assertBoundPluginVerification({ sourceCommit: options.sourceCommit, serviceTree: owned.manifest.sourceTree,
      expectedPeer: options.peer, peerSourceCommit: options.peer?.sourceCommit ?? verification.peer?.sourceCommit,
      selection: { packages: verification.peer?.origin === 'candidate' ? ['buildr'] : [] } }, owned.manifest, verification);
    return { artifact, candidate: owned.manifest, tarballBytes, verification };
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
  if (options.operation === 'publish' && (!options.authorized || !Number.isSafeInteger(options.candidateRunId) || options.candidateRunId < 1)) return { status: 'authorization-required', effects: [] };
  if (options.operation === 'prepare') {
    const peer = parseCompatibilityArtifact(options.peer);
    if (peer.packageName !== '@buildr-ai/buildr' || (peer.origin === 'candidate' && (!Number.isSafeInteger(options.buildrCandidateRunId) || options.buildrCandidateRunId < 1))) throw new Error('Plugin preparation requires its exact peer and original Candidate run.');
  }
  const effects: any[] = [];
  let found = pointer.runId ? { databaseId: pointer.runId } : locateRun(gh, options, options.operation);
  if (!found && !pointer.requested) {
    Object.assign(pointer, { requested: true, version: options.version, sourceCommit: options.sourceCommit, runId: null });
    dependencies.onPointer?.(pointer);
    const effect = { type: `plugin-${options.operation}-dispatched`, sourceCommit: options.sourceCommit, version: options.version, state: 'unknown' };
    effects.push(effect);
    const fields = options.operation === 'prepare'
      ? [`buildr_peer_origin=${options.peer.origin}`, `buildr_peer_version=${options.peer.version}`, `buildr_peer_integrity=${options.peer.integrity}`,
        ...(options.peer.origin === 'candidate' ? [`buildr_candidate_run_id=${options.buildrCandidateRunId}`] : [])]
      : [`candidate_run_id=${options.candidateRunId}`, ...(pointer.recoveryRunId ? [`recovery_run_id=${pointer.recoveryRunId}`] : [])];
    try { gh(['workflow', 'run', workflow, '--repo', repository, '--ref', 'main', '-f', `operation=${options.operation}`, '-f', `version=${options.version}`, ...fields.flatMap(field => ['-f', field])]); effect.state = 'confirmed'; }
    catch { /* Query only after an uncertain request. */ }
    found = locateRun(gh, options, options.operation);
  }
  if (!found) return { status: 'dispatch-unconfirmed', effects, nextActions: ['回读同一插件运行请求；响应未知时不再次派发。'] };
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
  catch { return { status: 'readback-required', run, effects, nextActions: ['原运行日志未知；保留请求，不重新发布。'] }; }
  return { status: run.conclusion === 'success' && journal.status === 'passed' ? 'passed' : 'blocked', run, journal, effects,
    nextActions: run.conclusion === 'success' && journal.status === 'passed' ? [] : ['核对原插件日志与准确公开字节，恢复尚未完成事项。'] };
}
