/** Validate manual inputs and remote run facts before consuming release artifacts. */
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { assertPluginSourceAggregate, releaseCandidateRequirements } from '../../buildr/tools/release/verify-pr-candidate.ts';
import { assertBoundVerification } from './full-verification.ts';
import { readReleaseCandidate, sourceSdkIdentityFromFiles, SOURCE_SDK_MANIFEST, PLUGIN_SERVICE_PATH, type ReleaseCandidate } from './release-candidate.ts';
import { assertPluginCandidateAdoption, createPluginCandidateAdoption, PLUGIN_CANDIDATE_ADOPTION_FILE, type PluginCandidateAdoption, type PluginCandidateMain } from './candidate-adoption.ts';

export const REPOSITORY = 'BuildrAI/Buildr';
export const WORKFLOW = '.github/workflows/publish-dsh-plugin.yml';
export const PUBLISH_STEP = 'Publish immutable plugin';
export const BUILDR_CANDIDATE_WORKFLOW = '.github/workflows/verify.yml';
export interface BuildrPeerInput { origin: 'registry' | 'candidate'; version: string; integrity: string; candidateRunId?: string }
export interface WorkflowInput { operation: 'prepare' | 'publish'; version: string; candidateRunId?: string; recoveryRunId?: string; buildrPeer?: BuildrPeerInput; sourceCandidateRunId?: string; sourceCommit?: string; selectionIdentity?: string }
export interface BuildrPeerCandidateSource { mainCommit: string; candidateCommit: string; mainParents: string[]; mainTree: string; candidateTree: string; workflowId: number }
type Run = { id: number; workflow_id: number; path: string; event: string; head_branch: string; head_sha: string; status: string; conclusion: string | null; display_title: string; run_attempt: number; run_number: number; repository: { full_name: string } };
type Job = { name: string; status: string; conclusion: string | null; steps?: Array<{ name: string; status: string; conclusion: string | null }> };
export type GithubRead = (path: string) => Promise<any>;
function fail(code: string): never { throw new Error(`plugin_workflow_invalid: ${code}`); }
function runId(value: string | undefined, required: boolean): string | undefined {
  if (!value && !required) return undefined;
  if (!/^[1-9]\d*$/.test(value ?? '') || !Number.isSafeInteger(Number(value))) fail('run-id');
  return value;
}
const exactVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
function buildrPeerInput(env: NodeJS.ProcessEnv, operation: WorkflowInput['operation']): BuildrPeerInput | undefined {
  const values = [env.PLUGIN_BUILDR_PEER_ORIGIN, env.PLUGIN_BUILDR_PEER_VERSION, env.PLUGIN_BUILDR_PEER_INTEGRITY, env.PLUGIN_BUILDR_CANDIDATE_RUN_ID];
  if (operation === 'publish') {
    if (values.some(Boolean)) fail('publish-cannot-replace-peer');
    return undefined;
  }
  const [origin, version, integrity, candidateValue] = values;
  if (origin !== 'registry' && origin !== 'candidate') fail('buildr-peer-origin');
  if (!exactVersion.test(version ?? '')) fail('buildr-peer-exact-version');
  if (!/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(integrity ?? '')) fail('buildr-peer-integrity');
  const hash = Buffer.from(integrity!.slice('sha512-'.length), 'base64');
  if (hash.length !== 64 || `sha512-${hash.toString('base64')}` !== integrity) fail('buildr-peer-integrity');
  const candidateRunId = runId(candidateValue, origin === 'candidate');
  if (origin === 'registry' && candidateRunId) fail('registry-peer-cannot-consume-candidate');
  if (candidateRunId === env.GITHUB_RUN_ID) fail('current-run-cannot-be-peer-source');
  return { origin, version: version!, integrity: integrity!, ...(candidateRunId ? { candidateRunId } : {}) };
}
export function validateWorkflowInput(env: NodeJS.ProcessEnv, source: { commit: string; version: string }): WorkflowInput {
  if (env.GITHUB_REPOSITORY !== REPOSITORY || env.GITHUB_SERVER_URL !== 'https://github.com' || env.GITHUB_EVENT_NAME !== 'workflow_dispatch' || env.GITHUB_REF !== 'refs/heads/main' || env.GITHUB_WORKFLOW_REF !== `${REPOSITORY}/${WORKFLOW}@refs/heads/main` || env.GITHUB_SHA !== source.commit || env.GITHUB_RUN_ATTEMPT !== '1') fail('manual-main-first-attempt-required');
  runId(env.GITHUB_RUN_ID, true);
  const operation = env.PLUGIN_OPERATION;
  if (operation !== 'prepare' && operation !== 'publish') fail('operation');
  const version = env.PLUGIN_VERSION ?? '';
  if (!exactVersion.test(version) || version !== source.version) fail('version-must-match-source');
  const candidateRunId = runId(env.PLUGIN_CANDIDATE_RUN_ID, operation === 'publish');
  const recoveryRunId = runId(env.PLUGIN_RECOVERY_RUN_ID, false);
  if (operation === 'prepare' && (candidateRunId || recoveryRunId)) fail('prepare-cannot-consume-publication');
  if (candidateRunId === env.GITHUB_RUN_ID || recoveryRunId === env.GITHUB_RUN_ID) fail('current-run-cannot-be-source');
  const buildrPeer = buildrPeerInput(env, operation);
  const sourceFields = [env.PLUGIN_SOURCE_CANDIDATE_RUN_ID, env.PLUGIN_SOURCE_COMMIT, env.PLUGIN_SELECTION_IDENTITY];
  if (operation === 'publish' && sourceFields.some(Boolean)) fail('publish-cannot-replace-source');
  if (operation === 'prepare') {
    const sourceCandidateRunId = runId(sourceFields[0], true);
    if (sourceCandidateRunId === env.GITHUB_RUN_ID || !/^[a-f0-9]{40}$/u.test(sourceFields[1] ?? '') || !/^(?:sha256-)?[a-f0-9]{64}$/u.test(sourceFields[2] ?? '')) fail('source-candidate-input');
    return { operation, version, candidateRunId, recoveryRunId, buildrPeer, sourceCandidateRunId, sourceCommit: sourceFields[1], selectionIdentity: sourceFields[2] };
  }
  return { operation, version, candidateRunId, recoveryRunId };
}
export function pluginCandidateMain(commit: string, git: (args: string[]) => string = args => execFileSync('git', args, { encoding: 'utf8' }).trim()): PluginCandidateMain {
  const parents = git(['rev-list', '--parents', '-n', '1', commit]).split(/\s/u);
  if (parents[0] !== commit) fail('plugin-main-identity');
  return { commit, parents: parents.slice(1), tree: git(['rev-parse', `${commit}^{tree}`]), serviceTree: git(['rev-parse', `${commit}:${PLUGIN_SERVICE_PATH}`]) };
}
export async function verifySourceCandidateAdoption(input: WorkflowInput, main: PluginCandidateMain,
  candidate: ReturnType<typeof readReleaseCandidate>, aggregate: any, api: GithubRead,
  git: (args: string[]) => string = args => execFileSync('git', args, { encoding: 'utf8' })): Promise<PluginCandidateAdoption> {
  if (input.operation !== 'prepare' || !input.sourceCandidateRunId || !input.sourceCommit || !input.selectionIdentity || !input.buildrPeer) fail('source-candidate-input');
  const sourceCommit = input.sourceCommit, sourceTree = git(['rev-parse', `${sourceCommit}^{tree}`]).trim();
  if (main.parents.length !== 2 || main.parents[1] !== sourceCommit || main.parents[0] !== aggregate?.selection?.main || main.tree !== sourceTree
    || candidate.manifest.sourceCommit !== sourceCommit || candidate.manifest.sourceTree !== main.serviceTree || candidate.manifest.version !== input.version
    || aggregate?.selection?.identity !== input.selectionIdentity || !aggregate.selection.packages.includes('dsh-plugin')) fail('plugin-source-protected-merge-mismatch');
  const workflow = await api(`/repos/${REPOSITORY}/actions/workflows/verify.yml`);
  const run: Run = await api(`/repos/${REPOSITORY}/actions/runs/${input.sourceCandidateRunId}`);
  if (workflow.path !== BUILDR_CANDIDATE_WORKFLOW || !Number.isSafeInteger(workflow.id) || run?.repository?.full_name !== REPOSITORY
    || run.path?.split('@')[0] !== BUILDR_CANDIDATE_WORKFLOW || run.workflow_id !== workflow.id || run.event !== 'workflow_dispatch'
    || String(run.id) !== input.sourceCandidateRunId || run.head_sha !== sourceCommit || run.status !== 'completed' || run.conclusion !== 'success'
    || !Number.isSafeInteger(run.run_attempt) || run.run_attempt < 1 || run.run_attempt > 100) fail('plugin-source-candidate-run-mismatch');
  const changedPaths = git(['diff', '--no-renames', '--name-only', '-z', main.parents[0]!, sourceCommit, '--']).split('\0').filter(Boolean).sort();
  const sourceFile = (name: string) => Buffer.from(git(['show', `${sourceCommit}:${PLUGIN_SERVICE_PATH}/${name}`, '--']));
  const sourceSdk = sourceSdkIdentityFromFiles(sourceFile(SOURCE_SDK_MANIFEST), sourceFile('sdk-patches/dsh-v0.2.0-rc.2-event-sources-settings.patch'));
  const workflowSha256 = createHash('sha256').update(git(['show', `${sourceCommit}:${BUILDR_CANDIDATE_WORKFLOW}`, '--'])).digest('hex');
  const peer = input.buildrPeer;
  const plan = { sourceCommit, sourceTree, serviceTree: main.serviceTree, pluginVersion: input.version, selection: aggregate.selection,
    requirements: releaseCandidateRequirements({ packages: aggregate.selection.packages, changedPaths }), changedPaths, workflowSha256, sourceSdk,
    ...(peer.origin === 'registry' ? { registryPeer: { version: peer.version, integrity: peer.integrity } } : {}) };
  assertPluginSourceAggregate(aggregate, plan, run.id, run.run_attempt);
  if (aggregate.verification.peer.origin !== peer.origin || aggregate.verification.peer.version !== peer.version || aggregate.verification.peer.integrity !== peer.integrity
    || !isDeepStrictEqual(aggregate.candidate, { artifactName: `plugin-candidate-v${input.version}`, ...candidate.manifest })) fail('plugin-source-candidate-artifact-mismatch');
  assertBoundVerification(aggregate.verification, candidate);
  return createPluginCandidateAdoption({ source: { runId: run.id, runAttempt: aggregate.workflow.runAttempt, commit: sourceCommit,
    tree: sourceTree, serviceTree: main.serviceTree, selectionIdentity: input.selectionIdentity, workflowSha256 }, main, candidate: candidate.manifest });
}
/** A pre-main Buildr candidate is consumed only through its exact protected merge. */
export function validateBuildrPeerCandidateRun(run: Run, input: BuildrPeerInput, source: BuildrPeerCandidateSource): void {
  if (input.origin !== 'candidate' || !input.candidateRunId) fail('buildr-candidate-peer-required');
  if (!run || run.repository?.full_name !== REPOSITORY || run.path !== BUILDR_CANDIDATE_WORKFLOW || run.event !== 'workflow_dispatch'
    || String(run.id) !== input.candidateRunId || run.workflow_id !== source.workflowId || !Number.isSafeInteger(run.run_attempt) || run.run_attempt < 1
    || run.status !== 'completed' || run.conclusion !== 'success' || run.head_sha !== source.candidateCommit) fail('buildr-peer-candidate-run-mismatch');
  if (![source.mainCommit, source.candidateCommit, source.mainTree, source.candidateTree].every(value => /^[a-f0-9]{40,64}$/.test(value))) fail('buildr-peer-source-identity');
  // The existing protected PR merge preserves the frozen selection as its second parent.
  if (source.mainParents.length !== 2 || source.mainParents[1] !== source.candidateCommit || source.mainTree !== source.candidateTree) fail('buildr-peer-protected-merge-mismatch');
}
export async function verifyBuildrPeerCandidate(input: WorkflowInput, mainCommit: string, manifest: Record<string, any>, api: GithubRead): Promise<void> {
  const peer = input.buildrPeer;
  if (input.operation !== 'prepare' || peer?.origin !== 'candidate' || !peer.candidateRunId) fail('buildr-candidate-peer-required');
  if (manifest.schemaVersion !== 'buildr.release-artifact/v1' || manifest.packageName !== '@buildr-ai/buildr' || manifest.version !== peer.version
    || manifest.integrity !== peer.integrity || !/^[a-f0-9]{40,64}$/.test(manifest.sourceCommit ?? '')) fail('buildr-peer-candidate-artifact-mismatch');
  const base = `/repos/${REPOSITORY}/actions`;
  const workflow = await api(`${base}/workflows/verify.yml`);
  if (workflow.path !== BUILDR_CANDIDATE_WORKFLOW || !Number.isSafeInteger(workflow.id)) fail('buildr-candidate-workflow-unavailable');
  const run: Run = await api(`${base}/runs/${peer.candidateRunId}`);
  const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' }).trim();
  const parents = git('rev-list', '--parents', '-n', '1', mainCommit).split(' ');
  if (parents[0] !== mainCommit) fail('buildr-peer-source-identity');
  validateBuildrPeerCandidateRun(run, peer, { mainCommit, candidateCommit: manifest.sourceCommit, mainParents: parents.slice(1),
    mainTree: git('rev-parse', `${mainCommit}^{tree}`), candidateTree: git('rev-parse', `${manifest.sourceCommit}^{tree}`), workflowId: workflow.id });
}
function ownRun(run: Run): void {
  if (!run || run.repository?.full_name !== REPOSITORY || run.path !== WORKFLOW || run.event !== 'workflow_dispatch' || !Number.isSafeInteger(run.id) || !Number.isSafeInteger(run.workflow_id) || !Number.isSafeInteger(run.run_number) || !Number.isSafeInteger(run.run_attempt) || run.run_attempt < 1 || run.run_attempt > 100) fail('remote-workflow-identity');
}
export function validateCandidateRun(run: Run, candidateRunId: string, sourceCommit: string, version: string, workflowId: number): void {
  ownRun(run);
  if (String(run.id) !== candidateRunId || run.workflow_id !== workflowId || run.head_sha !== sourceCommit || run.head_branch !== 'main' || run.status !== 'completed' || run.conclusion !== 'success' || run.display_title !== `DSH prepare ${version}` || run.run_attempt !== 1) fail('candidate-run-mismatch');
}
/** Missing/cancelled steps cannot prove a request was never sent. */
export function publicationMayHaveStarted(jobs: Job[]): boolean {
  const job = jobs.filter(value => value.name === 'publish');
  if (job.length !== 1 || job[0]!.status !== 'completed') return true;
  const steps = job[0]!.steps?.filter(value => value.name === PUBLISH_STEP);
  return steps?.length !== 1 || steps[0]!.status !== 'completed' || steps[0]!.conclusion !== 'skipped';
}
async function pages(api: GithubRead, path: string, key: string): Promise<any[]> {
  const values: any[] = [];
  for (let page = 1; page <= 10; page++) {
    const result = await api(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
    if (!Array.isArray(result?.[key]) || !Number.isSafeInteger(result.total_count) || result.total_count > 1000) fail('history-incomplete');
    values.push(...result[key]);
    if (values.length >= result.total_count) return values;
    if (result[key].length === 0) fail('history-incomplete');
  }
  fail('history-incomplete');
}
export async function verifyPublishRuns(input: WorkflowInput, sourceCommit: string, currentRunId: string, api: GithubRead): Promise<{ candidateRunId: string; recoveryRunId?: string }> {
  if (input.operation !== 'publish' || !input.candidateRunId) fail('publish-input-required');
  const base = `/repos/${REPOSITORY}/actions`;
  const workflow = await api(`${base}/workflows/publish-dsh-plugin.yml`);
  if (workflow.path !== WORKFLOW || !Number.isSafeInteger(workflow.id)) fail('workflow-unavailable');
  const current: Run = await api(`${base}/runs/${currentRunId}`);
  ownRun(current);
  if (current.workflow_id !== workflow.id || current.display_title !== `DSH publish ${input.version}` || current.head_sha !== sourceCommit || current.head_branch !== 'main' || current.run_attempt !== 1) fail('current-run-mismatch');
  const candidate: Run = await api(`${base}/runs/${input.candidateRunId}`);
  validateCandidateRun(candidate, input.candidateRunId, sourceCommit, input.version, workflow.id);
  const history = await pages(api, `${base}/workflows/publish-dsh-plugin.yml/runs`, 'workflow_runs');
  const uncertain: Run[] = [];
  for (const run of history as Run[]) {
    ownRun(run);
    if (run.workflow_id !== workflow.id) fail('history-workflow-mismatch');
    if (run.id === current.id || run.display_title !== `DSH publish ${input.version}`) continue;
    if (run.status !== 'completed') fail('previous-publication-still-active');
    let mayHaveStarted = false;
    for (let attempt = 1; attempt <= run.run_attempt; attempt++) {
      const jobs = await pages(api, `${base}/runs/${run.id}/attempts/${attempt}/jobs`, 'jobs');
      if (publicationMayHaveStarted(jobs)) mayHaveStarted = true;
    }
    if (mayHaveStarted) uncertain.push(run);
  }
  uncertain.sort((a, b) => b.run_number - a.run_number);
  const latest = uncertain[0];
  if (latest && String(latest.id) !== input.recoveryRunId) fail('previous-publication-evidence-required');
  if (!latest && input.recoveryRunId) fail('recovery-run-has-no-publication');
  if (latest && (latest.run_attempt !== 1 || latest.head_sha !== sourceCommit || latest.head_branch !== 'main')) fail('recovery-source-or-attempt-mismatch');
  return { candidateRunId: input.candidateRunId, ...(latest ? { recoveryRunId: String(latest.id) } : {}) };
}
export function githubReader(token: string, fetchImpl: typeof fetch = fetch): GithubRead {
  if (!token) fail('github-read-access-required');
  return async path => {
    if (!path.startsWith(`/repos/${REPOSITORY}/actions/`) || path.includes('..')) fail('github-read-path');
    const response = await fetchImpl(`https://api.github.com${path}`, { headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, signal: AbortSignal.timeout(15_000) });
    if (!response.ok) fail('github-read-failed');
    const body = await response.text();
    if (Buffer.byteLength(body) > 8 * 1024 * 1024) fail('github-response-too-large');
    return JSON.parse(body);
  };
}
if (import.meta.main) {
  try {
    const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
    const input = validateWorkflowInput(process.env, { commit, version });
    if (process.argv[2] === 'publish-check') await verifyPublishRuns(input, commit, process.env.GITHUB_RUN_ID!, githubReader(process.env.GH_TOKEN ?? ''));
    else if (process.argv[2] === 'adopt-candidate') {
      const args = process.argv.slice(3), values = new Map<string, string>();
      for (let index = 0; index < args.length; index += 2) {
        if (!['--candidate', '--aggregate', '--output'].includes(args[index]!) || values.has(args[index]!) || !args[index + 1] || args[index + 1]!.startsWith('--')) fail('adoption-arguments');
        values.set(args[index]!, args[index + 1]!);
      }
      if (values.size !== 3) fail('adoption-arguments');
      const main = pluginCandidateMain(commit);
      const candidate = readReleaseCandidate(values.get('--candidate')!, { version: input.version, sourceCommit: input.sourceCommit, sourceTree: main.serviceTree });
      const aggregate = JSON.parse(readFileSync(values.get('--aggregate')!, 'utf8'));
      const adoption = await verifySourceCandidateAdoption(input, main, candidate, aggregate, githubReader(process.env.GH_TOKEN ?? ''), args => execFileSync('git', args, { encoding: 'utf8' }));
      writeFileSync(values.get('--output')!, `${JSON.stringify(adoption, null, 2)}\n`);
      writeFileSync(join(dirname(values.get('--output')!), 'plugin-full-verification.json'), `${JSON.stringify(aggregate.verification, null, 2)}\n`);
    }
    else if (process.argv[2] === 'peer-check') {
      if (process.argv.length !== 5 || process.argv[3] !== '--manifest' || !process.argv[4]) fail('peer-manifest-required');
      await verifyBuildrPeerCandidate(input, commit, JSON.parse(readFileSync(process.argv[4], 'utf8')), githubReader(process.env.GH_TOKEN ?? ''));
    }
    else if (process.argv[2] !== 'input-check') fail('command');
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `version=${input.version}\n`);
    console.log(JSON.stringify({ status: 'validated', ...input }));
  } catch { console.error('Plugin workflow refused: check manual main inputs, source identity and complete previous publication evidence.'); process.exitCode = 1; }
}
