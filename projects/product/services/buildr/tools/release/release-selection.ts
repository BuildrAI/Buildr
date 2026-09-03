#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { parseArguments, requireOption } from './release-files.ts';
import { validateReleaseExecutionBinding } from './release-execution-binding.ts';
import { validateReleaseTransactionEvidence } from './release-transaction-evidence.ts';

export const releaseSelectionSchema: any = 'buildr.release-selection/v1';
export const releaseSelectionSchemaVersion: any = releaseSelectionSchema;
const SHA: any = /^[0-9a-f]{40}$/u;
const VERSION: any = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u;

function executeGit(command: any, args: any, options: any = {}): any  {
  return spawnSync(command, args, { cwd: options.cwd, encoding: 'utf8', windowsHide: true, input: options.input });
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

function branchFor(version: any): any  {
  return `release-${requiredVersion(version)}`;
}

function lifecycleRef(version: any, state: any): any  {
  return `refs/buildr/release/${requiredVersion(version)}/${state}`;
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
  return runGit(['show-ref', '--verify', '--quiet', ref], repo, dependencies, { allowFailure: true }).status === 0;
}

function cleanWorktree(repo: any, dependencies: any): any  {
  const result: any = runGit(['status', '--porcelain=v1', '--untracked-files=all'], repo, dependencies);
  if (result.stdout.trim()) throw new Error('Release selection requires a clean worktree.');
}

function requireExecutionBinding(options: any, repo: any): any  {
  if (!options.executionBinding) throw new Error('Release Git mutation requires a matching Task Worktree execution binding.');
  const binding: any = validateReleaseExecutionBinding(options.executionBinding, { repo });
  if (binding.version !== options.version) throw new Error(`Release execution binding version ${binding.version} does not match ${options.version}.`);
  return binding;
}

function requireCleanupAuthority(options: any, repo: any, state: any): any  {
  if (options.executionBinding) {
    const executionBinding: any = requireExecutionBinding(options, repo);
    return { kind: 'task-worktree', identity: executionBinding.identity };
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
  return runGit(['merge-base', '--is-ancestor', older, newer], repo, dependencies, { allowFailure: true }).status === 0;
}

function treeOf(commit: any, repo: any, dependencies: any): any  {
  return runGit(['rev-parse', `${commit}^{tree}`], repo, dependencies).stdout.trim();
}

function changedPaths(from: any, to: any, repo: any, dependencies: any): any  {
  const result: any = runGit(['diff', '--name-only', '--diff-filter=ACDMRTUXB', `${from}..${to}`], repo, dependencies);
  return [...new Set(result.stdout.split(/\r?\n/u).map((value: any) => value.trim()).filter(Boolean))].sort();
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

function selectionIdentity(model: any): any  {
  const stable: any = {
    schemaVersion: releaseSelectionSchema,
    version: model.version,
    branch: model.branch,
    devRef: model.devRef,
    devBaseline: model.devBaseline,
    releaseHead: model.releaseHead,
    releaseTree: model.releaseTree,
    generation: model.generation,
    selectionChain: model.selectionChain,
    reconciliationChain: model.reconciliationChain,
    freeze: model.freeze,
    freezeHistory: model.freezeHistory,
    abandon: model.abandon,
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
    effects: [],
    diagnostic: { code: extra.code ?? 'release_selection_blocked', message: error instanceof Error ? error.message : String(error), ...(extra.details ? { details: extra.details } : {}) },
    nextActions: extra.nextActions ?? ['核对当前 release ref、dev baseline 与 worktree 后重试；不得自动解决冲突或执行远端 mutation。'],
    ...(extra.conflict ? { conflict: extra.conflict } : {}),
  };
}

function readState(options: any, dependencies: any): any  {
  const version: any = requiredVersion(options.version);
  const branch: any = branchFor(version);
  const repo: any = path.resolve(options.repo ?? process.cwd());
  const devRef: any = options.devRef ?? 'dev';
  const baselineRef: any = lifecycleRef(version, 'baseline');
  const frozenRef: any = lifecycleRef(version, 'frozen');
  const abandonedRef: any = lifecycleRef(version, 'abandoned');
  if (!refExists(`refs/heads/${branch}`, repo, dependencies)) throw new Error(`Release branch ${branch} does not exist.`);
  if (!refExists(baselineRef, repo, dependencies)) throw new Error(`Release baseline ref is missing: ${baselineRef}`);
  const devHead: any = resolveCommit(devRef, repo, dependencies);
  const devBaseline: any = resolveCommit(baselineRef, repo, dependencies);
  const releaseHead: any = resolveCommit(`refs/heads/${branch}`, repo, dependencies);
  const frozenAt: any = refExists(frozenRef, repo, dependencies) ? resolveCommit(frozenRef, repo, dependencies) : null;
  const abandonedAt: any = refExists(abandonedRef, repo, dependencies) ? resolveCommit(abandonedRef, repo, dependencies) : null;
  const releaseHistory: any = selectionCommits(devBaseline, releaseHead, repo, dependencies);
  const invalidSelection: any = releaseHistory.selectionChain.find((entry: any) => !ancestor(devBaseline, entry.sourceDevCommit, repo, dependencies) || !ancestor(entry.sourceDevCommit, devHead, repo, dependencies));
  const invalidHistory: any = releaseHistory.history.find((entry: any) => entry.kind === 'invalid');
  const invalidProvenance: any = invalidSelection ?? invalidHistory;
  const freezeHistory: any = readFreezeHistory(version, releaseHistory.history, devBaseline, repo, dependencies);
  const invalidFreeze: any = freezeHistory.find((entry: any) => entry.state !== 'valid');
  const freeze: any = frozenAt ? { state: frozenAt === releaseHead ? 'frozen' : 'stale', commit: frozenAt } : { state: 'open', commit: null };
  const abandon: any = abandonedAt ? { state: 'abandoned', commit: abandonedAt } : { state: 'active', commit: null };
  const model: any = {
    schemaVersion: releaseSelectionSchema,
    operation: 'inspect',
    version,
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
  if (state.status === 'abandoned') throw new Error(`Release ${state.version} was abandoned and cannot ${action}.`);
  if (state.status === 'stale') throw new Error(`Release ${state.version} has a stale freeze ref; inspect and recover before ${action}.`);
  if (state.status === 'blocked') throw new Error(`Release ${state.version} has invalid selection provenance.`);
  if (action === 'update' && state.status === 'frozen') throw new Error(`Release ${state.version} is frozen and cannot update.`);
}

export function inspectReleaseSelection(options: any = {}, dependencies: any = {}): any  {
  try {
    return readState(options, dependencies);
  } catch (error: any) {
    return errorResult('inspect', options.version, error);
  }
}

export function createReleaseSelection(options: any = {}, dependencies: any = {}): any  {
  const version: any = options.version;
  try {
    const required: any = requiredVersion(version);
    const branch: any = branchFor(required);
    const repo: any = path.resolve(options.repo ?? process.cwd());
    const executionBinding: any = requireExecutionBinding(options, repo);
    const devRef: any = options.devRef ?? 'dev';
    cleanWorktree(repo, dependencies);
    const branchRef: any = `refs/heads/${branch}`;
    const baselineRef: any = lifecycleRef(required, 'baseline');
    if (refExists(branchRef, repo, dependencies) || refExists(baselineRef, repo, dependencies)) throw new Error(`Release ${branch} already exists or has lifecycle refs.`);
    const baseline: any = resolveCommit(options.baseline, repo, dependencies);
    const devHead: any = resolveCommit(devRef, repo, dependencies);
    if (!ancestor(baseline, devHead, repo, dependencies)) throw new Error(`Dev baseline ${baseline} is not contained by current ${devRef} (${devHead}).`);
    if (executionBinding.head !== baseline) throw new Error(`Release Task Worktree HEAD ${executionBinding.head} does not match selected baseline ${baseline}.`);
    updateRefs([`create ${branchRef} ${baseline}`, `create ${baselineRef} ${baseline}`], repo, dependencies);
    const result: any = readState({ version: required, repo, devRef }, dependencies);
    return { ...result, operation: 'create', status: 'passed', executionBindingIdentity: executionBinding.identity, effects: [{ type: 'branch-created', ref: branchRef, commit: baseline }, { type: 'baseline-ref-created', ref: baselineRef, commit: baseline }], nextActions: ['按维护者明确顺序逐个调用 update；普通 dev 前进不会自动进入 release。'] };
  } catch (error: any) {
    return errorResult('create', version, error, { code: 'release_selection_create_blocked' });
  }
}

export function selectReleaseCommit(options: any = {}, dependencies: any = {}): any  {
  const version: any = options.version;
  try {
    const repo: any = path.resolve(options.repo ?? process.cwd());
    const executionBinding: any = requireExecutionBinding(options, repo);
    const state: any = readState({ ...options, version }, dependencies);
    assertActive(state, 'update');
    const currentBranch: any = runGit(['branch', '--show-current'], repo, dependencies).stdout.trim() || null;
    const currentHead: any = resolveCommit('HEAD', repo, dependencies);
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
    cleanWorktree(repo, dependencies);
    const source: any = resolveCommit(options.source, repo, dependencies);
    const devHead: any = resolveCommit(options.devRef ?? state.devRef, repo, dependencies);
    if (!ancestor(source, devHead, repo, dependencies)) throw new Error(`Selected source ${source} is not contained by current ${options.devRef ?? state.devRef}.`);
    if (!ancestor(state.devBaseline, source, repo, dependencies) || source === state.devBaseline) throw new Error(`Selected source ${source} must be after the release baseline.`);
    if (state.selectionChain.some((entry: any) => entry.sourceDevCommit === source)) throw new Error(`Selected source ${source} is already present in the release selection chain.`);
    const before: any = state.releaseHead;
    const cherryPick: any = runGit(['cherry-pick', '-x', source], repo, dependencies, { allowFailure: true });
    if (cherryPick.status !== 0) {
      const paths: any = runGit(['diff', '--name-only', '--diff-filter=U'], repo, dependencies, { allowFailure: true }).stdout.split(/\r?\n/u).map((value: any) => value.trim()).filter(Boolean).sort();
      return errorResult('update', version, new Error(`cherry-pick -x ${source} conflicted.`), {
        code: 'release_selection_conflict',
        details: { sourceDevCommit: source, preOperationReleaseHead: before, conflictPaths: paths, stderr: cherryPick.stderr.trim() },
        conflict: { sourceDevCommit: source, preOperationReleaseHead: before, conflictPaths: paths, recovery: 'git cherry-pick --abort' },
        nextActions: ['保留冲突现场供维护者处理；确认后执行 git cherry-pick --abort，再重新选择可应用的 commit。'],
      });
    }
    const selectedHead: any = resolveCommit('HEAD', repo, dependencies);
    runGit(['update-ref', `refs/heads/${state.branch}`, selectedHead, before], repo, dependencies);
    const synchronized: any = readState({ version, repo, devRef: options.devRef ?? state.devRef }, dependencies);
    const entry: any = synchronized.selectionChain.at(-1);
    if (synchronized.releaseHead === before || entry?.sourceDevCommit !== source) throw new Error('cherry-pick result did not produce a verifiable -x provenance commit.');
    return { ...synchronized, operation: 'update', status: 'passed', executionBindingIdentity: executionBinding.identity, effects: [{ type: 'release-commit-created', sourceDevCommit: source, resultReleaseCommit: synchronized.releaseHead, generation: synchronized.generation }], nextActions: ['继续逐个选择 commit，或对当前 release HEAD 执行 freeze。'] };
  } catch (error: any) {
    return errorResult('update', version, error, { code: 'release_selection_update_blocked' });
  }
}

export function freezeReleaseSelection(options: any = {}, dependencies: any = {}): any  {
  const version: any = options.version;
  try {
    const repo: any = path.resolve(options.repo ?? process.cwd());
    const executionBinding: any = requireExecutionBinding(options, repo);
    const state: any = readState(options, dependencies);
    assertActive(state, 'freeze');
    cleanWorktree(repo, dependencies);
    const frozenRef: any = lifecycleRef(version, 'frozen');
    const historyRef: any = freezeHistoryRef(version, state.generation);
    const existingHistory: any = state.freezeHistory.find((entry: any) => entry.generation === state.generation);
    if (state.freeze.state === 'frozen' && existingHistory?.commit === state.releaseHead) return { ...state, operation: 'freeze', status: 'passed', executionBindingIdentity: executionBinding.identity, effects: [], nextActions: ['下游 Candidate consumer 可使用当前 selectionIdentity。'] };
    const commands: any[] = [existingHistory ? `verify ${historyRef} ${state.releaseHead}` : `create ${historyRef} ${state.releaseHead}`];
    if (state.freeze.state === 'frozen') commands.push(`verify ${frozenRef} ${state.releaseHead}`);
    else commands.push(`create ${frozenRef} ${state.releaseHead}`);
    updateRefs(commands, repo, dependencies);
    const result: any = readState(options, dependencies);
    return { ...result, operation: 'freeze', status: 'passed', executionBindingIdentity: executionBinding.identity, effects: [{ type: 'release-frozen', ref: frozenRef, historyRef, commit: state.releaseHead, generation: state.generation }], nextActions: ['下游 consumer 必须绑定当前 selectionIdentity；reopen或任何 release 内容变化都会使旧Candidate、artifact、readiness与transaction context stale。'] };
  } catch (error: any) {
    return errorResult('freeze', version, error, { code: 'release_selection_freeze_blocked' });
  }
}

export function reconcileReleaseSelectionWithMain(options: any = {}, dependencies: any = {}): any  {
  const version: any = options.version;
  try {
    if (options.confirm !== true) throw new Error('Main reconciliation requires explicit confirmation.');
    const reason: any = String(options.reason ?? '').trim();
    if (!reason) throw new Error('Main reconciliation requires a non-empty reason.');
    const repo: any = path.resolve(options.repo ?? process.cwd());
    const executionBinding: any = requireExecutionBinding(options, repo);
    const state: any = readState(options, dependencies);
    if (state.status !== 'frozen') throw new Error(`Release ${state.version} must be currently frozen before main reconciliation.`);
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
    cleanWorktree(repo, dependencies);
    if (ancestor(mainCommit, releaseParent, repo, dependencies)) {
      const coverageIdentity: any = digest({ version: state.version, mainParent: mainCommit, releaseParent, disposition: 'main-ancestor' });
      return { ...state, operation: 'reconcile-main', status: 'passed', action: 'already-converged', executionBindingIdentity: executionBinding.identity, effects: [], reconciliation: { mainParent: mainCommit, releaseParent, coverageIdentity, resultReleaseCommit: releaseParent }, nextActions: ['current main已在release历史中；当前frozen generation可作为Candidate最终source。'] };
    }
    if (previous) throw new Error(`Release ${state.version} already has a main reconciliation for ${previous.mainParent}; current main is not an ancestor, so a second reconciliation requires a new explicit lifecycle design.`);
    const mergeBase: any = runGit(['merge-base', releaseParent, mainCommit], repo, dependencies).stdout.trim();
    const mainPaths: any = changedPaths(mergeBase, mainCommit, repo, dependencies).filter(releaseProductPath);
    const releasePaths: any = new Set(changedPaths(mergeBase, releaseParent, repo, dependencies).filter(releaseProductPath));
    const uncoveredPaths: any = mainPaths.filter((entry: any) => !releasePaths.has(entry));
    const coverageIdentity: any = digest({ version: state.version, mainParent: mainCommit, releaseParent, mergeBase, mainPaths, releasePaths: [...releasePaths].sort(), uncoveredPaths });
    if (uncoveredPaths.length) return errorResult('reconcile-main', version, new Error('Current main contains product paths not covered by current dev/release provenance.'), {
      code: 'release_main_coverage_incomplete',
      details: { mainParent: mainCommit, releaseParent, mergeBase, uncoveredPaths, coverageIdentity },
      nextActions: ['先通过正式Task把列出的main独有内容交付dev，再选择该dev commit并重新执行coverage。'],
    });
    const releaseTree: any = treeOf(releaseParent, repo, dependencies);
    const resolutionIdentity: any = digest({ version: state.version, mainParent: mainCommit, releaseParent, releaseTree, coverageIdentity, reason });
    const message: any = [
      `Release ${state.version} main reconciliation`,
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
    const parents: any = commitParents(reconciledCommit, repo, dependencies);
    if (!parents.includes(mainCommit) || !parents.includes(releaseParent)) throw new Error('Main reconciliation commit does not contain the expected main and release parents.');
    const newGeneration: any = state.generation + 1;
    const frozenRef: any = lifecycleRef(state.version, 'frozen');
    const historyRef: any = freezeHistoryRef(state.version, newGeneration);
    const branchUpdates: any = executionBinding.branch === state.branch
      ? [`update refs/heads/${state.branch} ${reconciledCommit} ${releaseParent}`]
      : [`update refs/heads/${executionBinding.branch} ${reconciledCommit} ${releaseParent}`, `update refs/heads/${state.branch} ${reconciledCommit} ${releaseParent}`];
    updateRefs([
      `create ${historyRef} ${reconciledCommit}`,
      `update ${frozenRef} ${reconciledCommit} ${state.freeze.commit}`,
      ...branchUpdates,
    ], repo, dependencies);
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
    return errorResult('reconcile-main', version, error, { code: 'release_main_reconciliation_blocked' });
  }
}

export function reopenReleaseSelection(options: any = {}, dependencies: any = {}): any  {
  const version: any = options.version;
  try {
    if (options.confirm !== true) throw new Error('Release reopen requires explicit confirmation.');
    const reason: any = String(options.reason ?? '').trim();
    if (!reason) throw new Error('Release reopen requires a non-empty reason.');
    const repo: any = path.resolve(options.repo ?? process.cwd());
    const executionBinding: any = requireExecutionBinding(options, repo);
    const state: any = readState(options, dependencies);
    assertActive(state, 'reopen');
    if (state.status !== 'frozen') throw new Error(`Release ${state.version} is not currently frozen and cannot reopen.`);
    cleanWorktree(repo, dependencies);
    const frozenRef: any = lifecycleRef(version, 'frozen');
    const historyRef: any = freezeHistoryRef(version, state.generation);
    const existingHistory: any = state.freezeHistory.find((entry: any) => entry.generation === state.generation);
    const commands: any[] = [existingHistory ? `verify ${historyRef} ${state.releaseHead}` : `create ${historyRef} ${state.releaseHead}`, `delete ${frozenRef} ${state.releaseHead}`];
    updateRefs(commands, repo, dependencies);
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
    return errorResult('reopen', version, error, { code: 'release_selection_reopen_blocked', nextActions: ['核对current frozen selection、clean worktree、公开发布事实与显式confirmation/reason后重试；不得直接update或移动remote ref。'] });
  }
}

export function abandonReleaseSelection(options: any = {}, dependencies: any = {}): any  {
  const version: any = options.version;
  try {
    const repo: any = path.resolve(options.repo ?? process.cwd());
    const executionBinding: any = requireExecutionBinding(options, repo);
    const state: any = readState(options, dependencies);
    const abandonedRef: any = lifecycleRef(version, 'abandoned');
    if (state.abandon.state === 'abandoned') return { ...state, operation: 'abandon', status: 'passed', effects: [], nextActions: ['保留既有 Git/Task 事实；不得将 abandoned 集合送入 Candidate 或 publication。'] };
    runGit(['update-ref', abandonedRef, state.releaseHead], repo, dependencies);
    const result: any = readState(options, dependencies);
    return { ...result, operation: 'abandon', status: 'passed', executionBindingIdentity: executionBinding.identity, effects: [{ type: 'release-abandoned', ref: abandonedRef, commit: state.releaseHead }], nextActions: ['如确认不再需要本地恢复，另行显式调用 cleanup；远端 ref 需要独立授权。'] };
  } catch (error: any) {
    return errorResult('abandon', version, error, { code: 'release_selection_abandon_blocked' });
  }
}

export function inspectReleaseSelectionCleanup(options: any = {}, dependencies: any = {}): any  {
  const version: any = options.version;
  try {
    const required: any = requiredVersion(version);
    const repo: any = path.resolve(options.repo ?? process.cwd());
    const branch: any = branchFor(required);
    const branchRef: any = `refs/heads/${branch}`;
    const currentBranch: any = runGit(['branch', '--show-current'], repo, dependencies).stdout.trim();
    if (currentBranch === branch) throw new Error(`Cannot cleanup checked-out release branch ${branch}; checkout another branch first.`);
    const refs: any = refsUnder(`refs/buildr/release/${required}/`, repo, dependencies).map((entry: any) => entry.ref);
    const branchExists: any = refExists(branchRef, repo, dependencies);
    const state: any = branchExists || refs.length ? readState(options, dependencies) : null;
    const cleanupAuthority: any = requireCleanupAuthority(options, repo, state);
    return { schemaVersion: releaseSelectionSchema, operation: 'inspect-cleanup', version: required, branch, status: 'ready', branchExists, refs, cleanupAuthority, effects: [], nextActions: [] };
  } catch (error: any) {
    return errorResult('inspect-cleanup', version, error, { code: 'release_selection_cleanup_blocked' });
  }
}

export function cleanupReleaseSelection(options: any = {}, dependencies: any = {}): any  {
  const version: any = options.version;
  try {
    const required: any = requiredVersion(version);
    if (options.confirm !== true) throw new Error('Local release cleanup requires explicit confirmation.');
    const repo: any = path.resolve(options.repo ?? process.cwd());
    const inspected: any = inspectReleaseSelectionCleanup(options, dependencies);
    if (inspected.status !== 'ready') return { ...inspected, operation: 'cleanup' };
    const branch: any = inspected.branch;
    const branchRef: any = `refs/heads/${branch}`;
    const refs: any = inspected.refs;
    const branchExists: any = inspected.branchExists;
    const cleanupAuthority: any = inspected.cleanupAuthority;
    if (!branchExists && refs.length === 0) {
      return { schemaVersion: releaseSelectionSchema, operation: 'cleanup', version: required, branch, status: 'passed', action: 'already-cleaned', cleanupAuthority, effects: [], nextActions: [] };
    }
    if (branchExists) runGit(['branch', '-D', branch], repo, dependencies);
    for (const ref of refs) runGit(['update-ref', '-d', ref], repo, dependencies);
    return { schemaVersion: releaseSelectionSchema, operation: 'cleanup', version: required, branch, status: 'passed', action: 'cleaned', cleanupAuthority, effects: [...(branchExists ? [{ type: 'branch-deleted', ref: branchRef }] : []), ...refs.map((ref: any) => ({ type: 'lifecycle-ref-deleted', ref }))], nextActions: [] };
  } catch (error: any) {
    return errorResult('cleanup', version, error, { code: 'release_selection_cleanup_blocked', nextActions: ['确认本地 branch 未 checkout、资源ownership明确且传入 --confirm 后重试；正式远端release ref由独立owner核验。'] });
  }
}

export const createReleaseCollection: any = createReleaseSelection;
export const updateReleaseSelection: any = selectReleaseCommit;
export const inspectReleaseCollection: any = inspectReleaseSelection;

function cliOptions(parsed: any): any  {
  const executionBindingFile: any = parsed.option('execution-binding');
  return {
    version: requireOption(parsed, 'version'),
    repo: parsed.option('repo'),
    devRef: parsed.option('dev-ref', 'dev'),
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
  if (!['create', 'update', 'inspect', 'freeze', 'reconcile-main', 'reopen', 'abandon', 'cleanup'].includes(operation)) throw new Error('Usage: release-selection.ts <create|update|inspect|freeze|reconcile-main|reopen|abandon|cleanup> --version <version> [--repo <path>] [--execution-binding <json>] [--dev-ref <ref>] [--baseline <commit>] [--source <commit>] [--main-ref <ref>] [--reason <text>] [--confirm]');
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
