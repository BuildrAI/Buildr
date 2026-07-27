#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { collectChangedProductPaths } from './changed-paths.mjs';
import { createVerificationPlan, createVerificationPreflightPlan } from './planner.mjs';
import { executePlan, printPlan } from './plan-runner.mjs';
import { collectVerificationSourceIdentity, createVerificationEvidencePaths, writeVerificationTimingEvidence } from './timing/evidence.mjs';

const productRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const projectRoot = path.resolve(productRoot, '../..');

function usage(stream = process.stdout) {
  stream.write('Usage: npm run test:changed -- [--base <ref>] [--plan|--json] [path ...]\n');
}

function parseArgs(args) {
  const result = { base: null, planOnly: false, json: false, paths: [] };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--help' || arg === '-h') return { help: true };
    if (arg === '--plan') result.planOnly = true;
    else if (arg === '--json') { result.json = true; result.planOnly = true; }
    else if (arg === '--base') {
      if (!args[index + 1] || args[index + 1].startsWith('-')) throw new Error('Missing value for --base');
      result.base = args[index + 1];
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
    const preflightPlan = createVerificationPreflightPlan({ paths: changed.paths });
    const plan = createVerificationPlan({ paths: changed.paths });
    const output = { schemaVersion: 'buildr.verification-plan/v1', base: changed.base, source: changed.source, paths: plan.paths, preflightSteps: preflightPlan.steps, steps: plan.steps };
    if (args.json) process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    else if (args.planOnly) {
      if (changed.base) process.stdout.write(`Git base: ${changed.base}\n`);
      printPlan(plan);
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
        env: { BUILDR_CHANGED_PATHS_JSON: JSON.stringify(changed.paths) },
        stream: process.stdout,
        errorStream: process.stderr,
      };
      let preflight = { passed: true, results: [] };
      if (preflightPlan.steps.length) {
        process.stdout.write(`[verify-changed] preflight: ${preflightPlan.steps.map((item) => item.id).join(', ')}\n`);
        preflight = await executePlan(preflightPlan, executionOptions);
      }
      const execution = preflight.passed ? await executePlan(plan, executionOptions) : { passed: false, results: [] };
      results = [...preflight.results, ...execution.results];
      writeVerificationTimingEvidence({
        ...evidence,
        kind: 'changed',
        source,
        status: execution.passed ? 'passed' : 'failed',
        results,
        startedAt: totalStartedAt,
        finishedAt: Date.now(),
        diagnosticsDirectory: evidence.diagnosticsOutput,
        prefix: 'verify-changed',
        stream: process.stdout,
        errorStream: process.stderr,
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
      });
    } catch {}
  }
  usage(process.stderr);
  process.exitCode = 2;
} finally {
  if (executionRoot) fs.rmSync(executionRoot, { recursive: true, force: true });
}
