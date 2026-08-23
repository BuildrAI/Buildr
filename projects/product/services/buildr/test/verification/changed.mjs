#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { collectChangedProductPaths } from './changed-paths.mjs';
import { admitVerificationPlanBudget, createDevelopmentPlatformPlan, createVerificationAdmissionPlan, createVerificationPlan } from './planner.mjs';
import { executePlan, printPlan } from './plan-runner.mjs';
import { resolveVerificationExecutionProfile } from './registry.mjs';
import { CORE_TOTAL_BUDGET_MS } from './timing/budgets.mjs';
import { collectVerificationSourceIdentity, createVerificationEvidencePaths, writeVerificationTimingEvidence } from './timing/evidence.mjs';

const productRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const projectRoot = path.resolve(productRoot, '../..');

function usage(stream = process.stdout) {
  stream.write('Usage: npm run test:changed -- [--base <ref>] [--development-runner <windows>] [--plan|--json] [path ...]\n');
}

function parseArgs(args) {
  const result = { base: null, developmentRunner: null, planOnly: false, json: false, paths: [] };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--help' || arg === '-h') return { help: true };
    if (arg === '--plan') result.planOnly = true;
    else if (arg === '--json') { result.json = true; result.planOnly = true; }
    else if (arg === '--base') {
      if (!args[index + 1] || args[index + 1].startsWith('-')) throw new Error('Missing value for --base');
      result.base = args[index + 1];
      index += 1;
    } else if (arg === '--development-runner') {
      if (!args[index + 1] || args[index + 1].startsWith('-')) throw new Error('Missing value for --development-runner');
      result.developmentRunner = args[index + 1];
      index += 1;
    } else if (arg.startsWith('-')) throw new Error(`Unknown test:changed option: ${arg}`);
    else result.paths.push(arg);
  }
  if (result.base && result.paths.length > 0) throw new Error('--base cannot be combined with explicit paths');
  return result;
}

let executionRoot;
let evidence;
let results = [];
let totalStartedAt;
let source;
try {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
  } else {
    const changed = collectChangedProductPaths({ productRoot, projectRoot, base: args.base, explicitPaths: args.paths });
    const executionProfile = resolveVerificationExecutionProfile(process.env.BUILDR_VERIFICATION_PROFILE);
    const affectedPlan = args.developmentRunner
      ? createDevelopmentPlatformPlan({ runner: args.developmentRunner, paths: changed.paths })
      : createVerificationPlan({ paths: changed.paths, versionOnlyPackagePaths: changed.versionOnlyPackagePaths, selectionOnlyPaths: changed.selectionOnlyPaths, selectionReasons: changed.selectionReasons });
    const composedPlan = args.developmentRunner ? affectedPlan : createVerificationAdmissionPlan(affectedPlan);
    const plan = admitVerificationPlanBudget(composedPlan, {
      concurrency: executionProfile.limits,
      declaredBudgetMs: composedPlan.scope?.mode === 'full' ? CORE_TOTAL_BUDGET_MS : null,
    });
    const output = { schemaVersion: 'buildr.verification-plan/v1', status: plan.status, diagnostic: plan.diagnostic, base: changed.base, source: changed.source, developmentRunner: args.developmentRunner, paths: plan.paths, versionOnlyPackagePaths: changed.versionOnlyPackagePaths, selectionOnlyPaths: changed.selectionOnlyPaths, scope: plan.scope, estimate: plan.estimate, delegated: plan.delegated, ignored: plan.ignored, unmapped: plan.unmapped, productionOwnerGaps: plan.productionOwnerGaps, admissionStepIds: plan.admissionStepIds ?? [], preflightSteps: [], steps: plan.steps };
    if (args.json) {
      process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
      if (plan.status === 'blocked') process.exitCode = 1;
    }
    else if (args.planOnly) {
      if (changed.base) process.stdout.write(`Git base: ${changed.base}\n`);
      printPlan(plan);
      if (plan.status === 'blocked') process.exitCode = 1;
    } else if (plan.status === 'blocked') {
      printPlan(plan, process.stderr);
      process.exitCode = 1;
    } else if (plan.steps.length === 0) {
      process.stdout.write('No Product verification steps selected.\n');
    } else {
      executionRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-changed-verification-'));
      evidence = createVerificationEvidencePaths('changed');
      totalStartedAt = Date.now();
      source = collectVerificationSourceIdentity(productRoot, { projectRoot });
      fs.rmSync(evidence.diagnosticsOutput, { recursive: true, force: true });
      fs.mkdirSync(evidence.diagnosticsOutput, { recursive: true });
      const executionOptions = {
        productRoot,
        projectRoot,
        diagnosticsDirectory: evidence.diagnosticsOutput,
        artifactDirectory: path.join(executionRoot, 'candidate-package'),
        env: {
          BUILDR_CHANGED_PATHS_JSON: JSON.stringify(changed.paths),
          ...(changed.base ? { BUILDR_VERIFICATION_BASE: changed.base } : {}),
        },
        runId: evidence.runId,
        taskId: process.env.BUILDR_TASK_ID ?? source.branch ?? 'changed',
        concurrency: executionProfile.limits,
        executionProfile,
        stream: process.stdout,
        errorStream: process.stderr,
      };
      if ((plan.admissionStepIds ?? []).length > 0) process.stdout.write(`[verify-changed] admission: ${plan.admissionStepIds.join(', ')}\n`);
      const execution = await executePlan(plan, executionOptions);
      results = execution.results;
      writeVerificationTimingEvidence({
        ...evidence,
        kind: 'changed',
        source,
        status: execution.passed ? 'passed' : 'failed',
        results,
        contextLifecycle: execution.contextLifecycle,
        startedAt: totalStartedAt,
        finishedAt: Date.now(),
        diagnosticsDirectory: evidence.diagnosticsOutput,
        prefix: 'verify-changed',
        stream: process.stdout,
        errorStream: process.stderr,
        executionProfile,
      });
      if (!execution.passed) process.exitCode = 1;
      else process.stdout.write('Buildr changed verification passed.\n');
    }
  }
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  if (evidence && source && totalStartedAt && !fs.existsSync(evidence.timingOutput)) {
    try {
      writeVerificationTimingEvidence({
        ...evidence,
        kind: 'changed',
        source,
        status: 'failed',
        results,
        startedAt: totalStartedAt,
        finishedAt: Date.now(),
        diagnosticsDirectory: evidence.diagnosticsOutput,
        prefix: 'verify-changed',
        stream: process.stdout,
        errorStream: process.stderr,
        executionProfile: resolveVerificationExecutionProfile(process.env.BUILDR_VERIFICATION_PROFILE),
      });
    } catch {}
  }
  usage(process.stderr);
  process.exitCode = 2;
} finally {
  if (executionRoot) fs.rmSync(executionRoot, { recursive: true, force: true });
}
