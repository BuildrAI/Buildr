#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditProjectTestOwnership } from '../test-inventory-ownership.ts';

const productRoot: any = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const findings: any[] = auditProjectTestOwnership(productRoot).findings;

if (findings.length) {
  console.error('Test file ownership verification failed:');
  for (const finding of findings) console.error(`- ${JSON.stringify(finding)}`);
  process.exit(1);
}

console.log('Test file ownership verification passed. Every test file has exactly one primary verification owner.');
