import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import {
  verifyApplicationPayload,
  resolveApplicationPayloadRoot,
  resolveProductRoot,
} from '../../src/infrastructure/product-resources/index.mjs';
import { enrollProductInstallation, readCurrentInstallationOrigin } from '../../src/system/installation/module.mjs';
import { reportCliFailure, runCli } from '../../src/bootstrap/cli/main.ts';

Promise.resolve()
  .then(() => {
    const root = resolveApplicationPayloadRoot();
    if (root) {
      const verifiedPayload = verifyApplicationPayload(root, { readableOnly: true });
      const productRoot = resolveProductRoot();
      const origin = readCurrentInstallationOrigin(productRoot, { payloadRoot: root, payloadManifest: verifiedPayload.manifest });
      const formalEntryExpected = Boolean(process.env.BUILDR_NPM_ENTRY_PATH) || fs.existsSync(path.join(root, 'installation-origin.json'));
      if (formalEntryExpected && origin.channel !== 'npm') {
        throw new Error(`Formal npm Buildr entry has no application-payload-bound installation origin: ${(origin.blockingReasons || []).join('; ') || 'formal npm origin is missing'}.`);
      }
      if (origin.channel === 'npm') {
        const entryPath = process.env.BUILDR_NPM_ENTRY_PATH;
        if (!entryPath) throw new Error('Formal npm Buildr entry did not declare its explicit package entry path.');
        enrollProductInstallation({
          envelopePath: origin.receipt.file,
          productRoot,
          entryPath,
          runtimeExecutable: process.execPath,
          updateAuthority: null,
        });
      }
    }
    return runCli(process.argv);
  })
  .catch((error) => reportCliFailure(error, process.argv));
