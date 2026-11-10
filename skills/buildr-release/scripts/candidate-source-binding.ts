import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { assertReleaseExecutorRecoverySource, releaseExecutionCommit } from './release-executor-recovery.ts';
import { BUILD_INPUT_POLICY, assertBuildInputPolicy, verificationOnlyPath } from './build-input-policy.ts';
export { releaseBuildInputPaths, verificationOnlyPath } from './build-input-policy.ts';

export const CANDIDATE_SOURCE_BINDING_SCHEMA = 'buildr.candidate-source-binding/v2';
const LEGACY_BINDING_SCHEMA = 'buildr.candidate-source-binding/v1';
const sha = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u;
const prefix = 'projects/product/services/buildr/';
const digest = (value: unknown) => 'sha256-' + crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const gitRead = (repo: string, args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
import { readGitSourceInventory, type GitSourceEntry } from '../../../projects/product/services/buildr/test/verification/candidate-check-inputs.ts';
export { readGitSourceInventory, candidateCheckInputIdentity, createCandidateCheckInputReader, type GitSourceEntry } from '../../../projects/product/services/buildr/test/verification/candidate-check-inputs.ts';

export function createCandidateSourceBinding(repo: string, productSource: string, verificationSource: string, policy: any = BUILD_INPUT_POLICY): any {
  if (policy !== null) assertBuildInputPolicy(policy);
  const original = readGitSourceInventory(repo, productSource), current = readGitSourceInventory(repo, verificationSource);
  const buildInputs = (entries: GitSourceEntry[]) => entries.filter(entry => !verificationOnlyPath(entry.path, policy ?? BUILD_INPUT_POLICY));
  const previous = buildInputs(original), next = buildInputs(current);
  if (!previous.some(entry => entry.path === prefix + 'package.json')) throw new Error('Candidate product source has no package identity.');
  if (digest(previous) !== digest(next)) {
    const before = new Map(previous.map(entry => [entry.path, JSON.stringify(entry)]));
    const after = new Map(next.map(entry => [entry.path, JSON.stringify(entry)]));
    const changedPaths = [...new Set([...before.keys(), ...after.keys()])].filter(file => before.get(file) !== after.get(file)).sort();
    throw Object.assign(new Error('Candidate build inputs changed; the affected package requires a new build.'), { code: 'candidate-build-inputs-changed', changedPaths });
  }
  const binding = { schemaVersion: policy === null ? LEGACY_BINDING_SCHEMA : CANDIDATE_SOURCE_BINDING_SCHEMA,
    ...(policy === null ? {} : { inputPolicy: BUILD_INPUT_POLICY }), productSource,
    productTree: gitRead(repo, ['rev-parse', productSource + '^{tree}']).trim(), verificationSource,
    verificationTree: gitRead(repo, ['rev-parse', verificationSource + '^{tree}']).trim(),
    buildInputsIdentity: digest(previous) };
  return { ...binding, identity: digest(binding) };
}

export function assertCandidateSourceBinding(repo: string, binding: any): void {
  validateCandidateSourceBindingValue(binding);
  if (!isDeepStrictEqual(createCandidateSourceBinding(repo, binding.productSource, binding.verificationSource,
    binding.schemaVersion === LEGACY_BINDING_SCHEMA ? null : binding.inputPolicy), binding)) {
    throw new Error('Candidate source binding differs from actual Git inputs.');
  }
}

export function validateCandidateSourceBindingValue(value: any): any {
  const legacy = value?.schemaVersion === LEGACY_BINDING_SCHEMA;
  const fields = ['schemaVersion', 'productSource', 'productTree', 'verificationSource', 'verificationTree', 'buildInputsIdentity', 'identity',
    ...(legacy ? [] : ['inputPolicy'])];
  if (!value || Object.keys(value).length !== fields.length || fields.some(key => !Object.hasOwn(value, key))
    || ![CANDIDATE_SOURCE_BINDING_SCHEMA, LEGACY_BINDING_SCHEMA].includes(value.schemaVersion)
    || !['productSource', 'productTree', 'verificationSource', 'verificationTree'].every(key => sha.test(value[key] ?? ''))
    || !/^sha256-[a-f0-9]{64}$/u.test(value.buildInputsIdentity ?? '')) throw new Error('Candidate source binding schema is invalid.');
  if (!legacy) assertBuildInputPolicy(value.inputPolicy);
  const binding = { schemaVersion: value.schemaVersion, ...(legacy ? {} : { inputPolicy: BUILD_INPUT_POLICY }), productSource: value.productSource, productTree: value.productTree,
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
