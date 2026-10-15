#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { enforceOfflineVerification } from '../../../src/infrastructure/network/verification-network-policy.ts';
import { readCandidateCiArtifact } from '../candidate-ci-evidence.ts';
import { executePlan } from '../plan-runner.ts';
import { createCandidateCiShardPlan } from '../planner.ts';
import { resolveVerificationExecutionProfile } from '../registry.ts';
import { CANDIDATE_TARBALL_ENV, CANDIDATE_PACK_METADATA_ENV, CANDIDATE_RELEASE_MANIFEST_ENV } from './candidate-package.ts';

export const WINDOWS_ARTIFACT_DIAGNOSIS_SCHEMA = 'buildr.windows-artifact-diagnosis/v1';
export const WINDOWS_ARTIFACT_DIAGNOSIS_STEPS = Object.freeze(['system-app-process', 'runtime-adapter-parity', 'release-tarball-smoke']);
export const WINDOWS_DIAGNOSIS_SCENARIOS = Object.freeze({
  'runtime-windows': { shard: 'runtime-windows', artifactConsumer: true, stepIds: WINDOWS_ARTIFACT_DIAGNOSIS_STEPS },
  'package-consumer-windows': { shard: 'runtime-windows', artifactConsumer: true, stepIds: ['release-tarball-smoke'] },
  'worktree-windows': { shard: 'task-worktree-recovery-windows', artifactConsumer: false, stepIds: ['system-worktree-lifecycle', 'system-nested-git-isolation'] },
  'nested-lifecycle-windows': { shard: 'task-worktree-recovery-windows', artifactConsumer: false, stepIds: ['system-nested-git-isolation'] },
  'release-contract-windows': { shard: 'release-infrastructure-windows', artifactConsumer: false, stepIds: ['integration-candidate-release', 'integration-candidate-release-selection', 'integration-candidate-package-selection'] },
  'git-convergence-windows': { shard: 'release-infrastructure-windows', artifactConsumer: false, stepIds: ['integration-candidate-git-convergence', 'integration-candidate-git-selection'] },
});
const servicePrefix = 'projects/product/services/buildr/';
const sha = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u;
interface GitFacts { head: string; tree: string; changedPaths: string[]; dirty: boolean }
interface DiagnosisOptions { env?: NodeJS.ProcessEnv; productRoot?: string }
interface DiagnosisDependencies {
  platform?: NodeJS.Platform;
  readRun?: (file: string) => any;
  readGitFacts?: (productRoot: string, originalSource: string) => GitFacts;
  readArtifact?: typeof readCandidateCiArtifact;
  execute?: typeof executePlan;
  writeSummary?: (directory: string, summary: any) => void;
}
const fail = (code: string): never => { throw Object.assign(new Error(code), { code }); };
const required = (env: NodeJS.ProcessEnv, key: string) => env[key] || fail(`diagnosis-missing-${key.toLowerCase().replaceAll('_', '-')}`);

export function validateWindowsArtifactDiagnosis(env: NodeJS.ProcessEnv, run: any, facts: GitFacts): void {
  const runId = required(env, 'DIAGNOSTIC_CANDIDATE_RUN_ID'), original = required(env, 'DIAGNOSTIC_CANDIDATE_SOURCE');
  if (!/^[1-9]\d*$/u.test(runId) || String(run?.id) !== runId) fail('diagnosis-run-id-mismatch');
  if (!/^[^/\s]+\/[^/\s]+$/u.test(env.GITHUB_REPOSITORY || '') || run?.repository?.full_name !== env.GITHUB_REPOSITORY) fail('diagnosis-run-repository-mismatch');
  if (run?.path !== '.github/workflows/verify.yml' || run?.event !== 'workflow_dispatch') fail('diagnosis-run-workflow-mismatch');
  if (!sha.test(original) || run?.head_sha !== original) fail('diagnosis-run-source-mismatch');
  if (!sha.test(env.GITHUB_SHA || '') || facts.head !== env.GITHUB_SHA) fail('diagnosis-check-source-mismatch');
  if (!sha.test(env.EXPECTED_SOURCE_TREE || '') || facts.tree !== env.EXPECTED_SOURCE_TREE) fail('diagnosis-check-tree-mismatch');
  if (facts.dirty) fail('diagnosis-checkout-dirty');
  const allowed = (file: string) => file.startsWith(`${servicePrefix}test/`) || file.startsWith(`${servicePrefix}tools/verification/`)
    || file === '.github/workflows/verify.yml' || file === 'projects/product/knowledge/docs/flows/open-source-release.md'
    || file === 'projects/product/knowledge/docs/architecture/verification-framework.md';
  if (facts.changedPaths.some(file => !allowed(file))) fail('diagnosis-production-input-changed');
}

export function createWindowsArtifactDiagnosisPlan(scenario = 'runtime-windows'): any {
  const definition = Object.hasOwn(WINDOWS_DIAGNOSIS_SCENARIOS, scenario) && WINDOWS_DIAGNOSIS_SCENARIOS[scenario as keyof typeof WINDOWS_DIAGNOSIS_SCENARIOS];
  if (!definition) fail('diagnosis-unknown-scenario');
  const plan = createCandidateCiShardPlan(definition.shard, { externalArtifact: definition.artifactConsumer });
  const steps = plan.steps.filter((step: any) => definition.stepIds.includes(step.id));
  const selected = new Set(steps.map((step: any) => step.id));
  if (steps.length !== definition.stepIds.length || steps.some((step: any) => step.dependsOn.some((id: string) => !selected.has(id)))) fail('diagnosis-plan-coverage-mismatch');
  return { ...plan, source: 'windows-artifact-diagnosis', primaryStepIds: definition.stepIds, artifactConsumer: definition.artifactConsumer, steps };
}

function readGitFacts(productRoot: string, originalSource: string): GitFacts {
  const git = (args: string[]) => execFileSync('git', args, { cwd: productRoot, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  if (!sha.test(originalSource)) fail('diagnosis-run-source-mismatch');
  return { head: git(['rev-parse', 'HEAD']).trim(), tree: git(['rev-parse', 'HEAD^{tree}']).trim(),
    changedPaths: git(['diff', '--name-only', '--no-relative', '--no-renames', '-z', `${originalSource}..HEAD`, '--']).split('\0').filter(Boolean),
    dirty: git(['status', '--porcelain', '--untracked-files=all', '-z']).length > 0 };
}

function projectResult(result: any): any {
  const projected: any = {};
  for (const key of ['id', 'status', 'exitCode', 'childExitCode', 'childSignal', 'childOutcome', 'durationMs', 'queueDurationMs', 'startedAt', 'finishedAt', 'failureCode']) {
    if (typeof result[key] === 'string' || typeof result[key] === 'number' || result[key] === null) projected[key] = result[key];
  }
  projected.phases = (result.phases ?? []).map((phase: any) => Object.fromEntries(['scope', 'id', 'status', 'startedAt', 'finishedAt', 'durationMs'].filter(key => typeof phase[key] === 'string' || typeof phase[key] === 'number').map(key => [key, phase[key]])));
  projected.failureFacts = (result.failureFacts ?? []).map((fact: any) => Object.fromEntries(['stage', 'kind', 'code'].filter(key => typeof fact[key] === 'string').map(key => [key, fact[key]])));
  if (result.process) projected.process = { pid: result.process.pid ?? null, processGroupId: result.process.processGroupId ?? null };
  if (result.processCleanup) projected.processCleanup = { status: result.processCleanup.status };
  if (result.scheduling) projected.scheduling = Object.fromEntries(['demand', 'grant'].map(key => [key, Object.fromEntries(Object.entries(result.scheduling[key] ?? {}).filter(([name, value]) => ['workers', 'processes', 'git', 'workspaceIo'].includes(name) && Number.isInteger(value)))]));
  projected.diagnostics = Object.fromEntries(['stdoutPath', 'stderrPath'].filter(key => typeof result[key] === 'string').map(key => [key.replace('Path', 'File'), path.basename(result[key])]));
  return projected;
}

function writeSummary(directory: string, summary: any): void {
  fs.mkdirSync(directory, { recursive: true });
  const target = path.join(directory, 'windows-artifact-diagnosis.json'), temporary = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(summary, null, 2)}\n`);
  fs.renameSync(temporary, target);
}

export async function runWindowsArtifactDiagnosis(options: DiagnosisOptions = {}, dependencies: DiagnosisDependencies = {}): Promise<any> {
  const env = options.env ?? process.env, output = path.resolve(required(env, 'DIAGNOSTIC_OUTPUT'));
  const productRoot = path.resolve(options.productRoot ?? path.resolve(import.meta.dirname, '../../..'));
  const profile = resolveVerificationExecutionProfile('ci-workspace-limited');
  const results = new Map<string, any>(), persist = dependencies.writeSummary ?? writeSummary;
  const startedAt = Date.now();
  const summary: any = { schemaVersion: WINDOWS_ARTIFACT_DIAGNOSIS_SCHEMA, kind: 'diagnostic-only', aggregateEligible: false, status: 'failed',
    originalCandidateRunId: env.DIAGNOSTIC_CANDIDATE_RUN_ID ?? null, scenario: env.DIAGNOSTIC_SCENARIO || 'runtime-windows', artifactConsumed: false,
    checkSourceCommit: null, checkSourceTree: null, artifactSourceCommit: null, artifactSha256: null,
    host: { platform: dependencies.platform ?? process.platform, arch: process.arch, nodeVersion: process.versions.node, nodeExecutable: process.execPath,
      cpuCount: os.cpus().length, availableParallelism: os.availableParallelism(), totalMem: os.totalmem(), startFreeMem: os.freemem() },
    executionProfile: profile, startedAt: new Date(startedAt).toISOString(), results: [] };
  let stage = 'validation';
  try {
    const run = (dependencies.readRun ?? ((file: string) => JSON.parse(fs.readFileSync(file, 'utf8'))))(required(env, 'DIAGNOSTIC_RUN_JSON'));
    const facts = (dependencies.readGitFacts ?? readGitFacts)(productRoot, required(env, 'DIAGNOSTIC_CANDIDATE_SOURCE'));
    summary.checkSourceCommit = facts.head; summary.checkSourceTree = facts.tree;
    validateWindowsArtifactDiagnosis(env, run, facts);
    const plan = createWindowsArtifactDiagnosisPlan(summary.scenario), selected = new Set<string>(plan.primaryStepIds);
    summary.artifactConsumerSelected = plan.artifactConsumer;
    stage = 'artifact-readback';
    const artifact = (dependencies.readArtifact ?? readCandidateCiArtifact)(required(env, 'DIAGNOSTIC_ARTIFACT_DIR'), env.DIAGNOSTIC_CANDIDATE_SOURCE);
    summary.artifactSourceCommit = artifact.identity.sourceCommit; summary.artifactSha256 = artifact.identity.sha256;
    if (artifact.identity.sourceCommit !== env.DIAGNOSTIC_CANDIDATE_SOURCE) fail('diagnosis-artifact-source-mismatch');
    if ((dependencies.platform ?? process.platform) !== 'win32') fail('diagnosis-requires-windows');
    stage = 'execution'; summary.status = 'running'; persist(output, summary);
    const executionEnv = { ...env };
    for (const key of [CANDIDATE_TARBALL_ENV, CANDIDATE_PACK_METADATA_ENV, CANDIDATE_RELEASE_MANIFEST_ENV, 'BUILDR_RELEASE_ARTIFACT_MANIFEST', 'BUILDR_RELEASE_PACKAGE_SPEC']) executionEnv[key] = undefined;
    if (plan.artifactConsumer) Object.assign(executionEnv, { [CANDIDATE_TARBALL_ENV]: artifact.tarball, [CANDIDATE_PACK_METADATA_ENV]: artifact.metadataPath, [CANDIDATE_RELEASE_MANIFEST_ENV]: artifact.manifestPath });
    enforceOfflineVerification(executionEnv);
    const record = (result: any) => { if (!selected.has(result.id)) return; results.set(result.id, projectResult(result));
      if (result.id === 'release-tarball-smoke' && !['blocked', 'skipped'].includes(result.status)) summary.artifactConsumed = true; };
    const execution = await (dependencies.execute ?? executePlan)(plan, {
      productRoot, projectRoot: path.resolve(productRoot, '../..'), artifactDirectory: path.resolve(env.DIAGNOSTIC_ARTIFACT_DIR!),
      diagnosticsDirectory: path.join(output, 'diagnostics'), env: executionEnv, executionProfile: profile, concurrency: profile.limits, reuse: false,
      runId: `windows-artifact-diagnosis-${summary.scenario}-${env.GITHUB_RUN_ID || process.pid}`, taskId: `windows-artifact-diagnosis-${summary.scenario}`,
      stream: process.stdout, errorStream: process.stderr, prefix: 'windows-artifact-diagnosis',
      onComplete(result: any) { record(result); summary.results = [...results.values()]; persist(output, summary); },
    });
    for (const result of execution.results) record(result);
    stage = 'source-readback';
    validateWindowsArtifactDiagnosis(env, run, (dependencies.readGitFacts ?? readGitFacts)(productRoot, env.DIAGNOSTIC_CANDIDATE_SOURCE!));
    summary.status = execution.passed && results.size === selected.size && [...results.values()].every(result => result.status === 'passed') ? 'passed' : 'failed';
  } catch (error: any) {
    summary.status = 'failed'; summary.failure = { stage, code: /^diagnosis-[a-z0-9-]+$/u.test(error.code || '') ? error.code : `diagnosis-${stage}-failed` };
  } finally {
    summary.results = [...results.values()]; summary.host.endFreeMem = os.freemem(); summary.finishedAt = new Date().toISOString(); summary.durationMs = Date.now() - startedAt; persist(output, summary);
  }
  return summary;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { if ((await runWindowsArtifactDiagnosis()).status !== 'passed') process.exitCode = 1; }
  catch { process.stderr.write('Windows artifact diagnosis could not save its summary.\n'); process.exitCode = 1; }
}
