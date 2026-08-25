#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { sameFilesystemPath } from '../../src/infrastructure/filesystem/filesystem-path-identity.mjs';
import { cleanupReleaseSelection, inspectReleaseSelection } from './release-selection.mjs';
import { validateReleaseTransactionEvidence } from './release-transaction-evidence.mjs';

export const releaseGitConvergenceSchema = 'buildr.release-git-convergence/v1';

const SHA = /^[a-f0-9]{40}$/u;
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u;
const DIGEST = /^sha256-[a-f0-9]{64}$/u;

function execute(command, args, options = {}) {
  return spawnSync(command, args, { cwd: options.cwd, encoding: 'utf8', windowsHide: true });
}

function run(command, args, cwd, dependencies, { allowFailure = false } = {}) {
  const result = (dependencies.execute ?? execute)(command, args, { cwd });
  if (result?.error) throw new Error(`${command} ${args.join(' ')} failed to start: ${result.error.message}`);
  if (!allowFailure && result?.status !== 0) {
    const detail = [result?.stdout, result?.stderr].filter(Boolean).join('\n').trim();
    throw new Error(`${command} ${args.join(' ')} failed${detail ? `: ${detail}` : ''}`);
  }
  return { status: result?.status ?? 1, stdout: String(result?.stdout ?? ''), stderr: String(result?.stderr ?? '') };
}

function git(repo, args, dependencies, options) {
  return run('git', args, repo, dependencies, options);
}

function requiredVersion(value) {
  if (!VERSION.test(value ?? '')) throw new Error('Release version must be a semantic version without the leading v.');
  return value;
}

function requiredSha(value, label) {
  if (!SHA.test(value ?? '')) throw new Error(`${label} must be a full lowercase Git SHA.`);
  return value;
}

function branchFor(version) {
  return `release-${requiredVersion(version)}`;
}

function requiredGeneration(value) {
  const generation = Number(value);
  if (!Number.isSafeInteger(generation) || generation < 0) throw new Error('generation must be a non-negative integer.');
  return generation;
}

export function releaseCarrierBranchFor(version, generation) {
  return `codex/release-main-${requiredVersion(version)}-g${requiredGeneration(generation)}`;
}

function identity(value) {
  return `sha256-${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

function rev(repo, ref, dependencies) {
  return requiredSha(git(repo, ['rev-parse', '--verify', ref], dependencies).stdout.trim(), ref);
}

function tree(repo, ref, dependencies) {
  return rev(repo, `${ref}^{tree}`, dependencies);
}

function isAncestor(repo, ancestor, descendant, dependencies) {
  return git(repo, ['merge-base', '--is-ancestor', ancestor, descendant], dependencies, { allowFailure: true }).status === 0;
}

function remoteHeads(repo, remote, branches, dependencies) {
  const refs = branches.map((branch) => `refs/heads/${branch}`);
  const result = git(repo, ['ls-remote', '--heads', remote, ...refs], dependencies);
  const found = new Map(result.stdout.split(/\r?\n/u).filter(Boolean).map((line) => {
    const [commit, ref] = line.trim().split(/\s+/u);
    return [ref, commit];
  }));
  return Object.fromEntries(branches.map((branch) => [branch, found.get(`refs/heads/${branch}`) ?? null]));
}

function result(operation, status, data = {}) {
  return {
    schemaVersion: releaseGitConvergenceSchema,
    operation,
    status,
    effects: [],
    nextActions: [],
    ...data,
  };
}

function blocked(operation, code, message, data = {}) {
  const blockedStatus = data.status === 'published-but-dev-convergence-blocked'
    ? data.status
    : 'blocked';
  const { status: _status, diagnostic, nextActions, ...facts } = data;
  return result(operation, blockedStatus, {
    ...facts,
    diagnostic: { code, message, ...(diagnostic?.details ? { details: diagnostic.details } : {}) },
    nextActions: nextActions ?? ['重新读取current release、main、dev与publication facts后重试；不得ours、reset或force push。'],
  });
}

function releaseSource(context) {
  if (context.schemaVersion === 'buildr.release-context/v1') {
    return {
      version: context.release?.version,
      releaseCommit: context.release?.sourceCommit,
      releaseTree: context.release?.sourceTree,
      mainCommit: context.convergence?.mainCommit,
    };
  }
  return {
    version: context.releaseTask?.taskId?.replace(/^release-/u, '') || null,
    releaseCommit: context.candidate?.sourceCommit,
    releaseTree: context.convergence?.candidateTree,
    mainCommit: context.convergence?.mainCommit,
  };
}

function passedPublication(value) {
  const evidence = validateReleaseTransactionEvidence(value);
  if (evidence.status !== 'passed'
      || evidence.release.registryPublished !== true
      || evidence.release.registrySmoke !== 'passed'
      || !evidence.release.githubRelease
      || evidence.release.tagCommit !== evidence.publish.headSha) {
    throw new Error('Publication evidence is not a complete passed transaction.');
  }
  return evidence;
}

export function inspectDevBranchPolicy(options = {}, dependencies = {}) {
  const operation = 'inspect-dev-policy';
  try {
    const repo = path.resolve(options.repo ?? process.cwd());
    const repository = options.repository ?? 'BuildrAI/Buildr';
    const branch = options.dev ?? 'dev';
    const readback = run(options.ghCommand ?? 'gh', ['api', `repos/${repository}/branches/${branch}/protection`], repo, dependencies);
    const protection = JSON.parse(readback.stdout || '{}');
    const requiredLinearHistory = protection?.required_linear_history?.enabled === true;
    const observation = {
      source: 'github-branch-protection-readback',
      repository,
      branch,
      requiredLinearHistory,
      allowsMergeCommits: !requiredLinearHistory,
      identity: identity({ repository, branch, protection }),
    };
    return result(operation, 'ready', { observation });
  } catch (error) {
    return blocked(operation, 'dev-branch-policy-readback-blocked', error.message);
  }
}

function currentBranchPolicy(options, repo, dev, dependencies) {
  const inspected = dependencies.inspectBranchPolicy
    ? dependencies.inspectBranchPolicy({ repo, repository: options.repository ?? 'BuildrAI/Buildr', dev })
    : inspectDevBranchPolicy({ repo, repository: options.repository, dev, ghCommand: options.ghCommand }, dependencies);
  if (inspected?.status !== 'ready') return { status: 'blocked', inspected };
  const observation = inspected.observation;
  if (observation?.source !== 'github-branch-protection-readback'
      || observation.branch !== dev
      || !DIGEST.test(observation.identity ?? '')
      || typeof observation.requiredLinearHistory !== 'boolean'
      || typeof observation.allowsMergeCommits !== 'boolean') {
    return { status: 'blocked', inspected: blocked('inspect-dev-policy', 'dev-branch-policy-observation-invalid', 'Branch policy observation is not a closed current GitHub readback.') };
  }
  return { status: 'ready', observation };
}

export function inspectReleaseToMain(options = {}, dependencies = {}) {
  const operation = 'inspect-main';
  try {
    const repo = path.resolve(options.repo ?? process.cwd());
    const version = requiredVersion(options.version);
    const remote = options.remote ?? 'origin';
    const main = options.main ?? 'main';
    const dev = options.dev ?? 'dev';
    const branch = branchFor(version);
    const generation = requiredGeneration(options.generation);
    const carrierBranch = releaseCarrierBranchFor(version, generation);
    const candidateCommit = requiredSha(options.candidateCommit, 'candidateCommit');
    const candidateTree = requiredSha(options.candidateTree, 'candidateTree');
    const selection = inspectReleaseSelection({ version, repo, devRef: `${remote}/${dev}` }, dependencies);
    const findings = [];
    if (selection.status !== 'frozen') findings.push({ code: 'release-selection-not-frozen', expected: 'frozen', actual: selection.status });
    if (selection.generation !== generation) findings.push({ code: 'release-selection-generation-mismatch', expected: selection.generation ?? null, actual: generation });
    if (selection.releaseHead !== candidateCommit) findings.push({ code: 'release-candidate-commit-mismatch', expected: selection.releaseHead ?? null, actual: candidateCommit });
    if (selection.releaseTree !== candidateTree) findings.push({ code: 'release-candidate-tree-mismatch', expected: selection.releaseTree ?? null, actual: candidateTree });
    const refs = remoteHeads(repo, remote, [branch, carrierBranch, main, dev], dependencies);
    if (refs[branch] !== null && refs[branch] !== candidateCommit) findings.push({ code: 'remote-release-ref-drift', expected: candidateCommit, actual: refs[branch] });
    if (refs[carrierBranch] !== null && refs[carrierBranch] !== candidateCommit) findings.push({ code: 'release-carrier-ref-drift', expected: candidateCommit, actual: refs[carrierBranch] });
    const mainTree = refs[main] ? tree(repo, refs[main], dependencies) : null;
    const mainDisposition = mainTree === candidateTree ? 'tree-equivalent' : 'pending';
    return result(operation, findings.length ? 'blocked' : 'ready', {
      version,
      branch,
      generation,
      carrierBranch,
      candidate: { commit: candidateCommit, tree: candidateTree, selectionIdentity: selection.selectionIdentity ?? null },
      refs,
      main: { commit: refs[main], tree: mainTree, disposition: mainDisposition },
      findings,
      nextActions: findings.length ? ['修复current release selection或remote ref漂移后重试。'] : [],
    });
  } catch (error) {
    return blocked(operation, 'release-main-inspection-blocked', error.message);
  }
}

function parsePullRequests(stdout) {
  const value = JSON.parse(stdout || '[]');
  if (!Array.isArray(value)) throw new Error('GitHub pull request readback must be an array.');
  return value;
}

export function ensureReleaseToMainPullRequest(options = {}, dependencies = {}) {
  const operation = 'ensure-main-pr';
  const inspected = inspectReleaseToMain(options, dependencies);
  if (inspected.status !== 'ready') return { ...inspected, operation };
  try {
    const repo = path.resolve(options.repo ?? process.cwd());
    const remote = options.remote ?? 'origin';
    const main = options.main ?? 'main';
    const formalBranch = inspected.branch;
    const branch = inspected.carrierBranch;
    const repository = options.repository ?? 'BuildrAI/Buildr';
    const effects = [];
    if (inspected.refs[formalBranch] === null) {
      if (options.authorizeReleasePush !== true) {
        return blocked(operation, 'release-branch-push-authorization-required', `Remote ${formalBranch} is absent and requires explicit push authorization.`, {
          ...inspected,
          nextActions: [`确认将${inspected.candidate.commit}推送到${remote}/${formalBranch}并建立matching generation carrier后重试。`],
        });
      }
      git(repo, ['push', remote, `${inspected.candidate.commit}:refs/heads/${formalBranch}`], dependencies);
      const afterFormalPush = remoteHeads(repo, remote, [formalBranch], dependencies)[formalBranch];
      if (afterFormalPush !== inspected.candidate.commit) throw new Error(`Remote ${formalBranch} did not reach the authorized release commit.`);
      inspected.refs[formalBranch] = afterFormalPush;
      effects.push({ type: 'formal-release-branch-pushed', ref: `refs/heads/${formalBranch}`, commit: afterFormalPush });
    }
    if (inspected.refs[branch] === null) {
      if (options.authorizeReleasePush !== true) {
        return blocked(operation, 'release-branch-push-authorization-required', `Remote ${branch} is absent and requires explicit push authorization.`, {
          ...inspected,
          nextActions: [`确认将${inspected.candidate.commit}推送到owned carrier ${remote}/${branch}后重试。`],
        });
      }
      git(repo, ['push', remote, `${inspected.candidate.commit}:refs/heads/${branch}`], dependencies);
      const afterPush = remoteHeads(repo, remote, [branch], dependencies)[branch];
      if (afterPush !== inspected.candidate.commit) throw new Error(`Remote ${branch} did not reach the authorized release commit.`);
      inspected.refs[branch] = afterPush;
      effects.push({ type: 'release-carrier-pushed', ref: `refs/heads/${branch}`, commit: afterPush, generation: inspected.generation });
    }
    const prReadback = run(options.ghCommand ?? 'gh', [
      'pr', 'list', '--repo', repository, '--state', 'all', '--base', main, '--head', branch,
      '--json', 'number,state,headRefOid,headRefName,baseRefName,url,mergedAt',
    ], repo, dependencies);
    const pullRequests = parsePullRequests(prReadback.stdout);
    if (pullRequests.length > 1) return blocked(operation, 'release-main-pr-not-unique', `Expected at most one ${branch}→${main} pull request, found ${pullRequests.length}.`, { ...inspected, pullRequests, effects });
    if (pullRequests.length === 1) {
      const pullRequest = pullRequests[0];
      if (pullRequest.headRefOid !== inspected.candidate.commit || pullRequest.headRefName !== branch || pullRequest.baseRefName !== main) {
        return blocked(operation, 'release-main-pr-head-drift', 'Existing release→main pull request does not match the frozen release source.', { ...inspected, pullRequests, effects });
      }
      if (pullRequest.state === 'CLOSED' && !pullRequest.mergedAt) {
        return blocked(operation, 'release-main-pr-closed', 'The unique release→main pull request was closed without merging and cannot be treated as ready.', { ...inspected, pullRequests, effects });
      }
      if (pullRequest.state === 'MERGED' && inspected.main.disposition !== 'tree-equivalent') {
        return blocked(operation, 'release-main-tree-mismatch', 'The merged release→main pull request does not produce a main tree equal to the frozen release tree.', { ...inspected, pullRequests, effects });
      }
      return result(operation, 'ready', { ...inspected, pullRequest, effects, nextActions: [] });
    }
    if (options.authorizePullRequest !== true) {
      return blocked(operation, 'release-main-pr-authorization-required', `Creating the protected ${branch}→${main} pull request requires explicit authorization.`, {
        ...inspected,
        effects,
        nextActions: [`确认创建唯一${branch}→${main}受保护PR后重试。`],
      });
    }
    const created = run(options.ghCommand ?? 'gh', [
      'pr', 'create', '--repo', repository, '--base', main, '--head', branch,
      '--title', options.title ?? `Release ${options.version}`,
      '--body', options.body ?? `Release ${options.version} from frozen ${inspected.candidate.commit}.`,
    ], repo, dependencies).stdout.trim();
    effects.push({ type: 'pull-request-created', url: created });
    return result(operation, 'ready', { ...inspected, pullRequest: { url: created, state: 'OPEN', headRefOid: inspected.candidate.commit, headRefName: branch, baseRefName: main }, effects, nextActions: [] });
  } catch (error) {
    return blocked(operation, 'release-main-pr-blocked', error.message, { effects: [] });
  }
}

function cleanupTemporaryWorktree(repo, directory, dependencies) {
  git(repo, ['worktree', 'remove', '--force', directory], dependencies, { allowFailure: true });
  const holder = path.dirname(directory);
  fs.rmSync(directory, { recursive: true, force: true });
  if (path.basename(directory) === 'worktree' && path.basename(holder).startsWith('buildr-release-dev-convergence-')) {
    fs.rmSync(holder, { recursive: true, force: true });
  }
}

export function convergePublishedMainToDev(options = {}, dependencies = {}) {
  const operation = 'converge-dev';
  let temporary = null;
  try {
    const repo = path.resolve(options.repo ?? process.cwd());
    const remote = options.remote ?? 'origin';
    const main = options.main ?? 'main';
    const dev = options.dev ?? 'dev';
    const evidence = passedPublication(options.publicationEvidence);
    const source = releaseSource(evidence.context);
    const version = requiredVersion(source.version ?? evidence.release.npmVersion);
    const expectedMain = requiredSha(source.mainCommit ?? evidence.publish.headSha, 'publication main commit');
    const expectedTree = requiredSha(source.releaseTree, 'publication release tree');
    const refs = remoteHeads(repo, remote, [main, dev], dependencies);
    const recoveryIdentity = identity({
      operation,
      version,
      publicationEvidence: evidence.identity,
      expectedMain,
      mainBefore: refs[main],
      devBefore: refs[dev],
    });
    if (refs[main] !== expectedMain) {
      return blocked(operation, 'published-main-ref-drift', 'Publication succeeded, but current main no longer matches the published transaction.', {
        status: 'published-but-dev-convergence-blocked', version, recoveryIdentity, publication: { status: 'passed', evidenceIdentity: evidence.identity }, refs,
      });
    }
    const actualMainTree = tree(repo, refs[main], dependencies);
    if (actualMainTree !== expectedTree) {
      return blocked(operation, 'published-main-tree-mismatch', 'Publication succeeded, but current main tree does not match the frozen release tree.', {
        status: 'published-but-dev-convergence-blocked', version, recoveryIdentity, publication: { status: 'passed', evidenceIdentity: evidence.identity }, refs, expectedTree, actualMainTree,
      });
    }
    if (!refs[dev]) throw new Error(`Remote ${dev} is missing.`);
    if (isAncestor(repo, refs[main], refs[dev], dependencies)) {
      return result(operation, 'passed', {
        action: 'already-converged', version, recoveryIdentity, publication: { status: 'passed', evidenceIdentity: evidence.identity }, refs,
        convergence: { mainCommit: refs[main], mainTree: actualMainTree, devBefore: refs[dev], devAfter: refs[dev] },
      });
    }
    const policyReadback = currentBranchPolicy(options, repo, dev, dependencies);
    const branchPolicy = policyReadback.observation ?? null;
    if (policyReadback.status !== 'ready' || branchPolicy.requiredLinearHistory === true || branchPolicy.allowsMergeCommits !== true) {
      return blocked(operation, 'published-dev-branch-policy-incompatible', 'Publication succeeded, but current dev branch policy does not prove that the owned two-parent merge commit may be pushed normally.', {
        status: 'published-but-dev-convergence-blocked',
        version,
        recoveryIdentity,
        publication: { status: 'passed', evidenceIdentity: evidence.identity },
        refs,
        branchPolicy,
        policyReadback: policyReadback.inspected ?? null,
        nextActions: ['读取current dev branch policy；只有明确允许普通merge commit时才能继续，不得使用管理员绕过或改写历史。'],
      });
    }
    const holder = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-release-dev-convergence-'));
    temporary = path.join(holder, 'worktree');
    git(repo, ['worktree', 'add', '--detach', temporary, refs[dev]], dependencies);
    const merge = git(temporary, ['merge', '--no-ff', '--no-commit', refs[main]], dependencies, { allowFailure: true });
    if (merge.status !== 0) {
      const conflicts = git(temporary, ['diff', '--name-only', '--diff-filter=U'], dependencies, { allowFailure: true }).stdout.split(/\r?\n/u).map((item) => item.trim()).filter(Boolean).sort();
      git(temporary, ['merge', '--abort'], dependencies, { allowFailure: true });
      cleanupTemporaryWorktree(repo, temporary, dependencies);
      temporary = null;
      return blocked(operation, 'published-dev-merge-conflict', 'Publication succeeded, but main cannot be merged into current dev without conflicts.', {
        status: 'published-but-dev-convergence-blocked', version, recoveryIdentity, publication: { status: 'passed', evidenceIdentity: evidence.identity }, refs,
        conflictPaths: conflicts,
      });
    }
    git(temporary, ['-c', 'user.name=Buildr Release', '-c', 'user.email=release@example.com', 'commit', '-m', `chore(release): 收敛 ${version} main 到 dev`], dependencies);
    const merged = rev(temporary, 'HEAD', dependencies);
    if (!isAncestor(temporary, refs[dev], merged, dependencies) || !isAncestor(temporary, refs[main], merged, dependencies)) throw new Error('Convergence commit does not preserve both main and dev histories.');
    dependencies.beforeRemoteRecheck?.({ repo, refs, merged });
    const live = remoteHeads(repo, remote, [main, dev], dependencies);
    if (live[main] !== refs[main] || live[dev] !== refs[dev]) {
      cleanupTemporaryWorktree(repo, temporary, dependencies);
      temporary = null;
      return blocked(operation, 'published-convergence-remote-race', 'Publication succeeded, but a related remote ref changed before the dev push.', {
        status: 'published-but-dev-convergence-blocked', version, recoveryIdentity, publication: { status: 'passed', evidenceIdentity: evidence.identity }, expectedRefs: refs, actualRefs: live,
      });
    }
    const push = git(temporary, ['push', remote, `HEAD:refs/heads/${dev}`], dependencies, { allowFailure: true });
    if (push.status !== 0) {
      cleanupTemporaryWorktree(repo, temporary, dependencies);
      temporary = null;
      return blocked(operation, 'published-dev-push-rejected', 'Publication succeeded, but the normal fast-forward dev push was rejected.', {
        status: 'published-but-dev-convergence-blocked', version, recoveryIdentity, publication: { status: 'passed', evidenceIdentity: evidence.identity }, refs,
      });
    }
    const after = remoteHeads(repo, remote, [main, dev], dependencies);
    if (after[dev] !== merged || !isAncestor(repo, after[main], after[dev], dependencies)) throw new Error('Remote dev readback does not prove publication convergence.');
    cleanupTemporaryWorktree(repo, temporary, dependencies);
    temporary = null;
    return result(operation, 'passed', {
      action: 'merged', version, recoveryIdentity, publication: { status: 'passed', evidenceIdentity: evidence.identity }, refs: after,
      convergence: { mainCommit: after[main], mainTree: actualMainTree, devBefore: refs[dev], devAfter: after[dev] },
      effects: [{ type: 'dev-updated', ref: `refs/heads/${dev}`, before: refs[dev], after: after[dev], strategy: 'normal-merge' }],
    });
  } catch (error) {
    if (temporary) cleanupTemporaryWorktree(path.resolve(options.repo ?? process.cwd()), temporary, dependencies);
    return blocked(operation, 'published-dev-convergence-blocked', error.message, { status: 'published-but-dev-convergence-blocked' });
  }
}

function localBranchCommit(repo, branch, dependencies) {
  const ref = `refs/heads/${branch}`;
  const check = git(repo, ['show-ref', '--verify', '--hash', ref], dependencies, { allowFailure: true });
  return check.status === 0 ? requiredSha(check.stdout.trim(), ref) : null;
}

function releaseOwnedWorktrees(repo, branches, dependencies) {
  const branchRefs = new Set(branches.map((branch) => `refs/heads/${branch}`));
  const blocks = git(repo, ['worktree', 'list', '--porcelain'], dependencies).stdout.trim().split(/\n\n/u).filter(Boolean);
  return blocks.map((block) => Object.fromEntries(block.split(/\r?\n/u).map((line) => {
    const separator = line.indexOf(' ');
    return separator === -1 ? [line, true] : [line.slice(0, separator), line.slice(separator + 1)];
  }))).filter((entry) => branchRefs.has(entry.branch));
}

export function closeoutReleaseGitResources(options = {}, dependencies = {}) {
  const operation = 'closeout';
  try {
    const repo = path.resolve(options.repo ?? process.cwd());
    const remote = options.remote ?? 'origin';
    const version = requiredVersion(options.version);
    const generation = requiredGeneration(options.generation);
    const expectedCommit = requiredSha(options.expectedCommit, 'expectedCommit');
    const formalBranch = branchFor(version);
    const carrierBranch = releaseCarrierBranchFor(version, generation);
    const remoteRefs = remoteHeads(repo, remote, [formalBranch, carrierBranch], dependencies);
    const localFormal = localBranchCommit(repo, formalBranch, dependencies);
    const localCarrier = localBranchCommit(repo, carrierBranch, dependencies);
    const ownedWorktrees = releaseOwnedWorktrees(repo, [formalBranch, carrierBranch], dependencies);
    const findings = [];
    if (remoteRefs[formalBranch] !== expectedCommit) findings.push({ code: 'formal-release-ref-drift', ref: `refs/heads/${formalBranch}`, expected: expectedCommit, actual: remoteRefs[formalBranch] });
    if (localFormal !== null && localFormal !== expectedCommit) findings.push({ code: 'local-formal-release-ref-drift', ref: `refs/heads/${formalBranch}`, expected: expectedCommit, actual: localFormal });
    if (remoteRefs[carrierBranch] !== null && remoteRefs[carrierBranch] !== expectedCommit) findings.push({ code: 'release-carrier-ref-drift', ref: `refs/heads/${carrierBranch}`, expected: expectedCommit, actual: remoteRefs[carrierBranch] });
    if (localCarrier !== null && localCarrier !== expectedCommit) findings.push({ code: 'local-release-carrier-ref-drift', ref: `refs/heads/${carrierBranch}`, expected: expectedCommit, actual: localCarrier });
    for (const worktree of ownedWorktrees) {
      if (worktree.HEAD !== expectedCommit) findings.push({ code: 'release-worktree-head-drift', path: worktree.worktree, ref: worktree.branch, expected: expectedCommit, actual: worktree.HEAD ?? null });
    }
    if (findings.length) return blocked(operation, 'release-closeout-identity-unknown', 'Release closeout found resources whose ownership or identity cannot be proved.', { version, generation, expectedCommit, findings });

    const effects = [];
    if (ownedWorktrees.length && options.authorizeLocalSelectionCleanup !== true) {
      return blocked(operation, 'release-worktree-cleanup-authorization-required', 'Removing owned release worktrees requires explicit local closeout authorization.', { version, generation, expectedCommit, ownedWorktrees });
    }
    for (const worktree of ownedWorktrees) {
      if (sameFilesystemPath(worktree.worktree, repo)) return blocked(operation, 'release-worktree-is-execution-root', `Release-owned branch ${worktree.branch} is checked out in the execution root.`, { version, generation, expectedCommit, ownedWorktrees });
      git(repo, ['worktree', 'remove', '--force', worktree.worktree], dependencies);
      effects.push({ type: 'release-worktree-removed', path: worktree.worktree, ref: worktree.branch, commit: expectedCommit });
    }
    if (remoteRefs[carrierBranch] !== null) {
      if (options.authorizeCarrierCleanup !== true) {
        return blocked(operation, 'release-carrier-cleanup-authorization-required', `Deleting owned carrier ${remote}/${carrierBranch} requires explicit closeout authorization.`, {
          version, generation, expectedCommit, formalReleaseRef: { ref: `refs/heads/${formalBranch}`, commit: expectedCommit, disposition: 'retained-and-verified' },
        });
      }
      git(repo, ['push', remote, `:refs/heads/${carrierBranch}`], dependencies);
      if (remoteHeads(repo, remote, [carrierBranch], dependencies)[carrierBranch] !== null) throw new Error(`Remote carrier ${carrierBranch} still exists after deletion.`);
      effects.push({ type: 'remote-release-carrier-deleted', ref: `refs/heads/${carrierBranch}`, commit: expectedCommit });
    }
    if (localCarrier !== null) {
      if (options.authorizeCarrierCleanup !== true) {
        return blocked(operation, 'release-carrier-cleanup-authorization-required', `Deleting owned local carrier ${carrierBranch} requires explicit closeout authorization.`, { version, generation, expectedCommit, effects });
      }
      const currentBranch = git(repo, ['branch', '--show-current'], dependencies).stdout.trim();
      if (currentBranch === carrierBranch) return blocked(operation, 'release-carrier-checked-out', `Owned carrier ${carrierBranch} is currently checked out.`, { version, generation, expectedCommit, effects });
      git(repo, ['branch', '-D', carrierBranch], dependencies);
      effects.push({ type: 'local-release-carrier-deleted', ref: `refs/heads/${carrierBranch}`, commit: expectedCommit });
    }
    if (options.authorizeLocalSelectionCleanup !== true) {
      return blocked(operation, 'release-selection-cleanup-authorization-required', 'Deleting the local release branch and lifecycle refs requires explicit closeout authorization.', { version, generation, expectedCommit, effects });
    }
    const selectionCleanup = cleanupReleaseSelection({ repo, version, confirm: true }, dependencies);
    if (selectionCleanup.status !== 'passed') return blocked(operation, 'release-selection-cleanup-blocked', selectionCleanup.diagnostic?.message ?? 'Local selection cleanup failed.', { version, generation, expectedCommit, effects, selectionCleanup });
    effects.push(...selectionCleanup.effects);
    const closeoutIdentity = identity({ version, generation, expectedCommit, formalReleaseRef: expectedCommit, carrier: 'absent', selection: 'absent' });
    return result(operation, 'passed', {
      action: effects.length ? 'cleaned' : 'already-cleaned',
      version,
      generation,
      expectedCommit,
      identity: closeoutIdentity,
      formalReleaseRef: { ref: `refs/heads/${formalBranch}`, commit: expectedCommit, disposition: 'retained-and-verified' },
      resources: {
        carrier: { ref: `refs/heads/${carrierBranch}`, local: 'absent', remote: 'absent' },
        selection: { localBranch: 'absent', lifecycleRefs: 'absent' },
      },
      effects,
    });
  } catch (error) {
    return blocked(operation, 'release-closeout-blocked', error.message);
  }
}

export function cleanupRemoteReleaseBranch(options = {}, dependencies = {}) {
  const operation = 'cleanup-remote';
  try {
    const repo = path.resolve(options.repo ?? process.cwd());
    const remote = options.remote ?? 'origin';
    const evidence = passedPublication(options.publicationEvidence);
    const source = releaseSource(evidence.context);
    const version = requiredVersion(source.version ?? evidence.release.npmVersion);
    const branch = branchFor(version);
    const expected = requiredSha(source.releaseCommit, 'published release commit');
    const actual = remoteHeads(repo, remote, [branch], dependencies)[branch];
    const publicFacts = { publication: 'passed', tag: evidence.release.tag, npmVersion: evidence.release.npmVersion, githubRelease: evidence.release.githubRelease, evidenceIdentity: evidence.identity };
    if (actual === null) return result(operation, 'passed', { action: 'already-cleaned', version, ref: `refs/heads/${branch}`, expectedCommit: expected, actualCommit: null, publicFacts });
    if (actual !== expected) return blocked(operation, 'remote-release-ref-drift', `Remote ${branch} does not match the published release commit.`, { version, ref: `refs/heads/${branch}`, expectedCommit: expected, actualCommit: actual, publicFacts });
    if (options.authorizeRemoteDelete !== true) {
      return blocked(operation, 'remote-release-delete-authorization-required', `Deleting ${remote}/${branch} requires independent explicit authorization.`, {
        version, ref: `refs/heads/${branch}`, expectedCommit: expected, actualCommit: actual, publicFacts,
        nextActions: [`确认删除${remote}/${branch}（${actual}）后重试。`],
      });
    }
    git(repo, ['push', remote, `:refs/heads/${branch}`], dependencies);
    const after = remoteHeads(repo, remote, [branch], dependencies)[branch];
    if (after !== null) throw new Error(`Remote ${branch} still exists after deletion.`);
    return result(operation, 'passed', {
      action: 'deleted', version, ref: `refs/heads/${branch}`, expectedCommit: expected, actualCommit: null, publicFacts,
      effects: [{ type: 'remote-release-branch-deleted', ref: `refs/heads/${branch}`, commit: expected }],
    });
  } catch (error) {
    return blocked(operation, 'remote-release-cleanup-blocked', error.message);
  }
}

function readJsonFile(filename) {
  const resolved = path.resolve(filename);
  const stat = fs.lstatSync(resolved);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Evidence must be a regular non-symlink file: ${resolved}`);
  return JSON.parse(fs.readFileSync(resolved, 'utf8'));
}

function parseArgs(argv) {
  const [operation, ...rest] = argv;
  const options = { operation };
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index];
    const value = rest[index + 1];
    if (!key?.startsWith('--') || value === undefined) throw new Error(`Invalid argument: ${key || '<missing>'}`);
    options[key.slice(2)] = value;
  }
  const common = { repo: options.repo, remote: options.remote, main: options.main, dev: options.dev };
  if (operation === 'inspect-dev-policy') return { ...common, repository: options.repository, ghCommand: options.gh };
  if (operation === 'inspect-main' || operation === 'ensure-main-pr') return {
    ...common,
    version: options.version,
    generation: options.generation,
    candidateCommit: options['candidate-commit'],
    candidateTree: options['candidate-tree'],
    repository: options.repository,
    ghCommand: options.gh,
    authorizeReleasePush: options['authorize-release-push'] === 'true',
    authorizePullRequest: options['authorize-pull-request'] === 'true',
    title: options.title,
    body: options.body,
  };
  if (operation === 'converge-dev' || operation === 'cleanup-remote') return {
    ...common,
    publicationEvidence: readJsonFile(options['publication-evidence']),
    authorizeRemoteDelete: options['authorize-remote-delete'] === 'true',
    repository: options.repository,
    ghCommand: options.gh,
  };
  if (operation === 'closeout') return {
    ...common,
    version: options.version,
    generation: options.generation,
    expectedCommit: options['expected-commit'],
    authorizeCarrierCleanup: options['authorize-carrier-cleanup'] === 'true',
    authorizeLocalSelectionCleanup: options['authorize-local-selection-cleanup'] === 'true',
  };
  throw new Error('Usage: release-git-convergence.mjs <inspect-main|ensure-main-pr|inspect-dev-policy|converge-dev|closeout|cleanup-remote> ...');
}

if (process.argv[1] && sameFilesystemPath(process.argv[1], fileURLToPath(import.meta.url))) {
  try {
    const operation = process.argv[2];
    const options = parseArgs(process.argv.slice(2));
    const value = operation === 'inspect-main'
      ? inspectReleaseToMain(options)
      : operation === 'ensure-main-pr'
        ? ensureReleaseToMainPullRequest(options)
        : operation === 'inspect-dev-policy'
          ? inspectDevBranchPolicy(options)
        : operation === 'converge-dev'
          ? convergePublishedMainToDev(options)
          : operation === 'closeout'
            ? closeoutReleaseGitResources(options)
            : cleanupRemoteReleaseBranch(options);
    process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
    if (value.status === 'blocked' || value.status === 'published-but-dev-convergence-blocked') process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`${JSON.stringify(blocked('unknown', 'release-git-convergence-invalid-input', error.message), null, 2)}\n`);
    process.exitCode = 1;
  }
}
