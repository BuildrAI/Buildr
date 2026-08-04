#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { collectChangedProductPaths } from './changed-paths.mjs';
import { executePlan } from './plan-runner.mjs';
import { parseVerificationSchedulingMode } from './dag-scheduler.mjs';
import { createVerificationPlan, createVerificationPreflightPlan } from './planner.mjs';
import { resolveVerificationExecutionProfile } from './registry.mjs';
import { CANDIDATE_TOTAL_BUDGET_MS } from './timing/budgets.mjs';
import { collectVerificationSourceIdentity, createVerificationEvidencePaths, writeVerificationTimingEvidence } from './timing/evidence.mjs';

const productRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const projectRoot = path.resolve(productRoot, '../..');
const schedulingMode = parseVerificationSchedulingMode(process.env.BUILDR_VERIFICATION_SCHEDULING ?? 'cost');
const executionProfile = resolveVerificationExecutionProfile(process.env.BUILDR_VERIFICATION_PROFILE);
function parseArgs(args) {
  const result = { base: null, json: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--json') result.json = true;
    else if (arg === '--base') {
      if (!args[index + 1] || args[index + 1].startsWith('-')) throw new Error('Missing value for --base');
      result.base = args[++index];
    } else throw new Error(`Unknown test:candidate option: ${arg}`);
  }
  return result;
}
const request = parseArgs(process.argv.slice(2));
const changed = request.base ? collectChangedProductPaths({ productRoot, projectRoot, base: request.base }) : { base: null, source: 'candidate-profile', paths: [] };
const preflightPlan = createVerificationPreflightPlan({ paths: changed.paths });
const plan = createVerificationPlan({ profiles: ['candidate'], paths: changed.paths });
if (request.json) {
  const project = (step) => ({ id: step.id, name: step.name, reasons: step.reasons });
  process.stdout.write(`${JSON.stringify({ schemaVersion: 'buildr.verification-full-plan/v1', base: changed.base, source: changed.source, paths: plan.paths, delegated: plan.delegated, preflightSteps: preflightPlan.steps.map(project), steps: plan.steps.map(project) }, null, 2)}\n`);
  process.exit(0);
}
const executionRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-candidate-verification-'));
const evidence = createVerificationEvidencePaths('candidate');
const source = collectVerificationSourceIdentity(productRoot, { projectRoot });
const totalStartedAt = Date.now();
let results = [];

function writeSummary(status) {
  return writeVerificationTimingEvidence({
    ...evidence,
    kind: 'candidate',
    source,
    status,
    results,
    startedAt: totalStartedAt,
    finishedAt: Date.now(),
    totalBudgetMs: CANDIDATE_TOTAL_BUDGET_MS,
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
    taskId: process.env.BUILDR_TASK_ID ?? source.branch ?? 'candidate',
  };
  const preflight = preflightPlan.steps.length ? await executePlan(preflightPlan, executionOptions) : { passed: true, results: [] };
  const execution = preflight.passed ? await executePlan(plan, executionOptions) : { passed: false, results: [] };
  results = [...preflight.results, ...execution.results];
  passed = execution.passed;
  writeSummary(passed ? 'passed' : 'failed');
  if (passed) process.stdout.write('\nBuildr product verification passed.\n');
} catch (error) {
  process.stderr.write(`${error.stack || error.message}\n`);
  if (!fs.existsSync(evidence.timingOutput)) {
    try { writeSummary('failed'); } catch {}
  }
} finally {
  fs.rmSync(executionRoot, { recursive: true, force: true });
}
if (!passed) process.exitCode = results.find((result) => result.status === 'failed')?.exitCode || 1;
