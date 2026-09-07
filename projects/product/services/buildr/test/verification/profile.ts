#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createVerificationPlan } from './planner.ts';
import { executePlan } from './plan-runner.ts';

const productRoot: any = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const projectRoot: any = path.resolve(productRoot, '../..');
const profile: any = process.argv[2];
if (!profile) {
  process.stderr.write('Usage: node test/verification/profile.ts <profile>\n');
  process.exitCode = 2;
} else {
  const temporaryRoot: any = fs.mkdtempSync(path.join(os.tmpdir(), `buildr-verification-${profile}-`));
  try {
    const plan: any = createVerificationPlan({ profiles: [profile] });
    const execution: any = await executePlan(plan, {
      productRoot,
      projectRoot,
      diagnosticsDirectory: path.join(temporaryRoot, 'diagnostics'),
      artifactDirectory: path.join(temporaryRoot, 'candidate-package'),
      stream: process.stdout,
      errorStream: process.stderr,
    });
    if (!execution.passed) process.exitCode = 1;
    else process.stdout.write(`Buildr ${profile} verification passed.\n`);
  } catch (error: any) {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}
