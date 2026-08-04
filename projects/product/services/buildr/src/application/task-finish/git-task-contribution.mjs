import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const MAX_BUFFER = 64 * 1024 * 1024;
const CONTROL_SEGMENTS = new Set(['.buildr', '.git']);

function digest(value) {
  return `sha256-${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function normalizePath(value) {
  return path.posix.normalize(String(value || '').replaceAll('\\', '/')).replace(/^\.\//, '');
}

function deliverablePath(value) {
  const normalized = normalizePath(value);
  return Boolean(normalized) && !normalized.split('/').some((segment) => CONTROL_SEGMENTS.has(segment));
}

function git(root, args, options = {}) {
  return spawnSync('git', args, {
    cwd: root,
    encoding: options.encoding ?? 'utf8',
    maxBuffer: MAX_BUFFER,
    env: options.env || process.env,
    input: options.input,
  });
}

function gitText(root, args, options = {}) {
  const result = git(root, args, options);
  return result.status === 0 ? String(result.stdout).trim() : null;
}

function requireGitText(root, args, message, options = {}) {
  const value = gitText(root, args, options);
  if (!value) throw new Error(message);
  return value;
}

function nulPaths(result) {
  if (result.status !== 0) return null;
  return String(result.stdout).split('\0').filter(Boolean).map(normalizePath);
}

function taskSourcePaths(root, baselineHead) {
  const baseline = nulPaths(git(root, ['ls-tree', '-r', '-z', '--name-only', baselineHead]));
  const current = nulPaths(git(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard']));
  if (!baseline || !current) throw new Error('Unable to inventory Task source paths.');
  return [...new Set([...baseline, ...current].filter(deliverablePath))].sort();
}

function withTemporaryIndex(root, baselineHead, operation) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-task-contribution-'));
  try {
    const indexFile = path.join(temporary, 'index');
    const environment = { ...process.env, GIT_INDEX_FILE: indexFile };
    const read = git(root, ['read-tree', baselineHead], { env: environment });
    if (read.status !== 0) throw new Error(`Unable to seed Task source snapshot: ${read.stderr || read.stdout}`);
    const sourcePaths = taskSourcePaths(root, baselineHead);
    if (sourcePaths.length > 0) {
      const added = git(root, ['add', '-A', '-f', '--pathspec-from-file=-', '--pathspec-file-nul'], { env: environment, encoding: 'buffer', input: Buffer.from(`${sourcePaths.join('\0')}\0`) });
      if (added.status !== 0) throw new Error(`Unable to snapshot exact Task source: ${added.stderr || added.stdout}`);
    }
    const tree = requireGitText(root, ['write-tree'], 'Unable to write Task source snapshot tree.', { env: environment });
    return operation({ tree, environment, temporary });
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

function rawDelta(root, beforeTree, afterTree) {
  const result = git(root, ['diff-tree', '--no-commit-id', '-r', '--raw', '-z', '--no-renames', beforeTree, afterTree], { encoding: 'buffer' });
  if (result.status !== 0) throw new Error(`Unable to observe Task Contribution delta: ${String(result.stderr || result.stdout)}`);
  return Buffer.from(result.stdout);
}

function deltaIdentity(root, beforeTree, afterTree) {
  return digest(Buffer.concat([Buffer.from('buildr.git-task-contribution/v1\0'), rawDelta(root, beforeTree, afterTree)]));
}

function contributionPatch(root, beforeTree, afterTree) {
  const result = git(root, ['diff', '--binary', '--full-index', '--no-renames', beforeTree, afterTree, '--'], { encoding: 'buffer' });
  if (result.status !== 0) throw new Error(`Unable to materialize Task Contribution patch: ${String(result.stderr || result.stdout)}`);
  return Buffer.from(result.stdout);
}

function carrierRoot(workspaceRoot, runId) {
  const base = path.resolve(workspaceRoot, '.buildr', 'task-finish', 'carriers');
  const target = path.resolve(base, runId);
  if (path.dirname(target) !== base) throw new Error('Task Finish carrier path escapes its run-owned root.');
  return target;
}

function carrierRegistration(root, target) {
  const result = git(root, ['worktree', 'list', '--porcelain']);
  if (result.status !== 0) return null;
  const physical = (value) => {
    try { return fs.realpathSync(value); } catch { return path.resolve(value); }
  };
  const expected = physical(target);
  return String(result.stdout).split(/\n\n+/).map((entry) => entry.split('\n').find((line) => line.startsWith('worktree '))?.slice(9)).find((entry) => entry && physical(entry) === expected) || null;
}

export function observeGitTaskContribution({ root, deliveryBaselineHead }) {
  const sourceHead = requireGitText(root, ['rev-parse', 'HEAD^{commit}'], 'Task source HEAD is unavailable.');
  const originalBaselineHead = requireGitText(root, ['merge-base', sourceHead, deliveryBaselineHead], 'Task source and Delivery Baseline have no provable Git baseline.');
  const originalBaselineTree = requireGitText(root, ['rev-parse', `${originalBaselineHead}^{tree}`], 'Original Task baseline tree is unavailable.');
  return withTemporaryIndex(root, originalBaselineHead, ({ tree: sourceTree }) => ({
    schemaVersion: 'buildr.git-task-contribution/v1',
    identity: deltaIdentity(root, originalBaselineTree, sourceTree),
    originalBaseline: { head: originalBaselineHead, tree: originalBaselineTree },
    source: { head: sourceHead, tree: sourceTree },
  }));
}

export function removeIsolatedGitCarrier({ repositoryRoot, workspaceRoot, runId, expectedRoot = null }) {
  const target = carrierRoot(workspaceRoot, runId);
  if (expectedRoot && path.resolve(expectedRoot) !== target) return { status: 'blocked', code: 'task-finish.carrier-root-mismatch', root: target };
  const registered = carrierRegistration(repositoryRoot, target);
  if (!registered) return fs.existsSync(target)
    ? { status: 'blocked', code: 'task-finish.carrier-ownership-unprovable', root: target }
    : { status: 'not-applicable', root: target };
  const removed = git(repositoryRoot, ['worktree', 'remove', '--force', target]);
  if (removed.status !== 0) return { status: 'blocked', code: 'task-finish.carrier-cleanup-failed', root: target, diagnostic: String(removed.stderr || removed.stdout).trim() };
  return { status: 'removed', root: target };
}

export function createIsolatedGitCarrier({ repositoryRoot, workspaceRoot, runId, deliveryBaselineHead, taskContribution, message }) {
  const target = carrierRoot(workspaceRoot, runId);
  const existing = removeIsolatedGitCarrier({ repositoryRoot, workspaceRoot, runId });
  if (existing.status === 'blocked') throw Object.assign(new Error('Existing Delivery Carrier ownership cannot be proved.'), { code: existing.code, details: existing });
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const added = git(repositoryRoot, ['worktree', 'add', '--detach', target, deliveryBaselineHead]);
  if (added.status !== 0) throw Object.assign(new Error(`Unable to create isolated Delivery Carrier: ${added.stderr || added.stdout}`), { code: 'task-finish.carrier-create-failed' });
  try {
    const deliveryBaselineTree = requireGitText(target, ['rev-parse', 'HEAD^{tree}'], 'Delivery Baseline tree is unavailable.');
    const patch = contributionPatch(repositoryRoot, taskContribution.originalBaseline.tree, taskContribution.source.tree);
    if (patch.length > 0) {
      const applied = git(target, ['apply', '--index', '--binary', '-'], { encoding: 'buffer', input: patch });
      if (applied.status !== 0) throw Object.assign(new Error('Task Contribution does not apply cleanly to the latest Delivery Baseline.'), { code: 'task-finish.contribution-apply-conflict', details: String(applied.stderr || applied.stdout).trim() });
    }
    const appliedTree = requireGitText(target, ['write-tree'], 'Unable to write Delivery Carrier tree.');
    const appliedIdentity = deltaIdentity(target, deliveryBaselineTree, appliedTree);
    if (appliedIdentity !== taskContribution.identity) throw Object.assign(new Error('Applied Task Contribution is not identity-equivalent on the latest Delivery Baseline.'), {
      code: 'task-finish.contribution-not-equivalent',
      details: { expected: taskContribution.identity, observed: appliedIdentity },
    });
    if (appliedTree !== deliveryBaselineTree) {
      const committed = git(target, ['commit', '-m', message]);
      if (committed.status !== 0) throw Object.assign(new Error(`Unable to commit isolated Delivery Carrier: ${committed.stderr || committed.stdout}`), { code: 'task-finish.commit-failed' });
    }
    const head = requireGitText(target, ['rev-parse', 'HEAD^{commit}'], 'Delivery Carrier HEAD is unavailable.');
    const tree = requireGitText(target, ['rev-parse', 'HEAD^{tree}'], 'Delivery Carrier tree is unavailable.');
    const changedPaths = String(gitText(target, ['diff', '--name-only', `${deliveryBaselineHead}..${head}`]) || '').split('\n').filter(Boolean).sort();
    return {
      root: target,
      head,
      tree,
      changedPaths,
      deliveryBaseline: { head: deliveryBaselineHead, tree: deliveryBaselineTree },
      taskContribution: { ...taskContribution, appliedIdentity },
    };
  } catch (error) {
    const cleanup = removeIsolatedGitCarrier({ repositoryRoot, workspaceRoot, runId, expectedRoot: target });
    if (cleanup.status === 'blocked') error.cleanup = cleanup;
    throw error;
  }
}

export function verifyGitTaskContributionCarrier({ repositoryRoot, carrier }) {
  if (!carrier?.root || !carrierRegistration(repositoryRoot, carrier.root)) return { status: 'stale', code: 'task-finish.carrier-ownership-unprovable' };
  const head = gitText(carrier.root, ['rev-parse', 'HEAD^{commit}']);
  const tree = gitText(carrier.root, ['rev-parse', 'HEAD^{tree}']);
  const status = git(carrier.root, ['status', '--porcelain=v1', '-z', '--untracked-files=all']);
  if (head !== carrier.head || tree !== carrier.tree || status.status !== 0 || status.stdout.length !== 0) return { status: 'stale', code: 'task-finish.carrier-changed', observed: { head, tree, clean: status.status === 0 && status.stdout.length === 0 } };
  const appliedIdentity = deltaIdentity(carrier.root, carrier.deliveryBaseline.tree, tree);
  if (appliedIdentity !== carrier.taskContribution.identity || appliedIdentity !== carrier.taskContribution.appliedIdentity) return { status: 'stale', code: 'task-finish.contribution-not-equivalent', observed: { appliedIdentity } };
  return { status: 'equivalent', appliedIdentity };
}

export function verifyDeliveredGitTaskContribution({ taskRoot, targetRef, proof }) {
  try {
    if (!proof?.taskContribution || !proof?.deliveryBaseline || !proof?.head || !proof?.tree) return { status: 'stale', code: 'git_worktree_contribution_proof_invalid' };
    const targetHead = requireGitText(taskRoot, ['rev-parse', `${targetRef}^{commit}`], 'Delivered target ref is unavailable.');
    const targetTree = requireGitText(taskRoot, ['rev-parse', `${targetRef}^{tree}`], 'Delivered target tree is unavailable.');
    if (targetHead !== proof.head || targetTree !== proof.tree) return { status: 'stale', code: 'git_worktree_contribution_target_mismatch' };
    const sourceHead = requireGitText(taskRoot, ['rev-parse', 'HEAD^{commit}'], 'Task source HEAD is unavailable.');
    if (sourceHead !== proof.taskContribution.source.head) return { status: 'stale', code: 'git_worktree_contribution_source_head_drift' };
    const current = withTemporaryIndex(taskRoot, proof.taskContribution.originalBaseline.head, ({ tree }) => ({ tree }));
    if (current.tree !== proof.taskContribution.source.tree) return { status: 'stale', code: 'git_worktree_contribution_source_drift' };
    const sourceIdentity = deltaIdentity(taskRoot, proof.taskContribution.originalBaseline.tree, current.tree);
    const deliveredIdentity = deltaIdentity(taskRoot, proof.deliveryBaseline.tree, proof.tree);
    if (sourceIdentity !== proof.taskContribution.identity || deliveredIdentity !== proof.taskContribution.identity) return { status: 'stale', code: 'git_worktree_contribution_not_equivalent' };
    return { status: 'equivalent', identity: sourceIdentity };
  } catch (error) {
    return { status: 'stale', code: 'git_worktree_contribution_proof_failed', diagnostic: error.message };
  }
}
