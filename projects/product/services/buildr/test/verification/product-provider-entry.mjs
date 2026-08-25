#!/usr/bin/env node
import fs from 'node:fs';

import { createProductVerificationProvider } from '../../src/verification/application/product-verification-provider.mjs';
import { createVerificationPlan, createVerificationSelectionAudit } from './planner.mjs';

try {
  const input = JSON.parse(fs.readFileSync(0, 'utf8'));
  const provider = createProductVerificationProvider({
    providerId: input.providerId,
    providerIdentity: input.providerIdentity,
    createInternalPlan: createVerificationPlan,
    createSelectionAudit: createVerificationSelectionAudit,
  });
  process.stdout.write(`${JSON.stringify(provider.plan(input))}\n`);
} catch (error) {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
}
