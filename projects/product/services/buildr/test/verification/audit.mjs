#!/usr/bin/env node

import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { collectChangedProductPaths } from './changed-paths.mjs';
import {
  auditDailyCoreReleaseEvidence,
  createVerificationEvidenceMap,
  createVerificationPlan,
  createVerificationSelectionAudit,
  estimateVerificationPlan,
} from './planner.mjs';
import { resolveVerificationExecutionProfile } from './registry.mjs';

const productRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const projectRoot = path.resolve(productRoot, '../..');

function parseArgs(args) {
  const result = { base: null, head: null, paths: [] };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--base' || arg === '--head') {
      if (!args[index + 1] || args[index + 1].startsWith('-')) throw new Error(`Missing value for ${arg}`);
      result[arg.slice(2)] = args[index + 1];
      index += 1;
    } else if (arg === '--help' || arg === '-h') return { help: true };
    else if (arg.startsWith('-')) throw new Error(`Unknown verification audit option: ${arg}`);
    else result.paths.push(arg);
  }
  if (result.paths.length > 0 && (result.base || result.head)) throw new Error('Git base/head cannot be combined with explicit paths');
  if (result.head && !result.base) throw new Error('--head requires --base');
  return result;
}

try {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write('Usage: npm run test:audit:verification -- [--base <ref> [--head <ref>]] [path ...]\n');
  } else {
    const changed = collectChangedProductPaths({
      productRoot,
      projectRoot,
      base: args.base,
      head: args.head,
      explicitPaths: args.paths,
    });
    const plan = createVerificationPlan({
      paths: changed.paths,
      versionOnlyPackagePaths: changed.versionOnlyPackagePaths,
      selectionOnlyPaths: changed.selectionOnlyPaths,
      selectionReasons: changed.selectionReasons,
    });
    const executionProfile = resolveVerificationExecutionProfile(process.env.BUILDR_VERIFICATION_PROFILE);
    const output = {
      schemaVersion: 'buildr.verification-cost-audit/v1',
      status: plan.status,
      source: changed.source,
      base: changed.base,
      head: changed.head,
      paths: changed.paths,
      selection: createVerificationSelectionAudit(plan),
      estimate: estimateVerificationPlan(plan, { concurrency: executionProfile.limits }),
      primaryEvidence: createVerificationEvidenceMap(),
      releaseEvidence: auditDailyCoreReleaseEvidence(),
      diagnostic: plan.diagnostic,
    };
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    if (plan.status === 'blocked' || !output.primaryEvidence.ok || !output.releaseEvidence.ok) process.exitCode = 1;
  }
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 2;
}
