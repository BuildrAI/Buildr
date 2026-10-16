import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { assertReleaseExecutorRecoverySource, releaseExecutionCommit } from './release-executor-recovery.ts';

export const CANDIDATE_SOURCE_BINDING_SCHEMA = 'buildr.candidate-source-binding/v1';
const sha = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u;
const prefix = 'projects/product/services/buildr/';

export function verificationOnlyPath(file: string): boolean {
  // A repair runs the original controlled workflow with a separate checkout.
  // Changing that workflow requires its own fresh infrastructure acceptance.
  if (/^projects\/product\/(?:knowledge|openspec|tasks)\//u.test(file)) return true;
  if (!file.startsWith(prefix)) return false;
  const relative = file.slice(prefix.length);
  // Test Context is itself a public package export; the package producer and
  // build/prepare tooling are build inputs, even though used by verification.
  if (relative.startsWith('test/') && !relative.startsWith('test/context/') && relative !== 'test/verification/release/candidate-package.ts') return true;
  return /^tools\/release\//u.test(relative)
    && !/^tools\/release\/(?:application-payload|release-artifact|release-contract|release-notes)(?:[./-]|$)/u.test(relative);
}

export type GitSourceEntry = { path: string; mode: string; kind: string; object: string };
const digest = (value: unknown) => 'sha256-' + crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const gitRead = (repo: string, args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });

export function readGitSourceInventory(repo: string, commit: string): GitSourceEntry[] {
  if (!sha.test(commit)) throw new Error('Candidate source binding requires exact commit identities.');
  return gitRead(repo, ['ls-tree', '-r', '-z', '--full-tree', commit]).split('\0').filter(Boolean).map(line => {
    const tab = line.indexOf('\t'), [mode, kind, object] = line.slice(0, tab).split(' ');
    if (tab < 0 || !mode || !kind || !object) throw new Error('Candidate source inventory is invalid.');
    return { path: line.slice(tab + 1), mode, kind, object };
  }).sort((a, b) => a.path.localeCompare(b.path));
}

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

/** A check's executable recipe is compared in both snapshots. Dynamic readers
 * conservatively bind all verification inputs; production bytes bind separately. */
export function candidateCheckInputIdentity(repo: string, commit: string, step: any, reader?: { inventory: (commit: string) => GitSourceEntry[]; blob: (commit: string, file: string) => string }): string {
  const entries = reader?.inventory(commit) ?? readGitSourceInventory(repo, commit), byPath = new Map(entries.map(entry => [entry.path, entry]));
  const selected = new Set<string>(), visited = new Set<string>(), pending: string[] = [];
  const add = (file: string) => { selected.add(file); if (!visited.has(file)) { visited.add(file); pending.push(file); } };
  // These entrypoints discover files at runtime instead of listing them in argv.
  // Bind the complete discovered family (including currently excluded files),
  // then follow its imports; an added or changed test must revoke old proof.
  const discoveredFamily = step.executor?.file === 'test/verification/integration.ts' ? 'test/integration/'
    : step.executor?.file === 'test/verification/system.ts' ? 'test/system/' : null;
  for (const entry of entries) {
    const relative = entry.path.startsWith(prefix) ? entry.path.slice(prefix.length) : '';
    if (!verificationOnlyPath(entry.path)) selected.add(entry.path);
    if (/^test\/(?:helpers|context|fixtures)\//u.test(relative) || /^test\/verification\/(?:timing|support)\//u.test(relative)) selected.add(entry.path);
    if (/^test\/verification\/(?:executor|plan-runner|dag-scheduler|resource-coordinator|worker-budget|verification-reuse|verification-inputs|candidate-repair|candidate-ci|test-files)\.ts$/u.test(relative)) selected.add(entry.path);
    const selectors = [...(step.executor?.files ?? []), ...(step.executor?.args ?? []).filter((argument: string) => argument.startsWith('test/'))];
    if (selectors.some((pattern: string) => path.matchesGlob(relative, pattern))) add(entry.path);
    if (discoveredFamily && relative.startsWith(discoveredFamily) && /\.test\.[cm]?[jt]sx?$/u.test(relative)) add(entry.path);
  }
  if (step.executor?.file) add(prefix + step.executor.file);
  // The descriptor binds selection, execution dependencies, limits and resources.
  let conservative = !step.executor?.file && !step.executor?.files?.length;
  while (pending.length) {
    const file = pending.pop()!;
    if (!byPath.has(file) || !verificationOnlyPath(file) || !/\.[cm]?[jt]sx?$/u.test(file)) continue;
    const text = reader?.blob(commit, file) ?? gitRead(repo, ['show', commit + ':' + file]);
    const catalog = /\/test\/(?:verification|context)\/(?:registry|ownership|system-suites|profiles|dispositions)\.ts$/u.test(file);
    for (const match of catalog ? [] : text.matchAll(/['"]((?:test|tools)\/[^'"\n]+\.[cm]?[jt]sx?)['"]/gu)) {
      const child = prefix + match[1]!;
      if (byPath.has(child)) add(child); else conservative = true;
    }
    if (/\b(?:import|require)\s*\(\s*(?!['"\s])(?:[a-zA-Z_$])/u.test(text)) conservative = true;
    for (const match of text.matchAll(/\b(?:from\s*|import\s*\(?\s*|require\s*\(\s*)['"]([^'"\n]+)['"]/gu)) {
      if (!match[1]!.startsWith('.')) continue;
      const relative = path.posix.normalize(path.posix.join(path.posix.dirname(file), match[1]!));
      if (byPath.has(relative)) add(relative); else if (!relative.includes('/build/')) conservative = true;
    }
  }
  if (conservative) for (const entry of entries) selected.add(entry.path);
  return digest({ version: 1, descriptor: { id: step.id, executor: step.executor, dependsOn: step.dependsOn,
    contexts: step.contexts, timeoutMs: step.timeoutMs, resources: step.resources, resourceDemand: step.resourceDemand, concurrencyClass: step.concurrencyClass, executionProfile: step.executionProfile },
    entries: [...selected].sort().map(file => byPath.get(file) ?? { path: file, absent: true }) });
}

export function createCandidateCheckInputReader(repo: string): (commit: string, step: any) => string {
  const inventories = new Map<string, GitSourceEntry[]>(), blobs = new Map<string, string>();
  const reader = {
    inventory(commit: string) { if (!inventories.has(commit)) inventories.set(commit, readGitSourceInventory(repo, commit)); return inventories.get(commit)!; },
    blob(commit: string, file: string) { const key = commit + ':' + file; if (!blobs.has(key)) blobs.set(key, gitRead(repo, ['show', key])); return blobs.get(key)!; },
  };
  return (commit, step) => candidateCheckInputIdentity(repo, commit, step, reader);
}
