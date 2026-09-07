#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { collectVerificationSourceIdentity, validateVerificationTimingEvidence } from './evidence.ts';

const [summaryFile, productRoot = '.', expectedKind = 'candidate']: any = process.argv.slice(2);
if (!summaryFile) throw new Error('Usage: node verify-summary.ts <timing.json> [productRoot] [core|candidate|changed]');

const summaryPath: any = path.resolve(summaryFile);
const summary: any = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
const source: any = collectVerificationSourceIdentity(path.resolve(productRoot), {
  projectRoot: path.resolve(summary.source?.projectRoot ?? productRoot),
});
const validation: any = validateVerificationTimingEvidence(summary, source, expectedKind);
const result: any = {
  schemaVersion: 'buildr.verification-timing-check/v1',
  summaryPath,
  expectedKind,
  status: summary.status ?? null,
  runId: summary.run?.id ?? null,
  source,
  findings: validation.findings,
  ok: validation.ok,
};
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (!result.ok) process.exitCode = 1;
