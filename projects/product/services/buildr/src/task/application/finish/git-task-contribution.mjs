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
} from '../../../infrastructure/git/git-task-contribution.mjs';
import { sameFilesystemPath } from '../../../infrastructure/git/checkout-identity.mjs';
import {
  publicTaskFinishDeliveryCommit,
  taskFinishDeliveryCommitFromMessage,
  taskFinishDeliveryCommitMatches,
} from './task-finish-delivery-commit.mjs';

export { observeGitTaskContribution, observeGitTaskContributionFromRef } from '../../../infrastructure/git/git-task-contribution.mjs';

function carrierContainer(workspaceRoot, runId) {
  const base = path.resolve(workspaceRoot, '.buildr', 'transient', 'task-finish', 'carriers');
  const target = path.resolve(base, runId);
  if (path.dirname(target) !== base) throw new Error('Task Finish carrier path escapes its run-owned root.');
  return target;
}

export function taskFinishCarrierRoot(workspaceRoot, runId, repositorySelector = null) {
  const container = carrierContainer(workspaceRoot, runId);
  if (!repositorySelector) return container;
  const readable = String(repositorySelector).replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'repository';
  const identity = crypto.createHash('sha256').update(String(repositorySelector)).digest('hex').slice(0, 12);
  const target = path.resolve(container, `${readable}-${identity}`);
  if (path.dirname(target) !== container) throw new Error('Task Finish repository carrier path escapes its run-owned root.');
  return target;
}

function carrierRegistration(root, target) {
  const result = git(root, ['worktree', 'list', '--porcelain']);
  if (result.status !== 0) return null;
  return String(result.stdout).split(/\n\n+/).map((entry) => entry.split('\n').find((line) => line.startsWith('worktree '))?.slice(9)).find((entry) => entry && sameFilesystemPath(entry, target)) || null;
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

function carrierChanges(root, before, after) {
  const changes = rawChanges(root, before, after);
  return { changes, changedPaths: changes.map((change) => change.path) };
}

function portableContributionPath(value) {
  const normalized = path.posix.normalize(String(value || '').replaceAll('\\', '/')).replace(/^\.\//, '');
  if (!normalized || normalized === '.' || normalized === '..' || normalized.startsWith('../') || path.posix.isAbsolute(normalized)) return null;
  return normalized;
}

function exactTreePath(root, tree, change) {
  const observed = git(root, ['ls-tree', '-z', '--full-tree', tree, '--', change.path]);
  if (observed.status !== 0) return null;
  const entry = String(observed.stdout).split('\0').filter(Boolean)[0] || null;
  const matched = entry ? /^(\d+) (\S+) ([0-9a-f]+)\t(.*)$/.exec(entry) : null;
  const deleted = change.afterMode === '000000' || /^0+$/.test(change.afterBlob);
  return deleted
    ? entry === null
    : Boolean(matched && matched[1] === change.afterMode && matched[3] === change.afterBlob && matched[4] === change.path);
}

export function createTaskContributionPathCoverage({ repositoryRoot, taskContribution, deliveryBaselineTree, carrierTree, agentReviewedTargetPaths = [] }) {
  const beforeTree = taskContribution?.originalBaseline?.tree || null;
  const sourceTree = taskContribution?.source?.tree || null;
  if (!beforeTree || !sourceTree || !deliveryBaselineTree || !carrierTree || !taskContribution?.identity) {
    return { status: 'blocked', code: 'task-finish.delivery-adaptation-path-coverage-input-invalid' };
  }
  const observedIdentity = deltaIdentity(repositoryRoot, beforeTree, sourceTree);
  if (observedIdentity !== taskContribution.identity) {
    return { status: 'blocked', code: 'task-finish.task-contribution-identity-mismatch', expectedIdentity: taskContribution.identity, observedIdentity };
  }
  const contributionChanges = rawChanges(repositoryRoot, beforeTree, sourceTree);
  if (contributionChanges.length === 0) return { status: 'blocked', code: 'task-finish.task-contribution-empty' };
  const contributionPaths = contributionChanges.map((item) => item.path);
  const contributionSet = new Set(contributionPaths);
  const carrierChangedPaths = carrierChanges(repositoryRoot, deliveryBaselineTree, carrierTree).changedPaths.filter((item) => contributionSet.has(item));
  const carrierChangedSet = new Set(carrierChangedPaths);
  const targetContainedPaths = contributionChanges.filter((item) => !carrierChangedSet.has(item.path) && exactTreePath(repositoryRoot, deliveryBaselineTree, item) === true).map((item) => item.path);
  const targetContainedSet = new Set(targetContainedPaths);
  const reviewed = [];
  const reviewedSet = new Set();
  const invalid = [];
  for (const item of agentReviewedTargetPaths || []) {
    const reviewedPath = portableContributionPath(item?.path);
    const reason = typeof item?.reason === 'string' ? item.reason.trim() : '';
    if (!reviewedPath || !reason || !contributionSet.has(reviewedPath)) {
      invalid.push({ path: reviewedPath || null, code: !reviewedPath ? 'path-invalid' : !reason ? 'reason-missing' : 'path-unknown' });
      continue;
    }
    if (reviewedSet.has(reviewedPath) || targetContainedSet.has(reviewedPath) || carrierChangedSet.has(reviewedPath)) {
      invalid.push({ path: reviewedPath, code: reviewedSet.has(reviewedPath) ? 'path-duplicate' : 'path-already-accounted' });
      continue;
    }
    reviewedSet.add(reviewedPath);
    reviewed.push({ path: reviewedPath, reason });
  }
  if (invalid.length) return { status: 'blocked', code: 'task-finish.delivery-adaptation-path-coverage-invalid', invalidPaths: invalid };
  reviewed.sort((left, right) => left.path.localeCompare(right.path));
  const missingPaths = contributionPaths.filter((item) => !targetContainedSet.has(item) && !carrierChangedSet.has(item) && !reviewedSet.has(item));
  const value = {
    schemaVersion: 'buildr.task-contribution-path-coverage/v1',
    taskContributionIdentity: taskContribution.identity,
    deliveryBaselineTree,
    carrierTree,
    contributionPaths,
    targetContainedPaths,
    carrierChangedPaths,
    agentReviewedTargetPaths: reviewed,
    counts: {
      total: contributionPaths.length,
      targetContained: targetContainedPaths.length,
      carrierChanged: carrierChangedPaths.length,
      agentReviewedTarget: reviewed.length,
      missing: missingPaths.length,
    },
  };
  const coverage = { ...value, identity: containmentIdentity(value) };
  return missingPaths.length
    ? { status: 'blocked', code: 'task-finish.delivery-adaptation-path-coverage-incomplete', missingPaths, coverage }
    : { status: 'covered', coverage };
}

function verifyTaskContributionPathCoverage({ repositoryRoot, carrier }) {
  const stored = carrier?.pathCoverage;
  if (stored?.schemaVersion !== 'buildr.task-contribution-path-coverage/v1' || !stored.identity) {
    return { status: 'stale', code: 'task-finish.delivery-adaptation-path-coverage-missing' };
  }
  const current = createTaskContributionPathCoverage({
    repositoryRoot,
    taskContribution: carrier.taskContribution,
    deliveryBaselineTree: carrier.deliveryBaseline?.tree,
    carrierTree: carrier.tree,
    agentReviewedTargetPaths: stored.agentReviewedTargetPaths,
  });
  if (current.status !== 'covered' || current.coverage.identity !== stored.identity || JSON.stringify(current.coverage) !== JSON.stringify(stored)) {
    return { status: 'stale', code: current.code || 'task-finish.delivery-adaptation-path-coverage-drift', observed: current };
  }
  return { status: 'current', identity: stored.identity, counts: stored.counts };
}

function taskContributionActivationPaths(repositoryRoot, taskContribution) {
  const before = taskContribution?.originalBaseline?.tree;
  const after = taskContribution?.source?.tree;
  if (!before || !after) return null;
  const beforeTree = git(repositoryRoot, ['cat-file', '-e', `${before}^{tree}`]);
  const afterTree = git(repositoryRoot, ['cat-file', '-e', `${after}^{tree}`]);
  if (beforeTree.status !== 0 || afterTree.status !== 0) return null;
  return carrierChanges(repositoryRoot, before, after).changedPaths;
}

function taskContributionConflictPaths(repositoryRoot, taskContribution, deliveryBaselineTree, activationPaths) {
  const deliveryBaselinePaths = new Set(carrierChanges(repositoryRoot, taskContribution.originalBaseline.tree, deliveryBaselineTree).changedPaths);
  return activationPaths.filter((file) => deliveryBaselinePaths.has(file));
}

function containmentIdentity(value) {
  return `sha256-${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

function carrierContentDigest(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function carrierFileDigest(file) {
  const hash = crypto.createHash('sha256');
  const buffer = Buffer.allocUnsafe(64 * 1024);
  const descriptor = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
  try {
    let bytesRead;
    do {
      bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytesRead > 0) hash.update(buffer.subarray(0, bytesRead));
    } while (bytesRead > 0);
  } finally { fs.closeSync(descriptor); }
  return hash.digest('hex');
}

function observeUntrackedCarrierContent(root) {
  const listed = git(root, ['ls-files', '--others', '--exclude-standard', '-z']);
  if (listed.status !== 0) return { status: 'unprovable', code: 'task-finish.carrier-untracked-unreadable' };
  const files = String(listed.stdout).split('\0').filter(Boolean).sort();
  const entries = [];
  for (const relativePath of files) {
    const target = path.resolve(root, relativePath);
    if (target === root || !target.startsWith(`${root}${path.sep}`)) return { status: 'unprovable', code: 'task-finish.carrier-untracked-path-invalid' };
    let stat;
    try { stat = fs.lstatSync(target); }
    catch { return { status: 'unprovable', code: 'task-finish.carrier-untracked-unreadable' }; }
    try {
      if (stat.isSymbolicLink()) {
        entries.push({ path: relativePath.replaceAll('\\', '/'), kind: 'symlink', mode: stat.mode & 0o7777, digest: carrierContentDigest(fs.readlinkSync(target)) });
      } else if (stat.isFile()) {
        entries.push({ path: relativePath.replaceAll('\\', '/'), kind: 'file', mode: stat.mode & 0o7777, digest: carrierFileDigest(target) });
      } else return { status: 'unprovable', code: 'task-finish.carrier-untracked-kind-unsupported' };
    } catch { return { status: 'unprovable', code: 'task-finish.carrier-untracked-unreadable' }; }
  }
  return { status: 'observed', entries };
}

function observeGitCarrierContent({ repositoryRoot, workspaceRoot, runId, repositorySelector = null, carrier }) {
  const expectedRoot = taskFinishCarrierRoot(workspaceRoot, runId, repositorySelector);
  if (!carrier?.root || !sameFilesystemPath(carrier.root, expectedRoot)) {
    return { status: 'unprovable', code: 'task-finish.carrier-root-mismatch' };
  }
  const registered = carrierRegistration(repositoryRoot, expectedRoot);
  if (!registered) {
    return fs.existsSync(expectedRoot)
      ? { status: 'unprovable', code: 'task-finish.carrier-ownership-unprovable' }
      : { status: 'absent', code: null };
  }
  const head = gitText(expectedRoot, ['rev-parse', 'HEAD^{commit}']);
  const index = git(expectedRoot, ['ls-files', '--stage', '-z']);
  const worktree = git(expectedRoot, ['diff', '--binary', '--full-index', '--no-ext-diff']);
  const status = git(expectedRoot, ['status', '--porcelain=v1', '-z', '--untracked-files=all']);
  const untracked = observeUntrackedCarrierContent(expectedRoot);
  if (!head || index.status !== 0 || worktree.status !== 0 || status.status !== 0 || untracked.status !== 'observed') {
    return { status: 'unprovable', code: untracked.code || 'task-finish.carrier-content-unreadable' };
  }
  return {
    status: 'observed',
    content: {
      head,
      indexDigest: containmentIdentity(String(index.stdout)),
      worktreeDigest: containmentIdentity(String(worktree.stdout)),
      statusDigest: containmentIdentity(String(status.stdout)),
      untracked: untracked.entries,
    },
  };
}

export function createGitCarrierDisposabilityProof({ repositoryRoot, workspaceRoot, runId, repositorySelector = null, carrier, handoffIdentity = null, repositoryTopology = null, prepareFailure = null }) {
  const observed = observeGitCarrierContent({ repositoryRoot, workspaceRoot, runId, repositorySelector, carrier });
  if (observed.status !== 'observed') return observed;
  const proof = {
    schemaVersion: 'buildr.task-finish-carrier-disposability-proof/v1',
    runId,
    repositorySelector: repositorySelector || 'workspace',
    carrierIdentity: carrier.identity || null,
    handoffIdentity,
    repositoryTopology,
    initialPrepareFailure: prepareFailure ? { operation: prepareFailure.operation || null, code: prepareFailure.code || null, status: prepareFailure.status || null } : null,
    content: observed.content,
  };
  return { status: 'proved', proof: { ...proof, identity: containmentIdentity(proof) } };
}

export function verifyGitCarrierDisposabilityProof({ repositoryRoot, workspaceRoot, runId, repositorySelector = null, carrier, proof, handoffIdentity = null, repositoryTopology = null }) {
  if (proof?.schemaVersion !== 'buildr.task-finish-carrier-disposability-proof/v1'
    || proof.runId !== runId
    || proof.repositorySelector !== (repositorySelector || 'workspace')
    || proof.carrierIdentity !== (carrier?.identity || null)
    || proof.handoffIdentity !== handoffIdentity
    || JSON.stringify(proof.repositoryTopology) !== JSON.stringify(repositoryTopology)
    || !proof.identity) return { status: 'unprovable', code: 'task-finish.carrier-disposability-proof-invalid' };
  const unsigned = { ...proof };
  delete unsigned.identity;
  if (containmentIdentity(unsigned) !== proof.identity) return { status: 'unprovable', code: 'task-finish.carrier-disposability-proof-identity-mismatch' };
  const observed = observeGitCarrierContent({ repositoryRoot, workspaceRoot, runId, repositorySelector, carrier });
  if (observed.status === 'absent') return { status: 'not-applicable', code: null, proofIdentity: proof.identity };
  if (observed.status !== 'observed') return observed;
  if (JSON.stringify(observed.content) !== JSON.stringify(proof.content)) {
    return { status: 'changed', code: 'task-finish.carrier-disposability-drift', proofIdentity: proof.identity };
  }
  return { status: 'unchanged', code: null, proofIdentity: proof.identity };
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
  const proof = { carrierRef, targetRef, changedPaths, checkedPaths, pathCoverageIdentity: carrier.pathCoverage?.identity || null };
  return { status: 'contained', ...proof, identity: containmentIdentity(proof) };
}

export function inspectGitTaskContributionContainment({ repositoryRoot, targetRef, taskContribution }) {
  const beforeTree = taskContribution?.originalBaseline?.tree || null;
  const sourceTree = taskContribution?.source?.tree || null;
  if (!targetRef || taskContribution?.schemaVersion !== 'buildr.git-task-contribution/v1'
    || !taskContribution?.identity || !beforeTree || !sourceTree) {
    return { status: 'unprovable', code: 'task-finish.task-contribution-containment-input-invalid', targetRef };
  }
  try {
    const observedIdentity = deltaIdentity(repositoryRoot, beforeTree, sourceTree);
    if (observedIdentity !== taskContribution.identity) {
      return {
        status: 'unprovable',
        code: 'task-finish.task-contribution-identity-mismatch',
        targetRef,
        expectedIdentity: taskContribution.identity,
        observedIdentity,
      };
    }
    const resolvedTargetRef = gitText(repositoryRoot, ['rev-parse', `${targetRef}^{commit}`]);
    if (!resolvedTargetRef) return { status: 'unprovable', code: 'task-finish.task-contribution-target-unreadable', targetRef };
    const changes = rawChanges(repositoryRoot, beforeTree, sourceTree);
    if (changes.length === 0) {
      return { status: 'not-contained', code: 'task-finish.task-contribution-empty', targetRef: resolvedTargetRef, changedPaths: [] };
    }
    const checkedPaths = [];
    for (const change of changes) {
      const observed = git(repositoryRoot, ['ls-tree', '-z', '--full-tree', resolvedTargetRef, '--', change.path]);
      if (observed.status !== 0) {
        return {
          status: 'unprovable',
          code: 'task-finish.task-contribution-target-path-unreadable',
          targetRef: resolvedTargetRef,
          path: change.path,
          diagnostic: String(observed.stderr || observed.stdout).trim(),
        };
      }
      const entry = String(observed.stdout).split('\0').filter(Boolean)[0] || null;
      const matched = entry ? /^(\d+) (\S+) ([0-9a-f]+)\t(.*)$/.exec(entry) : null;
      const deleted = change.afterMode === '000000' || /^0+$/.test(change.afterBlob);
      const exact = deleted
        ? entry === null
        : Boolean(matched && matched[1] === change.afterMode && matched[3] === change.afterBlob && matched[4] === change.path);
      const evidence = {
        path: change.path,
        expected: deleted ? { state: 'absent' } : { state: 'present', mode: change.afterMode, object: change.afterBlob },
        observed: entry === null
          ? { state: 'absent' }
          : matched
          ? { state: 'present', mode: matched[1], type: matched[2], object: matched[3], path: matched[4] }
          : { state: 'unparseable' },
        exact,
      };
      checkedPaths.push(evidence);
      if (!exact) {
        return {
          status: 'not-contained',
          code: 'task-finish.task-contribution-path-not-contained',
          targetRef: resolvedTargetRef,
          changedPaths: changes.map((item) => item.path),
          checkedPaths,
        };
      }
    }
    const proof = {
      schemaVersion: 'buildr.task-delivery-containment-proof/v1',
      taskContributionIdentity: taskContribution.identity,
      originalBaselineTree: beforeTree,
      sourceTree,
      targetRef: resolvedTargetRef,
      changedPaths: changes.map((item) => item.path),
      checkedPaths,
    };
    return { status: 'contained', ...proof, identity: containmentIdentity(proof) };
  } catch (error) {
    return { status: 'unprovable', code: 'task-finish.task-contribution-containment-failed', targetRef, diagnostic: error.message };
  }
}

export function inspectAgentReviewedZeroDeltaContainment({ repositoryRoot, workspaceRoot = repositoryRoot, targetRef, carrier, runId, repositorySelector = null }) {
  const carrierRef = carrier?.head || null;
  const baseline = carrier?.deliveryBaseline || null;
  const changedPaths = Array.isArray(carrier?.changedPaths) ? carrier.changedPaths : null;
  const changes = Array.isArray(carrier?.changes) ? carrier.changes : null;
  let expectedRoot = null;
  try { expectedRoot = runId ? taskFinishCarrierRoot(workspaceRoot, runId, repositorySelector) : null; } catch { /* invalid run identity remains unprovable */ }
  if (!carrierRef || !targetRef || !expectedRoot || !carrier?.root || !sameFilesystemPath(carrier.root, expectedRoot)
    || carrier?.reuseMode !== 'agent-reviewed-delivery-adaptation'
    || carrier?.zeroDelta !== true
    || !baseline?.head || !baseline?.tree
    || carrierRef !== baseline.head || carrier?.tree !== baseline.tree
    || changedPaths === null || changedPaths.length !== 0
    || changes === null || changes.length !== 0
    || !carrier?.carrierDeltaIdentity) {
    return {
      status: 'unprovable',
      code: 'task-finish.zero-delta-containment-input-invalid',
      carrierRef,
      targetRef,
      changedPaths: changedPaths || [],
    };
  }

  const verified = verifyGitTaskContributionCarrier({ repositoryRoot, carrier });
  if (verified.status !== 'equivalent') {
    return {
      status: 'unprovable',
      code: 'task-finish.zero-delta-carrier-unprovable',
      carrierRef,
      targetRef,
      changedPaths: [],
      observed: verified,
    };
  }

  const resolvedTargetRef = gitText(repositoryRoot, ['rev-parse', `${targetRef}^{commit}`]);
  const targetTree = resolvedTargetRef ? gitText(repositoryRoot, ['rev-parse', `${resolvedTargetRef}^{tree}`]) : null;
  if (!resolvedTargetRef || !targetTree) {
    return {
      status: 'unprovable',
      code: 'task-finish.zero-delta-target-unreadable',
      carrierRef,
      targetRef,
      changedPaths: [],
    };
  }
  if (resolvedTargetRef !== carrierRef || targetTree !== carrier.tree) {
    return {
      status: 'not-contained',
      code: 'task-finish.zero-delta-target-not-contained',
      carrierRef,
      targetRef: resolvedTargetRef,
      changedPaths: [],
      observed: { targetTree },
    };
  }

  const proof = {
    carrierRef,
    targetRef: resolvedTargetRef,
    proof: 'agent-reviewed-zero-delta',
    pathCoverageIdentity: carrier.pathCoverage.identity,
  };
  return {
    status: 'contained',
    code: 'task-finish.agent-reviewed-zero-delta-contained',
    proof: proof.proof,
    carrierRef,
    targetRef: resolvedTargetRef,
    changedPaths: [],
    pathCoverageIdentity: carrier.pathCoverage.identity,
    identity: containmentIdentity(proof),
  };
}

export function removeIsolatedGitCarrier({ repositoryRoot, workspaceRoot, runId, repositorySelector = null, expectedRoot = null }) {
  const target = taskFinishCarrierRoot(workspaceRoot, runId, repositorySelector);
  if (expectedRoot && !sameFilesystemPath(expectedRoot, target)) return { status: 'blocked', code: 'task-finish.carrier-root-mismatch', root: target };
  const registered = carrierRegistration(repositoryRoot, target);
  if (!registered) {
    if (fs.existsSync(target)) return { status: 'blocked', code: 'task-finish.carrier-ownership-unprovable', root: target };
    const container = carrierContainer(workspaceRoot, runId);
    if (repositorySelector && fs.existsSync(container) && fs.readdirSync(container).length === 0) fs.rmdirSync(container);
    return { status: 'not-applicable', root: target };
  }
  const removed = git(repositoryRoot, ['worktree', 'remove', '--force', target]);
  if (removed.status !== 0) return { status: 'blocked', code: 'task-finish.carrier-cleanup-failed', root: target, diagnostic: String(removed.stderr || removed.stdout).trim() };
  if (carrierRegistration(repositoryRoot, target) || fs.existsSync(target)) {
    return { status: 'blocked', code: 'task-finish.carrier-cleanup-readback-failed', root: target };
  }
  const container = carrierContainer(workspaceRoot, runId);
  if (repositorySelector && fs.existsSync(container) && fs.readdirSync(container).length === 0) {
    try { fs.rmdirSync(container); }
    catch (error) { return { status: 'blocked', code: 'task-finish.carrier-container-cleanup-failed', root: target, container, diagnostic: error.message }; }
  }
  return { status: 'removed', root: target };
}

function observedDeliveryCommit(root, ref = 'HEAD') {
  const message = gitText(root, ['log', '-1', '--format=%B', ref]);
  return message == null ? null : taskFinishDeliveryCommitFromMessage(message);
}

function verifyCarrierDeliveryCommit(carrier) {
  if (!carrier?.deliveryCommit?.identity) return { matches: true, observed: null };
  const observed = observedDeliveryCommit(carrier.root, carrier.head || 'HEAD');
  return observed
    ? { matches: carrier.deliveryCommit.identity === observed.identity && carrier.deliveryCommit.subject === observed.subject, observed }
    : { matches: false, observed: null };
}

export function createIsolatedGitCarrier({ repositoryRoot, workspaceRoot, runId, repositorySelector = null, deliveryBaselineHead, taskContribution, deliveryCommit = null, message = null }) {
  const expectedDeliveryCommit = deliveryCommit || taskFinishDeliveryCommitFromMessage(message);
  const activationPaths = taskContributionActivationPaths(repositoryRoot, taskContribution);
  if (!activationPaths) throw Object.assign(new Error('Task Contribution activation paths are unavailable.'), { code: 'task-finish.task-contribution-unprovable' });
  const target = taskFinishCarrierRoot(workspaceRoot, runId, repositorySelector);
  const existing = removeIsolatedGitCarrier({ repositoryRoot, workspaceRoot, runId, repositorySelector });
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
        const conflictPaths = taskContributionConflictPaths(target, taskContribution, deliveryBaselineTree, activationPaths);
        git(target, ['reset', '--hard', deliveryBaselineHead]);
        return {
          status: 'adaptation-required',
          root: target,
          head: deliveryBaselineHead,
          tree: deliveryBaselineTree,
          changedPaths: [],
          activationPaths,
          deliveryBaseline: { head: deliveryBaselineHead, tree: deliveryBaselineTree },
          taskContribution,
          deliveryCommit: publicTaskFinishDeliveryCommit(expectedDeliveryCommit),
          conflict: { code: 'task-finish.contribution-apply-conflict', conflictPaths, diagnostic: String(applied.stderr || applied.stdout).trim() },
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
        activationPaths,
        deliveryBaseline: { head: deliveryBaselineHead, tree: deliveryBaselineTree },
        taskContribution,
        deliveryCommit: publicTaskFinishDeliveryCommit(expectedDeliveryCommit),
        conflict: { code: 'task-finish.contribution-not-equivalent', diagnostic: { expected: taskContribution.identity, observed: appliedIdentity } },
      };
    }
    const commitCreated = appliedTree !== deliveryBaselineTree;
    if (commitCreated) {
      const committed = git(target, ['commit', '-F', '-'], { input: `${expectedDeliveryCommit.message}\n` });
      if (committed.status !== 0) throw Object.assign(new Error(`Unable to commit isolated Delivery Carrier: ${committed.stderr || committed.stdout}`), { code: 'task-finish.commit-failed' });
    }
    const head = requireGitText(target, ['rev-parse', 'HEAD^{commit}'], 'Delivery Carrier HEAD is unavailable.');
    const tree = requireGitText(target, ['rev-parse', 'HEAD^{tree}'], 'Delivery Carrier tree is unavailable.');
    if (commitCreated) {
      const actualMessage = gitText(target, ['log', '-1', '--format=%B', head]);
      const messageMatch = taskFinishDeliveryCommitMatches(expectedDeliveryCommit, actualMessage);
      if (!messageMatch.matches) throw Object.assign(new Error('Delivery Carrier commit message does not match the frozen Task Finish message.'), {
        code: 'task-finish.commit-message-mismatch',
        details: { expected: publicTaskFinishDeliveryCommit(expectedDeliveryCommit), observed: publicTaskFinishDeliveryCommit(messageMatch.observed) },
      });
    }
    const { changes, changedPaths } = carrierChanges(target, deliveryBaselineHead, head);
    return {
      status: 'prepared',
      root: target,
      head,
      tree,
      commitCreated,
      changedPaths,
      changes,
      activationPaths,
      deliveryBaseline: { head: deliveryBaselineHead, tree: deliveryBaselineTree },
      taskContribution: { ...taskContribution, appliedIdentity },
      deliveryCommit: publicTaskFinishDeliveryCommit(expectedDeliveryCommit),
    };
  } catch (error) {
    const cleanup = removeIsolatedGitCarrier({ repositoryRoot, workspaceRoot, runId, repositorySelector, expectedRoot: target });
    if (cleanup.status === 'blocked') error.cleanup = cleanup;
    throw error;
  }
}

export function adoptAgentReviewedGitCarrier({ repositoryRoot, carrier, acceptZeroDelta = false, agentReviewedTargetPaths = [] }) {
  if (!carrier?.root || !carrierRegistration(repositoryRoot, carrier.root)) return { status: 'blocked', code: 'task-finish.carrier-ownership-unprovable' };
  const baselineHead = carrier.deliveryBaseline?.head;
  const baselineTree = carrier.deliveryBaseline?.tree;
  if (!baselineHead || !baselineTree) return { status: 'blocked', code: 'task-finish.delivery-baseline-unprovable' };
  const head = gitText(carrier.root, ['rev-parse', 'HEAD^{commit}']);
  const tree = gitText(carrier.root, ['rev-parse', 'HEAD^{tree}']);
  const status = git(carrier.root, ['status', '--porcelain=v1', '-z', '--untracked-files=all']);
  if (!head || !tree || status.status !== 0 || status.stdout.length !== 0) return { status: 'blocked', code: 'task-finish.delivery-adaptation-dirty', observed: { head, tree, clean: false } };
  const zeroDelta = head === baselineHead && tree === baselineTree;
  const activationPaths = taskContributionActivationPaths(repositoryRoot, carrier.taskContribution);
  if (!activationPaths?.length) return { status: 'blocked', code: 'task-finish.task-contribution-unprovable' };
  if (head === baselineHead || tree === baselineTree) {
    if (!zeroDelta || !acceptZeroDelta) return { status: 'blocked', code: 'task-finish.delivery-adaptation-missing', observed: { head, tree } };
    const coverage = createTaskContributionPathCoverage({ repositoryRoot, taskContribution: carrier.taskContribution, deliveryBaselineTree: baselineTree, carrierTree: tree, agentReviewedTargetPaths });
    if (coverage.status !== 'covered') return coverage;
    return {
      status: 'adopted',
      head,
      tree,
      changedPaths: [],
      changes: [],
      activationPaths,
      zeroDelta: true,
      carrierDeltaIdentity: deltaIdentity(carrier.root, baselineTree, tree),
      pathCoverage: coverage.coverage,
      cleanliness: { clean: true },
      deliveryCommit: carrier.deliveryCommit || null,
    };
  }
  const ancestor = git(carrier.root, ['merge-base', '--is-ancestor', baselineHead, head]);
  if (ancestor.status !== 0) return { status: 'blocked', code: 'task-finish.delivery-baseline-drift', observed: { baselineHead, head } };
  const merges = gitText(carrier.root, ['rev-list', '--merges', `${baselineHead}..${head}`]);
  if (merges) return { status: 'blocked', code: 'task-finish.delivery-adaptation-merge-commit', observed: { merges: merges.split('\n') } };
  const deliveryCommit = verifyCarrierDeliveryCommit({ ...carrier, head });
  if (!deliveryCommit.matches) return { status: 'blocked', code: 'task-finish.commit-message-mismatch', observed: { deliveryCommit: publicTaskFinishDeliveryCommit(deliveryCommit.observed) } };
  const { changes, changedPaths } = carrierChanges(carrier.root, baselineHead, head);
  const carrierDeltaIdentity = deltaIdentity(carrier.root, baselineTree, tree);
  const coverage = createTaskContributionPathCoverage({ repositoryRoot, taskContribution: carrier.taskContribution, deliveryBaselineTree: baselineTree, carrierTree: tree, agentReviewedTargetPaths });
  if (coverage.status !== 'covered') return coverage;
  return {
    status: 'adopted',
    head,
    tree,
    changedPaths,
    changes,
    activationPaths,
    zeroDelta: false,
    carrierDeltaIdentity,
    pathCoverage: coverage.coverage,
    cleanliness: { clean: true },
    deliveryCommit: publicTaskFinishDeliveryCommit(deliveryCommit.observed),
  };
}

export function verifyGitTaskContributionCarrier({ repositoryRoot, carrier }) {
  if (!carrier?.root || !carrierRegistration(repositoryRoot, carrier.root)) return { status: 'stale', code: 'task-finish.carrier-ownership-unprovable' };
  const head = gitText(carrier.root, ['rev-parse', 'HEAD^{commit}']);
  const tree = gitText(carrier.root, ['rev-parse', 'HEAD^{tree}']);
  const status = git(carrier.root, ['status', '--porcelain=v1', '-z', '--untracked-files=all']);
  if (head !== carrier.head || tree !== carrier.tree || status.status !== 0 || status.stdout.length !== 0) return { status: 'stale', code: 'task-finish.carrier-changed', observed: { head, tree, clean: status.status === 0 && status.stdout.length === 0 } };
  if (carrier.zeroDelta) {
    if (head !== carrier.deliveryBaseline.head || tree !== carrier.deliveryBaseline.tree || carrier.changedPaths?.length || carrier.changes?.length) return { status: 'stale', code: 'task-finish.delivery-adaptation-drift', observed: { head, tree, changedPaths: carrier.changedPaths || [], changes: carrier.changes || [] } };
  } else {
    const deliveryCommit = verifyCarrierDeliveryCommit(carrier);
    if (!deliveryCommit.matches) return { status: 'stale', code: 'task-finish.commit-message-mismatch', observed: { deliveryCommit: publicTaskFinishDeliveryCommit(deliveryCommit.observed) } };
  }
  const appliedIdentity = deltaIdentity(carrier.root, carrier.deliveryBaseline.tree, tree);
  if (carrier.reuseMode === 'agent-reviewed-delivery-adaptation') {
    if (appliedIdentity !== carrier.carrierDeltaIdentity) return { status: 'stale', code: 'task-finish.delivery-adaptation-drift', observed: { appliedIdentity } };
    const coverage = verifyTaskContributionPathCoverage({ repositoryRoot, carrier });
    if (coverage.status !== 'current') return coverage;
    return { status: 'equivalent', appliedIdentity, reuseMode: carrier.reuseMode, pathCoverageIdentity: coverage.identity };
  }
  if (appliedIdentity !== carrier.taskContribution.identity || appliedIdentity !== carrier.taskContribution.appliedIdentity) return { status: 'stale', code: 'task-finish.contribution-not-equivalent', observed: { appliedIdentity } };
  return { status: 'equivalent', appliedIdentity, reuseMode: 'deterministic-reuse' };
}

export function verifyDeliveredGitTaskContribution({ taskRoot, targetRef, proof }) {
  try {
    if (!proof?.taskContribution || !proof?.head || !proof?.tree) return { status: 'stale', code: 'git_worktree_contribution_proof_invalid' };
    const targetHead = requireGitText(taskRoot, ['rev-parse', `${targetRef}^{commit}`], 'Delivered target ref is unavailable.');
    const proofHead = requireGitText(taskRoot, ['rev-parse', `${proof.head}^{commit}`], 'Delivered carrier ref is unavailable.');
    const proofTree = requireGitText(taskRoot, ['rev-parse', `${proof.head}^{tree}`], 'Delivered carrier tree is unavailable.');
    const delivered = git(taskRoot, ['merge-base', '--is-ancestor', proof.head, targetHead]);
    if (proofHead !== proof.head || proofTree !== proof.tree || delivered.status !== 0) return { status: 'stale', code: 'git_worktree_contribution_target_mismatch' };
    if (proof.deliveryCommit?.identity && !proof.zeroDelta) {
      const deliveryCommit = observedDeliveryCommit(taskRoot, proof.head);
      if (!deliveryCommit || deliveryCommit.identity !== proof.deliveryCommit.identity || deliveryCommit.subject !== proof.deliveryCommit.subject) return { status: 'stale', code: 'git_worktree_delivery_commit_mismatch' };
    }
    const sourceHead = requireGitText(taskRoot, ['rev-parse', 'HEAD^{commit}'], 'Task source HEAD is unavailable.');
    if (sourceHead !== proof.taskContribution.source.head) return { status: 'stale', code: 'git_worktree_contribution_source_head_drift' };
    const current = withTemporaryIndex(taskRoot, proof.taskContribution.originalBaseline.head, ({ tree }) => ({ tree }));
    if (current.tree !== proof.taskContribution.source.tree) return { status: 'stale', code: 'git_worktree_contribution_source_drift' };
    const sourceIdentity = deltaIdentity(taskRoot, proof.taskContribution.originalBaseline.tree, current.tree);
    if (sourceIdentity !== proof.taskContribution.identity) return { status: 'stale', code: 'git_worktree_contribution_source_not_equivalent' };
    if (proof.reuseMode === 'agent-reviewed-delivery-adaptation') {
      if (proof.pathCoverage) {
        const coverage = verifyTaskContributionPathCoverage({ repositoryRoot: taskRoot, carrier: proof });
        if (coverage.status !== 'current') return { status: 'stale', code: 'git_worktree_delivery_adaptation_path_coverage_invalid', observed: coverage };
      }
      const equivalence = proof.deliveryEquivalence;
      if (equivalence?.status === 'equivalent'
        && equivalence.reuseMode === proof.reuseMode
        && equivalence.semanticEquivalence === 'agent-reviewed-not-proven-by-buildr'
        && proof.identity
        && equivalence.carrierIdentity === proof.identity
        && equivalence.taskContributionIdentity === sourceIdentity) {
        return { status: 'equivalent', identity: sourceIdentity, carrierIdentity: proof.identity, reuseMode: proof.reuseMode };
      }
      if (!proof.deliveryBaseline) return { status: 'stale', code: 'git_worktree_delivery_adaptation_proof_invalid' };
      const deliveredIdentity = deltaIdentity(taskRoot, proof.deliveryBaseline.tree, proof.tree);
      if (!proof.carrierDeltaIdentity || deliveredIdentity !== proof.carrierDeltaIdentity) return { status: 'stale', code: 'git_worktree_delivery_adaptation_not_equivalent' };
      return { status: 'equivalent', identity: sourceIdentity, carrierIdentity: deliveredIdentity, reuseMode: proof.reuseMode };
    }
    if (!proof.deliveryBaseline) return { status: 'stale', code: 'git_worktree_contribution_proof_invalid' };
    const deliveredIdentity = deltaIdentity(taskRoot, proof.deliveryBaseline.tree, proof.tree);
    if (deliveredIdentity !== proof.taskContribution.identity) return { status: 'stale', code: 'git_worktree_contribution_not_equivalent' };
    return { status: 'equivalent', identity: sourceIdentity, reuseMode: 'deterministic-reuse' };
  } catch (error) {
    return { status: 'stale', code: 'git_worktree_contribution_proof_failed', diagnostic: error.message };
  }
}

export function verifyGitTaskContributionContainmentProof({ taskRoot, targetRef, proof }) {
  try {
    if (proof?.schemaVersion !== 'buildr.task-delivery-containment-proof/v1'
      || proof?.taskContribution?.schemaVersion !== 'buildr.git-task-contribution/v1'
      || !proof.identity) {
      return { status: 'stale', code: 'git_worktree_containment_proof_invalid' };
    }
    const current = observeGitTaskContribution({
      root: taskRoot,
      deliveryBaselineHead: proof.taskContribution.originalBaseline.head,
    });
    if (current.identity !== proof.taskContribution.identity
      || current.source.head !== proof.taskContribution.source.head
      || current.source.tree !== proof.taskContribution.source.tree) {
      return { status: 'stale', code: 'git_worktree_contribution_source_drift' };
    }
    const observed = inspectGitTaskContributionContainment({
      repositoryRoot: taskRoot,
      targetRef,
      taskContribution: proof.taskContribution,
    });
    if (observed.status !== 'contained'
      || observed.identity !== proof.identity
      || observed.targetRef !== proof.targetRef) {
      return { status: 'stale', code: observed.code || 'git_worktree_containment_proof_mismatch', observed };
    }
    return { status: 'equivalent', identity: current.identity, containmentIdentity: observed.identity, reuseMode: 'target-containment' };
  } catch (error) {
    return { status: 'stale', code: 'git_worktree_containment_proof_failed', diagnostic: error.message };
  }
}

export function createGitNoContributionProof({ taskRoot, targetRef, taskContribution }) {
  const current = observeGitTaskContribution({ root: taskRoot, deliveryBaselineHead: taskContribution.originalBaseline.head });
  if (current.identity !== taskContribution.identity
    || current.source.head !== taskContribution.source.head
    || current.source.tree !== taskContribution.source.tree
    || current.originalBaseline.tree !== current.source.tree) {
    return { status: 'stale', code: 'task-finish.no-contribution-drift', observed: current };
  }
  const targetHead = gitText(taskRoot, ['rev-parse', `${targetRef}^{commit}`]);
  const targetTree = targetHead ? gitText(taskRoot, ['rev-parse', `${targetHead}^{tree}`]) : null;
  if (!targetHead || !targetTree) return { status: 'stale', code: 'task-finish.no-contribution-target-unavailable' };
  const value = {
    schemaVersion: 'buildr.git-no-contribution-proof/v1',
    kind: 'no-contribution',
    taskContribution,
    target: { head: targetHead, tree: targetTree },
  };
  return { status: 'equivalent', proof: { ...value, identity: containmentIdentity(value) } };
}

export function verifyGitNoContributionProof({ taskRoot, targetRef, proof }) {
  try {
    if (proof?.schemaVersion !== 'buildr.git-no-contribution-proof/v1'
      || proof?.kind !== 'no-contribution'
      || !proof?.taskContribution?.originalBaseline?.head
      || !proof?.taskContribution?.source?.tree
      || !proof?.target?.head
      || !proof?.target?.tree
      || !proof?.identity) return { status: 'stale', code: 'git_worktree_no_contribution_proof_invalid' };
    const unsigned = {
      schemaVersion: proof.schemaVersion,
      kind: proof.kind,
      taskContribution: proof.taskContribution,
      target: proof.target,
    };
    if (containmentIdentity(unsigned) !== proof.identity) return { status: 'stale', code: 'git_worktree_no_contribution_proof_identity_mismatch' };
    const targetHead = requireGitText(taskRoot, ['rev-parse', `${targetRef}^{commit}`], 'No-contribution target ref is unavailable.');
    const targetTree = requireGitText(taskRoot, ['rev-parse', `${targetHead}^{tree}`], 'No-contribution target tree is unavailable.');
    if (targetHead !== proof.target.head || targetTree !== proof.target.tree) return { status: 'stale', code: 'git_worktree_no_contribution_target_mismatch' };
    const current = observeGitTaskContribution({ root: taskRoot, deliveryBaselineHead: proof.taskContribution.originalBaseline.head });
    if (current.identity !== proof.taskContribution.identity
      || current.source.head !== proof.taskContribution.source.head
      || current.source.tree !== proof.taskContribution.source.tree
      || current.originalBaseline.tree !== current.source.tree) {
      return { status: 'stale', code: 'git_worktree_no_contribution_source_drift', observed: current };
    }
    return { status: 'equivalent', identity: current.identity, proofIdentity: proof.identity, reuseMode: 'no-contribution' };
  } catch (error) {
    return { status: 'stale', code: 'git_worktree_no_contribution_proof_failed', diagnostic: error.message };
  }
}
