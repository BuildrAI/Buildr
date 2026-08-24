#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { collectVerificationSourceIdentity, validateVerificationTimingEvidence } from './evidence.mjs';

const [summaryFile, productRoot = '.', expectedKind = 'candidate'] = process.argv.slice(2);
if (!summaryFile) throw new Error('Usage: node verify-summary.mjs <timing.json> [productRoot] [core|candidate|changed]');

const summaryPath = path.resolve(summaryFile);
const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
const source = collectVerificationSourceIdentity(path.resolve(productRoot), {
  projectRoot: path.resolve(summary.source?.projectRoot ?? productRoot),
});
const validation = validateVerificationTimingEvidence(summary, source, expectedKind);
const result = {
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
