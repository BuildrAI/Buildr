import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  gitContributionCommand as git,
  gitContributionText as gitText,
  gitTaskContributionIdentity as deltaIdentity,
  gitTaskContributionPatch as contributionPatch,
  observeGitTaskContribution,
  requireGitContributionText as requireGitText,
  withGitTaskContributionSnapshot as withTemporaryIndex,
} from '../../infrastructure/git/git-task-contribution.mjs';

export { observeGitTaskContribution } from '../../infrastructure/git/git-task-contribution.mjs';

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

function rawChanges(root, before, after) {
  const result = git(root, ['diff', '--raw', '--full-index', '--abbrev=40', '--no-renames', '-z', `${before}..${after}`]);
  if (result.status !== 0) return [];
  const tokens = String(result.stdout).split('\0').filter(Boolean);
  const changes = [];
  for (let index = 0; index < tokens.length; index += 2) {
    const header = tokens[index];
    const file = tokens[index + 1];
    const matched = /^:(\d+) (\d+) ([0-9a-f]+) ([0-9a-f]+) (\S+)$/.exec(header);
    if (!matched || !file) continue;
    changes.push({ path: file.replaceAll('\\', '/'), beforeMode: matched[1], afterMode: matched[2], beforeBlob: matched[3], afterBlob: matched[4], status: matched[5] });
  }
  return changes.sort((left, right) => left.path.localeCompare(right.path));
}

function containmentIdentity(value) {
  return `sha256-${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

export function inspectGitCarrierContainment({ repositoryRoot, targetRef, carrier }) {
  const carrierRef = carrier?.head || null;
  const changedPaths = [...new Set((carrier?.changedPaths || []).map((value) => String(value).replaceAll('\\', '/')))].sort();
  const changes = Array.isArray(carrier?.changes) ? [...carrier.changes].sort((left, right) => left.path.localeCompare(right.path)) : [];
  if (!carrierRef || !targetRef || changes.length === 0 || changedPaths.join('\0') !== changes.map((change) => change.path).join('\0')) {
    return { status: 'unprovable', code: 'task-finish.carrier-containment-input-invalid', carrierRef, targetRef, changedPaths };
  }
  const ancestor = git(repositoryRoot, ['merge-base', '--is-ancestor', carrierRef, targetRef]);
  if (ancestor.status === 1) return { status: 'not-contained', code: 'task-finish.carrier-not-ancestor', carrierRef, targetRef, changedPaths };
  if (ancestor.status !== 0) return { status: 'unprovable', code: 'task-finish.carrier-ancestry-unreadable', carrierRef, targetRef, changedPaths, diagnostic: String(ancestor.stderr || ancestor.stdout).trim() };

  const checkedPaths = [];
  for (const change of changes) {
    const observed = git(repositoryRoot, ['ls-tree', '-z', '--full-tree', targetRef, '--', change.path]);
    if (observed.status !== 0) return { status: 'unprovable', code: 'task-finish.carrier-target-path-unreadable', carrierRef, targetRef, path: change.path, diagnostic: String(observed.stderr || observed.stdout).trim() };
    const entry = String(observed.stdout).split('\0').filter(Boolean)[0] || null;
    const matched = entry ? /^(\d+) (\S+) ([0-9a-f]+)\t(.*)$/.exec(entry) : null;
    const deleted = change.afterMode === '000000' || /^0+$/.test(change.afterBlob);
    const exact = deleted
      ? entry === null
      : Boolean(matched && matched[1] === change.afterMode && matched[3] === change.afterBlob && matched[4] === change.path);
    const evidence = {
      path: change.path,
      expected: deleted ? { state: 'absent' } : { state: 'present', mode: change.afterMode, object: change.afterBlob },
      observed: entry === null ? { state: 'absent' } : matched ? { state: 'present', mode: matched[1], type: matched[2], object: matched[3], path: matched[4] } : { state: 'unparseable' },
      exact,
    };
    checkedPaths.push(evidence);
    if (!exact) return { status: 'not-contained', code: 'task-finish.carrier-path-not-contained', carrierRef, targetRef, changedPaths, checkedPaths };
  }
  const proof = { carrierRef, targetRef, changedPaths, checkedPaths };
  return { status: 'contained', ...proof, identity: containmentIdentity(proof) };
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
      if (applied.status !== 0) {
        git(target, ['reset', '--hard', deliveryBaselineHead]);
        return {
          status: 'adaptation-required',
          root: target,
          head: deliveryBaselineHead,
          tree: deliveryBaselineTree,
          changedPaths: [],
          deliveryBaseline: { head: deliveryBaselineHead, tree: deliveryBaselineTree },
          taskContribution,
          conflict: { code: 'task-finish.contribution-apply-conflict', diagnostic: String(applied.stderr || applied.stdout).trim() },
        };
      }
    }
    const appliedTree = requireGitText(target, ['write-tree'], 'Unable to write Delivery Carrier tree.');
    const appliedIdentity = deltaIdentity(target, deliveryBaselineTree, appliedTree);
    if (appliedIdentity !== taskContribution.identity) {
      git(target, ['reset', '--hard', deliveryBaselineHead]);
      return {
        status: 'adaptation-required',
        root: target,
        head: deliveryBaselineHead,
        tree: deliveryBaselineTree,
        changedPaths: [],
        deliveryBaseline: { head: deliveryBaselineHead, tree: deliveryBaselineTree },
        taskContribution,
        conflict: { code: 'task-finish.contribution-not-equivalent', diagnostic: { expected: taskContribution.identity, observed: appliedIdentity } },
      };
    }
    if (appliedTree !== deliveryBaselineTree) {
      const committed = git(target, ['commit', '-m', message]);
      if (committed.status !== 0) throw Object.assign(new Error(`Unable to commit isolated Delivery Carrier: ${committed.stderr || committed.stdout}`), { code: 'task-finish.commit-failed' });
    }
    const head = requireGitText(target, ['rev-parse', 'HEAD^{commit}'], 'Delivery Carrier HEAD is unavailable.');
    const tree = requireGitText(target, ['rev-parse', 'HEAD^{tree}'], 'Delivery Carrier tree is unavailable.');
    const changedPaths = String(gitText(target, ['diff', '--name-only', `${deliveryBaselineHead}..${head}`]) || '').split('\n').filter(Boolean).sort();
    return {
      status: 'prepared',
      root: target,
      head,
      tree,
      changedPaths,
      changes: rawChanges(target, deliveryBaselineHead, head),
      deliveryBaseline: { head: deliveryBaselineHead, tree: deliveryBaselineTree },
      taskContribution: { ...taskContribution, appliedIdentity },
    };
  } catch (error) {
    const cleanup = removeIsolatedGitCarrier({ repositoryRoot, workspaceRoot, runId, expectedRoot: target });
    if (cleanup.status === 'blocked') error.cleanup = cleanup;
    throw error;
  }
}

export function adoptAgentReviewedGitCarrier({ repositoryRoot, carrier }) {
  if (!carrier?.root || !carrierRegistration(repositoryRoot, carrier.root)) return { status: 'blocked', code: 'task-finish.carrier-ownership-unprovable' };
  const baselineHead = carrier.deliveryBaseline?.head;
  const baselineTree = carrier.deliveryBaseline?.tree;
  if (!baselineHead || !baselineTree) return { status: 'blocked', code: 'task-finish.delivery-baseline-unprovable' };
  const head = gitText(carrier.root, ['rev-parse', 'HEAD^{commit}']);
  const tree = gitText(carrier.root, ['rev-parse', 'HEAD^{tree}']);
  const status = git(carrier.root, ['status', '--porcelain=v1', '-z', '--untracked-files=all']);
  if (!head || !tree || status.status !== 0 || status.stdout.length !== 0) return { status: 'blocked', code: 'task-finish.delivery-adaptation-dirty', observed: { head, tree, clean: false } };
  if (head === baselineHead || tree === baselineTree) return { status: 'blocked', code: 'task-finish.delivery-adaptation-missing', observed: { head, tree } };
  const ancestor = git(carrier.root, ['merge-base', '--is-ancestor', baselineHead, head]);
  if (ancestor.status !== 0) return { status: 'blocked', code: 'task-finish.delivery-baseline-drift', observed: { baselineHead, head } };
  const merges = gitText(carrier.root, ['rev-list', '--merges', `${baselineHead}..${head}`]);
  if (merges) return { status: 'blocked', code: 'task-finish.delivery-adaptation-merge-commit', observed: { merges: merges.split('\n') } };
  const changedPaths = String(gitText(carrier.root, ['diff', '--name-only', `${baselineHead}..${head}`]) || '').split('\n').filter(Boolean).sort();
  const carrierDeltaIdentity = deltaIdentity(carrier.root, baselineTree, tree);
  return {
    status: 'adopted',
    head,
    tree,
    changedPaths,
    changes: rawChanges(carrier.root, baselineHead, head),
    carrierDeltaIdentity,
    cleanliness: { clean: true },
  };
}

export function verifyGitTaskContributionCarrier({ repositoryRoot, carrier }) {
  if (!carrier?.root || !carrierRegistration(repositoryRoot, carrier.root)) return { status: 'stale', code: 'task-finish.carrier-ownership-unprovable' };
  const head = gitText(carrier.root, ['rev-parse', 'HEAD^{commit}']);
  const tree = gitText(carrier.root, ['rev-parse', 'HEAD^{tree}']);
  const status = git(carrier.root, ['status', '--porcelain=v1', '-z', '--untracked-files=all']);
  if (head !== carrier.head || tree !== carrier.tree || status.status !== 0 || status.stdout.length !== 0) return { status: 'stale', code: 'task-finish.carrier-changed', observed: { head, tree, clean: status.status === 0 && status.stdout.length === 0 } };
  const appliedIdentity = deltaIdentity(carrier.root, carrier.deliveryBaseline.tree, tree);
  if (carrier.reuseMode === 'agent-reviewed-delivery-adaptation') {
    if (appliedIdentity !== carrier.carrierDeltaIdentity) return { status: 'stale', code: 'task-finish.delivery-adaptation-drift', observed: { appliedIdentity } };
    return { status: 'equivalent', appliedIdentity, reuseMode: carrier.reuseMode };
  }
  if (appliedIdentity !== carrier.taskContribution.identity || appliedIdentity !== carrier.taskContribution.appliedIdentity) return { status: 'stale', code: 'task-finish.contribution-not-equivalent', observed: { appliedIdentity } };
  return { status: 'equivalent', appliedIdentity, reuseMode: 'deterministic-reuse' };
}

export function verifyDeliveredGitTaskContribution({ taskRoot, targetRef, proof }) {
  try {
    if (!proof?.taskContribution || !proof?.deliveryBaseline || !proof?.head || !proof?.tree) return { status: 'stale', code: 'git_worktree_contribution_proof_invalid' };
    const targetHead = requireGitText(taskRoot, ['rev-parse', `${targetRef}^{commit}`], 'Delivered target ref is unavailable.');
    const proofHead = requireGitText(taskRoot, ['rev-parse', `${proof.head}^{commit}`], 'Delivered carrier ref is unavailable.');
    const proofTree = requireGitText(taskRoot, ['rev-parse', `${proof.head}^{tree}`], 'Delivered carrier tree is unavailable.');
    const delivered = git(taskRoot, ['merge-base', '--is-ancestor', proof.head, targetHead]);
    if (proofHead !== proof.head || proofTree !== proof.tree || delivered.status !== 0) return { status: 'stale', code: 'git_worktree_contribution_target_mismatch' };
    const sourceHead = requireGitText(taskRoot, ['rev-parse', 'HEAD^{commit}'], 'Task source HEAD is unavailable.');
    if (sourceHead !== proof.taskContribution.source.head) return { status: 'stale', code: 'git_worktree_contribution_source_head_drift' };
    const current = withTemporaryIndex(taskRoot, proof.taskContribution.originalBaseline.head, ({ tree }) => ({ tree }));
    if (current.tree !== proof.taskContribution.source.tree) return { status: 'stale', code: 'git_worktree_contribution_source_drift' };
    const sourceIdentity = deltaIdentity(taskRoot, proof.taskContribution.originalBaseline.tree, current.tree);
    const deliveredIdentity = deltaIdentity(taskRoot, proof.deliveryBaseline.tree, proof.tree);
    if (sourceIdentity !== proof.taskContribution.identity) return { status: 'stale', code: 'git_worktree_contribution_source_not_equivalent' };
    if (proof.reuseMode === 'agent-reviewed-delivery-adaptation') {
      if (!proof.carrierDeltaIdentity || deliveredIdentity !== proof.carrierDeltaIdentity) return { status: 'stale', code: 'git_worktree_delivery_adaptation_not_equivalent' };
      return { status: 'equivalent', identity: sourceIdentity, carrierIdentity: deliveredIdentity, reuseMode: proof.reuseMode };
    }
    if (deliveredIdentity !== proof.taskContribution.identity) return { status: 'stale', code: 'git_worktree_contribution_not_equivalent' };
    return { status: 'equivalent', identity: sourceIdentity, reuseMode: 'deterministic-reuse' };
  } catch (error) {
    return { status: 'stale', code: 'git_worktree_contribution_proof_failed', diagnostic: error.message };
  }
}
