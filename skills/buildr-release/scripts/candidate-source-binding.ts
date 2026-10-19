import { discoveredVerificationFiles, literalUrlImports, verificationEntryFiles } from '../../../projects/product/services/buildr/test/verification/verification-input-discovery.ts';
import { createVerificationSourceInputReader, verificationInputSourceFromGit } from '../../../projects/product/services/buildr/test/verification/verification-source-inputs.ts';
import { verificationStepExecutionInputs } from '../../../projects/product/services/buildr/test/verification/registry.ts';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { assertReleaseExecutorRecoverySource, releaseExecutionCommit } from './release-executor-recovery.ts';

export const CANDIDATE_SOURCE_BINDING_SCHEMA = 'buildr.candidate-source-binding/v1';
const sha = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u;
const prefix = 'projects/product/services/buildr/';
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

type CandidateInputReader = { inventory: (commit: string) => GitSourceEntry[]; blob: (commit: string, file: string) => string };

function checkSource(repo: string, commit: string, reader?: CandidateInputReader, legacyDeclarations = false) {
  const inventory = reader?.inventory(commit);
  const objects = inventory && new Map(inventory.map(entry => [entry.object, entry.path]));
  const source = inventory && verificationInputSourceFromGit(inventory.map(entry => ({ ...entry, file: entry.path })),
    object => Buffer.from(reader!.blob(commit, objects!.get(object)!)));
  return createVerificationSourceInputReader(repo, path.join(repo, prefix), commit, source, { legacyDeclarations });
}

function checkIdentity(source: ReturnType<typeof checkSource>, step: any, legacyExecution = false): string {
  const inputs = source.inputs({ ...step, reuse: step.reuse || { scope: 'repository' } }, true);
  if (inputs.unavailable) throw new Error('Candidate check inputs include unavailable source bytes.');
  return digest({ version: 3, descriptor: { id: step.id, executor: step.executor, dependsOn: step.dependsOn,
    contexts: step.contexts, timeoutMs: step.timeoutMs, resources: step.resources, resourceDemand: step.resourceDemand,
    concurrencyClass: step.concurrencyClass, executionProfile: legacyExecution ? step.executionProfile : verificationStepExecutionInputs(step), scope: step.reuse?.scope ?? 'repository' }, inputs });
}

/** Candidate transport uses the same normalized bytes, scopes and executable
 * dependency selection as local reuse; platform and package checks stay separate. */
export function candidateCheckInputIdentity(repo: string, commit: string, step: any, reader?: { inventory: (commit: string) => GitSourceEntry[]; blob: (commit: string, file: string) => string }): string {
  // Explicit byte readers already supply repository-relative fixture inputs.
  // Native Git accepts a service cwd, but source paths below require its root.
  if (!reader) repo = gitRead(repo, ['rev-parse', '--show-toplevel']).trim();
  return checkIdentity(checkSource(repo, commit, reader), step);
}

function legacyVerificationOnlyPath(file: string): boolean {
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


/** Authentication of historical v2 evidence only. Never emits new evidence or
 * decides present-day applicability: both snapshots must match the shared model. */
function legacyCandidateCheckInputIdentity(repo: string, commit: string, step: any, reader: CandidateInputReader): string {
  const entries = reader?.inventory(commit) ?? readGitSourceInventory(repo, commit), byPath = new Map(entries.map(entry => [entry.path, entry]));
  const selected = new Set<string>(), visited = new Set<string>(), pending: string[] = [];
  const add = (file: string) => { selected.add(file); if (!visited.has(file)) { visited.add(file); pending.push(file); } };
  for (const entry of entries) {
    const relative = entry.path.startsWith(prefix) ? entry.path.slice(prefix.length) : '';
    if (!legacyVerificationOnlyPath(entry.path)) selected.add(entry.path);
    if (/^test\/(?:helpers|context|fixtures)\//u.test(relative) || /^test\/verification\/(?:timing|support)\//u.test(relative)) selected.add(entry.path);
    if (/^test\/verification\/(?:executor|plan-runner|dag-scheduler|resource-coordinator|worker-budget|verification-reuse|verification-inputs|candidate-repair|candidate-ci|test-files|verification-input-discovery)\.ts$/u.test(relative)) selected.add(entry.path);
    const selectors = [...(step.executor?.files ?? []), ...(step.executor?.args ?? []).filter((argument: string) => argument.startsWith('test/'))];
    if (selectors.some((pattern: string) => path.matchesGlob(relative, pattern))) add(entry.path);
  }
  const family = step.executor?.file === 'test/verification/system.ts' ? 'test/system/'
    : step.executor?.file === 'test/verification/integration.ts' ? 'test/integration/' : null;
  const inventory = family ? entries.filter(entry => entry.path.startsWith(prefix + family) && /\.test\.[cm]?[jt]sx?$/u.test(entry.path)).map(entry => entry.path.slice(prefix.length)).sort() : [];
  const discovery = { selected: family ? step.executor.discoveredFiles ?? inventory : [], inventory };
  for (const file of discovery.selected) add(prefix + file);
  for (const file of verificationEntryFiles(step.executor ?? {})) add(path.posix.normalize(prefix + file));
  // The descriptor binds selection, execution dependencies, limits and resources.
  let conservative = verificationEntryFiles(step.executor ?? {}).length === 0 && !step.executor?.files?.length;
  while (pending.length) {
    const file = pending.pop()!;
    if (!byPath.has(file) || !legacyVerificationOnlyPath(file) || !/\.[cm]?[jt]sx?$/u.test(file)) continue;
    const text = reader?.blob(commit, file) ?? gitRead(repo, ['show', commit + ':' + file]);
    const urls = literalUrlImports(text);
    for (const target of urls.imports) {
      const relative = path.posix.normalize(path.posix.join(path.posix.dirname(file), target));
      if (byPath.has(relative)) add(relative); else conservative = true;
    }
    const catalog = /\/test\/(?:verification|context)\/(?:registry|ownership|system-suites|profiles|dispositions)\.ts$/u.test(file);
    for (const match of catalog ? [] : text.matchAll(/['"]((?:test|tools)\/[^'"\n]+\.[cm]?[jt]sx?)['"]/gu)) {
      const child = prefix + match[1]!;
      if (byPath.has(child)) add(child); else conservative = true;
    }
    if (/\b(?:import|require)\s*\(\s*(?!['"\s])(?:[a-zA-Z_$])/u.test(urls.remainder)) conservative = true;
    for (const match of text.matchAll(/\b(?:from\s*|import\s*\(?\s*|require\s*\(\s*)['"]([^'"\n]+)['"]/gu)) {
      if (!match[1]!.startsWith('.')) continue;
      const relative = path.posix.normalize(path.posix.join(path.posix.dirname(file), match[1]!));
      if (byPath.has(relative)) add(relative); else if (!relative.includes('/build/')) conservative = true;
    }
  }
  if (conservative) for (const entry of entries) selected.add(entry.path);
  return digest({ version: 2, discoveredMembers: discovery.inventory, descriptor: { id: step.id, executor: step.executor, dependsOn: step.dependsOn,
    contexts: step.contexts, timeoutMs: step.timeoutMs, resources: step.resources, resourceDemand: step.resourceDemand, concurrencyClass: step.concurrencyClass, executionProfile: step.executionProfile },
    entries: [...selected].sort().map(file => byPath.get(file) ?? { path: file, absent: true }) });
}

export function createCandidateCheckInputReader(repo: string) {
  // Resolve once per reader, not once per check or historical source snapshot.
  repo = gitRead(repo, ['rev-parse', '--show-toplevel']).trim();
  const inventories = new Map<string, GitSourceEntry[]>(), blobs = new Map<string, string>();
  const reader = {
    inventory(commit: string) { if (!inventories.has(commit)) inventories.set(commit, readGitSourceInventory(repo, commit)); return inventories.get(commit)!; },
    blob(commit: string, file: string) { const key = commit + ':' + file; if (!blobs.has(key)) blobs.set(key, gitRead(repo, ['show', key])); return blobs.get(key)!; },
  };
  const sources = new Map<string, ReturnType<typeof checkSource>>();
  const legacySources = new Map<string, ReturnType<typeof checkSource>>();
  const current = (commit: string, step: any) => {
    if (!sources.has(commit)) sources.set(commit, checkSource(repo, commit));
    return checkIdentity(sources.get(commit)!, step);
  };
  return Object.assign(current, { matches(commit: string, step: any, identity: string): boolean {
    // Prior v3 records included all CI queue limits. Authenticate their original
    // digest before today's per-check execution policy compares applicability.
    if (current(commit, step) === identity) return true;
    if (checkIdentity(sources.get(commit)!, step, true) === identity) return true;
    if (!legacySources.has(commit)) legacySources.set(commit, checkSource(repo, commit, undefined, true));
    if ([false, true].some(legacy => checkIdentity(legacySources.get(commit)!, step, legacy) === identity)) return true;
    return legacyCandidateCheckInputIdentity(repo, commit, step, reader) === identity;
  } });
}
