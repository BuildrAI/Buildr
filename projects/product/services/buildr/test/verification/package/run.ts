#!/usr/bin/env node

import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  PACKAGE_VERIFIER_ENV,
  PACKAGE_VERIFIERS,
  selectPackageVerifiers,
} from '../../../src/agent-assets/application/package-maintenance/verification-registry.ts';

const productRoot: any = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const selector: any = process.argv[2];

function usage(stream: any = process.stdout): any  {
  stream.write('Usage: node test/verification/package/run.ts <selector>\n\n');
  stream.write('Selectors:\n');
  for (const step of PACKAGE_VERIFIERS) stream.write(`  ${step.id.padEnd(10)} ${step.name}\n`);
}

if (!selector || selector === '--help' || selector === '-h') {
  usage(selector ? process.stdout : process.stderr);
  process.exitCode = selector ? 0 : 2;
} else {
  try {
    selectPackageVerifiers(selector);
    const result: any = spawnSync(process.execPath, [path.join(productRoot, 'bin', 'buildr.mjs'), 'package', 'check'], {
      cwd: productRoot,
      env: { ...process.env, [PACKAGE_VERIFIER_ENV]: selector },
      encoding: 'utf8',
    });
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    process.exitCode = result.status ?? 1;
  } catch (error: any) {
    process.stderr.write(`${error.message}\n`);
    usage(process.stderr);
    process.exitCode = 2;
  }
}
