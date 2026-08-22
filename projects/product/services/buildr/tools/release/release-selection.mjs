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
  return spawnSync(command, args, { cwd: options.cwd, encoding: 'utf8', windowsHide: true });
}

function runGit(args, repo, dependencies, { allowFailure = false } = {}) {
  const result = (dependencies.execute ?? executeGit)('git', args, { cwd: repo });
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

function resolveCommit(ref, repo, dependencies) {
  const result = runGit(['rev-parse', '--verify', `${ref}^{commit}`], repo, dependencies, { allowFailure: true });
  const commit = result.stdout.trim();
  if (result.status !== 0 || !SHA.test(commit)) throw new Error(`Git commit is unavailable: ${ref}`);
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

function selectionSource(commit, repo, dependencies) {
  const body = commitBody(commit, repo, dependencies);
  const match = body.match(/cherry picked from commit ([0-9a-f]{40})/iu);
  return match?.[1] ?? null;
}

function selectionCommits(baseline, branchHead, repo, dependencies) {
  const result = runGit(['rev-list', '--reverse', '--first-parent', `${baseline}..${branchHead}`], repo, dependencies);
  return result.stdout.split(/\r?\n/u).map((value) => value.trim()).filter(Boolean).map((commit, index) => ({
    order: index + 1,
    sourceDevCommit: selectionSource(commit, repo, dependencies),
    resultReleaseCommit: commit,
    changedPaths: commitChangedPaths(commit, repo, dependencies),
  }));
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
    freeze: model.freeze,
    abandon: model.abandon,
  };
  return `sha256-${crypto.createHash('sha256').update(JSON.stringify(stable)).digest('hex')}`;
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
  const selectionChain = selectionCommits(devBaseline, releaseHead, repo, dependencies);
  const invalidSelection = selectionChain.find((entry) => !entry.sourceDevCommit || !ancestor(devBaseline, entry.sourceDevCommit, repo, dependencies) || !ancestor(entry.sourceDevCommit, devHead, repo, dependencies));
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
    generation: selectionChain.length,
    changedPaths: changedPaths(devBaseline, releaseHead, repo, dependencies),
    selectionChain,
    freeze,
    abandon,
    status: invalidSelection ? 'blocked' : abandon.state === 'abandoned' ? 'abandoned' : freeze.state === 'stale' ? 'stale' : freeze.state === 'frozen' ? 'frozen' : 'ready',
    integrity: invalidSelection ? { status: 'invalid', code: 'selection_provenance_missing', resultReleaseCommit: invalidSelection.resultReleaseCommit } : { status: 'valid' },
    effects: [],
    diagnostic: invalidSelection ? { code: 'selection_provenance_invalid', message: `Release commit ${invalidSelection.resultReleaseCommit} has missing or non-current cherry-pick -x provenance.` } : null,
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
    const frozenRef = lifecycleRef(version, 'frozen');
    if (state.freeze.state === 'frozen') return { ...state, operation: 'freeze', status: 'passed', effects: [], nextActions: ['下游 Candidate consumer 可使用当前 selectionIdentity。'] };
    runGit(['update-ref', frozenRef, state.releaseHead], repo, dependencies);
    const result = readState(options, dependencies);
    return { ...result, operation: 'freeze', status: 'passed', effects: [{ type: 'release-frozen', ref: frozenRef, commit: state.releaseHead, generation: state.generation }], nextActions: ['下游 consumer 必须绑定当前 selectionIdentity；任何 release 内容变化都会使 freeze stale。'] };
  } catch (error) {
    return errorResult('freeze', version, error, { code: 'release_selection_freeze_blocked' });
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
    const remoteRefs = runGit(['for-each-ref', '--format=%(refname)', `refs/remotes/*/${branch}`], repo, dependencies).stdout.split(/\r?\n/u).map((value) => value.trim()).filter(Boolean);
    if (remoteRefs.length > 0) throw new Error(`Remote release ref exists (${remoteRefs.join(', ')}); remote cleanup requires independent authorization.`);
    if (!refExists(branchRef, repo, dependencies)) throw new Error(`Release branch ${branch} does not exist.`);
    const refs = ['baseline', 'frozen', 'abandoned'].map((state) => lifecycleRef(required, state)).filter((ref) => refExists(ref, repo, dependencies));
    runGit(['branch', '-D', branch], repo, dependencies);
    for (const ref of refs) runGit(['update-ref', '-d', ref], repo, dependencies);
    return { schemaVersion: releaseSelectionSchema, operation: 'cleanup', version: required, branch, status: 'passed', effects: [{ type: 'branch-deleted', ref: branchRef }, ...refs.map((ref) => ({ type: 'lifecycle-ref-deleted', ref }))], nextActions: [] };
  } catch (error) {
    return errorResult('cleanup', version, error, { code: 'release_selection_cleanup_blocked', nextActions: ['确认本地 branch 未 checkout、remote ref 已独立处理且传入 --confirm 后重试。'] });
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
    confirm: parsed.has('confirm'),
  };
}

function runCli(argv) {
  const parsed = parseArguments(argv);
  const operation = parsed.positionals[0];
  if (!['create', 'update', 'inspect', 'freeze', 'abandon', 'cleanup'].includes(operation)) throw new Error('Usage: release-selection.mjs <create|update|inspect|freeze|abandon|cleanup> --version <version> [--repo <path>] [--dev-ref <ref>] [--baseline <commit>] [--source <commit>] [--confirm]');
  const options = cliOptions(parsed);
  if (operation === 'create' && !options.baseline) throw new Error('Missing required --baseline.');
  if (operation === 'update' && !options.source) throw new Error('Missing required --source.');
  const result = operation === 'create' ? createReleaseSelection(options) : operation === 'update' ? selectReleaseCommit(options) : operation === 'inspect' ? inspectReleaseSelection(options) : operation === 'freeze' ? freezeReleaseSelection(options) : operation === 'abandon' ? abandonReleaseSelection(options) : cleanupReleaseSelection(options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.status === 'blocked') process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  try { runCli(process.argv.slice(2)); } catch (error) {
    process.stdout.write(`${JSON.stringify({ schemaVersion: releaseSelectionSchema, status: 'blocked', effects: [], diagnostic: { code: 'release_selection_invalid_input', message: error.message }, nextActions: [] }, null, 2)}\n`);
    process.exitCode = 1;
  }
}
