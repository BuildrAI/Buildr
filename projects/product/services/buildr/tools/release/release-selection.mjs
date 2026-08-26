#!/usr/bin/env node

import crypto from 'node:crypto';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { parseArguments, requireOption } from './release-files.mjs';

export const releaseSelectionSchema = 'buildr.release-selection/v1';
export const releaseSelectionSchemaVersion = releaseSelectionSchema;
const SHA = /^[0-9a-f]{40}$/u;
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u;

function executeGit(command, args, options = {}) {
  return spawnSync(command, args, { cwd: options.cwd, encoding: 'utf8', windowsHide: true, input: options.input });
}

function runGit(args, repo, dependencies, { allowFailure = false, input } = {}) {
  const result = (dependencies.execute ?? executeGit)('git', args, { cwd: repo, input });
  if (result?.error) throw new Error(`git ${args.join(' ')} failed to start: ${result.error.message}`);
  if (!allowFailure && result?.status !== 0) {
    const detail = [result?.stdout, result?.stderr].filter(Boolean).join('\n').trim();
    throw new Error(`git ${args.join(' ')} failed${detail ? `: ${detail}` : ''}`);
  }
  return { status: result?.status ?? 1, stdout: String(result?.stdout ?? ''), stderr: String(result?.stderr ?? '') };
}

function requiredVersion(value) {
  if (!VERSION.test(value ?? '')) throw new Error('Release version must be a valid semantic version without the leading v.');
  return value;
}

function branchFor(version) {
  return `release-${requiredVersion(version)}`;
}

function lifecycleRef(version, state) {
  return `refs/buildr/release/${requiredVersion(version)}/${state}`;
}

function freezeHistoryRef(version, generation) {
  if (!Number.isSafeInteger(generation) || generation < 0) throw new Error('Release freeze generation must be a non-negative integer.');
  return `${lifecycleRef(version, 'freezes')}/${generation}`;
}

function resolveCommit(ref, repo, dependencies, { allowFailure = false } = {}) {
  const result = runGit(['rev-parse', '--verify', `${ref}^{commit}`], repo, dependencies, { allowFailure: true });
  const commit = result.stdout.trim();
  if (result.status !== 0 || !SHA.test(commit)) {
    if (allowFailure) return null;
    throw new Error(`Git commit is unavailable: ${ref}`);
  }
  return commit;
}

function refExists(ref, repo, dependencies) {
  return runGit(['show-ref', '--verify', '--quiet', ref], repo, dependencies, { allowFailure: true }).status === 0;
}

function cleanWorktree(repo, dependencies) {
  const result = runGit(['status', '--porcelain=v1', '--untracked-files=all'], repo, dependencies);
  if (result.stdout.trim()) throw new Error('Release selection requires a clean worktree.');
}

function ancestor(older, newer, repo, dependencies) {
  return runGit(['merge-base', '--is-ancestor', older, newer], repo, dependencies, { allowFailure: true }).status === 0;
}

function treeOf(commit, repo, dependencies) {
  return runGit(['rev-parse', `${commit}^{tree}`], repo, dependencies).stdout.trim();
}

function changedPaths(from, to, repo, dependencies) {
  const result = runGit(['diff', '--name-only', '--diff-filter=ACDMRTUXB', `${from}..${to}`], repo, dependencies);
  return [...new Set(result.stdout.split(/\r?\n/u).map((value) => value.trim()).filter(Boolean))].sort();
}

function commitChangedPaths(commit, repo, dependencies) {
  return changedPaths(`${commit}^`, commit, repo, dependencies);
}

function commitBody(commit, repo, dependencies) {
  return runGit(['show', '-s', '--format=%B', commit], repo, dependencies).stdout;
}

function commitParents(commit, repo, dependencies) {
  const values = runGit(['rev-list', '--parents', '-n', '1', commit], repo, dependencies).stdout.trim().split(/\s+/u);
  return values.slice(1).filter((value) => SHA.test(value));
}

function trailer(body, name) {
  const match = body.match(new RegExp(`^${name}:\\s*((?:sha256-)?[0-9a-f]{40,64})\\s*$`, 'imu'));
  return match?.[1] ?? null;
}

function mainReconciliationMetadata(commit, repo, dependencies) {
  const parents = commitParents(commit, repo, dependencies);
  const body = commitBody(commit, repo, dependencies);
  const mainParent = trailer(body, 'Buildr-Main-Reconciliation-Main');
  const releaseParent = trailer(body, 'Buildr-Main-Reconciliation-Release');
  const resolutionIdentity = trailer(body, 'Buildr-Main-Reconciliation-Resolution');
  if (parents.length < 2 || !mainParent || !releaseParent || !resolutionIdentity) return null;
  if (!parents.includes(mainParent) || !parents.includes(releaseParent)) return null;
  return { parents, mainParent, releaseParent, resolutionIdentity };
}

function selectionSource(commit, repo, dependencies) {
  const body = commitBody(commit, repo, dependencies);
  const match = body.match(/cherry picked from commit ([0-9a-f]{40})/iu);
  return match?.[1] ?? null;
}

function selectionCommits(baseline, branchHead, repo, dependencies) {
  const result = runGit(['rev-list', '--reverse', '--first-parent', `${baseline}..${branchHead}`], repo, dependencies);
  const history = result.stdout.split(/\r?\n/u).map((value) => value.trim()).filter(Boolean).map((commit, index) => {
    const reconciliation = mainReconciliationMetadata(commit, repo, dependencies);
    if (reconciliation) return {
      kind: 'main-reconciliation',
      order: index + 1,
      sourceDevCommit: null,
      resultReleaseCommit: commit,
      changedPaths: commitChangedPaths(commit, repo, dependencies),
      reconciliationIdentity: digest({ commit, ...reconciliation }),
      ...reconciliation,
    };
    const sourceDevCommit = selectionSource(commit, repo, dependencies);
    return {
      kind: sourceDevCommit ? 'selection' : 'invalid',
      order: index + 1,
      sourceDevCommit,
      resultReleaseCommit: commit,
      changedPaths: commitChangedPaths(commit, repo, dependencies),
    };
  });
  const selectionChain = history.filter((entry) => entry.kind === 'selection').map((entry, index) => ({ ...entry, order: index + 1 }));
  const reconciliationChain = history.filter((entry) => entry.kind === 'main-reconciliation').map((entry, index) => ({ ...entry, order: index + 1 }));
  return { history, selectionChain, reconciliationChain };
}

function refsUnder(prefix, repo, dependencies) {
  return runGit(['for-each-ref', '--format=%(refname) %(objectname)', prefix], repo, dependencies).stdout
    .split(/\r?\n/u)
    .map((value) => value.trim())
    .filter(Boolean)
    .map((line) => {
      const separator = line.indexOf(' ');
      return { ref: line.slice(0, separator), commit: line.slice(separator + 1) };
    });
}

function readFreezeHistory(version, releaseHistory, devBaseline, repo, dependencies) {
  const prefix = `${lifecycleRef(version, 'freezes')}/`;
  return refsUnder(prefix, repo, dependencies).map(({ ref, commit }) => {
    const suffix = ref.slice(prefix.length);
    const generation = /^\d+$/u.test(suffix) ? Number(suffix) : Number.NaN;
    if (!Number.isSafeInteger(generation) || generation < 0 || !SHA.test(commit)) {
      return { generation: null, commit, ref, state: 'invalid', tree: null };
    }
    const expectedCommit = generation === 0 ? devBaseline : releaseHistory[generation - 1]?.resultReleaseCommit;
    return {
      generation,
      commit,
      ref,
      state: expectedCommit === commit ? 'valid' : 'invalid',
      tree: treeOf(commit, repo, dependencies),
    };
  }).sort((left, right) => (left.generation ?? Number.MAX_SAFE_INTEGER) - (right.generation ?? Number.MAX_SAFE_INTEGER) || left.ref.localeCompare(right.ref));
}

function updateRefs(commands, repo, dependencies) {
  const input = ['start', ...commands, 'prepare', 'commit', ''].join('\n');
  runGit(['update-ref', '--stdin'], repo, dependencies, { input });
}

function selectionIdentity(model) {
  const stable = {
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

function digest(value) {
  return `sha256-${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

function errorResult(operation, version, error, extra = {}) {
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

function readState(options, dependencies) {
  const version = requiredVersion(options.version);
  const branch = branchFor(version);
  const repo = path.resolve(options.repo ?? process.cwd());
  const devRef = options.devRef ?? 'dev';
  const baselineRef = lifecycleRef(version, 'baseline');
  const frozenRef = lifecycleRef(version, 'frozen');
  const abandonedRef = lifecycleRef(version, 'abandoned');
  if (!refExists(`refs/heads/${branch}`, repo, dependencies)) throw new Error(`Release branch ${branch} does not exist.`);
  if (!refExists(baselineRef, repo, dependencies)) throw new Error(`Release baseline ref is missing: ${baselineRef}`);
  const devHead = resolveCommit(devRef, repo, dependencies);
  const devBaseline = resolveCommit(baselineRef, repo, dependencies);
  const releaseHead = resolveCommit(`refs/heads/${branch}`, repo, dependencies);
  const frozenAt = refExists(frozenRef, repo, dependencies) ? resolveCommit(frozenRef, repo, dependencies) : null;
  const abandonedAt = refExists(abandonedRef, repo, dependencies) ? resolveCommit(abandonedRef, repo, dependencies) : null;
  const releaseHistory = selectionCommits(devBaseline, releaseHead, repo, dependencies);
  const invalidSelection = releaseHistory.selectionChain.find((entry) => !ancestor(devBaseline, entry.sourceDevCommit, repo, dependencies) || !ancestor(entry.sourceDevCommit, devHead, repo, dependencies));
  const invalidHistory = releaseHistory.history.find((entry) => entry.kind === 'invalid');
  const invalidProvenance = invalidSelection ?? invalidHistory;
  const freezeHistory = readFreezeHistory(version, releaseHistory.history, devBaseline, repo, dependencies);
  const invalidFreeze = freezeHistory.find((entry) => entry.state !== 'valid');
  const freeze = frozenAt ? { state: frozenAt === releaseHead ? 'frozen' : 'stale', commit: frozenAt } : { state: 'open', commit: null };
  const abandon = abandonedAt ? { state: 'abandoned', commit: abandonedAt } : { state: 'active', commit: null };
  const model = {
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

function assertActive(state, action) {
  if (state.status === 'abandoned') throw new Error(`Release ${state.version} was abandoned and cannot ${action}.`);
  if (state.status === 'stale') throw new Error(`Release ${state.version} has a stale freeze ref; inspect and recover before ${action}.`);
  if (state.status === 'blocked') throw new Error(`Release ${state.version} has invalid selection provenance.`);
  if (action === 'update' && state.status === 'frozen') throw new Error(`Release ${state.version} is frozen and cannot update.`);
}

export function inspectReleaseSelection(options = {}, dependencies = {}) {
  try {
    return readState(options, dependencies);
  } catch (error) {
    return errorResult('inspect', options.version, error);
  }
}

export function createReleaseSelection(options = {}, dependencies = {}) {
  const version = options.version;
  try {
    const required = requiredVersion(version);
    const branch = branchFor(required);
    const repo = path.resolve(options.repo ?? process.cwd());
    const devRef = options.devRef ?? 'dev';
    cleanWorktree(repo, dependencies);
    const branchRef = `refs/heads/${branch}`;
    const baselineRef = lifecycleRef(required, 'baseline');
    if (refExists(branchRef, repo, dependencies) || refExists(baselineRef, repo, dependencies)) throw new Error(`Release ${branch} already exists or has lifecycle refs.`);
    const baseline = resolveCommit(options.baseline, repo, dependencies);
    const devHead = resolveCommit(devRef, repo, dependencies);
    if (!ancestor(baseline, devHead, repo, dependencies)) throw new Error(`Dev baseline ${baseline} is not contained by current ${devRef} (${devHead}).`);
    runGit(['checkout', '-b', branch, baseline], repo, dependencies);
    runGit(['update-ref', baselineRef, baseline], repo, dependencies);
    const result = readState({ version: required, repo, devRef }, dependencies);
    return { ...result, operation: 'create', status: 'passed', effects: [{ type: 'branch-created', ref: branchRef, commit: baseline }, { type: 'baseline-ref-created', ref: baselineRef, commit: baseline }], nextActions: ['按维护者明确顺序逐个调用 update；普通 dev 前进不会自动进入 release。'] };
  } catch (error) {
    return errorResult('create', version, error, { code: 'release_selection_create_blocked' });
  }
}

export function selectReleaseCommit(options = {}, dependencies = {}) {
  const version = options.version;
  try {
    const repo = path.resolve(options.repo ?? process.cwd());
    const state = readState({ ...options, version }, dependencies);
    assertActive(state, 'update');
    const currentBranch = runGit(['branch', '--show-current'], repo, dependencies).stdout.trim() || null;
    const currentHead = resolveCommit('HEAD', repo, dependencies);
    if (currentBranch !== state.branch || currentHead !== state.releaseHead) {
      return errorResult('update', version, new Error(`Release selection update requires checkout ${state.branch} at ${state.releaseHead}; current checkout is ${currentBranch ?? 'detached'} at ${currentHead}.`), {
        code: 'release_selection_target_mismatch',
        details: {
          expectedBranch: state.branch,
          expectedHead: state.releaseHead,
          actualBranch: currentBranch,
          actualHead: currentHead,
        },
        nextActions: [`切换到 ${state.branch} 并确认 HEAD 为 ${state.releaseHead} 后重试；当前 workspace 不得执行 Release selection update。`],
      });
    }
    cleanWorktree(repo, dependencies);
    const source = resolveCommit(options.source, repo, dependencies);
    const devHead = resolveCommit(options.devRef ?? state.devRef, repo, dependencies);
    if (!ancestor(source, devHead, repo, dependencies)) throw new Error(`Selected source ${source} is not contained by current ${options.devRef ?? state.devRef}.`);
    if (!ancestor(state.devBaseline, source, repo, dependencies) || source === state.devBaseline) throw new Error(`Selected source ${source} must be after the release baseline.`);
    if (state.selectionChain.some((entry) => entry.sourceDevCommit === source)) throw new Error(`Selected source ${source} is already present in the release selection chain.`);
    const before = state.releaseHead;
    const cherryPick = runGit(['cherry-pick', '-x', source], repo, dependencies, { allowFailure: true });
    if (cherryPick.status !== 0) {
      const paths = runGit(['diff', '--name-only', '--diff-filter=U'], repo, dependencies, { allowFailure: true }).stdout.split(/\r?\n/u).map((value) => value.trim()).filter(Boolean).sort();
      return errorResult('update', version, new Error(`cherry-pick -x ${source} conflicted.`), {
        code: 'release_selection_conflict',
        details: { sourceDevCommit: source, preOperationReleaseHead: before, conflictPaths: paths, stderr: cherryPick.stderr.trim() },
        conflict: { sourceDevCommit: source, preOperationReleaseHead: before, conflictPaths: paths, recovery: 'git cherry-pick --abort' },
        nextActions: ['保留冲突现场供维护者处理；确认后执行 git cherry-pick --abort，再重新选择可应用的 commit。'],
      });
    }
    const after = readState({ version, repo, devRef: options.devRef ?? state.devRef }, dependencies);
    const entry = after.selectionChain.at(-1);
    if (after.releaseHead === before || entry?.sourceDevCommit !== source) throw new Error('cherry-pick result did not produce a verifiable -x provenance commit.');
    return { ...after, operation: 'update', status: 'passed', effects: [{ type: 'release-commit-created', sourceDevCommit: source, resultReleaseCommit: after.releaseHead, generation: after.generation }], nextActions: ['继续逐个选择 commit，或对当前 release HEAD 执行 freeze。'] };
  } catch (error) {
    return errorResult('update', version, error, { code: 'release_selection_update_blocked' });
  }
}

export function freezeReleaseSelection(options = {}, dependencies = {}) {
  const version = options.version;
  try {
    const repo = path.resolve(options.repo ?? process.cwd());
    const state = readState(options, dependencies);
    assertActive(state, 'freeze');
    cleanWorktree(repo, dependencies);
    const frozenRef = lifecycleRef(version, 'frozen');
    const historyRef = freezeHistoryRef(version, state.generation);
    const existingHistory = state.freezeHistory.find((entry) => entry.generation === state.generation);
    if (state.freeze.state === 'frozen' && existingHistory?.commit === state.releaseHead) return { ...state, operation: 'freeze', status: 'passed', effects: [], nextActions: ['下游 Candidate consumer 可使用当前 selectionIdentity。'] };
    const commands = [existingHistory ? `verify ${historyRef} ${state.releaseHead}` : `create ${historyRef} ${state.releaseHead}`];
    if (state.freeze.state === 'frozen') commands.push(`verify ${frozenRef} ${state.releaseHead}`);
    else commands.push(`create ${frozenRef} ${state.releaseHead}`);
    updateRefs(commands, repo, dependencies);
    const result = readState(options, dependencies);
    return { ...result, operation: 'freeze', status: 'passed', effects: [{ type: 'release-frozen', ref: frozenRef, historyRef, commit: state.releaseHead, generation: state.generation }], nextActions: ['下游 consumer 必须绑定当前 selectionIdentity；reopen或任何 release 内容变化都会使旧Candidate、artifact、readiness与transaction context stale。'] };
  } catch (error) {
    return errorResult('freeze', version, error, { code: 'release_selection_freeze_blocked' });
  }
}

export function reconcileReleaseSelectionWithMain(options = {}, dependencies = {}) {
  const version = options.version;
  try {
    if (options.confirm !== true) throw new Error('Main reconciliation requires explicit confirmation.');
    const reason = String(options.reason ?? '').trim();
    if (!reason) throw new Error('Main reconciliation requires a non-empty reason.');
    const repo = path.resolve(options.repo ?? process.cwd());
    const state = readState(options, dependencies);
    if (state.status !== 'frozen') throw new Error(`Release ${state.version} must be currently frozen before main reconciliation.`);
    const currentBranch = runGit(['branch', '--show-current'], repo, dependencies).stdout.trim() || null;
    const currentHead = resolveCommit('HEAD', repo, dependencies);
    if (currentBranch !== state.branch || currentHead !== state.releaseHead) throw new Error(`Main reconciliation requires checkout ${state.branch} at ${state.releaseHead}; current checkout is ${currentBranch ?? 'detached'} at ${currentHead}.`);
    const mainRef = options.mainRef ?? 'origin/main';
    const mainCommit = resolveCommit(mainRef, repo, dependencies);
    const previous = state.reconciliationChain.at(-1);
    if (previous?.mainParent === mainCommit && previous.resultReleaseCommit === state.releaseHead && state.freeze.commit === state.releaseHead) {
      return { ...state, operation: 'reconcile-main', status: 'passed', action: 'already-converged', effects: [], reconciliation: previous, nextActions: ['使用当前 release generation 重新生成 Candidate、artifact 与 readiness。'] };
    }
    if (previous) throw new Error(`Release ${state.version} already has a main reconciliation for ${previous.mainParent}; a second reconciliation is not allowed.`);

    const mergeHead = resolveCommit('MERGE_HEAD', repo, dependencies, { allowFailure: true });
    const mergeInProgress = mergeHead !== null;
    const releaseParent = state.releaseHead;
    if (mergeInProgress && mergeHead !== mainCommit) throw new Error(`Existing merge in progress targets ${mergeHead}, not expected current main ${mainCommit}.`);
    if (!mergeInProgress) {
      cleanWorktree(repo, dependencies);
      const merged = runGit(['merge', '--no-ff', '--no-commit', mainRef], repo, dependencies, { allowFailure: true });
      if (merged.status !== 0) {
        const paths = runGit(['diff', '--name-only', '--diff-filter=U'], repo, dependencies, { allowFailure: true }).stdout.split(/\r?\n/u).map((value) => value.trim()).filter(Boolean).sort();
        return errorResult('reconcile-main', version, new Error(`main reconciliation merge of ${mainCommit} into ${releaseParent} requires conflict resolution.`), {
          code: 'release_main_reconciliation_conflict',
          details: { mainParent: mainCommit, releaseParent, conflictPaths: paths, stderr: merged.stderr.trim() },
          conflict: { mainParent: mainCommit, releaseParent, conflictPaths: paths, recovery: '解决冲突后重新调用 reconcile-main；不得使用 ours、reset 或 force push' },
          nextActions: ['在当前 release execution worktree 由维护者解决列出的语义冲突；解决后保持 MERGE_HEAD，再用同一 reason/confirm 重试。'],
        });
      }
    }
    const unresolved = runGit(['diff', '--name-only', '--diff-filter=U'], repo, dependencies, { allowFailure: true }).stdout.split(/\r?\n/u).map((value) => value.trim()).filter(Boolean).sort();
    if (unresolved.length) return errorResult('reconcile-main', version, new Error('Main reconciliation still has unresolved conflict paths.'), {
      code: 'release_main_reconciliation_unresolved',
      details: { mainParent: mainCommit, releaseParent, conflictPaths: unresolved },
      conflict: { mainParent: mainCommit, releaseParent, conflictPaths: unresolved, recovery: '解决全部冲突后重新调用 reconcile-main' },
      nextActions: ['解决全部冲突并确认 index 无未合并路径；不得直接提交未解决现场。'],
    });
    const resolvedTree = runGit(['write-tree'], repo, dependencies).stdout.trim();
    const resolutionIdentity = digest({ version: state.version, mainParent: mainCommit, releaseParent, resolvedTree, reason });
    const message = [
      `Release ${state.version} main reconciliation`,
      '',
      reason,
      '',
      `Buildr-Main-Reconciliation-Main: ${mainCommit}`,
      `Buildr-Main-Reconciliation-Release: ${releaseParent}`,
      `Buildr-Main-Reconciliation-Resolution: ${resolutionIdentity}`,
    ].join('\n');
    runGit(['commit', '-m', message], repo, dependencies);
    const reconciledCommit = resolveCommit('HEAD', repo, dependencies);
    const parents = commitParents(reconciledCommit, repo, dependencies);
    if (!parents.includes(mainCommit) || !parents.includes(releaseParent)) throw new Error('Main reconciliation commit does not contain the expected main and release parents.');
    const newGeneration = state.generation + 1;
    const frozenRef = lifecycleRef(state.version, 'frozen');
    const historyRef = freezeHistoryRef(state.version, newGeneration);
    updateRefs([
      `create ${historyRef} ${reconciledCommit}`,
      `update ${frozenRef} ${reconciledCommit} ${state.freeze.commit}`,
    ], repo, dependencies);
    const result = readState(options, dependencies);
    return {
      ...result,
      operation: 'reconcile-main',
      status: 'passed',
      action: 'reconciled',
      effects: [{ type: 'main-reconciliation-merge-created', mainParent: mainCommit, releaseParent, resultReleaseCommit: reconciledCommit, generation: newGeneration, resolutionIdentity }],
      reconciliation: result.reconciliationChain.at(-1),
      nextActions: ['旧 Candidate、artifact、readiness 与 transaction context 已失效；对新的 release HEAD/tree 重新运行完整 Candidate。'],
    };
  } catch (error) {
    return errorResult('reconcile-main', version, error, { code: 'release_main_reconciliation_blocked' });
  }
}

export function reopenReleaseSelection(options = {}, dependencies = {}) {
  const version = options.version;
  try {
    if (options.confirm !== true) throw new Error('Release reopen requires explicit confirmation.');
    const reason = String(options.reason ?? '').trim();
    if (!reason) throw new Error('Release reopen requires a non-empty reason.');
    const repo = path.resolve(options.repo ?? process.cwd());
    const state = readState(options, dependencies);
    assertActive(state, 'reopen');
    if (state.status !== 'frozen') throw new Error(`Release ${state.version} is not currently frozen and cannot reopen.`);
    cleanWorktree(repo, dependencies);
    const frozenRef = lifecycleRef(version, 'frozen');
    const historyRef = freezeHistoryRef(version, state.generation);
    const existingHistory = state.freezeHistory.find((entry) => entry.generation === state.generation);
    const commands = [existingHistory ? `verify ${historyRef} ${state.releaseHead}` : `create ${historyRef} ${state.releaseHead}`, `delete ${frozenRef} ${state.releaseHead}`];
    updateRefs(commands, repo, dependencies);
    const result = readState(options, dependencies);
    return {
      ...result,
      operation: 'reopen',
      status: 'passed',
      effects: [{ type: 'release-reopened', ref: frozenRef, historyRef, commit: state.releaseHead, generation: state.generation, reason }],
      nextActions: ['旧Candidate、artifact、readiness与transaction context已stale；按维护者明确顺序独立调用update，完成后重新freeze并运行完整Candidate。'],
    };
  } catch (error) {
    return errorResult('reopen', version, error, { code: 'release_selection_reopen_blocked', nextActions: ['核对current frozen selection、clean worktree、公开发布事实与显式confirmation/reason后重试；不得直接update或移动remote ref。'] });
  }
}

export function abandonReleaseSelection(options = {}, dependencies = {}) {
  const version = options.version;
  try {
    const repo = path.resolve(options.repo ?? process.cwd());
    const state = readState(options, dependencies);
    const abandonedRef = lifecycleRef(version, 'abandoned');
    if (state.abandon.state === 'abandoned') return { ...state, operation: 'abandon', status: 'passed', effects: [], nextActions: ['保留既有 Git/Task 事实；不得将 abandoned 集合送入 Candidate 或 publication。'] };
    runGit(['update-ref', abandonedRef, state.releaseHead], repo, dependencies);
    const result = readState(options, dependencies);
    return { ...result, operation: 'abandon', status: 'passed', effects: [{ type: 'release-abandoned', ref: abandonedRef, commit: state.releaseHead }], nextActions: ['如确认不再需要本地恢复，另行显式调用 cleanup；远端 ref 需要独立授权。'] };
  } catch (error) {
    return errorResult('abandon', version, error, { code: 'release_selection_abandon_blocked' });
  }
}

export function cleanupReleaseSelection(options = {}, dependencies = {}) {
  const version = options.version;
  try {
    const required = requiredVersion(version);
    if (options.confirm !== true) throw new Error('Local release cleanup requires explicit confirmation.');
    const repo = path.resolve(options.repo ?? process.cwd());
    const branch = branchFor(required);
    const branchRef = `refs/heads/${branch}`;
    const currentBranch = runGit(['branch', '--show-current'], repo, dependencies).stdout.trim();
    if (currentBranch === branch) throw new Error(`Cannot cleanup checked-out release branch ${branch}; checkout another branch first.`);
    const refs = refsUnder(`refs/buildr/release/${required}/`, repo, dependencies).map((entry) => entry.ref);
    const branchExists = refExists(branchRef, repo, dependencies);
    if (!branchExists && refs.length === 0) {
      return { schemaVersion: releaseSelectionSchema, operation: 'cleanup', version: required, branch, status: 'passed', action: 'already-cleaned', effects: [], nextActions: [] };
    }
    if (branchExists) runGit(['branch', '-D', branch], repo, dependencies);
    for (const ref of refs) runGit(['update-ref', '-d', ref], repo, dependencies);
    return { schemaVersion: releaseSelectionSchema, operation: 'cleanup', version: required, branch, status: 'passed', action: 'cleaned', effects: [...(branchExists ? [{ type: 'branch-deleted', ref: branchRef }] : []), ...refs.map((ref) => ({ type: 'lifecycle-ref-deleted', ref }))], nextActions: [] };
  } catch (error) {
    return errorResult('cleanup', version, error, { code: 'release_selection_cleanup_blocked', nextActions: ['确认本地 branch 未 checkout、资源ownership明确且传入 --confirm 后重试；正式远端release ref由独立owner核验。'] });
  }
}

export const createReleaseCollection = createReleaseSelection;
export const updateReleaseSelection = selectReleaseCommit;
export const inspectReleaseCollection = inspectReleaseSelection;

function cliOptions(parsed) {
  return {
    version: requireOption(parsed, 'version'),
    repo: parsed.option('repo'),
    devRef: parsed.option('dev-ref', 'dev'),
    baseline: parsed.option('baseline'),
    source: parsed.option('source'),
    reason: parsed.option('reason'),
    confirm: parsed.has('confirm'),
    mainRef: parsed.option('main-ref', 'origin/main'),
  };
}

function runCli(argv) {
  const parsed = parseArguments(argv);
  const operation = parsed.positionals[0];
  if (!['create', 'update', 'inspect', 'freeze', 'reconcile-main', 'reopen', 'abandon', 'cleanup'].includes(operation)) throw new Error('Usage: release-selection.mjs <create|update|inspect|freeze|reconcile-main|reopen|abandon|cleanup> --version <version> [--repo <path>] [--dev-ref <ref>] [--baseline <commit>] [--source <commit>] [--main-ref <ref>] [--reason <text>] [--confirm]');
  const options = cliOptions(parsed);
  if (operation === 'create' && !options.baseline) throw new Error('Missing required --baseline.');
  if (operation === 'update' && !options.source) throw new Error('Missing required --source.');
  const result = operation === 'create' ? createReleaseSelection(options) : operation === 'update' ? selectReleaseCommit(options) : operation === 'inspect' ? inspectReleaseSelection(options) : operation === 'freeze' ? freezeReleaseSelection(options) : operation === 'reconcile-main' ? reconcileReleaseSelectionWithMain(options) : operation === 'reopen' ? reopenReleaseSelection(options) : operation === 'abandon' ? abandonReleaseSelection(options) : cleanupReleaseSelection(options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.status === 'blocked') process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  try { runCli(process.argv.slice(2)); } catch (error) {
    process.stdout.write(`${JSON.stringify({ schemaVersion: releaseSelectionSchema, status: 'blocked', effects: [], diagnostic: { code: 'release_selection_invalid_input', message: error.message }, nextActions: [] }, null, 2)}\n`);
    process.exitCode = 1;
  }
}
