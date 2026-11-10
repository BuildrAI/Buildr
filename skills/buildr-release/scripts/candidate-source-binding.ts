import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { assertReleaseExecutorRecoverySource, releaseExecutionCommit } from './release-executor-recovery.ts';

export const CANDIDATE_SOURCE_BINDING_SCHEMA = 'buildr.candidate-source-binding/v1';
const sha = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u;
const prefix = 'projects/product/services/buildr/';
const digest = (value: unknown) => 'sha256-' + crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const gitRead = (repo: string, args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
const releaseScripts = 'skills/buildr-release/scripts/';
export const releaseBuildInputPaths = new Set([
  'skills/buildr-release/scripts/package.json',
  ...['candidate-package', 'application-payload', 'application-payload-entry', 'mysql-connection-entry',
    'release-artifact', 'release-files', 'release-contract', 'release-notes'].map(name => `${releaseScripts}${name}.ts`),
  `${releaseScripts}dsh-plugin/release.ts`,
]);

export function verificationOnlyPath(file: string): boolean {
  // A repair runs the original controlled workflow with a separate checkout.
  // Changing that workflow requires its own fresh infrastructure acceptance.
  if (/^projects\/product\/(?:knowledge|openspec|tasks)\//u.test(file)) return true;
  if (file.startsWith('skills/buildr-release/')) return !releaseBuildInputPaths.has(file);
  // The Web Service's test fixtures are verifier inputs, not Vite or package inputs.
  if (file.startsWith('projects/product/services/buildr-web/test/')) return true;
  if (!file.startsWith(prefix)) return false;
  const relative = file.slice(prefix.length);
  // Test Context is itself a public package export; the package producer and
  // build/prepare tooling are build inputs, even though used by verification.
  if (relative.startsWith('test/') && !relative.startsWith('test/context/') && relative !== 'test/verification/release/candidate-package.ts') return true;
  return /^tools\/release\//u.test(relative)
    && !/^tools\/release\/(?:application-payload|release-artifact|release-contract|release-notes)(?:[./-]|$)/u.test(relative);
}

import { readGitSourceInventory, type GitSourceEntry } from '../../../projects/product/services/buildr/test/verification/candidate-check-inputs.ts';
export { readGitSourceInventory, candidateCheckInputIdentity, createCandidateCheckInputReader, type GitSourceEntry } from '../../../projects/product/services/buildr/test/verification/candidate-check-inputs.ts';

export function createCandidateSourceBinding(repo: string, productSource: string, verificationSource: string): any {
  const original = readGitSourceInventory(repo, productSource), current = readGitSourceInventory(repo, verificationSource);
  const buildInputs = (entries: GitSourceEntry[]) => entries.filter(entry => !verificationOnlyPath(entry.path));
  const previous = buildInputs(original), next = buildInputs(current);
  if (!previous.some(entry => entry.path === prefix + 'package.json')) throw new Error('Candidate product source has no package identity.');
  if (digest(previous) !== digest(next)) {
    const before = new Map(previous.map(entry => [entry.path, JSON.stringify(entry)]));
    const after = new Map(next.map(entry => [entry.path, JSON.stringify(entry)]));
    const changedPaths = [...new Set([...before.keys(), ...after.keys()])].filter(file => before.get(file) !== after.get(file)).sort();
    throw Object.assign(new Error('Candidate build inputs changed; the affected package requires a new build.'), { code: 'candidate-build-inputs-changed', changedPaths });
  }
  const binding = { schemaVersion: CANDIDATE_SOURCE_BINDING_SCHEMA, productSource,
    productTree: gitRead(repo, ['rev-parse', productSource + '^{tree}']).trim(), verificationSource,
    verificationTree: gitRead(repo, ['rev-parse', verificationSource + '^{tree}']).trim(),
    buildInputsIdentity: digest(previous) };
  return { ...binding, identity: digest(binding) };
}

export function assertCandidateSourceBinding(repo: string, binding: any): void {
  if (!isDeepStrictEqual(createCandidateSourceBinding(repo, binding?.productSource, binding?.verificationSource), binding)) {
    throw new Error('Candidate source binding differs from actual Git inputs.');
  }
}

export function validateCandidateSourceBindingValue(value: any): any {
  const fields = ['schemaVersion', 'productSource', 'productTree', 'verificationSource', 'verificationTree', 'buildInputsIdentity', 'identity'];
  if (!value || Object.keys(value).length !== fields.length || fields.some(key => !Object.hasOwn(value, key))
    || value.schemaVersion !== CANDIDATE_SOURCE_BINDING_SCHEMA
    || !['productSource', 'productTree', 'verificationSource', 'verificationTree'].every(key => sha.test(value[key] ?? ''))
    || !/^sha256-[a-f0-9]{64}$/u.test(value.buildInputsIdentity ?? '')) throw new Error('Candidate source binding schema is invalid.');
  const binding = { schemaVersion: CANDIDATE_SOURCE_BINDING_SCHEMA, productSource: value.productSource, productTree: value.productTree,
    verificationSource: value.verificationSource, verificationTree: value.verificationTree, buildInputsIdentity: value.buildInputsIdentity };
  if (value.identity !== digest(binding)) throw new Error('Candidate source binding integrity differs.');
  return { ...binding, identity: value.identity };
}

export function releaseExecutionSource(repo: string, context: any): string {
  // Candidate verification is evidence provenance, not publisher authority.
  // A repaired check never selects code that will receive production credentials.
  assertReleaseExecutorRecoverySource(context, { repo });
  const executor = releaseExecutionCommit(context);
  if (!sha.test(executor ?? '')) throw new Error('Release protected executor source is invalid.');
  const binding = context?.verification;
  if (!binding) return executor;
  validateCandidateSourceBindingValue(binding);
  assertCandidateSourceBinding(repo, binding);
  if (binding.productSource !== context.release?.sourceCommit || binding.productTree !== context.release?.sourceTree
    || binding.productSource !== context.artifact?.sourceCommit) throw new Error('Release execution source is not bound to the original package.');
  return executor;
}

export function assertReleaseExecutionCheckout(repo: string, context: any): void {
  if (gitRead(repo, ['rev-parse', 'HEAD']).trim() !== releaseExecutionSource(repo, context)) throw new Error('Release executor checkout differs from the protected publisher source.');
}
