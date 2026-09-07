#!/usr/bin/env node

import fs from 'node:fs';
import process from 'node:process';
import { cleanupVerificationTimingEvidence } from './evidence.ts';

const [summaryPath]: any = process.argv.slice(2);
if (!summaryPath) {
  process.stderr.write('Usage: node cleanup-evidence.ts <timing-summary.json>\n');
  process.exitCode = 2;
} else {
  try {
    const summary: any = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
    const result: any = cleanupVerificationTimingEvidence(summary);
    process.stdout.write(`${JSON.stringify({ schemaVersion: 'buildr.verification-evidence-cleanup/v1', ...result }, null, 2)}\n`);
    if (!result.ok) process.exitCode = 1;
  } catch (error: any) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  }
}
