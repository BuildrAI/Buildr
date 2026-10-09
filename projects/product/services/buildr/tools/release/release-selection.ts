#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { parseArguments } from './release-files.ts';
import { releaseSelectionKey, resolveReleaseExecutionBinding, validateReleaseExecutionBinding } from './release-execution-binding.ts';
import { validateReleaseTransactionEvidence } from './release-transaction-evidence.ts';
import { normalizeReleaseTargets } from './release-targets.ts';
import { validatePackagePublicationEvidence } from './release-package-evidence.ts';

export { releaseSelectionKey } from './release-execution-binding.ts';

export const releaseSelectionSchema: any = 'buildr.release-selection/v1';
export const releaseSelectionSchemaVersion: any = releaseSelectionSchema;
const SHA: any = /^[0-9a-f]{40}$/u;
const VERSION: any = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u;

function executeGit(command: any, args: any, options: any = {}): any  {
  return spawnSync(command, args, { cwd: options.cwd, encoding: 'utf8', windowsHide: true, input: options.input, timeout: 30_000 });
}

function runGit(args: any, repo: any, dependencies: any, { allowFailure = false, input }: any = {}): any  {
  const result: any = (dependencies.execute ?? executeGit)('git', args, { cwd: repo, input });
  if (result?.error) throw new Error(`git ${args.join(' ')} failed to start: ${result.error.message}`);
  if (!allowFailure && result?.status !== 0) {
    const detail: any = [result?.stdout, result?.stderr].filter(Boolean).join('\n').trim();
    throw new Error(`git ${args.join(' ')} failed${detail ? `: ${detail}` : ''}`);
  }
  return { status: result?.status ?? 1, stdout: String(result?.stdout ?? ''), stderr: String(result?.stderr ?? '') };
}

function requiredVersion(value: any): any  {
  if (!VERSION.test(value ?? '')) throw new Error('Release version must be a valid semantic version without the leading v.');
  return value;
}

function branchFor(key: any): any  {
  return `release-${key}`;
}

function lifecycleRef(key: any, state: any): any  {
  return `refs/buildr/release/${key}/${state}`;
}

function freezeHistoryRef(version: any, generation: any): any  {
  if (!Number.isSafeInteger(generation) || generation < 0) throw new Error('Release freeze generation must be a non-negative integer.');
  return `${lifecycleRef(version, 'freezes')}/${generation}`;
}

function resolveCommit(ref: any, repo: any, dependencies: any, { allowFailure = false }: any = {}): any  {
  const result: any = runGit(['rev-parse', '--verify', `${ref}^{commit}`], repo, dependencies, { allowFailure: true });
  const commit: any = result.stdout.trim();
  if (result.status !== 0 || !SHA.test(commit)) {
    if (allowFailure) return null;
    throw new Error(`Git commit is unavailable: ${ref}`);
  }
  return commit;
}

function refExists(ref: any, repo: any, dependencies: any): any  {
  return runGit(['for-each-ref', '--format=%(refname)', ref], repo, dependencies).stdout.trim().split(/\r?\n/u).includes(ref);
}

function readRefPresence(refs: string[], repo: any, dependencies: any): Set<string> {
  // for-each-ref patterns also match child refs. Membership must use the full
  // returned ref name; a child must never prove that its parent exists.
  return new Set(runGit(['for-each-ref', '--format=%(refname)', ...refs], repo, dependencies).stdout.trim().split(/\r?\n/u));
}

function cleanWorktree(repo: any, dependencies: any): any  {
  const result: any = runGit(['status', '--porcelain=v1', '--untracked-files=all'], repo, dependencies);
  if (result.stdout.trim()) throw new Error('Release selection requires a clean worktree.');
}

function requireExecutionBinding(options: any, repo: any): any  {
  const current = options.executionBinding ?? (options.workspace ? resolveReleaseExecutionBinding({ version: options.version, selectionId: options.selectionId, workspace: options.workspace, repo }) : null);
  if (!current) throw new Error('Release Git mutation requires a canonical Workspace and matching Task Worktree.');
  const binding: any = validateReleaseExecutionBinding(current, { repo });
  if (releaseSelectionKey(binding) !== releaseSelectionKey(options)) throw new Error('Release execution binding selectionId does not match the requested selection.');
  if (binding.version !== (options.version ?? null)) throw new Error(`Release execution binding version ${binding.version} does not match ${options.version ?? null}.`);
  return binding;
}

function normalizedTargets(value: any, selectionId: string): any {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Array.isArray(value.packages) || !value.versions) throw new Error('Release selection targets are invalid.');
  const normalized = normalizeReleaseTargets({ packages: value.packages.join(','), version: value.versions.buildr,
    pluginVersion: value.versions['dsh-plugin'], selectionId: value.selectionId });
  if (normalized.selectionId !== selectionId || JSON.stringify(normalized) !== JSON.stringify(value)) throw new Error('Release selection targets are not the exact normalized target binding.');
  return normalized;
}

/** Read the immutable target object from the existing selection ref family. Never writes. */
function readTargets(options: any, key: string, repo: string, dependencies: any, presence?: Set<string>): any {
  const ref = lifecycleRef(key, 'targets');
  if (!(presence === undefined ? refExists(ref, repo, dependencies) : presence.has(ref))) {
    if (options.selectionId !== undefined && key !== options.version) throw new Error('Release selection immutable targets ref is missing.');
    const version = requiredVersion(options.version);
    if (options.targets !== undefined) {
      const expected = normalizedTargets(options.targets, key);
      if (expected.packages.length !== 1 || expected.packages[0] !== 'buildr' || expected.versions.buildr !== version) throw new Error('Legacy release selection cannot be rebound to other package targets.');
    }
    return null;
  }
  if (options.selectionId === undefined) throw new Error('Release selection has an explicit target binding; use its selectionId and targets.');
  const object = runGit(['rev-parse', '--verify', ref], repo, dependencies).stdout.trim();
  if (!SHA.test(object) || runGit(['cat-file', '-t', object], repo, dependencies).stdout.trim() !== 'blob') throw new Error('Release targets ref must identify a Git blob.');
  const bytes = runGit(['cat-file', 'blob', object], repo, dependencies).stdout;
  if (Buffer.byteLength(bytes) > 64 * 1024) throw new Error('Release targets object exceeds its bound.');
  const targets = normalizedTargets(JSON.parse(bytes), key);
  if (options.targets !== undefined && JSON.stringify(normalizedTargets(options.targets, key)) !== JSON.stringify(targets)) throw new Error('Release selection target/version binding conflicts with the existing selection.');
  if (options.version !== undefined && (options.version ?? null) !== (targets.versions.buildr ?? null)) throw new Error('Release selection main version conflicts with its immutable targets.');
  return { selectionId: key, targets, targetsIdentity: digest(targets), targetsRefObject: object };
}

function targetsGuard(state: any): string[] {
  return state.targetsRefObject ? [`verify ${lifecycleRef(state.selectionId, 'targets')} ${state.targetsRefObject}`] : [];
}

function requireCleanupAuthority(options: any, repo: any, state: any): any  {
  if (options.executionBinding) {
    const executionBinding: any = requireExecutionBinding(options, repo);
    return { kind: 'task-worktree', identity: executionBinding.identity };
  }
  if (options.publicationEvidence?.schemaVersion === 'buildr.package-publication-evidence/v1') {
    const evidence = validatePackagePublicationEvidence(options.publicationEvidence);
    const context = evidence.context;
    const key = releaseSelectionKey(options);
    if (context.selection.selectionId !== key || context.targets.selectionId !== key
        || context.selection.version !== (context.targets.versions.buildr ?? null)
        || (options.version !== undefined && context.selection.version !== (options.version ?? null))
        || (options.targets !== undefined && JSON.stringify(normalizedTargets(options.targets, key)) !== JSON.stringify(context.targets))
        || (state && (!state.targets || JSON.stringify(context.targets) !== JSON.stringify(state.targets)
          || context.selection.identity !== state.selectionIdentity || state.status !== 'frozen'
          || context.selection.releaseHead !== state.releaseHead || context.selection.releaseTree !== state.releaseTree
          || context.selection.generation !== state.generation))) {
      throw new Error('Package Publication evidence does not match the immutable frozen release selection.');
    }
    return { kind: 'publication', identity: evidence.identity };
  }
  if (state?.selectionId !== undefined || options.selectionId !== undefined && options.selectionId !== options.version) {
    throw new Error('Package-bound release cleanup requires complete package Publication evidence.');
  }
  if (options.targets !== undefined) {
    const targets = normalizedTargets(options.targets, releaseSelectionKey(options));
    if (targets.packages.length !== 1 || targets.packages[0] !== 'buildr' || targets.versions.buildr !== options.version) {
      throw new Error('Legacy Publication evidence cannot authorize other package targets.');
    }
  }
  const evidence: any = validateReleaseTransactionEvidence(options.publicationEvidence);
  const context: any = evidence.context;
  if (evidence.status !== 'passed'
      || evidence.release.registryPublished !== true
      || evidence.release.registrySmoke !== 'passed'
      || !evidence.release.githubRelease) {
    throw new Error('Release cleanup requires complete passed Publication evidence.');
  }
  if (context.release.version !== options.version
      || context.selection.version !== options.version
      || context.selection.status !== 'frozen'
      || (state && (context.selection.releaseHead !== state.releaseHead
        || context.selection.generation !== state.generation))) {
    throw new Error('Publication evidence does not match the current frozen release selection.');
  }
  return { kind: 'publication', identity: evidence.identity };
}

function ancestor(older: any, newer: any, repo: any, dependencies: any): any  {
  const result = runGit(['merge-base', '--is-ancestor', older, newer], repo, dependencies, { allowFailure: true });
  if (![0, 1].includes(result.status)) throw new Error(`Git ancestry is unknown: ${result.stderr}`);
  return result.status === 0;
}

function treeOf(commit: any, repo: any, dependencies: any): any  {
  return runGit(['rev-parse', `${commit}^{tree}`], repo, dependencies).stdout.trim();
}

function changedPaths(from: any, to: any, repo: any, dependencies: any): any  {
  const result: any = runGit(['diff', '--no-renames', '--name-only', '--diff-filter=ACDMRTUXB', `${from}..${to}`], repo, dependencies);
  return [...new Set(result.stdout.split(/\r?\n/u).map((value: any) => value.trim()).filter(Boolean))].sort();
}

function historyChangedPaths(from: any, to: any, repo: any, dependencies: any): any  {
  const commits: any = runGit(['rev-list', '--reverse', `${from}..${to}`], repo, dependencies).stdout
    .split(/\r?\n/u)
    .map((value: any) => value.trim())
    .filter(Boolean);
  return [...new Set(commits.flatMap((commit: any) => commitChangedPaths(commit, repo, dependencies)))].sort();
}

function releaseProductPath(value: any): any  {
  return value === 'CHANGELOG.md' || value === 'projects/product' || value.startsWith('projects/product/');
}

function commitChangedPaths(commit: any, repo: any, dependencies: any): any  {
  return changedPaths(`${commit}^`, commit, repo, dependencies);
}

function commitBody(commit: any, repo: any, dependencies: any): any  {
  return runGit(['show', '-s', '--format=%B', commit], repo, dependencies).stdout;
}

function commitParents(commit: any, repo: any, dependencies: any): any  {
  const values: any = runGit(['rev-list', '--parents', '-n', '1', commit], repo, dependencies).stdout.trim().split(/\s+/u);
  return values.slice(1).filter((value: any) => SHA.test(value));
}

function trailer(body: any, name: any): any  {
  const match: any = body.match(new RegExp(`^${name}:\\s*((?:sha256-)?[0-9a-f]{40,64})\\s*$`, 'imu'));
  return match?.[1] ?? null;
}

function mainReconciliationMetadata(commit: any, repo: any, dependencies: any): any  {
  const parents: any = commitParents(commit, repo, dependencies);
  const body: any = commitBody(commit, repo, dependencies);
  const mainParent: any = trailer(body, 'Buildr-Main-Reconciliation-Main');
  const releaseParent: any = trailer(body, 'Buildr-Main-Reconciliation-Release');
  const coverageIdentity: any = trailer(body, 'Buildr-Main-Reconciliation-Coverage');
  const resolutionIdentity: any = trailer(body, 'Buildr-Main-Reconciliation-Resolution');
  if (parents.length < 2 || !mainParent || !releaseParent || !coverageIdentity || !resolutionIdentity) return null;
  if (!parents.includes(mainParent) || !parents.includes(releaseParent)) return null;
  return { parents, mainParent, releaseParent, coverageIdentity, resolutionIdentity };
}

function selectionSource(commit: any, repo: any, dependencies: any): any  {
  const body: any = commitBody(commit, repo, dependencies);
  const match: any = body.match(/cherry picked from commit ([0-9a-f]{40})/iu);
  return match?.[1] ?? null;
}

function selectionCommits(baseline: any, branchHead: any, repo: any, dependencies: any): any  {
  const result: any = runGit(['rev-list', '--reverse', '--first-parent', `${baseline}..${branchHead}`], repo, dependencies);
  const history: any = result.stdout.split(/\r?\n/u).map((value: any) => value.trim()).filter(Boolean).map((commit: any, index: any) => {
    const reconciliation: any = mainReconciliationMetadata(commit, repo, dependencies);
    if (reconciliation) return {
      kind: 'main-reconciliation',
      order: index + 1,
      sourceDevCommit: null,
      resultReleaseCommit: commit,
      changedPaths: commitChangedPaths(commit, repo, dependencies),
      reconciliationIdentity: digest({ commit, ...reconciliation }),
      ...reconciliation,
    };
    const sourceDevCommit: any = selectionSource(commit, repo, dependencies);
    return {
      kind: sourceDevCommit ? 'selection' : 'invalid',
      order: index + 1,
      sourceDevCommit,
      resultReleaseCommit: commit,
      changedPaths: commitChangedPaths(commit, repo, dependencies),
    };
  });
  const selectionChain: any = history.filter((entry: any) => entry.kind === 'selection').map((entry: any, index: any) => ({ ...entry, order: index + 1 }));
  const reconciliationChain: any = history.filter((entry: any) => entry.kind === 'main-reconciliation').map((entry: any, index: any) => ({ ...entry, order: index + 1 }));
  return { history, selectionChain, reconciliationChain };
}

function refsUnder(prefix: any, repo: any, dependencies: any): any  {
  return runGit(['for-each-ref', '--format=%(refname) %(objectname)', prefix], repo, dependencies).stdout
    .split(/\r?\n/u)
    .map((value: any) => value.trim())
    .filter(Boolean)
    .map((line: any) => {
      const separator: any = line.indexOf(' ');
      return { ref: line.slice(0, separator), commit: line.slice(separator + 1) };
    });
}

function readFreezeHistory(version: any, releaseHistory: any, devBaseline: any, repo: any, dependencies: any): any  {
  const prefix: any = `${lifecycleRef(version, 'freezes')}/`;
  return refsUnder(prefix, repo, dependencies).map(({ ref, commit }: any) => {
    const suffix: any = ref.slice(prefix.length);
    const generation: any = /^\d+$/u.test(suffix) ? Number(suffix) : Number.NaN;
    if (!Number.isSafeInteger(generation) || generation < 0 || !SHA.test(commit)) {
      return { generation: null, commit, ref, state: 'invalid', tree: null };
    }
    const expectedCommit: any = generation === 0 ? devBaseline : releaseHistory[generation - 1]?.resultReleaseCommit;
    return {
      generation,
      commit,
      ref,
      state: expectedCommit === commit ? 'valid' : 'invalid',
      tree: treeOf(commit, repo, dependencies),
    };
  }).sort((left: any, right: any) => (left.generation ?? Number.MAX_SAFE_INTEGER) - (right.generation ?? Number.MAX_SAFE_INTEGER) || left.ref.localeCompare(right.ref));
}

function updateRefs(commands: any, repo: any, dependencies: any): any  {
  const input: any = ['start', ...commands, 'prepare', 'commit', ''].join('\n');
  runGit(['update-ref', '--stdin'], repo, dependencies, { input });
}

export function selectionIdentity(model: any, legacyDevRef?: string): any  {
  const stable: any = {
    schemaVersion: releaseSelectionSchema,
    version: model.version,
    branch: model.branch,
    ...(legacyDevRef ? { devRef: legacyDevRef } : {}),
    devBaseline: model.devBaseline,
    releaseHead: model.releaseHead,
    releaseTree: model.releaseTree,
    generation: model.generation,
    selectionChain: model.selectionChain,
    reconciliationChain: model.reconciliationChain,
    freeze: model.freeze,
    freezeHistory: model.freezeHistory,
    abandon: model.abandon,
    ...(model.selectionId === undefined ? {} : { selectionId: model.selectionId, targets: model.targets, targetsIdentity: model.targetsIdentity }),
  };
  return `sha256-${crypto.createHash('sha256').update(JSON.stringify(stable)).digest('hex')}`;
}

function digest(value: any): any  {
  return `sha256-${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

function errorResult(operation: any, version: any, error: any, extra: any = {}): any  {
  return {
    schemaVersion: releaseSelectionSchema,
    operation,
    version,
    status: 'blocked',
    effects: extra.effects ?? error?.effects ?? [],
    diagnostic: { code: extra.code ?? 'release_selection_blocked', message: error instanceof Error ? error.message : String(error), ...(extra.details ? { details: extra.details } : {}) },
    nextActions: extra.nextActions ?? ['核对当前 release ref、dev baseline 与 worktree 后重试；不得自动解决冲突或执行远端 mutation。'],
    ...(extra.conflict ? { conflict: extra.conflict } : {}),
  };
}

function readState(options: any, dependencies: any): any  {
  const key = releaseSelectionKey(options);
  const branch: any = branchFor(key);
  const repo: any = path.resolve(options.repo ?? process.cwd());
  const devRef: any = options.devRef ?? 'dev';
  const baselineRef: any = lifecycleRef(key, 'baseline');
  const frozenRef: any = lifecycleRef(key, 'frozen');
  const abandonedRef: any = lifecycleRef(key, 'abandoned');
  const branchRef = `refs/heads/${branch}`;
  const presence = readRefPresence([branchRef, baselineRef, lifecycleRef(key, 'targets'), frozenRef, abandonedRef], repo, dependencies);
  if (!presence.has(branchRef)) throw new Error(`Release branch ${branch} does not exist.`);
  if (!presence.has(baselineRef)) throw new Error(`Release baseline ref is missing: ${baselineRef}`);
  const targetBinding = readTargets(options, key, repo, dependencies, presence);
  const version = targetBinding ? targetBinding.targets.versions.buildr ?? null : requiredVersion(options.version);
  const devHead: any = resolveCommit(devRef, repo, dependencies);
  const devBaseline: any = resolveCommit(baselineRef, repo, dependencies);
  const releaseHead: any = resolveCommit(`refs/heads/${branch}`, repo, dependencies);
  const frozenAt: any = presence.has(frozenRef) ? resolveCommit(frozenRef, repo, dependencies) : null;
  const abandonedAt: any = presence.has(abandonedRef) ? resolveCommit(abandonedRef, repo, dependencies) : null;
  const releaseHistory: any = selectionCommits(devBaseline, releaseHead, repo, dependencies);
  const invalidSelection: any = releaseHistory.selectionChain.find((entry: any) => !ancestor(devBaseline, entry.sourceDevCommit, repo, dependencies) || !ancestor(entry.sourceDevCommit, devHead, repo, dependencies));
  const invalidHistory: any = releaseHistory.history.find((entry: any) => entry.kind === 'invalid');
  const invalidProvenance: any = invalidSelection ?? invalidHistory;
  const freezeHistory: any = readFreezeHistory(key, releaseHistory.history, devBaseline, repo, dependencies);
  const invalidFreeze: any = freezeHistory.find((entry: any) => entry.state !== 'valid');
  const freeze: any = frozenAt ? { state: frozenAt === releaseHead ? 'frozen' : 'stale', commit: frozenAt } : { state: 'open', commit: null };
  const abandon: any = abandonedAt ? { state: 'abandoned', commit: abandonedAt } : { state: 'active', commit: null };
  const model: any = {
    schemaVersion: releaseSelectionSchema,
    operation: 'inspect',
    version,
    ...(targetBinding ?? {}),
    branch,
    devRef,
    devHead,
    devBaseline,
    releaseHead,
    releaseTree: treeOf(releaseHead, repo, dependencies),
    generation: releaseHistory.history.length,
    changedPaths: changedPaths(devBaseline, releaseHead, repo, dependencies),
    selectionChain: releaseHistory.selectionChain,
    reconciliationChain: releaseHistory.reconciliationChain,
    freezeHistory,
    freeze,
    abandon,
    status: invalidSelection || invalidHistory || invalidFreeze ? 'blocked' : abandon.state === 'abandoned' ? 'abandoned' : freeze.state === 'stale' ? 'stale' : freeze.state === 'frozen' ? 'frozen' : 'ready',
    integrity: invalidProvenance
      ? { status: 'invalid', code: 'selection_provenance_missing', resultReleaseCommit: invalidProvenance.resultReleaseCommit }
      : invalidFreeze
        ? { status: 'invalid', code: 'freeze_history_invalid', ref: invalidFreeze.ref, commit: invalidFreeze.commit }
        : { status: 'valid' },
    effects: [],
    diagnostic: invalidProvenance
      ? { code: 'selection_provenance_invalid', message: `Release commit ${invalidProvenance.resultReleaseCommit} has missing or non-current cherry-pick -x provenance.` }
      : invalidFreeze
        ? { code: 'release_freeze_history_invalid', message: `Release freeze history ref ${invalidFreeze.ref} does not match generation ${invalidFreeze.generation ?? 'unknown'}.` }
        : null,
    nextActions: [],
  };
  model.selectionIdentity = selectionIdentity(model);
  return model;
}

function assertActive(state: any, action: any): any  {
  const key = state.selectionId ?? state.version;
  if (state.status === 'abandoned') throw new Error(`Release ${key} was abandoned and cannot ${action}.`);
  if (state.status === 'stale') throw new Error(`Release ${key} has a stale freeze ref; inspect and recover before ${action}.`);
  if (state.status === 'blocked') throw new Error(`Release ${key} has invalid selection provenance.`);
  if (action === 'update' && state.status === 'frozen') throw new Error(`Release ${key} is frozen and cannot update.`);
}

export function inspectReleaseSelection(options: any = {}, dependencies: any = {}): any  {
  try {
    return readState(options, dependencies);
  } catch (error: any) {
    return errorResult('inspect', options.version ?? null, error);
  }
}

export function inspectReleaseSourceProvenance(options: any, dependencies: any = {}): any {
  const { repo, sourceCommit, generation, devRef } = options;
  if (!SHA.test(sourceCommit) || !Number.isSafeInteger(generation) || generation < 0 || generation > 10000) throw new Error('Published selection source/generation is invalid.');
  const chain = runGit(['rev-list', '--first-parent', `--max-count=${generation + 1}`, sourceCommit], repo, dependencies).stdout.trim().split(/\r?\n/u);
  if (chain.length !== generation + 1) throw new Error('Published source history cannot prove its frozen baseline.');
  const devBaseline = chain.at(-1);
  const devHead = resolveCommit(devRef, repo, dependencies);
  const history = selectionCommits(devBaseline, sourceCommit, repo, dependencies);
  if (history.history.length !== generation || history.history.some((entry: any) => entry.kind === 'invalid')) throw new Error('Published release contains unproven selection history.');
  if (![devBaseline, ...history.selectionChain.map((entry: any) => entry.sourceDevCommit)].every(commit => ancestor(commit, devHead, repo, dependencies))) throw new Error('Published baseline or selected source is no longer contained by current dev.');
  const generationCommits = [devBaseline, ...history.history.map((entry: any) => entry.resultReleaseCommit)];
  return { status: 'passed', disposition: 'published-git-history', devBaseline, devHead, generation, releaseHead: sourceCommit, releaseTree: treeOf(sourceCommit, repo, dependencies), selectionChain: history.selectionChain, generationCommits, effects: [] };
}

export function createReleaseSelection(options: any = {}, dependencies: any = {}): any  {
  const version: any = options.version ?? null;
  const effects: any[] = [];
  try {
    const required = releaseSelectionKey(options);
    if (options.targets !== undefined && options.selectionId === undefined) throw new Error('Explicit package targets require their selectionId.');
    const targets = options.selectionId === undefined ? null : normalizedTargets(options.targets, required);
    if (targets && (targets.versions.buildr ?? null) !== (options.version ?? null)) throw new Error('Release selection version differs from its selected main target.');
    if (targets && (targets.packages.length !== 1 || targets.packages[0] !== 'buildr') && VERSION.test(required)) throw new Error('Plugin/joint selectionId cannot occupy the legacy main-version namespace.');
    const branch: any = branchFor(required);
    const repo: any = path.resolve(options.repo ?? process.cwd());
    const executionBinding: any = requireExecutionBinding(options, repo);
    const devRef: any = options.devRef ?? 'dev';
    cleanWorktree(repo, dependencies);
    const branchRef: any = `refs/heads/${branch}`;
    const baselineRef: any = lifecycleRef(required, 'baseline');
    const baseline: any = resolveCommit(options.baseline, repo, dependencies);
    const devHead: any = resolveCommit(devRef, repo, dependencies);
    if (!ancestor(baseline, devHead, repo, dependencies)) throw new Error(`Dev baseline ${baseline} is not contained by current ${devRef} (${devHead}).`);
    const targetsRef = lifecycleRef(required, 'targets');
    if (refExists(branchRef, repo, dependencies) || refExists(baselineRef, repo, dependencies) || refExists(targetsRef, repo, dependencies)) {
      if (targets && !refExists(targetsRef, repo, dependencies)) throw new Error('Existing legacy selection has no immutable targets; retain its version-only recovery or choose a new selectionId.');
      const existing = readState({ ...options, repo, devRef }, dependencies);
      if (existing.devBaseline !== baseline || existing.releaseHead !== executionBinding.head || existing.status === 'abandoned' || existing.status === 'blocked') throw new Error(`Release ${branch} exists with a different baseline or execution head.`);
      return { ...existing, operation: 'create', status: 'passed', action: 'reused', effects: [] };
    }
    if (executionBinding.head !== baseline) throw new Error(`Release Task Worktree HEAD ${executionBinding.head} does not match selected baseline ${baseline}.`);
    const targetObject = targets ? runGit(['hash-object', '-w', '--stdin'], repo, dependencies, { input: `${JSON.stringify(targets)}\n` }).stdout.trim() : null;
    if (targetObject && !SHA.test(targetObject)) throw new Error('Release targets did not produce a valid Git blob identity.');
    if (targetObject) effects.push({ type: 'release-targets-object-written', object: targetObject, state: 'confirmed' });
    const created = { type: 'release-selection-created', refs: [branchRef, baselineRef, ...(targets ? [targetsRef] : [])], commit: baseline, state: 'unknown' };
    effects.push(created);
    updateRefs([`create ${branchRef} ${baseline}`, `create ${baselineRef} ${baseline}`, ...(targetObject ? [`create ${targetsRef} ${targetObject}`] : [])], repo, dependencies);
    created.state = 'confirmed';
    const result: any = readState({ ...options, repo, devRef }, dependencies);
    return { ...result, operation: 'create', status: 'passed', executionBindingIdentity: executionBinding.identity, effects: [{ type: 'branch-created', ref: branchRef, commit: baseline }, { type: 'baseline-ref-created', ref: baselineRef, commit: baseline }, ...(targetObject ? [{ type: 'targets-ref-created', ref: targetsRef, object: targetObject }] : [])], nextActions: ['按维护者明确顺序逐个调用 update；普通 dev 前进不会自动进入 release。'] };
  } catch (error: any) {
    return errorResult('create', version, error, { code: 'release_selection_create_blocked', effects });
  }
}

export function selectReleaseCommit(options: any = {}, dependencies: any = {}): any  {
  const version: any = options.version ?? null;
  const effects: any[] = [];
  try {
    const repo: any = path.resolve(options.repo ?? process.cwd());
    const executionBinding: any = requireExecutionBinding(options, repo);
    const state: any = readState({ ...options, version }, dependencies);
    const currentBranch: any = runGit(['branch', '--show-current'], repo, dependencies).stdout.trim() || null;
    const currentHead: any = resolveCommit('HEAD', repo, dependencies);
    cleanWorktree(repo, dependencies);
    const source: any = resolveCommit(options.source, repo, dependencies);
    const devHead: any = resolveCommit(options.devRef ?? state.devRef, repo, dependencies);
    if (!ancestor(source, devHead, repo, dependencies)) throw new Error(`Selected source ${source} is not contained by current ${options.devRef ?? state.devRef}.`);
    if (state.integrity?.status === 'valid' && state.status !== 'abandoned' && currentBranch === executionBinding.branch && currentHead === state.releaseHead && state.selectionChain.some((entry: any) => entry.sourceDevCommit === source)) {
      return { ...state, operation: 'update', status: 'passed', action: 'reused', effects: [] };
    }
    assertActive(state, 'update');
    if (currentBranch === executionBinding.branch && currentHead !== state.releaseHead
        && JSON.stringify(commitParents(currentHead, repo, dependencies)) === JSON.stringify([state.releaseHead])
        && selectionSource(currentHead, repo, dependencies) === source) {
      const repaired = { type: 'formal-release-ref-recovered', ref: `refs/heads/${state.branch}`, commit: currentHead, sourceDevCommit: source, state: 'unknown' };
      effects.push({ type: 'release-commit-reused', commit: currentHead, state: 'confirmed' }, repaired);
      updateRefs([...targetsGuard(state), `update ${repaired.ref} ${currentHead} ${state.releaseHead}`], repo, dependencies);
      repaired.state = 'confirmed';
      const recovered = readState(options, dependencies);
      if (recovered.integrity.status !== 'valid') throw new Error('Recovered release selection provenance is invalid.');
      return { ...recovered, operation: 'update', status: 'passed', action: 'recovered', effects };
    }
    if (currentBranch !== executionBinding.branch || currentHead !== state.releaseHead) {
      return errorResult('update', version, new Error(`Release selection update requires bound Task branch ${executionBinding.branch} at ${state.releaseHead}; current checkout is ${currentBranch ?? 'detached'} at ${currentHead}.`), {
        code: 'release_selection_target_mismatch',
        details: {
          expectedBranch: executionBinding.branch,
          expectedHead: state.releaseHead,
          actualBranch: currentBranch,
          actualHead: currentHead,
        },
        nextActions: [`切换到 ${state.branch} 并确认 HEAD 为 ${state.releaseHead} 后重试；当前 workspace 不得执行 Release selection update。`],
      });
    }
    if (!ancestor(state.devBaseline, source, repo, dependencies) || source === state.devBaseline) throw new Error(`Selected source ${source} must be after the release baseline.`);
    const before: any = state.releaseHead;
    if (state.targetsRefObject) updateRefs(targetsGuard(state), repo, dependencies);
    const selected = { type: 'release-commit-created', sourceDevCommit: source, state: 'unknown', resultReleaseCommit: null as string | null };
    effects.push(selected);
    const cherryPick: any = runGit(['cherry-pick', '-x', source], repo, dependencies, { allowFailure: true });
    if (cherryPick.status !== 0) {
      selected.state = 'conflict';
      const paths: any = runGit(['diff', '--name-only', '--diff-filter=U'], repo, dependencies, { allowFailure: true }).stdout.split(/\r?\n/u).map((value: any) => value.trim()).filter(Boolean).sort();
      return errorResult('update', version, new Error(`cherry-pick -x ${source} conflicted.`), {
        code: 'release_selection_conflict',
        effects,
        details: { sourceDevCommit: source, preOperationReleaseHead: before, conflictPaths: paths, stderr: cherryPick.stderr.trim() },
        conflict: { sourceDevCommit: source, preOperationReleaseHead: before, conflictPaths: paths, recovery: 'git cherry-pick --abort' },
        nextActions: ['保留冲突现场供维护者处理；确认后执行 git cherry-pick --abort，再重新选择可应用的 commit。'],
      });
    }
    selected.state = 'confirmed';
    const selectedHead: any = resolveCommit('HEAD', repo, dependencies);
    effects[0].resultReleaseCommit = selectedHead;
    updateRefs([...targetsGuard(state), `update refs/heads/${state.branch} ${selectedHead} ${before}`], repo, dependencies);
    const synchronized: any = readState({ ...options, repo, devRef: options.devRef ?? state.devRef }, dependencies);
    const entry: any = synchronized.selectionChain.at(-1);
    if (synchronized.releaseHead === before || entry?.sourceDevCommit !== source) throw new Error('cherry-pick result did not produce a verifiable -x provenance commit.');
    return { ...synchronized, operation: 'update', status: 'passed', executionBindingIdentity: executionBinding.identity, effects: [{ type: 'release-commit-created', sourceDevCommit: source, resultReleaseCommit: synchronized.releaseHead, generation: synchronized.generation }], nextActions: ['继续逐个选择 commit，或对当前 release HEAD 执行 freeze。'] };
  } catch (error: any) {
    return errorResult('update', version, error, { code: 'release_selection_update_blocked', effects });
  }
}

export function freezeReleaseSelection(options: any = {}, dependencies: any = {}): any  {
  const version: any = options.version ?? null;
  const effects: any[] = [];
  try {
    const repo: any = path.resolve(options.repo ?? process.cwd());
    const executionBinding: any = requireExecutionBinding(options, repo);
    const state: any = readState(options, dependencies);
    assertActive(state, 'freeze');
    cleanWorktree(repo, dependencies);
    const frozenRef: any = lifecycleRef(state.selectionId ?? state.version, 'frozen');
    const historyRef: any = freezeHistoryRef(state.selectionId ?? state.version, state.generation);
    const existingHistory: any = state.freezeHistory.find((entry: any) => entry.generation === state.generation);
    if (state.freeze.state === 'frozen' && existingHistory?.commit === state.releaseHead) return { ...state, operation: 'freeze', status: 'passed', executionBindingIdentity: executionBinding.identity, effects: [], nextActions: ['下游 Candidate consumer 可使用当前 selectionIdentity。'] };
    const commands: any[] = [...targetsGuard(state), existingHistory ? `verify ${historyRef} ${state.releaseHead}` : `create ${historyRef} ${state.releaseHead}`];
    if (state.freeze.state === 'frozen') commands.push(`verify ${frozenRef} ${state.releaseHead}`);
    else commands.push(`create ${frozenRef} ${state.releaseHead}`);
    const updated = { type: 'release-lifecycle-refs-updated', commands, state: 'unknown' };
    effects.push(updated);
    updateRefs(commands, repo, dependencies);
    updated.state = 'confirmed';
    const result: any = readState(options, dependencies);
    if (result.status !== 'frozen') throw new Error('Release freeze readback is not frozen.');
    return { ...result, operation: 'freeze', status: 'passed', executionBindingIdentity: executionBinding.identity, effects: [{ type: 'release-frozen', ref: frozenRef, historyRef, commit: state.releaseHead, generation: state.generation }], nextActions: ['下游 consumer 必须绑定当前 selectionIdentity；reopen或任何 release 内容变化都会使旧Candidate、artifact、readiness与transaction context stale。'] };
  } catch (error: any) {
    return errorResult('freeze', version, error, { code: 'release_selection_freeze_blocked', effects });
  }
}

export function reconcileReleaseSelectionWithMain(options: any = {}, dependencies: any = {}): any  {
  const version: any = options.version ?? null;
  const effects: any[] = [];
  try {
    if (options.confirm !== true) throw new Error('Main reconciliation requires explicit confirmation.');
    const reason: any = String(options.reason ?? '').trim();
    if (!reason) throw new Error('Main reconciliation requires a non-empty reason.');
    const repo: any = path.resolve(options.repo ?? process.cwd());
    const executionBinding: any = requireExecutionBinding(options, repo);
    const state: any = readState(options, dependencies);
    if (state.status !== 'frozen') throw new Error(`Release ${state.selectionId ?? state.version} must be currently frozen before main reconciliation.`);
    const currentBranch: any = runGit(['branch', '--show-current'], repo, dependencies).stdout.trim() || null;
    const currentHead: any = resolveCommit('HEAD', repo, dependencies);
    if (currentBranch !== executionBinding.branch || currentHead !== state.releaseHead) throw new Error(`Main reconciliation requires bound Task branch ${executionBinding.branch} at ${state.releaseHead}; current checkout is ${currentBranch ?? 'detached'} at ${currentHead}.`);
    const mainRef: any = options.mainRef ?? 'origin/main';
    const mainCommit: any = resolveCommit(mainRef, repo, dependencies);
    const previous: any = state.reconciliationChain.at(-1);
    if (previous?.mainParent === mainCommit && previous.resultReleaseCommit === state.releaseHead && state.freeze.commit === state.releaseHead) {
      return { ...state, operation: 'reconcile-main', status: 'passed', action: 'already-converged', effects: [], reconciliation: previous, nextActions: ['使用当前 release generation 重新生成 Candidate、artifact 与 readiness。'] };
    }
    const releaseParent: any = state.releaseHead;
    const targetIdentity = state.selectionId === undefined ? {} : { selectionId: state.selectionId, targetsIdentity: state.targetsIdentity };
    cleanWorktree(repo, dependencies);
    if (ancestor(mainCommit, releaseParent, repo, dependencies)) {
      const coverageIdentity: any = digest({ version: state.version, ...targetIdentity, mainParent: mainCommit, releaseParent, disposition: 'main-ancestor' });
      return { ...state, operation: 'reconcile-main', status: 'passed', action: 'already-converged', executionBindingIdentity: executionBinding.identity, effects: [], reconciliation: { mainParent: mainCommit, releaseParent, coverageIdentity, resultReleaseCommit: releaseParent }, nextActions: ['current main已在release历史中；当前frozen generation可作为Candidate最终source。'] };
    }
    const mergeBase: any = runGit(['merge-base', releaseParent, mainCommit], repo, dependencies).stdout.trim();
    const mainPaths: any = changedPaths(mergeBase, mainCommit, repo, dependencies).filter(releaseProductPath);
    const releasePaths: any = new Set(historyChangedPaths(mergeBase, releaseParent, repo, dependencies).filter(releaseProductPath));
    const uncoveredPaths: any = mainPaths.filter((entry: any) => !releasePaths.has(entry));
    const coverageIdentity: any = digest({ version: state.version, ...targetIdentity, mainParent: mainCommit, releaseParent, mergeBase, mainPaths, releasePaths: [...releasePaths].sort(), uncoveredPaths });
    if (uncoveredPaths.length) return errorResult('reconcile-main', version, new Error('Current main contains product paths not covered by current dev/release provenance.'), {
      code: 'release_main_coverage_incomplete',
      details: { mainParent: mainCommit, releaseParent, mergeBase, uncoveredPaths, coverageIdentity },
      nextActions: ['先通过正式Task把列出的main独有内容交付dev，再选择该dev commit并重新执行coverage。'],
    });
    const releaseTree: any = treeOf(releaseParent, repo, dependencies);
    const resolutionIdentity: any = digest({ version: state.version, ...targetIdentity, mainParent: mainCommit, releaseParent, releaseTree, coverageIdentity, reason });
    const message: any = [
      `Release ${state.selectionId ?? state.version} main reconciliation`,
      '',
      reason,
      '',
      `Buildr-Main-Reconciliation-Main: ${mainCommit}`,
      `Buildr-Main-Reconciliation-Release: ${releaseParent}`,
      `Buildr-Main-Reconciliation-Coverage: ${coverageIdentity}`,
      `Buildr-Main-Reconciliation-Resolution: ${resolutionIdentity}`,
    ].join('\n');
    const reconciledCommit: any = runGit(['commit-tree', releaseTree, '-p', releaseParent, '-p', mainCommit], repo, dependencies, { input: `${message}\n` }).stdout.trim();
    if (!SHA.test(reconciledCommit)) throw new Error('Tree-preserving main reconciliation did not create a commit.');
    effects.push({ type: 'main-reconciliation-commit-created', commit: reconciledCommit, state: 'confirmed' });
    const parents: any = commitParents(reconciledCommit, repo, dependencies);
    if (!parents.includes(mainCommit) || !parents.includes(releaseParent)) throw new Error('Main reconciliation commit does not contain the expected main and release parents.');
    const newGeneration: any = state.generation + 1;
    const frozenRef: any = lifecycleRef(state.selectionId ?? state.version, 'frozen');
    const historyRef: any = freezeHistoryRef(state.selectionId ?? state.version, newGeneration);
    const branchUpdates: any = executionBinding.branch === state.branch
      ? [`update refs/heads/${state.branch} ${reconciledCommit} ${releaseParent}`]
      : [`update refs/heads/${executionBinding.branch} ${reconciledCommit} ${releaseParent}`, `update refs/heads/${state.branch} ${reconciledCommit} ${releaseParent}`];
    const updated = { type: 'main-reconciliation-refs-updated', commit: reconciledCommit, state: 'unknown' };
    effects.push(updated);
    updateRefs([
      ...targetsGuard(state),
      `create ${historyRef} ${reconciledCommit}`,
      `update ${frozenRef} ${reconciledCommit} ${state.freeze.commit}`,
      ...branchUpdates,
    ], repo, dependencies);
    updated.state = 'confirmed';
    const result: any = readState(options, dependencies);
    if (result.releaseTree !== releaseTree || treeOf('HEAD', repo, dependencies) !== releaseTree) throw new Error('Main reconciliation changed the frozen release tree.');
    return {
      ...result,
      operation: 'reconcile-main',
      status: 'passed',
      action: 'reconciled',
      executionBindingIdentity: executionBinding.identity,
      effects: [{ type: 'main-reconciliation-history-created', mainParent: mainCommit, releaseParent, resultReleaseCommit: reconciledCommit, generation: newGeneration, coverageIdentity, resolutionIdentity, tree: releaseTree }],
      reconciliation: result.reconciliationChain.at(-1),
      nextActions: ['旧 Candidate、artifact、readiness 与 transaction context 已失效；对新的 release HEAD/tree 重新运行完整 Candidate。'],
    };
  } catch (error: any) {
    return errorResult('reconcile-main', version, error, { code: 'release_main_reconciliation_blocked', effects });
  }
}

export function reopenReleaseSelection(options: any = {}, dependencies: any = {}): any  {
  const version: any = options.version ?? null;
  const effects: any[] = [];
  try {
    if (options.confirm !== true) throw new Error('Release reopen requires explicit confirmation.');
    const reason: any = String(options.reason ?? '').trim();
    if (!reason) throw new Error('Release reopen requires a non-empty reason.');
    const repo: any = path.resolve(options.repo ?? process.cwd());
    const executionBinding: any = requireExecutionBinding(options, repo);
    const state: any = readState(options, dependencies);
    assertActive(state, 'reopen');
    if (state.status === 'ready' && state.freezeHistory.some((entry: any) => entry.commit === state.releaseHead)) return { ...state, operation: 'reopen', status: 'passed', action: 'reused', effects: [] };
    if (state.status !== 'frozen') throw new Error(`Release ${state.selectionId ?? state.version} is not currently frozen and cannot reopen.`);
    cleanWorktree(repo, dependencies);
    const frozenRef: any = lifecycleRef(state.selectionId ?? state.version, 'frozen');
    const historyRef: any = freezeHistoryRef(state.selectionId ?? state.version, state.generation);
    const existingHistory: any = state.freezeHistory.find((entry: any) => entry.generation === state.generation);
    const commands: any[] = [...targetsGuard(state), existingHistory ? `verify ${historyRef} ${state.releaseHead}` : `create ${historyRef} ${state.releaseHead}`, `delete ${frozenRef} ${state.releaseHead}`];
    const updated = { type: 'release-lifecycle-refs-updated', commands, state: 'unknown' };
    effects.push(updated);
    updateRefs(commands, repo, dependencies);
    updated.state = 'confirmed';
    const result: any = readState(options, dependencies);
    return {
      ...result,
      operation: 'reopen',
      status: 'passed',
      executionBindingIdentity: executionBinding.identity,
      effects: [{ type: 'release-reopened', ref: frozenRef, historyRef, commit: state.releaseHead, generation: state.generation, reason }],
      nextActions: ['旧Candidate、artifact、readiness与transaction context已stale；按维护者明确顺序独立调用update，完成后重新freeze并运行完整Candidate。'],
    };
  } catch (error: any) {
    return errorResult('reopen', version, error, { code: 'release_selection_reopen_blocked', effects, nextActions: ['核对current frozen selection、clean worktree、公开发布事实与显式confirmation/reason后重试；不得直接update或移动remote ref。'] });
  }
}

export function abandonReleaseSelection(options: any = {}, dependencies: any = {}): any  {
  const version: any = options.version ?? null;
  const effects: any[] = [];
  try {
    const repo: any = path.resolve(options.repo ?? process.cwd());
    const executionBinding: any = requireExecutionBinding(options, repo);
    const state: any = readState(options, dependencies);
    const abandonedRef: any = lifecycleRef(state.selectionId ?? state.version, 'abandoned');
    if (state.abandon.state === 'abandoned') return { ...state, operation: 'abandon', status: 'passed', effects: [], nextActions: ['保留既有 Git/Task 事实；不得将 abandoned 集合送入 Candidate 或 publication。'] };
    const abandoned = { type: 'release-abandoned', ref: abandonedRef, commit: state.releaseHead, state: 'unknown' };
    effects.push(abandoned);
    updateRefs([...targetsGuard(state), `create ${abandonedRef} ${state.releaseHead}`], repo, dependencies);
    abandoned.state = 'confirmed';
    const result: any = readState(options, dependencies);
    return { ...result, operation: 'abandon', status: 'passed', executionBindingIdentity: executionBinding.identity, effects: [{ type: 'release-abandoned', ref: abandonedRef, commit: state.releaseHead }], nextActions: ['如确认不再需要本地恢复，另行显式调用 cleanup；远端 ref 需要独立授权。'] };
  } catch (error: any) {
    return errorResult('abandon', version, error, { code: 'release_selection_abandon_blocked', effects });
  }
}

export function inspectReleaseSelectionCleanup(options: any = {}, dependencies: any = {}): any  {
  const version: any = options.version ?? null;
  try {
    const required = releaseSelectionKey(options);
    const repo: any = path.resolve(options.repo ?? process.cwd());
    const branch: any = branchFor(required);
    const branchRef: any = `refs/heads/${branch}`;
    const currentBranch: any = runGit(['branch', '--show-current'], repo, dependencies).stdout.trim();
    const worktrees = runGit(['worktree', 'list', '--porcelain'], repo, dependencies).stdout;
    const checkedOut = currentBranch === branch || worktrees.split(/\r?\n/u).includes(`branch refs/heads/${branch}`);
    const observedRefs = refsUnder(`refs/buildr/release/${required}/`, repo, dependencies);
    const refs: any = observedRefs.map((entry: any) => entry.ref);
    const branchExists: any = refExists(branchRef, repo, dependencies);
    const state: any = branchExists || refs.length ? readState(options, dependencies) : null;
    if (state?.targetsRefObject && observedRefs.find((entry: any) => entry.ref === lifecycleRef(required, 'targets'))?.commit !== state.targetsRefObject) throw new Error('Release targets ref changed during cleanup inspection.');
    const observed = [...(branchExists ? [{ ref: branchRef, commit: state.releaseHead }] : []), ...observedRefs];
    const cleanupAuthority: any = requireCleanupAuthority(options, repo, state);
    return { schemaVersion: releaseSelectionSchema, operation: 'inspect-cleanup', version: state?.version ?? options.version ?? null, ...(options.selectionId === undefined ? {} : { selectionId: required }), branch, status: 'ready', branchExists, refs, observedRefs: observed, checkedOut, cleanupAuthority, effects: [], nextActions: [] };
  } catch (error: any) {
    return errorResult('inspect-cleanup', version, error, { code: 'release_selection_cleanup_blocked' });
  }
}

export function cleanupReleaseSelection(options: any = {}, dependencies: any = {}): any  {
  const version: any = options.version ?? null;
  const effects: any[] = [];
  try {
    const required = releaseSelectionKey(options);
    if (options.confirm !== true) throw new Error('Local release cleanup requires explicit confirmation.');
    const repo: any = path.resolve(options.repo ?? process.cwd());
    const inspected: any = inspectReleaseSelectionCleanup(options, dependencies);
    if (inspected.status !== 'ready') return { ...inspected, operation: 'cleanup' };
    if (inspected.checkedOut) throw new Error(`Cannot cleanup checked-out release branch ${inspected.branch}.`);
    const branch: any = inspected.branch;
    const branchRef: any = `refs/heads/${branch}`;
    const refs: any = inspected.refs;
    const branchExists: any = inspected.branchExists;
    const cleanupAuthority: any = inspected.cleanupAuthority;
    if (!branchExists && refs.length === 0) {
      return { schemaVersion: releaseSelectionSchema, operation: 'cleanup', version: inspected.version, ...(options.selectionId === undefined ? {} : { selectionId: required }), branch, status: 'passed', action: 'already-cleaned', cleanupAuthority, effects: [], nextActions: [] };
    }
    const observed = inspected.observedRefs;
    const removed = { type: 'release-local-refs-deleted', refs: observed, state: 'unknown' };
    effects.push(removed);
    updateRefs(observed.map(({ ref, commit }: any) => `delete ${ref} ${commit}`), repo, dependencies);
    removed.state = 'confirmed';
    if (refExists(branchRef, repo, dependencies) || refsUnder(`refs/buildr/release/${required}/`, repo, dependencies).length) throw new Error('Release local refs remain after cleanup; preserve and inspect the current facts.');
    return { schemaVersion: releaseSelectionSchema, operation: 'cleanup', version: inspected.version, ...(options.selectionId === undefined ? {} : { selectionId: required }), branch, status: 'passed', action: 'cleaned', cleanupAuthority, effects: [...(branchExists ? [{ type: 'branch-deleted', ref: branchRef }] : []), ...refs.map((ref: any) => ({ type: 'lifecycle-ref-deleted', ref }))], nextActions: [] };
  } catch (error: any) {
    return errorResult('cleanup', version, error, { code: 'release_selection_cleanup_blocked', effects, nextActions: ['确认本地 branch 未 checkout、资源ownership明确且传入 --confirm 后重试；正式远端release ref由独立owner核验。'] });
  }
}

export const createReleaseCollection: any = createReleaseSelection;
export const updateReleaseSelection: any = selectReleaseCommit;
export const inspectReleaseCollection: any = inspectReleaseSelection;

function cliOptions(parsed: any): any  {
  const executionBindingFile: any = parsed.option('execution-binding');
  const targetsFile = parsed.option('targets');
  return {
    version: parsed.option('version'),
    selectionId: parsed.option('selection-id'),
    targets: targetsFile ? JSON.parse(fs.readFileSync(path.resolve(targetsFile), 'utf8')) : undefined,
    repo: parsed.option('repo'),
    devRef: parsed.option('dev-ref', 'dev'),
    workspace: parsed.option('workspace'),
    baseline: parsed.option('baseline'),
    source: parsed.option('source'),
    reason: parsed.option('reason'),
    confirm: parsed.has('confirm'),
    mainRef: parsed.option('main-ref', 'origin/main'),
    executionBinding: executionBindingFile ? JSON.parse(fs.readFileSync(path.resolve(executionBindingFile), 'utf8')) : null,
  };
}

function runCli(argv: any): any  {
  const parsed: any = parseArguments(argv);
  const operation: any = parsed.positionals[0];
  if (!['create', 'update', 'inspect', 'freeze', 'reconcile-main', 'reopen', 'abandon', 'cleanup'].includes(operation)) throw new Error('Usage: release-selection.ts <create|update|inspect|freeze|reconcile-main|reopen|abandon|cleanup> [--version <main-version>] [--selection-id <id>] [--targets <json>] [--repo <path>] [--execution-binding <json>] [--dev-ref <ref>] [--baseline <commit>] [--source <commit>] [--main-ref <ref>] [--reason <text>] [--confirm]');
  const options: any = cliOptions(parsed);
  if (operation === 'create' && !options.baseline) throw new Error('Missing required --baseline.');
  if (operation === 'update' && !options.source) throw new Error('Missing required --source.');
  const result: any = operation === 'create' ? createReleaseSelection(options) : operation === 'update' ? selectReleaseCommit(options) : operation === 'inspect' ? inspectReleaseSelection(options) : operation === 'freeze' ? freezeReleaseSelection(options) : operation === 'reconcile-main' ? reconcileReleaseSelectionWithMain(options) : operation === 'reopen' ? reopenReleaseSelection(options) : operation === 'abandon' ? abandonReleaseSelection(options) : cleanupReleaseSelection(options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.status === 'blocked') process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  try { runCli(process.argv.slice(2)); } catch (error: any) {
    process.stdout.write(`${JSON.stringify({ schemaVersion: releaseSelectionSchema, status: 'blocked', effects: [], diagnostic: { code: 'release_selection_invalid_input', message: error.message }, nextActions: [] }, null, 2)}\n`);
    process.exitCode = 1;
  }
}
