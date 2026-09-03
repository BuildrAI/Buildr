#!/usr/bin/env node
import fs from 'node:fs'; import os from 'node:os';
import path from 'node:path'; import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { executePlan } from './plan-runner.mjs'; import { parseVerificationSchedulingMode } from './dag-scheduler.mjs';
import { admitVerificationPlanBudget, createVerificationAdmissionPlan, createVerificationPlan } from './planner.mjs';
import { resolveVerificationExecutionProfile } from './registry.mjs';
import { enforceOfflineVerification } from '../../src/infrastructure/network/verification-network-policy.ts';
import { CANDIDATE_TOTAL_BUDGET_MS, CORE_TOTAL_BUDGET_MS } from './timing/budgets.mjs';
import { collectVerificationSourceIdentity, createVerificationEvidencePaths, writeVerificationTimingEvidence } from './timing/evidence.mjs';
const productRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'); const projectRoot = path.resolve(productRoot, '../..');
const schedulingMode = parseVerificationSchedulingMode(process.env.BUILDR_VERIFICATION_SCHEDULING ?? 'cost'); const executionProfile = resolveVerificationExecutionProfile(process.env.BUILDR_VERIFICATION_PROFILE);
function parseArgs(args) {
  const result = { json: false, profile: 'candidate' };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--profile') {
      if (!['daily-full', 'core', 'candidate'].includes(args[index + 1])) throw new Error('Missing or invalid --profile value.');
      result.profile = args[index += 1];
    } else if (arg === '--json') result.json = true;
    else throw new Error(`Unknown test:${result.profile} option: ${arg}`);
  }
  return result;
}
const request = parseArgs(process.argv.slice(2));
const registryProfile = request.profile === 'daily-full' ? 'core' : request.profile;
const lane = registryProfile === 'core'
  ? { budgetMs: CORE_TOTAL_BUDGET_MS, kind: 'core', source: request.profile === 'daily-full' ? 'daily-full-entry' : 'core-profile', model: { verificationTarget: 'task-or-current-source', selection: 'full', evidenceSet: 'daily-full', compatibilityProfile: 'core' } }
  : { budgetMs: CANDIDATE_TOTAL_BUDGET_MS, kind: 'candidate', source: 'candidate-profile', model: { verificationTarget: 'product-artifact-candidate', selection: 'full', evidenceSet: 'daily-full-plus-candidate-artifact', compatibilityProfile: null } };
const plan = admitVerificationPlanBudget(
  createVerificationAdmissionPlan(createVerificationPlan({ profiles: [registryProfile] })),
  { concurrency: executionProfile.limits, declaredBudgetMs: lane.budgetMs },
);
if (request.json) {
  const project = (step) => ({ id: step.id, name: step.name, reasons: step.reasons });
  await new Promise((resolve, reject) => process.stdout.write(`${JSON.stringify({ schemaVersion: 'buildr.verification-full-plan/v1', status: plan.status, diagnostic: plan.diagnostic, base: null, source: lane.source, model: lane.model, paths: plan.paths, scope: plan.scope, estimate: plan.estimate, delegated: plan.delegated, admissionStepIds: plan.admissionStepIds, preflightSteps: [], steps: plan.steps.map(project) }, null, 2)}\n`, (error) => error ? reject(error) : resolve()));
  process.exit(plan.status === 'ready' ? 0 : 1);
}
if (plan.status === 'blocked') throw new Error(plan.diagnostic?.message ?? `${request.profile} verification plan is blocked.`);
const developmentNodeVersion = fs.readFileSync(path.join(projectRoot, '.node-version'), 'utf8').trim();
if (process.versions.node !== developmentNodeVersion) throw new Error(`Buildr Product development Node mismatch: expected ${developmentNodeVersion}, active ${process.versions.node}.`);
enforceOfflineVerification();
process.stdout.write(`[verify-product] developmentNode=${developmentNodeVersion} executable=${process.execPath}\n`);
const executionRoot = fs.mkdtempSync(path.join(os.tmpdir(), `buildr-${lane.kind}-verification-`));
const evidence = createVerificationEvidencePaths(lane.kind);
const source = collectVerificationSourceIdentity(productRoot, { projectRoot });
const totalStartedAt = Date.now();
let results = [], contextLifecycle = null;
function writeSummary(status) {
  return writeVerificationTimingEvidence({
    ...evidence,
    kind: lane.kind,
    source,
    status,
    results,
    contextLifecycle,
    startedAt: totalStartedAt,
    finishedAt: Date.now(),
    totalBudgetMs: lane.budgetMs,
    diagnosticsDirectory: evidence.diagnosticsOutput,
    prefix: 'verify-product',
    stream: process.stdout,
    errorStream: process.stderr,
    schedulingMode,
    executionProfile,
  });
}
let passed = false;
try {
  fs.rmSync(evidence.diagnosticsOutput, { recursive: true, force: true });
  fs.mkdirSync(evidence.diagnosticsOutput, { recursive: true });
  const executionOptions = {
    productRoot,
    projectRoot,
    diagnosticsDirectory: evidence.diagnosticsOutput,
    artifactDirectory: path.join(executionRoot, 'candidate-package'),
    stream: process.stdout,
    errorStream: process.stderr,
    prefix: 'verify-product',
    schedulingMode,
    concurrency: executionProfile.limits,
    executionProfile,
    runId: evidence.runId,
    taskId: process.env.BUILDR_TASK_ID ?? source.branch ?? lane.kind,
  };
  const execution = await executePlan(plan, executionOptions);
  results = execution.results; contextLifecycle = execution.contextLifecycle; passed = execution.passed;
  writeSummary(passed ? 'passed' : 'failed');
  if (passed) process.stdout.write(`\nBuildr product ${lane.kind} verification passed.\n`);
} catch (error) {
  process.stderr.write(`${error.stack || error.message}\n`);
  if (!fs.existsSync(evidence.timingOutput)) {
    try { writeSummary('failed'); } catch {}
  }
} finally {
  fs.rmSync(executionRoot, { recursive: true, force: true });
}
if (!passed) process.exitCode = results.find((result) => result.status === 'failed')?.exitCode || 1;
