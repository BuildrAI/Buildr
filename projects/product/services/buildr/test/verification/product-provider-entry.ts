#!/usr/bin/env node
import fs from 'node:fs';

import { createProductVerificationProvider } from '../../src/verification/application/product-verification-provider.ts';
import { createVerificationPlan, createVerificationSelectionAudit } from './planner.ts';

try {
  const input: any = JSON.parse(fs.readFileSync(0, 'utf8'));
  const provider: any = createProductVerificationProvider({
    providerId: input.providerId,
    providerIdentity: input.providerIdentity,
    createInternalPlan: createVerificationPlan,
    createSelectionAudit: createVerificationSelectionAudit,
  });
  process.stdout.write(`${JSON.stringify(provider.plan(input))}\n`);
} catch (error: any) {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
}
