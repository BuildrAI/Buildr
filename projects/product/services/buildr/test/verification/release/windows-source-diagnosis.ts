#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { enforceOfflineVerification } from '../../../src/infrastructure/network/verification-network-policy.ts';
import { executePlan } from '../plan-runner.ts';
import { createVerificationPlan } from '../planner.ts';
import { resolveVerificationExecutionProfile } from '../registry.ts';
import { projectResult } from './windows-artifact-diagnosis.ts';

export const WINDOWS_SOURCE_DIAGNOSIS_SCHEMA = 'buildr.windows-source-diagnosis/v1';
export const WINDOWS_SOURCE_DIAGNOSIS_SCENARIO = 'app-process-windows';
const stepId = 'system-app-process';
const sha = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u;
interface GitFacts { head: string; tree: string; dirty: boolean }
interface DiagnosisOptions { env?: NodeJS.ProcessEnv; productRoot?: string }
interface DiagnosisDependencies {
  platform?: NodeJS.Platform;
  readGitFacts?: (productRoot: string) => GitFacts;
  execute?: typeof executePlan;
  writeSummary?: (directory: string, summary: any) => void;
}
const fail = (code: string): never => { throw Object.assign(new Error(code), { code }); };
const required = (env: NodeJS.ProcessEnv, key: string) => env[key] || fail(`diagnosis-missing-${key.toLowerCase().replaceAll('_', '-')}`);

export function validateWindowsSourceDiagnosis(env: NodeJS.ProcessEnv, facts: GitFacts): void {
  if (env.DIAGNOSTIC_SCENARIO !== WINDOWS_SOURCE_DIAGNOSIS_SCENARIO) fail('diagnosis-unknown-scenario');
  if (!sha.test(env.GITHUB_SHA || '') || facts.head !== env.GITHUB_SHA) fail('diagnosis-check-source-mismatch');
  if (!sha.test(env.EXPECTED_SOURCE_TREE || '') || facts.tree !== env.EXPECTED_SOURCE_TREE) fail('diagnosis-check-tree-mismatch');
  if (facts.dirty) fail('diagnosis-checkout-dirty');
}

export function createWindowsSourceDiagnosisPlan(scenario: string): any {
  if (scenario !== WINDOWS_SOURCE_DIAGNOSIS_SCENARIO) fail('diagnosis-unknown-scenario');
  const plan = createVerificationPlan({ stepIds: [stepId] });
  if (plan.steps.length !== 1 || plan.steps[0].id !== stepId || plan.steps[0].dependsOn.length !== 0
      || plan.steps[0].executor.type === 'candidate-artifact' || plan.steps[0].executor.consumesArtifact) fail('diagnosis-plan-coverage-mismatch');
  return { ...plan, source: 'windows-source-diagnosis', primaryStepIds: [stepId] };
}

function readGitFacts(productRoot: string): GitFacts {
  const git = (args: string[]) => execFileSync('git', args, { cwd: productRoot, encoding: 'utf8', timeout: 30_000,
    maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  return { head: git(['rev-parse', 'HEAD']).trim(), tree: git(['rev-parse', 'HEAD^{tree}']).trim(),
    dirty: git(['status', '--porcelain', '--untracked-files=all', '-z']).length > 0 };
}

function writeSummary(directory: string, summary: any): void {
  fs.mkdirSync(directory, { recursive: true });
  const target = path.join(directory, 'windows-source-diagnosis.json'), temporary = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(summary, null, 2)}\n`);
  fs.renameSync(temporary, target);
}

export async function runWindowsSourceDiagnosis(options: DiagnosisOptions = {}, dependencies: DiagnosisDependencies = {}): Promise<any> {
  const env = options.env ?? process.env, output = path.resolve(required(env, 'DIAGNOSTIC_OUTPUT'));
  const productRoot = path.resolve(options.productRoot ?? path.resolve(import.meta.dirname, '../../..'));
  const profile = resolveVerificationExecutionProfile('ci-workspace-limited');
  const results = new Map<string, any>(), persist = dependencies.writeSummary ?? writeSummary;
  const startedAt = Date.now();
  const summary: any = { schemaVersion: WINDOWS_SOURCE_DIAGNOSIS_SCHEMA, kind: 'diagnostic-only', aggregateEligible: false,
    status: 'failed', scenario: env.DIAGNOSTIC_SCENARIO ?? null, sourceCommit: null, sourceTree: null,
    host: { platform: dependencies.platform ?? process.platform, arch: process.arch, nodeVersion: process.versions.node,
      nodeExecutable: process.execPath, cpuCount: os.cpus().length, availableParallelism: os.availableParallelism(),
      totalMem: os.totalmem(), startFreeMem: os.freemem() },
    executionProfile: profile, startedAt: new Date(startedAt).toISOString(), results: [] };
  let stage = 'validation';
  try {
    if ((dependencies.platform ?? process.platform) !== 'win32') fail('diagnosis-requires-windows');
    const facts = (dependencies.readGitFacts ?? readGitFacts)(productRoot);
    summary.sourceCommit = facts.head; summary.sourceTree = facts.tree;
    validateWindowsSourceDiagnosis(env, facts);
    const plan = createWindowsSourceDiagnosisPlan(env.DIAGNOSTIC_SCENARIO!);
    const executionEnv = { ...env };
    // Explicit undefined survives the executor's process.env merge. Deletion
    // would restore inherited package inputs from its outer environment.
    for (const key of ['BUILDR_CANDIDATE_TARBALL', 'BUILDR_CANDIDATE_PACK_METADATA', 'BUILDR_CANDIDATE_RELEASE_MANIFEST',
      'BUILDR_RELEASE_ARTIFACT_MANIFEST', 'BUILDR_RELEASE_PACKAGE_SPEC']) executionEnv[key] = undefined;
    enforceOfflineVerification(executionEnv);
    const record = (result: any) => { if (result.id === stepId) results.set(result.id, projectResult(result)); };
    stage = 'execution'; summary.status = 'running'; persist(output, summary);
    let execution: any, executionFailure: any;
    try {
      execution = await (dependencies.execute ?? executePlan)(plan, {
        productRoot, projectRoot: path.resolve(productRoot, '../..'), diagnosticsDirectory: path.join(output, 'diagnostics'),
        env: executionEnv, executionProfile: profile, concurrency: profile.limits, reuse: false,
        runId: `windows-source-diagnosis-${env.GITHUB_RUN_ID || process.pid}`, taskId: 'windows-source-diagnosis-app-process-windows',
        stream: process.stdout, errorStream: process.stderr, prefix: 'windows-source-diagnosis',
        onComplete(result: any) { record(result); summary.results = [...results.values()]; persist(output, summary); },
      });
      for (const result of execution.results) record(result);
    } catch (error: any) { executionFailure = error; }
    stage = 'source-readback';
    validateWindowsSourceDiagnosis(env, (dependencies.readGitFacts ?? readGitFacts)(productRoot));
    if (executionFailure) { stage = 'execution'; throw executionFailure; }
    summary.status = execution.passed && results.size === 1 && results.get(stepId)?.status === 'passed'
      && results.get(stepId)?.exitCode === 0 ? 'passed' : 'failed';
  } catch (error: any) {
    summary.status = 'failed';
    summary.failure = { stage, code: /^diagnosis-[a-z0-9-]+$/u.test(error.code || '') ? error.code : `diagnosis-${stage}-failed` };
  } finally {
    summary.results = [...results.values()]; summary.host.endFreeMem = os.freemem();
    summary.finishedAt = new Date().toISOString(); summary.durationMs = Date.now() - startedAt; persist(output, summary);
  }
  return summary;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { if ((await runWindowsSourceDiagnosis()).status !== 'passed') process.exitCode = 1; }
  catch { process.stderr.write('Windows source diagnosis could not save its summary.\n'); process.exitCode = 1; }
}
