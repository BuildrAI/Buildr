#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { sameFilesystemPath } from '../../../src/infrastructure/filesystem/filesystem-path-identity.ts';
import { verifyApplicationPayload } from '../../../src/infrastructure/product-resources/index.ts';
import { resolveCandidateSourceCommit } from '../candidate-ci-evidence.ts';
import { executeVerificationCommand } from '../support/process-executor.ts';
import { createVerificationPhaseRecorder } from '../timing/phases.ts';
import { readSharedCandidatePackage } from './candidate-package.ts';

const serviceRoot = path.resolve(import.meta.dirname, '../../..');
export const CANDIDATE_BROWSER_SELECTORS = Object.freeze(['core']);

export function candidateBrowserWebRoot(candidate: any, payload: any, sourceCommit: string): string {
  if (!candidate?.manifest || candidate.manifest.sourceCommit !== sourceCommit) throw new Error('Candidate Browser requires the exact source-bound release artifact.');
  if (payload?.layout !== 'installed' || payload.manifest?.sourceCommit !== sourceCommit
    || payload.manifest?.applicationPayloadDigest !== candidate.manifest.applicationPayloadDigest) {
    throw new Error('Candidate Browser Web payload differs from the frozen artifact.');
  }
  return path.join(payload.root, 'payload/product/web-dist');
}

export async function runCandidateBrowser({
  candidate,
  sourceCommit,
  execute = executeVerificationCommand,
  verifyPayload = verifyApplicationPayload,
  env = process.env,
}: any): Promise<any> {
  if (!candidate?.manifest || candidate.manifest.sourceCommit !== sourceCommit) throw new Error('Candidate Browser requires the exact source-bound release artifact.');
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-candidate-browser-'));
  const phases = createVerificationPhaseRecorder('candidate-browser-core');
  const run = async (id: string, argv: string[], cwd: string, timeoutMs: number, extraEnv: any = {}) => {
    const result = await execute({ name: id, command: { argv, cwd, timeoutMs } }, { cwd, env: { ...env, ...extraEnv } });
    if (result.stdout && id !== 'archive-inventory') process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    if (result.status !== 'passed') throw new Error(`Candidate Browser ${id} failed: ${result.failureCode || result.exitCode}`);
    return result;
  };
  try {
    await phases.run('artifact-unpack', async () => {
      const inventory = await run('archive-inventory', ['tar', '-tzf', candidate.tarball], temporaryRoot, 30_000);
      const paths = String(inventory.stdout).split(/\r?\n/u).filter(Boolean);
      if (paths.length === 0 || paths.some(entry => !entry.startsWith('package/') || path.posix.normalize(entry).replace(/\/$/u, '') !== entry.replace(/\/$/u, '') || entry.includes('\\'))) {
        throw new Error('Candidate Browser archive contains an invalid package path.');
      }
      await run('archive-extract', ['tar', '-xzf', candidate.tarball, '-C', temporaryRoot], temporaryRoot, 30_000);
    });
    const webDistRoot = await phases.run('artifact-verify', async () => candidateBrowserWebRoot(candidate,
      verifyPayload(path.join(temporaryRoot, 'package'), { layout: 'installed' }), sourceCommit));
    const plan = { schemaVersion: 'buildr.browser-selector-plan/v1', status: 'selected', mode: 'candidate-artifact', selectors: [...CANDIDATE_BROWSER_SELECTORS], paths: [] };
    process.stdout.write(`${JSON.stringify({ scope: 'candidate-browser', sourceCommit, artifact: candidate.manifest.sha256, applicationPayloadDigest: candidate.manifest.applicationPayloadDigest, selectors: plan.selectors })}\n`);
    await phases.run('browser:core', () => run('browser:core', [process.execPath,
      path.join(serviceRoot, 'tools/development/run-isolated-workspace-smoke.ts'), '--script',
      path.join(serviceRoot, 'test/browser-smoke/buildr-web-browser.test.ts'), '--', 'core'], serviceRoot, 300_000, { BUILDR_BROWSER_WEB_DIST_ROOT: webDistRoot, BUILDR_BROWSER_SELECTOR_PLAN_JSON: JSON.stringify(plan) }));
    return { status: 'passed', selectors: [...CANDIDATE_BROWSER_SELECTORS], sourceCommit, artifact: candidate.manifest.sha256, webDistRoot };
  } finally {
    await phases.run('artifact-cleanup', async () => fs.rmSync(temporaryRoot, { recursive: true, force: true }));
    phases.emit();
  }
}

async function main(): Promise<void> {
  if (process.argv.slice(2).join(' ') !== '--selector core') throw new Error('Candidate Browser accepts only --selector core.');
  const candidate = readSharedCandidatePackage();
  const sourceCommit = resolveCandidateSourceCommit(serviceRoot, process.env.BUILDR_CANDIDATE_SOURCE_SHA || null);
  // The source harness provides isolated fixtures and HTTP hosting. Only the Web
  // bytes come from the Candidate; installed CLI/runtime behavior has separate owners.
  await runCandidateBrowser({ candidate, sourceCommit });
}

if (process.argv[1] && sameFilesystemPath(process.argv[1], fileURLToPath(import.meta.url))) {
  main().catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
