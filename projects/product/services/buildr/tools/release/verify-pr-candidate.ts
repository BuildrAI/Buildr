#!/usr/bin/env node
import fs from 'node:fs';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { parseReleaseCandidate, readReleaseCandidate, sourceSdkIdentityFromFiles, SOURCE_SDK_MANIFEST, PLUGIN_SERVICE_PATH } from '../../../dsh-plugin/tools/release-candidate.ts';
import { MAIN_PACKAGE, compatibilityVersion, parseCompatibilityArtifact } from './package-compatibility.ts';
import { normalizeReleaseTargets } from './release-targets.ts';
import { readArtifactInput } from '../../../dsh-plugin/tools/buildr-peer.ts';
import { assertBoundVerificationManifest } from '../../../dsh-plugin/tools/full-verification.ts';

function requireFact(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export const PLUGIN_SOURCE_AGGREGATE_SCHEMA = 'buildr.dsh-plugin-source-ci-aggregate/v1';
const workflowPath = '.github/workflows/verify.yml';
const sha = /^[0-9a-f]{40}$/u;
const digest = /^(?:sha256-)?[0-9a-f]{64}$/u;
type Selection = { id: string; packages: string[]; versions: Record<string, string>; baseline: string; main: string; identity: string };
type GitRead = (args: string[]) => string;

/** Publication targets cannot reduce the checks required by the complete main-to-source tree diff. */
export function releaseCandidateRequirements({ packages, changedPaths }: { packages: string[]; changedPaths: string[] }): { buildr: boolean; plugin: boolean } {
  requireFact(packages.length > 0 && packages.every(value => ['buildr', 'dsh-plugin'].includes(value)) && new Set(packages).size === packages.length, 'Unsupported release packages.');
  requireFact(changedPaths.every(value => typeof value === 'string' && !value.startsWith('/') && !value.split('/').includes('..') && !/[\u0000-\u001f\u007f\\]/u.test(value)), 'Invalid changed product path.');
  const buildrInput = (value: string): boolean => {
    if (value.startsWith('projects/product/services/buildr-web/')) return true;
    if (value.startsWith('projects/product/services/buildr/')) {
      const local = value.slice('projects/product/services/buildr/'.length);
      // These tools are outside the npm runtime. Their focused regression is
      // still required, but they do not independently require a new main pack.
      if (local.startsWith('tools/release/') && !['release-consumption.ts', 'application-payload.ts', 'application-payload-entry.ts', 'release-files.ts', 'release-artifact.ts', 'candidate-ci-contract.ts', 'release-contract.ts', 'release-notes.ts', 'release-authority.ts'].includes(path.posix.basename(local))) return false;
      if (local.startsWith('test/integration-candidate-release/') || /^test\/unit\/(?:release[^/]*|package-compatibility)\.test\.ts$/u.test(local) || /^test\/contract\/(?:release[^/]*|open-source-release|package-compatibility)\.test\.ts$/u.test(local) || local === 'test/helpers/package-compatibility-fixtures.ts') return false;
      return true;
    }
    return (value.startsWith('.github/') && value !== '.github/workflows/publish-dsh-plugin.yml') || ['projects/product/buildr', 'projects/product/.node-version', 'projects/product/preparation.yml', 'projects/product/verification.yml'].includes(value);
  };
  return {
    buildr: packages.includes('buildr') || changedPaths.some(buildrInput),
    plugin: packages.includes('dsh-plugin') || changedPaths.some(value => value.startsWith(`${PLUGIN_SERVICE_PATH}/`) || value === '.github/workflows/publish-dsh-plugin.yml'),
  };
}

function parseSelection(value: unknown): Selection {
  const input = value as Selection;
  requireFact(input && typeof input === 'object' && !Array.isArray(input) && Object.keys(input).sort().join(',') === 'baseline,id,identity,main,packages,versions', 'Release selection projection is invalid.');
  requireFact(Array.isArray(input.packages) && input.versions && typeof input.versions === 'object' && !Array.isArray(input.versions), 'Release selection targets are invalid.');
  const targets = normalizeReleaseTargets({ packages: input.packages as any, version: input.versions.buildr, pluginVersion: input.versions['dsh-plugin'], selectionId: input.id });
  requireFact(targets.selectionId === input.id && isDeepStrictEqual(targets.packages, input.packages) && isDeepStrictEqual(targets.versions, input.versions), 'Release selection projection differs from normalized targets.');
  requireFact(sha.test(input.baseline) && sha.test(input.main) && digest.test(input.identity), 'Release selection source identities are invalid.');
  return input;
}

export function createReleaseCandidatePlan(env: NodeJS.ProcessEnv, git: GitRead): any {
  if (!env.BUILDR_RELEASE_PACKAGES) return { schemaVersion: 'buildr.package-candidate-plan/v1', legacy: true, requirements: { buildr: true, plugin: false } };
  const packages = env.BUILDR_RELEASE_PACKAGES.split(',');
  const versions: Record<string, string> = {};
  for (const name of packages) versions[name] = name === 'buildr' ? env.BUILDR_SOURCE_BUILDR_VERSION ?? '' : env.BUILDR_PLUGIN_VERSION ?? '';
  const selection = parseSelection({ id: env.BUILDR_SELECTION_ID, packages, versions, baseline: env.BUILDR_SELECTION_BASELINE, main: env.BUILDR_SELECTION_MAIN, identity: env.BUILDR_SELECTION_IDENTITY });
  const sourceCommit = git(['rev-parse', 'HEAD']).trim();
  requireFact(sha.test(sourceCommit) && sourceCommit === (env.CANDIDATE_SOURCE_SHA ?? env.GITHUB_SHA), 'Candidate checkout differs from exact source.');
  requireFact(git(['rev-parse', 'refs/remotes/origin/main']).trim() === selection.main, 'Observed main differs from frozen selection main.');
  for (const name of packages) {
    const sourceVersion = JSON.parse(git(['show', `${sourceCommit}:projects/product/services/${name}/package.json`])).version;
    requireFact(sourceVersion === versions[name], `Selected ${name} version differs from source.`);
  }
  // Comparing only the picked commits would miss product changes already in
  // the selected dev baseline. Disable rename detection to retain both sides.
  const changedPaths = git(['diff', '--no-renames', '--name-only', '-z', selection.main, sourceCommit, '--']).split('\0').filter(Boolean).sort();
  const requirements = releaseCandidateRequirements({ packages, changedPaths });
  const sourceSdk = requirements.plugin ? sourceSdkIdentityFromFiles(Buffer.from(git(['show', `${sourceCommit}:${PLUGIN_SERVICE_PATH}/${SOURCE_SDK_MANIFEST}`])), Buffer.from(git(['show', `${sourceCommit}:${PLUGIN_SERVICE_PATH}/sdk-patches/dsh-v0.2.0-rc.2-event-sources-settings.patch`]))) : undefined;
  let registryPeer: { version: string; integrity: string } | undefined;
  if (requirements.plugin && !packages.includes('buildr')) {
    const peerVersion = compatibilityVersion(env.BUILDR_BUILDR_PEER_VERSION);
    requireFact(/^sha512-[A-Za-z0-9+/]{86}==$/u.test(env.BUILDR_BUILDR_PEER_INTEGRITY ?? ''), 'Exact published Buildr peer integrity is required.');
    registryPeer = { version: peerVersion, integrity: env.BUILDR_BUILDR_PEER_INTEGRITY! };
  }
  return { schemaVersion: 'buildr.package-candidate-plan/v1', legacy: false, selection, sourceCommit,
    sourceTree: git(['rev-parse', `${sourceCommit}^{tree}`]).trim(),
    serviceTree: git(['rev-parse', `${sourceCommit}:${PLUGIN_SERVICE_PATH}`]).trim(),
    pluginVersion: JSON.parse(git(['show', `${sourceCommit}:${PLUGIN_SERVICE_PATH}/package.json`])).version,
    workflowSha256: createHash('sha256').update(git(['show', `${sourceCommit}:${workflowPath}`])).digest('hex'),
    changedPaths, requirements, ...(sourceSdk ? { sourceSdk } : {}), ...(registryPeer ? { registryPeer } : {}) };
}

export function createPluginSourceAggregate(plan: any, candidate: any, full: any, workflow: any): any {
  candidate = parseReleaseCandidate(candidate);
  requireFact(plan?.legacy === false && plan.requirements?.plugin === true, 'Plugin source Candidate plan is missing.');
  requireFact(candidate.sourceCommit === plan.sourceCommit && candidate.sourceTree === plan.serviceTree && candidate.version === plan.pluginVersion, 'Plugin source Candidate differs from planned source.');
  assertBoundPluginVerification(plan, candidate, full);
  requireFact(/^[1-9]\d*$/u.test(String(workflow?.runId)) && Number.isSafeInteger(workflow?.runAttempt) && workflow.runAttempt >= 1 && workflow.runAttempt <= 100, 'Plugin source verification run identity is invalid.');
  return { schemaVersion: PLUGIN_SOURCE_AGGREGATE_SCHEMA, status: 'passed', purpose: 'source-admission', repository: 'BuildrAI/Buildr',
    sourceCommit: plan.sourceCommit, sourceTree: plan.sourceTree, serviceTree: plan.serviceTree,
    workflow: { path: workflowPath, sha256: plan.workflowSha256, runId: workflow.runId, runAttempt: workflow.runAttempt }, selection: plan.selection,
    changedPaths: plan.changedPaths, requirements: plan.requirements,
    candidate: { artifactName: `plugin-candidate-v${candidate.version}`, ...candidate },
    verification: full, checks: [{ id: 'plugin-full', status: 'passed' }, { id: 'plugin-candidate-bytes', status: 'passed' }] };
}

export function assertBoundPluginVerification(plan: any, candidate: any, full: any): void {
  try { assertBoundVerificationManifest(full, candidate); }
  catch (error: any) { throw new Error(`Full plugin verification is invalid: ${error.message}`); }
  requireFact(full.sourceCommit === plan.sourceCommit && full.sourceTree === plan.serviceTree, 'Full plugin verification differs from planned source.');
  const peer = parseCompatibilityArtifact(full.peer);
  requireFact(peer.packageName === '@buildr-ai/buildr' && peer.origin === (plan.selection.packages.includes('buildr') ? 'candidate' : 'registry') && (peer.origin !== 'candidate' || peer.sourceCommit === (plan.peerSourceCommit ?? plan.sourceCommit)), 'Full plugin verification used the wrong peer origin or source.');
  if (plan.expectedPeer) requireFact(isDeepStrictEqual(peer, parseCompatibilityArtifact(plan.expectedPeer)), 'Full plugin verification used a different frozen peer.');
  if (plan.selection.versions?.buildr) requireFact(peer.version === plan.selection.versions.buildr, 'Full plugin verification used a different selected Buildr version.');
  if (plan.registryPeer) requireFact(peer.version === plan.registryPeer.version && peer.integrity === plan.registryPeer.integrity, 'Full plugin verification used a different published peer.');
  requireFact(!plan.sourceSdk || isDeepStrictEqual(candidate.sourceSdk, plan.sourceSdk), 'Full plugin verification used different SDK inputs.');
}

export function assertPluginSourceAggregate(value: any, plan: any, runId: number, runAttempt = 1): void {
  requireFact(value?.schemaVersion === PLUGIN_SOURCE_AGGREGATE_SCHEMA && value.status === 'passed' && value.purpose === 'source-admission' && value.repository === 'BuildrAI/Buildr', 'Plugin source aggregate is invalid.');
  requireFact(value.sourceCommit === plan.sourceCommit && value.sourceTree === plan.sourceTree && value.serviceTree === plan.serviceTree && isDeepStrictEqual(value.selection, plan.selection) && isDeepStrictEqual(value.requirements, plan.requirements) && isDeepStrictEqual(value.changedPaths, plan.changedPaths), 'Plugin source aggregate differs from exact selection.');
  requireFact(value.workflow?.path === workflowPath && value.workflow.sha256 === plan.workflowSha256 && Number(value.workflow.runId) === runId && Number.isSafeInteger(value.workflow.runAttempt) && value.workflow.runAttempt >= 1 && value.workflow.runAttempt <= runAttempt && runAttempt <= 100, 'Plugin source aggregate recipe or run differs.');
  requireFact(value.verification?.status === 'passed' && ['plugin-full', 'plugin-candidate-bytes'].every(id => value.checks?.filter((check: any) => check.id === id && check.status === 'passed').length === 1), 'Plugin source aggregate checks did not pass.');
  requireFact(value.candidate?.sourceCommit === plan.sourceCommit && value.candidate.sourceTree === plan.serviceTree && value.candidate.version === plan.pluginVersion && value.candidate.artifactName === `plugin-candidate-v${value.candidate.version}`, 'Plugin source aggregate candidate differs.');
  parseReleaseCandidate(value.candidate);
  assertBoundPluginVerification(plan, value.candidate, value.verification);
}

export async function verifyReleasePullRequestCandidate(
  event: any,
  repository: string,
  requestJson: (endpoint: string) => Promise<any>,
  scoped?: { git: GitRead; loadAggregate: (runId: number) => Promise<any> },
): Promise<any> {
  const pullRequest = event?.pull_request;
  const branch = pullRequest?.head?.ref;
  const sourceCommit = pullRequest?.head?.sha;
  requireFact(pullRequest?.base?.ref === 'main' && /^codex\/release-main-.+-g\d+$/u.test(branch), 'Expected a release carrier pull request into main.');
  requireFact(/^[0-9a-f]{40}$/u.test(sourceCommit), 'Release pull request has no exact source commit.');
  const runIds = [...String(pullRequest.body ?? '').matchAll(/^Candidate run ID: ([1-9]\d*)$/gmu)].map(match => Number(match[1]));
  requireFact(runIds.length === 1 && Number.isSafeInteger(runIds[0]), 'Release pull request must identify one Candidate run.');
  const runId = runIds[0];
  const selectionLines = [...String(pullRequest.body ?? '').matchAll(/^Release selection: (.+)$/gmu)];
  let plan: any = null;
  if (selectionLines.length) {
    requireFact(selectionLines.length === 1 && scoped, 'Scoped release PR requires one selection and source inspection.');
    const selection = parseSelection(JSON.parse(selectionLines[0][1]));
    const peerLines = [...String(pullRequest.body ?? '').matchAll(/^Buildr peer: (.+)$/gmu)];
    requireFact(peerLines.length <= 1, 'Scoped release PR has duplicate peer contexts.');
    const expectedPeer = peerLines.length === 1 ? parseCompatibilityArtifact(JSON.parse(peerLines[0][1])) : undefined;
    requireFact(/^codex\/release-main-(.+)-g\d+$/u.exec(branch)?.[1] === selection.id && pullRequest.base.sha === selection.main, 'Release carrier or current main differs from selection.');
    plan = createReleaseCandidatePlan({ BUILDR_RELEASE_PACKAGES: selection.packages.join(','), BUILDR_SOURCE_BUILDR_VERSION: selection.versions.buildr, BUILDR_PLUGIN_VERSION: selection.versions['dsh-plugin'], BUILDR_SELECTION_ID: selection.id, BUILDR_SELECTION_BASELINE: selection.baseline, BUILDR_SELECTION_MAIN: selection.main, BUILDR_SELECTION_IDENTITY: selection.identity, BUILDR_BUILDR_PEER_VERSION: expectedPeer?.version, BUILDR_BUILDR_PEER_INTEGRITY: expectedPeer?.integrity, CANDIDATE_SOURCE_SHA: sourceCommit }, scoped.git);
    requireFact(!plan.requirements.plugin || expectedPeer, 'Scoped plugin source PR requires its frozen peer context.');
    if (expectedPeer) plan.expectedPeer = expectedPeer;
  } else {
    // A missing body projection is not proof of a legacy release. Only the
    // original main-version namespace and its exact frozen source can prove it.
    const legacyVersion = /^codex\/release-main-(.+)-g\d+$/u.exec(branch)![1];
    try { normalizeReleaseTargets({ version: legacyVersion }); }
    catch { throw new Error('Release selection proof is required for a scoped release carrier.'); }
    requireFact(scoped, 'Legacy release requires frozen source inspection.');
    const sourcePackage = JSON.parse(scoped.git(['show', `${sourceCommit}:projects/product/services/buildr/package.json`]));
    requireFact(sourcePackage?.name === MAIN_PACKAGE && sourcePackage.version === legacyVersion, 'Legacy release carrier differs from frozen main package.');
    requireFact(!Object.hasOwn(sourcePackage, 'buildrCompatibility') && !/^Buildr peer:/mu.test(String(pullRequest.body ?? '')), 'Release selection proof is required for compatibility-aware source.');
    const sourceWorkflow = scoped.git(['show', `${sourceCommit}:${workflowPath}`]);
    requireFact(!/\b(?:release_packages|BUILDR_RELEASE_PACKAGES)\b/u.test(sourceWorkflow), 'Release selection proof is required for a scoped verification recipe.');
  }

  const run = await requestJson(`repos/${repository}/actions/runs/${runId}`);
  requireFact(run?.id === runId && run?.repository?.full_name === repository, 'Candidate run repository or ID differs from the pull request.');
  requireFact(run.event === 'workflow_dispatch' && run.path?.split('@')[0] === '.github/workflows/verify.yml', 'Referenced run is not a dispatched Candidate verification.');
  requireFact(run.head_sha === sourceCommit && run.head_branch === branch, 'Candidate run source differs from the release pull request.');
  requireFact(run.status === 'completed' && run.conclusion === 'success', 'Matching Candidate verification has not passed.');
  if (plan) requireFact(Number.isSafeInteger(run.run_attempt) && run.run_attempt >= 1 && run.run_attempt <= 100, 'Scoped Candidate run attempt is invalid.');

  const jobs = await requestJson(`repos/${repository}/actions/runs/${runId}/jobs?per_page=100`);
  requireFact(Number.isSafeInteger(jobs?.total_count) && jobs.total_count >= 0 && jobs.total_count < 100 && jobs.jobs?.length === jobs.total_count, 'Candidate job list is incomplete.');
  requireFact(jobs?.jobs?.filter((job: any) => job.name === 'Candidate gate' && job.conclusion === 'success').length === 1, 'Matching Candidate gate did not pass.');
  const artifacts = await requestJson(`repos/${repository}/actions/runs/${runId}/artifacts?per_page=100`);
  requireFact(Number.isSafeInteger(artifacts?.total_count) && artifacts.total_count >= 0 && artifacts.total_count < 100 && artifacts.artifacts?.length === artifacts.total_count, 'Candidate artifact list is incomplete.');
  const names = !plan || plan.requirements.buildr ? ['candidate-package', 'candidate-aggregate'] : [];
  if (plan?.requirements.plugin) names.push(`plugin-candidate-v${plan.selection.versions['dsh-plugin'] ?? JSON.parse(scoped!.git(['show', `${sourceCommit}:${PLUGIN_SERVICE_PATH}/package.json`])).version}`, 'plugin-candidate-aggregate');
  for (const name of names) {
    requireFact(artifacts?.artifacts?.filter((artifact: any) => artifact.name === name && artifact.expired === false && artifact.size_in_bytes > 0).length === 1, `Matching Candidate ${name} is unavailable or not unique.`);
  }
  if (plan?.requirements.plugin) assertPluginSourceAggregate(await scoped!.loadAggregate(runId), plan, runId, run.run_attempt);
  return { status: 'passed', runId, sourceCommit, branch };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const serviceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
    const repo = path.resolve(serviceRoot, '../../../..');
    const git: GitRead = args => execFileSync('git', args, { cwd: repo, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
    const action = process.argv[2];
    if (action === 'plan') {
      const plan = createReleaseCandidatePlan(process.env, git);
      fs.writeFileSync(path.join(process.env.RUNNER_TEMP ?? os.tmpdir(), 'release-candidate-plan.json'), `${JSON.stringify(plan)}\n`);
      if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `buildr=${plan.requirements.buildr}\nplugin=${plan.requirements.plugin}\njoint=${plan.selection?.packages.join(',') === 'buildr,dsh-plugin'}\ncandidate_peer=${plan.selection?.packages.includes('buildr') === true}\nplugin_version=${plan.pluginVersion ?? ''}\n`);
      process.stdout.write(`${JSON.stringify(plan)}\n`);
    } else if (action === 'plugin-aggregate') {
      const plan = createReleaseCandidatePlan(process.env, git);
      const candidateFile = path.join(repo, PLUGIN_SERVICE_PATH, 'build/release-candidates', plan.pluginVersion, 'candidate.json');
      const manifestBytes = Buffer.from(git(['show', `${plan.sourceCommit}:${PLUGIN_SERVICE_PATH}/${SOURCE_SDK_MANIFEST}`]));
      const patchBytes = Buffer.from(git(['show', `${plan.sourceCommit}:${PLUGIN_SERVICE_PATH}/sdk-patches/dsh-v0.2.0-rc.2-event-sources-settings.patch`]));
      const { manifest } = readReleaseCandidate(candidateFile, { version: plan.pluginVersion, sourceCommit: plan.sourceCommit, sourceTree: plan.serviceTree, sourceSdk: sourceSdkIdentityFromFiles(manifestBytes, patchBytes) });
      const full = JSON.parse(fs.readFileSync(path.join(process.env.RUNNER_TEMP ?? os.tmpdir(), 'plugin-full-verification.json'), 'utf8'));
      plan.expectedPeer = readArtifactInput(path.join(process.env.RUNNER_TEMP ?? os.tmpdir(), 'plugin-buildr-peer.json')).artifact;
      const aggregate = createPluginSourceAggregate(plan, manifest, full, { runId: process.env.GITHUB_RUN_ID, runAttempt: Number(process.env.GITHUB_RUN_ATTEMPT) });
      fs.writeFileSync(path.join(process.env.RUNNER_TEMP ?? os.tmpdir(), 'plugin-candidate-ci-aggregate.json'), `${JSON.stringify(aggregate)}\n`);
      process.stdout.write(`${JSON.stringify({ status: aggregate.status, sourceCommit: aggregate.sourceCommit })}\n`);
    } else {
      requireFact(action === undefined, 'Unsupported Candidate check action.');
      const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH ?? '', 'utf8'));
      const repository = process.env.GITHUB_REPOSITORY ?? '';
      requireFact(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repository), 'GitHub repository is unavailable.');
      const result = await verifyReleasePullRequestCandidate(event, repository, async endpoint =>
        JSON.parse(execFileSync('gh', ['api', endpoint], { encoding: 'utf8', timeout: 30_000 })),
        { git, loadAggregate: async runId => {
          const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-plugin-source-proof-'));
          try {
            execFileSync('gh', ['run', 'download', String(runId), '--repo', repository, '--name', 'plugin-candidate-aggregate', '--dir', directory], { stdio: 'pipe', timeout: 30_000 });
            const file = path.join(directory, 'plugin-candidate-ci-aggregate.json');
            requireFact(fs.lstatSync(file).isFile() && fs.statSync(file).size < 8 * 1024 * 1024, 'Plugin source aggregate is unavailable.');
            return JSON.parse(fs.readFileSync(file, 'utf8'));
          } finally { fs.rmSync(directory, { recursive: true, force: true }); }
        } },
      );
      process.stdout.write(`${JSON.stringify(result)}\n`);
    }
  } catch (error: any) {
    process.stderr.write(`Release pull request Candidate check failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
