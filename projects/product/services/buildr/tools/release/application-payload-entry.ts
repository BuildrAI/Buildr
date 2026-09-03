import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import {
  verifyApplicationPayload,
  resolveApplicationPayloadRoot,
  resolveProductRoot,
} from '../../src/infrastructure/product-resources/index.ts';
import { enrollProductInstallation, readCurrentInstallationOrigin } from '../../src/system/installation/module.ts';
import { reportCliFailure, runCli } from '../../src/bootstrap/cli/main.ts';

Promise.resolve()
  .then(() => {
    const root: any = resolveApplicationPayloadRoot();
    if (root) {
      const verifiedPayload: any = verifyApplicationPayload(root, { readableOnly: true });
      const productRoot: any = resolveProductRoot();
      const origin: any = readCurrentInstallationOrigin(productRoot, { payloadRoot: root, payloadManifest: verifiedPayload.manifest });
      const formalEntryExpected: any = Boolean(process.env.BUILDR_NPM_ENTRY_PATH) || fs.existsSync(path.join(root, 'installation-origin.json'));
      if (formalEntryExpected && origin.channel !== 'npm') {
        throw new Error(`Formal npm Buildr entry has no application-payload-bound installation origin: ${(origin.blockingReasons || []).join('; ') || 'formal npm origin is missing'}.`);
      }
      if (origin.channel === 'npm') {
        const entryPath: any = process.env.BUILDR_NPM_ENTRY_PATH;
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
  .catch((error: any) => reportCliFailure(error, process.argv));
