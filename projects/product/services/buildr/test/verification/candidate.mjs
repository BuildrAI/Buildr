#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { executePlan } from './plan-runner.mjs';
import { parseVerificationSchedulingMode } from './dag-scheduler.mjs';
import { createVerificationPlan } from './planner.mjs';
import { resolveVerificationExecutionProfile } from './registry.mjs';
import { CANDIDATE_TOTAL_BUDGET_MS } from './timing/budgets.mjs';
import { collectVerificationSourceIdentity, createVerificationEvidencePaths, writeVerificationTimingEvidence } from './timing/evidence.mjs';

const productRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const projectRoot = path.resolve(productRoot, '../..');
const schedulingMode = parseVerificationSchedulingMode(process.env.BUILDR_VERIFICATION_SCHEDULING ?? 'cost');
const executionProfile = resolveVerificationExecutionProfile(process.env.BUILDR_VERIFICATION_PROFILE);
function parseArgs(args) {
  const result = { json: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--json') result.json = true;
    else throw new Error(`Unknown test:candidate option: ${arg}`);
  }
  return result;
}
const request = parseArgs(process.argv.slice(2));
const plan = createVerificationPlan({ profiles: ['candidate'] });
if (request.json) {
  const project = (step) => ({ id: step.id, name: step.name, reasons: step.reasons });
  await new Promise((resolve, reject) => process.stdout.write(`${JSON.stringify({ schemaVersion: 'buildr.verification-full-plan/v1', base: null, source: 'candidate-profile', paths: plan.paths, delegated: plan.delegated, preflightSteps: [], steps: plan.steps.map(project) }, null, 2)}\n`, (error) => error ? reject(error) : resolve()));
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
  const execution = await executePlan(plan, executionOptions);
  results = execution.results;
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
