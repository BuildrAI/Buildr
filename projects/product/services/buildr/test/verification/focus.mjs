#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { sameFilesystemPath } from '../../src/infrastructure/filesystem/filesystem-path-identity.mjs';
import { executePlan, printPlan } from './plan-runner.mjs';
import { createVerificationPlan } from './planner.mjs';
import { resolveVerificationExecutionProfile, VERIFICATION_GROUPS, verificationSteps } from './registry.mjs';
import { collectVerificationSourceIdentity, createVerificationEvidencePaths, writeVerificationTimingEvidence } from './timing/evidence.mjs';

const productRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const projectRoot = path.resolve(productRoot, '../..');

export function usage(stream = process.stdout) {
  stream.write('Usage: npm run test:focus -- [--plan|--json] <step-id|group:<group>>...\n');
  stream.write('       npm run test:focus -- --list\n');
}

export function parseFocusArgs(args) {
  const result = { help: false, list: false, planOnly: false, json: false, stepIds: [], groups: [] };
  for (const arg of args) {
    if (arg === '--help' || arg === '-h') result.help = true;
    else if (arg === '--list') result.list = true;
    else if (arg === '--plan') result.planOnly = true;
    else if (arg === '--json') { result.json = true; result.planOnly = true; }
    else if (arg.startsWith('group:')) result.groups.push(arg.slice('group:'.length));
    else if (arg.startsWith('-')) throw new Error(`Unknown test:focus option: ${arg}`);
    else result.stepIds.push(arg);
  }
  result.stepIds = [...new Set(result.stepIds)];
  result.groups = [...new Set(result.groups)];
  if (result.help && args.length > 1) throw new Error('--help cannot be combined with other arguments');
  if (result.list && args.length > 1) throw new Error('--list cannot be combined with other arguments');
  if (!result.help && !result.list && result.stepIds.length === 0 && result.groups.length === 0) throw new Error('test:focus requires at least one step or group selector');
  return result;
}

export function resolveFocusPlan(parsed) {
  const unknownGroups = parsed.groups.filter((group) => !VERIFICATION_GROUPS.includes(group));
  if (unknownGroups.length > 0) throw new Error(`Unknown verification group: ${unknownGroups.join(', ')}`);
  return createVerificationPlan({ stepIds: parsed.stepIds, groups: parsed.groups });
}

export function printFocusCatalog(stream = process.stdout) {
  stream.write('Groups:\n');
  for (const group of VERIFICATION_GROUPS) stream.write(`  group:${group}\n`);
  stream.write('Steps:\n');
  for (const step of verificationSteps) stream.write(`  ${step.id.padEnd(32)} ${step.name}\n`);
}

if (process.argv[1] && sameFilesystemPath(process.argv[1], fileURLToPath(import.meta.url))) {
  let temporaryRoot;
  try {
    const parsed = parseFocusArgs(process.argv.slice(2));
    if (parsed.help) usage();
    else if (parsed.list) printFocusCatalog();
    else {
      const plan = resolveFocusPlan(parsed);
      const payload = {
        schemaVersion: 'buildr.verification-focus-plan/v1',
        selectors: {
          steps: plan.stepIds,
          groups: plan.groups,
        },
        steps: plan.steps,
      };
      if (parsed.json) process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
      else if (parsed.planOnly) printPlan(plan);
      else {
        temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-focus-verification-'));
        const executionProfile = resolveVerificationExecutionProfile(process.env.BUILDR_VERIFICATION_PROFILE);
        const evidence = createVerificationEvidencePaths('focus', { temporaryRoot });
        const source = collectVerificationSourceIdentity(productRoot, { projectRoot });
        const startedAt = Date.now();
        fs.rmSync(evidence.diagnosticsOutput, { recursive: true, force: true });
        fs.mkdirSync(evidence.diagnosticsOutput, { recursive: true });
        const execution = await executePlan(plan, {
          productRoot,
          projectRoot,
          diagnosticsDirectory: evidence.diagnosticsOutput,
          artifactDirectory: path.join(temporaryRoot, 'candidate-package'),
          stream: process.stdout,
          errorStream: process.stderr,
          prefix: 'focus',
          concurrency: executionProfile.limits,
          executionProfile,
          runId: evidence.runId,
          taskId: process.env.BUILDR_TASK_ID ?? source.branch ?? 'focus',
        });
        writeVerificationTimingEvidence({
          ...evidence,
          kind: 'focus',
          source,
          status: execution.passed ? 'passed' : 'failed',
          results: execution.results,
          contextLifecycle: execution.contextLifecycle,
          startedAt,
          finishedAt: Date.now(),
          diagnosticsDirectory: evidence.diagnosticsOutput,
          prefix: 'focus',
          stream: process.stdout,
          errorStream: process.stderr,
          executionProfile,
        });
        if (!execution.passed) process.exitCode = 1;
        else process.stdout.write(`Buildr focus verification passed: ${[...plan.stepIds, ...plan.groups.map((group) => `group:${group}`)].join(' ')}\n`);
      }
    }
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    usage(process.stderr);
    process.exitCode = 2;
  } finally {
    if (temporaryRoot) fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}
