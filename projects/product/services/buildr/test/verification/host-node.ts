#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { executePlan } from './plan-runner.ts';
import { createVerificationPlan } from './planner.ts';
import { resolveVerificationExecutionProfile } from './registry.ts';
import { collectVerificationSourceIdentity, createVerificationEvidencePaths, writeVerificationTimingEvidence } from './timing/evidence.ts';
import { enforceOfflineVerification } from '../../src/infrastructure/network/verification-network-policy.ts';

const productRoot: any = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const projectRoot: any = path.resolve(productRoot, '../..');
const executionProfile: any = resolveVerificationExecutionProfile(process.env.BUILDR_VERIFICATION_PROFILE);
const executionRoot: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-host-node-verification-'));
const evidence: any = createVerificationEvidencePaths('host-node');
const source: any = collectVerificationSourceIdentity(productRoot, { projectRoot });
const startedAt: any = Date.now();
const plan: any = createVerificationPlan({ profiles: ['host-node'] });
let results: any[] = [];
let contextLifecycle: any = null;
let passed: any = false;

enforceOfflineVerification();

function writeSummary(status: any): any  {
  writeVerificationTimingEvidence({
    ...evidence,
    kind: 'host-node',
    source,
    status,
    results,
    contextLifecycle,
    startedAt,
    finishedAt: Date.now(),
    diagnosticsDirectory: evidence.diagnosticsOutput,
    prefix: 'verify-host-node',
    stream: process.stdout,
    errorStream: process.stderr,
    executionProfile,
    expectedNodeVersion: null,
  });
}

try {
  fs.rmSync(evidence.diagnosticsOutput, { recursive: true, force: true });
  fs.mkdirSync(evidence.diagnosticsOutput, { recursive: true });
  process.stdout.write(`[verify-host-node] platform=${process.platform} node=${process.versions.node} executable=${process.execPath}\n`);
  const execution: any = await executePlan(plan, {
    productRoot,
    projectRoot,
    diagnosticsDirectory: evidence.diagnosticsOutput,
    artifactDirectory: path.join(executionRoot, 'candidate-package'),
    stream: process.stdout,
    errorStream: process.stderr,
    prefix: 'verify-host-node',
    concurrency: executionProfile.limits,
    executionProfile,
    expectedNodeVersion: null,
  });
  results = execution.results;
  contextLifecycle = execution.contextLifecycle;
  passed = execution.passed;
  writeSummary(passed ? 'passed' : 'failed');
  if (passed) process.stdout.write('Buildr Host Node compatibility verification passed.\n');
} catch (error: any) {
  process.stderr.write(`${error.stack || error.message}\n`);
  if (!fs.existsSync(evidence.timingOutput)) {
    try { writeSummary('failed'); } catch {}
  }
} finally {
  fs.rmSync(executionRoot, { recursive: true, force: true });
}

if (!passed) process.exitCode = results.find((result: any) => result.status === 'failed')?.exitCode || 1;
