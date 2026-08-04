#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { executePlan, printPlan } from './plan-runner.mjs';
import { createVerificationPlan } from './planner.mjs';
import { resolveVerificationExecutionProfile, VERIFICATION_GROUPS, verificationSteps } from './registry.mjs';

const productRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

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

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
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
        const execution = await executePlan(plan, {
          productRoot,
          diagnosticsDirectory: path.join(temporaryRoot, 'diagnostics'),
          artifactDirectory: path.join(temporaryRoot, 'candidate-package'),
          stream: process.stdout,
          errorStream: process.stderr,
          prefix: 'focus',
          concurrency: executionProfile.limits,
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
