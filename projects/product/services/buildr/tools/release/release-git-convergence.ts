#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { sameFilesystemPath } from '../../src/infrastructure/filesystem/filesystem-path-identity.ts';
import { cleanupReleaseSelection, inspectReleaseSelection, inspectReleaseSelectionCleanup, reconcileReleaseSelectionWithMain, inspectReleaseSourceProvenance } from './release-selection.ts';
import { validateReleaseTransactionEvidence } from './release-transaction-evidence.ts';
import { repositoryFromUrl } from './release-authority-preflight.ts';

export const releaseGitConvergenceSchema: any = 'buildr.release-git-convergence/v1';

const SHA: any = /^[a-f0-9]{40}$/u;
const VERSION: any = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u;
const DIGEST: any = /^sha256-[a-f0-9]{64}$/u;

function execute(command: any, args: any, options: any = {}): any  {
  return spawnSync(command, args, { cwd: options.cwd, encoding: 'utf8', windowsHide: true, timeout: 30_000 });
}

function run(command: any, args: any, cwd: any, dependencies: any, { allowFailure = false }: any = {}): any  {
  const result: any = (dependencies.execute ?? execute)(command, args, { cwd });
  if (result?.error) throw new Error(`${command} ${args.join(' ')} failed to start: ${result.error.message}`);
  if (!allowFailure && result?.status !== 0) {
    const detail: any = [result?.stdout, result?.stderr].filter(Boolean).join('\n').trim();
    throw new Error(`${command} ${args.join(' ')} failed${detail ? `: ${detail}` : ''}`);
  }
  return { status: result?.status ?? 1, stdout: String(result?.stdout ?? ''), stderr: String(result?.stderr ?? '') };
}

function git(repo: any, args: any, dependencies: any, options: any = {}): any  {
  return run('git', args, repo, dependencies, options);
}

function requiredVersion(value: any): any  {
  if (!VERSION.test(value ?? '')) throw new Error('Release version must be a semantic version without the leading v.');
  return value;
}

function requiredSha(value: any, label: any): any  {
  if (!SHA.test(value ?? '')) throw new Error(`${label} must be a full lowercase Git SHA.`);
  return value;
}

function branchFor(version: any): any  {
  return `release-${requiredVersion(version)}`;
}

function requiredGeneration(value: any): any  {
  const generation: any = Number(value);
  if (!Number.isSafeInteger(generation) || generation < 0) throw new Error('generation must be a non-negative integer.');
  return generation;
}

export function releaseCarrierBranchFor(version: any, generation: any): any  {
  return `codex/release-main-${requiredVersion(version)}-g${requiredGeneration(generation)}`;
}

function identity(value: any): any  {
  return `sha256-${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

function rev(repo: any, ref: any, dependencies: any): any  {
  return requiredSha(git(repo, ['rev-parse', '--verify', ref], dependencies).stdout.trim(), ref);
}

function tree(repo: any, ref: any, dependencies: any): any  {
  return rev(repo, `${ref}^{tree}`, dependencies);
}

function parents(repo: any, ref: any, dependencies: any): any  {
  const values: any = git(repo, ['rev-list', '--parents', '-n', '1', ref], dependencies).stdout.trim().split(/\s+/u);
  return values.slice(1).filter((value: any) => SHA.test(value));
}

function remoteHeads(repo: any, remote: any, branches: any, dependencies: any): any  {
  const refs: any = branches.map((branch: any) => `refs/heads/${branch}`);
  const result: any = git(repo, ['ls-remote', '--heads', remote, ...refs], dependencies);
  const found: any = new Map(result.stdout.split(/\r?\n/u).filter(Boolean).map((line: any) => {
    const [commit, ref]: any = line.trim().split(/\s+/u);
    return [ref, commit];
  }));
  return Object.fromEntries(branches.map((branch: any) => [branch, found.get(`refs/heads/${branch}`) ?? null]));
}

export function releaseBranchName(value: string, remote = 'origin'): string {
  const branch = value.replace(/^refs\/heads\//u, '').replace(new RegExp(`^(?:refs/remotes/)?${remote.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}/`, 'u'), '');
  if (!branch || branch.startsWith('-') || /^[a-f0-9]{40}$/u.test(branch) || /[\s:~^?*\[\\]/u.test(branch)) throw new Error(`Expected a branch ref, received ${value}. Use an explicit commit input for SHA observations.`);
  return branch;
}

export function pushReleaseBranch({ repo, remote = 'origin', branch, commit, before = null, remove = false }: any, dependencies: any = {}, effects: any[] = []): any {
  const ref = `refs/heads/${branch}`;
  const effect = { type: remove ? 'remote-release-ref-deleted' : 'remote-release-ref-pushed', ref, commit, state: 'unknown' };
  effects.push(effect);
  let error: unknown = null;
  try {
    const args = remove ? ['push', remote, `--force-with-lease=${ref}:${before ?? commit}`, `:${ref}`] : ['push', remote, `${commit}:${ref}`];
    git(repo, args, dependencies);
  } catch (caught) { error = caught; }
  const current = remoteHeads(repo, remote, [branch], dependencies)[branch];
  if (current !== (remove ? null : commit)) {
    effect.state = current === before ? 'not-applied' : 'conflict';
    throw error ?? new Error(`Remote ${ref} did not reach the requested state.`);
  }
  effect.state = 'confirmed';
  return effect;
}

function remoteTag(repo: any, remote: any, tag: any, dependencies: any): any  {
  const ref: any = `refs/tags/${tag}`;
  const result: any = git(repo, ['ls-remote', '--tags', remote, ref, `${ref}^{}`], dependencies);
  const entries: any = new Map(result.stdout.split(/\r?\n/u).filter(Boolean).map((line: any) => {
    const [commit, name]: any = line.trim().split(/\s+/u);
    return [name, commit];
  }));
  const object: any = entries.get(ref) ?? null;
  return object ? { ref, object, target: entries.get(`${ref}^{}`) ?? object } : null;
}

function localTag(repo: any, tag: any, dependencies: any): any  {
  const ref: any = `refs/tags/${tag}`;
  const object: any = git(repo, ['rev-parse', '--verify', ref], dependencies, { allowFailure: true });
  if (object.status !== 0) return null;
  const target: any = git(repo, ['rev-parse', '--verify', `${ref}^{}`], dependencies, { allowFailure: true });
  return target.status === 0 ? { ref, object: object.stdout.trim(), target: target.stdout.trim() } : null;
}

function result(operation: any, status: any, data: any = {}): any  {
  return {
    schemaVersion: releaseGitConvergenceSchema,
    operation,
    status,
    effects: [],
    nextActions: [],
    ...data,
  };
}

function blocked(operation: any, code: any, message: any, data: any = {}): any  {
  const blockedStatus: any = data.status === 'published-but-dev-reconciliation-blocked'
    ? data.status
    : 'blocked';
  const { status: _status, diagnostic, nextActions, ...facts }: any = data;
  return result(operation, blockedStatus, {
    ...facts,
    diagnostic: { code, message, ...(diagnostic?.details ? { details: diagnostic.details } : {}) },
    nextActions: nextActions ?? ['重新读取current frozen selection、release、main、dev与Publication facts后重试；不得写入dev、reset或force push。'],
  });
}

function releaseSource(context: any): any  {
  if (context.schemaVersion === 'buildr.release-context/v2') {
    return {
      version: context.release?.version,
      releaseCommit: context.release?.sourceCommit,
      releaseTree: context.release?.sourceTree,
      mainCommit: context.convergence?.mainCommit,
      selection: context.selection ?? null,
    };
  }
  return {
    version: context.releaseTask?.taskId?.replace(/^release-/u, '') || null,
    releaseCommit: context.candidate?.sourceCommit,
    releaseTree: context.convergence?.candidateTree,
    mainCommit: context.convergence?.mainCommit,
    selection: null,
  };
}

function passedPublication(value: any): any  {
  const evidence: any = validateReleaseTransactionEvidence(value);
  if (evidence.status !== 'passed'
      || evidence.release.registryPublished !== true
      || evidence.release.registrySmoke !== 'passed'
      || !evidence.release.githubRelease
      || evidence.release.tagCommit !== evidence.publish.headSha) {
    throw new Error('Publication evidence is not a complete passed transaction.');
  }
  return evidence;
}

// A matching tree is insufficient: the immutable published history must keep
// the selected source reachable after its temporary branch is removed.
function verifyPublishedSourcePreservation(repo: string, remote: string, evidence: any, main: string, dependencies: any): any {
  const source = releaseSource(evidence.context);
  const expectedMain = requiredSha(source.mainCommit ?? evidence.publish.headSha, 'publication main commit');
  const expectedSource = requiredSha(source.releaseCommit, 'publication release commit');
  const tag = remoteTag(repo, remote, evidence.release.tag, dependencies);
  if (evidence.release.tag !== `v${source.version}` || !tag || tag.target !== expectedMain || tag.target !== evidence.release.tagCommit) {
    throw new Error('Official remote Tag does not preserve the published main commit.');
  }
  const mainHead = remoteHeads(repo, remote, [main], dependencies)[main];
  if (!mainHead || git(repo, ['merge-base', '--is-ancestor', expectedMain, mainHead], dependencies, { allowFailure: true }).status !== 0
      || git(repo, ['merge-base', '--is-ancestor', expectedSource, expectedMain], dependencies, { allowFailure: true }).status !== 0
      || tree(repo, expectedMain, dependencies) !== source.releaseTree) {
    throw new Error('Published source is not preserved by the official Tag and current main history.');
  }
  return { sourceCommit: expectedSource, publishedMainCommit: expectedMain, mainHead, tag };
}

export function inspectDevBranchPolicy(options: any = {}, dependencies: any = {}): any  {
  const operation: any = 'inspect-dev-policy';
  try {
    const repo: any = path.resolve(options.repo ?? process.cwd());
    const repository: any = options.repository ?? 'BuildrAI/Buildr';
    const branch: any = options.dev ?? 'dev';
    const readback: any = run(options.ghCommand ?? 'gh', ['api', `repos/${repository}/branches/${branch}/protection`], repo, dependencies);
    const protection: any = JSON.parse(readback.stdout || '{}');
    const requiredLinearHistory: any = protection?.required_linear_history?.enabled === true;
    const observation: any = {
      source: 'github-branch-protection-readback',
      repository,
      branch,
      requiredLinearHistory,
      allowsMergeCommits: !requiredLinearHistory,
      identity: identity({ repository, branch, protection }),
    };
    return result(operation, 'ready', { observation });
  } catch (error: any) {
    return blocked(operation, 'dev-branch-policy-readback-blocked', error.message);
  }
}

export function inspectReleaseToMain(options: any = {}, dependencies: any = {}): any  {
  const operation: any = 'inspect-main';
  try {
    const repo: any = path.resolve(options.repo ?? process.cwd());
    const version: any = requiredVersion(options.version);
    const remote: any = options.remote ?? 'origin';
    const main: any = releaseBranchName(options.main ?? 'main', remote);
    const dev: any = releaseBranchName(options.dev ?? 'dev', remote);
    const branch: any = branchFor(version);
    const generation: any = requiredGeneration(options.generation);
    const carrierBranch: any = releaseCarrierBranchFor(version, generation);
    const candidateCommit: any = requiredSha(options.candidateCommit, 'candidateCommit');
    const candidateTree: any = requiredSha(options.candidateTree, 'candidateTree');
    const selection: any = inspectReleaseSelection({ version, repo, devRef: `${remote}/${dev}` }, dependencies);
    const findings: any[] = [];
    if (selection.status !== 'frozen') findings.push({ code: 'release-selection-not-frozen', expected: 'frozen', actual: selection.status });
    if (selection.generation !== generation) findings.push({ code: 'release-selection-generation-mismatch', expected: selection.generation ?? null, actual: generation });
    if (selection.releaseHead !== candidateCommit) findings.push({ code: 'release-candidate-commit-mismatch', expected: selection.releaseHead ?? null, actual: candidateCommit });
    if (selection.releaseTree !== candidateTree) findings.push({ code: 'release-candidate-tree-mismatch', expected: selection.releaseTree ?? null, actual: candidateTree });
    const refs: any = remoteHeads(repo, remote, [branch, carrierBranch, main, dev], dependencies);
    if (refs[branch] !== null && refs[branch] !== candidateCommit && git(repo, ['merge-base', '--is-ancestor', refs[branch], candidateCommit], dependencies, { allowFailure: true }).status !== 0) findings.push({ code: 'remote-release-ref-drift', expected: candidateCommit, actual: refs[branch] });
    if (refs[carrierBranch] !== null && refs[carrierBranch] !== candidateCommit) findings.push({ code: 'release-carrier-ref-drift', expected: candidateCommit, actual: refs[carrierBranch] });
    const mainTree: any = refs[main] ? tree(repo, refs[main], dependencies) : null;
    const mainDisposition: any = mainTree === candidateTree ? 'tree-equivalent' : 'pending';
    return result(operation, findings.length ? 'blocked' : 'ready', {
      version,
      branch,
      generation,
      carrierBranch,
      candidate: { commit: candidateCommit, tree: candidateTree, selectionIdentity: selection.selectionIdentity ?? null },
      refs,
      main: { commit: refs[main], tree: mainTree, disposition: mainDisposition, mergeMethod: null, mergeParents: null },
      reconciliation: selection.reconciliationChain?.at(-1) ?? null,
      findings,
      nextActions: findings.length ? ['修复current release selection或remote ref漂移后重试。'] : [],
    });
  } catch (error: any) {
    return blocked(operation, 'release-main-inspection-blocked', error.message);
  }
}

function parsePullRequests(stdout: any): any  {
  const value: any = JSON.parse(stdout || '[]');
  if (!Array.isArray(value)) throw new Error('GitHub pull request readback must be an array.');
  return value;
}

export function ensureReleaseToMainPullRequest(options: any = {}, dependencies: any = {}): any  {
  const operation: any = 'ensure-main-pr';
  const effects: any[] = [];
  const inspected: any = inspectReleaseToMain(options, dependencies);
  if (inspected.status !== 'ready') return { ...inspected, operation };
  try {
    const repo: any = path.resolve(options.repo ?? process.cwd());
    const remote: any = options.remote ?? 'origin';
    const main: any = releaseBranchName(options.main ?? 'main', remote);
    const formalBranch: any = inspected.branch;
    const branch: any = inspected.carrierBranch;
    const repository: any = options.repository ?? 'BuildrAI/Buildr';
    const prReadback: any = run(options.ghCommand ?? 'gh', [
      'pr', 'list', '--repo', repository, '--state', 'all', '--base', main, '--head', branch,
      '--json', 'number,state,headRefOid,headRefName,baseRefName,url,mergedAt,mergeCommit,mergeStateStatus',
    ], repo, dependencies);
    const pullRequests: any = parsePullRequests(prReadback.stdout);
    if (pullRequests.length > 1) return blocked(operation, 'release-main-pr-not-unique', `Expected at most one ${branch}→${main} pull request, found ${pullRequests.length}.`, { ...inspected, pullRequests, effects });
    if (pullRequests.length === 1) {
      const pullRequest: any = pullRequests[0];
      if (pullRequest.headRefOid !== inspected.candidate.commit || pullRequest.headRefName !== branch || pullRequest.baseRefName !== main) {
        return blocked(operation, 'release-main-pr-head-drift', 'Existing release→main pull request does not match the frozen release source.', { ...inspected, pullRequests, effects });
      }
      if (pullRequest.state === 'CLOSED' && !pullRequest.mergedAt) {
        return blocked(operation, 'release-main-pr-closed', 'The unique release→main pull request was closed without merging and cannot be treated as ready.', { ...inspected, pullRequests, effects });
      }
      if (pullRequest.state === 'MERGED' && inspected.main.disposition !== 'tree-equivalent') {
        return blocked(operation, 'release-main-tree-mismatch', 'The merged release→main pull request does not produce a main tree equal to the frozen release tree.', { ...inspected, pullRequests, effects });
      }
      if (pullRequest.state === 'MERGED' && inspected.reconciliation) {
        const mergeCommit: any = typeof pullRequest.mergeCommit === 'string' ? pullRequest.mergeCommit : pullRequest.mergeCommit?.oid ?? null;
        const mergeParents: any = mergeCommit ? parents(repo, mergeCommit, dependencies) : [];
        if (mergeCommit !== inspected.refs[main] || mergeParents.length !== 2 || !mergeParents.includes(inspected.candidate.commit)) {
          return blocked(operation, 'release-main-merge-commit-evidence-missing', 'The merged release→main pull request does not prove a merge commit from the current carrier.', {
            ...inspected,
            pullRequests,
            mergeCommit,
            mergeParents,
            effects,
            nextActions: ['重新读取GitHub mergeCommitOid与main父提交关系；squash/rebase结果不能作为发布收敛证据。'],
          });
        }
        inspected.main.mergeMethod = 'merge';
        inspected.main.mergeParents = mergeParents;
      }
      if (pullRequest.state === 'MERGED') {
        const mergeCommit = typeof pullRequest.mergeCommit === 'string' ? pullRequest.mergeCommit : pullRequest.mergeCommit?.oid;
        if (!mergeCommit || !inspected.refs[main]
            || git(repo, ['merge-base', '--is-ancestor', inspected.candidate.commit, mergeCommit], dependencies, { allowFailure: true }).status !== 0
            || git(repo, ['merge-base', '--is-ancestor', mergeCommit, inspected.refs[main]], dependencies, { allowFailure: true }).status !== 0) {
          return blocked(operation, 'release-main-history-not-preserved', 'The merged pull request does not preserve the frozen release source in current main.', { ...inspected, pullRequests, effects });
        }
        return result(operation, 'ready', { ...inspected, pullRequest, effects, nextActions: [] });
      }
    }
    if (inspected.refs[formalBranch] !== inspected.candidate.commit) {
      if (options.authorizeReleasePush !== true) {
        return blocked(operation, 'release-branch-push-authorization-required', `Remote ${formalBranch} is absent and requires explicit push authorization.`, {
          ...inspected,
          nextActions: [`确认将${inspected.candidate.commit}推送到${remote}/${formalBranch}并建立matching generation carrier后重试。`],
        });
      }
      pushReleaseBranch({ repo, remote, branch: formalBranch, commit: inspected.candidate.commit, before: inspected.refs[formalBranch] }, dependencies, effects);
      inspected.refs[formalBranch] = inspected.candidate.commit;
      effects.at(-1).type = 'formal-release-branch-pushed';
    }
    if (inspected.refs[branch] === null) {
      if (options.authorizeReleasePush !== true) {
        return blocked(operation, 'release-branch-push-authorization-required', `Remote ${branch} is absent and requires explicit push authorization.`, {
          ...inspected,
          nextActions: [`确认将${inspected.candidate.commit}推送到owned carrier ${remote}/${branch}后重试。`],
        });
      }
      pushReleaseBranch({ repo, remote, branch, commit: inspected.candidate.commit, before: inspected.refs[branch] }, dependencies, effects);
      inspected.refs[branch] = inspected.candidate.commit;
      effects.at(-1).type = 'release-carrier-pushed';
      effects.at(-1).generation = inspected.generation;
    }
    if (pullRequests.length === 1) return result(operation, 'ready', { ...inspected, pullRequest: pullRequests[0], effects, nextActions: [] });
    if (options.authorizePullRequest !== true) {
      return blocked(operation, 'release-main-pr-authorization-required', `Creating the protected ${branch}→${main} pull request requires explicit authorization.`, {
        ...inspected,
        effects,
        nextActions: [`确认创建唯一${branch}→${main}受保护PR后重试。`],
      });
    }
    const creation = { type: 'pull-request-created', branch, state: 'unknown', url: null as string | null };
    effects.push(creation);
    const created: any = run(options.ghCommand ?? 'gh', [
      'pr', 'create', '--repo', repository, '--base', main, '--head', branch,
      '--title', options.title ?? `Release ${options.version}`,
      '--body', options.body ?? `Release ${options.version} from frozen ${inspected.candidate.commit}.`,
    ], repo, dependencies).stdout.trim();
    creation.url = created;
    creation.state = 'confirmed';
    return result(operation, 'ready', { ...inspected, pullRequest: { url: created, state: 'OPEN', headRefOid: inspected.candidate.commit, headRefName: branch, baseRefName: main }, effects, nextActions: [] });
  } catch (error: any) {
    return blocked(operation, 'release-main-pr-blocked', error.message, { effects });
  }
}

export function reconcileReleaseToMain(options: any = {}, dependencies: any = {}): any  {
  const operation: any = 'reconcile-main';
  try {
    const repo: any = path.resolve(options.repo ?? process.cwd());
    const remote: any = options.remote ?? 'origin';
    const resultValue: any = reconcileReleaseSelectionWithMain({
      ...options,
      repo,
      devRef: options.devRef ?? `${remote}/${options.dev ?? 'dev'}`,
      mainRef: options.mainRef ?? `${remote}/${options.main ?? 'main'}`,
    }, dependencies);
    return { ...resultValue, operation };
  } catch (error: any) {
    return blocked(operation, 'release-main-reconciliation-blocked', error.message);
  }
}

export function reconcilePublishedReleaseWithDev(options: any = {}, dependencies: any = {}): any  {
  const operation: any = 'reconcile-dev';
  try {
    const repo: any = path.resolve(options.repo ?? process.cwd());
    const remote: any = options.remote ?? 'origin';
    const main: any = releaseBranchName(options.main ?? 'main', remote);
    const dev: any = releaseBranchName(options.dev ?? 'dev', remote);
    const evidence: any = passedPublication(options.publicationEvidence);
    const source: any = releaseSource(evidence.context);
    const version: any = requiredVersion(source.version ?? evidence.release.npmVersion);
    const branch: any = branchFor(version);
    const expectedMain: any = requiredSha(source.mainCommit ?? evidence.publish.headSha, 'publication main commit');
    const expectedRelease: any = requiredSha(source.releaseCommit, 'publication release commit');
    const expectedTree: any = requiredSha(source.releaseTree, 'publication release tree');
    const refs: any = remoteHeads(repo, remote, [branch, main, dev], dependencies);
    const contextSelection: any = source.selection;
    let selection: any = null;
    if (refs[dev] && contextSelection) {
      try {
        selection = inspectReleaseSourceProvenance({ repo, sourceCommit: expectedRelease, generation: contextSelection.generation, devRef: refs[dev] }, dependencies);
      } catch (error: any) {
        selection = { status: 'blocked', diagnostic: { message: error.message }, effects: [] };
      }
    }
    const recoveryIdentity: any = identity({
      operation,
      version,
      publicationEvidence: evidence.identity,
      selectionIdentity: contextSelection?.identity ?? null,
      expectedRelease,
      expectedMain,
      refs,
    });
    const publicFacts: any = { status: 'passed', evidenceIdentity: evidence.identity };
    if (!refs[main] || git(repo, ['merge-base', '--is-ancestor', expectedMain, refs[main]], dependencies, { allowFailure: true }).status !== 0) {
      return blocked(operation, 'published-main-ref-drift', 'Publication succeeded, but current main no longer matches the published transaction.', {
        status: 'published-but-dev-reconciliation-blocked', version, recoveryIdentity, publication: publicFacts, refs,
      });
    }
    const actualMainTree: any = tree(repo, expectedMain, dependencies);
    if (actualMainTree !== expectedTree) {
      return blocked(operation, 'published-main-tree-mismatch', 'Publication succeeded, but current main tree does not match the frozen release tree.', {
        status: 'published-but-dev-reconciliation-blocked', version, recoveryIdentity, publication: publicFacts, refs, expectedTree, actualMainTree,
      });
    }
    if (refs[branch] !== null && refs[branch] !== expectedRelease && options.inspectDriftedReleaseForCleanup !== true) {
      return blocked(operation, 'published-release-ref-drift', 'Publication succeeded, but the formal remote release ref does not match the frozen release source.', {
        status: 'published-but-dev-reconciliation-blocked', version, recoveryIdentity, publication: publicFacts, refs, expectedRelease,
      });
    }
    if (refs[branch] !== expectedRelease) verifyPublishedSourcePreservation(repo, remote, evidence, main, dependencies);
    if (!refs[dev]) {
      return blocked(operation, 'published-dev-ref-missing', `Remote ${dev} is missing.`, {
        status: 'published-but-dev-reconciliation-blocked', version, recoveryIdentity, publication: publicFacts, refs,
      });
    }
    if (!selection || selection.status !== 'passed' || contextSelection?.status !== 'frozen'
        || contextSelection.version !== version || contextSelection.generation !== selection.generation
        || contextSelection.releaseHead !== expectedRelease || contextSelection.releaseTree !== expectedTree
        || selection.releaseHead !== expectedRelease || selection.releaseTree !== expectedTree) {
      return blocked(operation, 'published-release-selection-invalid', 'Published Git history does not match the frozen source and current dev provenance.', {
        status: 'published-but-dev-reconciliation-blocked', version, recoveryIdentity, publication: publicFacts, refs, selection,
      });
    }
    const sourceCommits: any = selection.selectionChain.map((entry: any) => entry.sourceDevCommit);
    const reconciliationIdentity: any = identity({
      operation,
      version,
      publicationEvidence: evidence.identity,
      selectionIdentity: contextSelection.identity,
      mainCommit: expectedMain,
      mainTree: actualMainTree,
      releaseCommit: expectedRelease,
      devHead: refs[dev],
      devBaseline: selection.devBaseline,
      sourceCommits,
    });
    return result(operation, 'passed', {
      action: 'verified',
      version,
      identity: reconciliationIdentity,
      recoveryIdentity,
      publication: publicFacts,
      refs,
      reconciliation: {
        status: 'passed',
        selectionIdentity: contextSelection.identity,
        generation: selection.generation,
        releaseCommit: selection.releaseHead,
        releaseTree: selection.releaseTree,
        mainCommit: expectedMain,
        mainTree: actualMainTree,
        devHead: refs[dev],
        devBaseline: selection.devBaseline,
        sourceCommits,
      },
    });
  } catch (error: any) {
    return blocked(operation, 'published-dev-reconciliation-blocked', error.message, { status: 'published-but-dev-reconciliation-blocked' });
  }
}

export function convergePublishedMainToDev(options: any = {}, dependencies: any = {}): any  {
  return reconcilePublishedReleaseWithDev(options, dependencies);
}

function localBranchCommit(repo: any, branch: any, dependencies: any): any  {
  const ref: any = `refs/heads/${branch}`;
  const check: any = git(repo, ['show-ref', '--verify', '--hash', ref], dependencies, { allowFailure: true });
  return check.status === 0 ? requiredSha(check.stdout.trim(), ref) : null;
}

function releaseOwnedWorktrees(repo: any, branches: any, dependencies: any): any  {
  const branchRefs: any = new Set(branches.map((branch: any) => `refs/heads/${branch}`));
  const blocks: any = git(repo, ['worktree', 'list', '--porcelain'], dependencies).stdout.trim().split(/\n\n/u).filter(Boolean);
  return blocks.map((block: any) => Object.fromEntries(block.split(/\r?\n/u).map((line: any) => {
    const separator: any = line.indexOf(' ');
    return separator === -1 ? [line, true] : [line.slice(0, separator), line.slice(separator + 1)];
  }))).filter((entry: any) => branchRefs.has(entry.branch));
}

function remoteReleaseFamily(repo: string, remote: string, version: string, dependencies: any): Map<string, string> {
  const prefix = `codex/release-main-${version}-g`;
  const output = git(repo, ['ls-remote', '--heads', remote, `refs/heads/release-${version}`, `refs/heads/${prefix}*`], dependencies).stdout;
  return new Map(output.trim().split(/\r?\n/u).filter(Boolean).map((line: string) => {
    const [commit, ref] = line.trim().split(/\s+/u);
    if (!ref?.startsWith('refs/heads/') || (ref !== `refs/heads/release-${version}` && !ref.startsWith(`refs/heads/${prefix}`))) throw new Error('Unexpected release branch readback.');
    return [ref.slice('refs/heads/'.length), requiredSha(commit, ref)];
  }));
}

function readGithubPages(repository: string, endpoint: string, options: any, repo: string, dependencies: any): any[] {
  const response = run(options.ghCommand ?? 'gh', ['api', '--paginate', '--slurp', `repos/${repository}/${endpoint}`], repo, dependencies);
  const pages = JSON.parse(response.stdout);
  if (!Array.isArray(pages) || pages.length === 0) throw new Error('GitHub returned invalid paginated activity evidence.');
  return pages;
}

function releaseActivityRepository(options: any, evidence: any, repo: string, remote: string, dependencies: any): string {
  const repository = evidence.publish.repository;
  if (!/^[\w.-]+\/[\w.-]+$/u.test(repository ?? '') || (options.repository && options.repository !== repository)) throw new Error('Cleanup repository does not match Publication evidence.');
  for (const args of [['remote', 'get-url', '--all', remote], ['remote', 'get-url', '--push', '--all', remote]]) {
    const urls = git(repo, args, dependencies).stdout.trim().split(/\r?\n/u);
    if (!urls.length || urls.some((url: string) => repositoryFromUrl(url)?.toLowerCase() !== repository.toLowerCase())) throw new Error('The actual Git fetch/push target does not match Publication evidence.');
  }
  return repository;
}

function inspectReleaseBranchActivity(repo: string, branch: string, repository: string, options: any, dependencies: any): any {
  const pullPages = readGithubPages(repository, 'pulls?state=open&per_page=100', options, repo, dependencies);
  if (pullPages.some(page => !Array.isArray(page))) throw new Error('GitHub returned invalid pull request pages.');
  const pullRequests = pullPages.flat();
  if (pullRequests.some(pr => pr?.state !== 'open' || !Number.isSafeInteger(pr.number) || pr.number < 1
      || typeof pr.head?.ref !== 'string' || !pr.head.ref || typeof pr.base?.ref !== 'string' || !pr.base.ref
      || (pr.head.repo && !/^[\w.-]+\/[\w.-]+$/u.test(pr.head.repo.full_name ?? '')))) throw new Error('GitHub returned incomplete pull request identities.');
  const activePullRequests = pullRequests.filter(pr => pr.base.ref === branch || (pr.head.ref === branch && (!pr.head.repo || pr.head.repo.full_name === repository)));
  const runPages = readGithubPages(repository, `actions/runs?branch=${encodeURIComponent(branch)}&per_page=100`, options, repo, dependencies);
  if (runPages.some(page => !Array.isArray(page?.workflow_runs) || !Number.isSafeInteger(page.total_count) || page.total_count < 0)) throw new Error('GitHub returned invalid workflow run pages.');
  const runs = runPages.flatMap(page => page.workflow_runs);
  if (runPages.some(page => page.total_count !== runs.length) || new Set(runs.map(item => item.id)).size !== runs.length
      || runs.some(item => !Number.isSafeInteger(item.id) || item.id < 1 || typeof item?.status !== 'string' || item.head_branch !== branch)) throw new Error('GitHub workflow run evidence is incomplete.');
  const activeRuns = runs.filter(item => item.status !== 'completed');
  return { pullRequests: activePullRequests.map(pr => pr.number), runs: activeRuns.map(item => item.id) };
}

function closeoutPublishedReleaseBranches(options: any, dependencies: any, evidence: any): any {
  const operation = 'closeout';
  const effects: any[] = [];
  const findings: any[] = [];
  const branches: any[] = [];
  try {
    const repo = path.resolve(options.repo ?? process.cwd());
    const remote = options.remote ?? 'origin';
    const version = requiredVersion(options.version);
    const generation = requiredGeneration(options.generation);
    const expectedCommit = requiredSha(options.expectedCommit, 'expectedCommit');
    if (evidence.context.selection?.generation !== generation) throw new Error('Cleanup generation differs from the published context.');
    const formalBranch = branchFor(version);
    if (options.authorizeCarrierCleanup !== true || options.authorizeLocalSelectionCleanup !== true) {
      return blocked(operation, 'release-cleanup-authorization-required', 'Release closeout requires the bound carrier and local cleanup authorization.');
    }
    const preservation = verifyPublishedSourcePreservation(repo, remote, evidence, releaseBranchName(options.main ?? 'main', remote), dependencies);
    const dev = releaseBranchName(options.dev ?? 'dev', remote);
    const devHead = remoteHeads(repo, remote, [dev], dependencies)[dev];
    if (!devHead) throw new Error('Current dev is missing; release generation ownership cannot be verified.');
    const provenance = inspectReleaseSourceProvenance({ repo, sourceCommit: expectedCommit, generation, devRef: devHead }, dependencies);
    const currentCarrier = releaseCarrierBranchFor(version, generation);
    const allGenerations = options.cleanupPolicy === 'delete-owned-release-branches/v2';
    if (allGenerations && options.authorizeRemoteDelete !== true) throw new Error('All-generation cleanup requires bound remote deletion authorization.');
    const remoteRefs = allGenerations ? remoteReleaseFamily(repo, remote, version, dependencies)
      : new Map<string, string>(Object.entries(remoteHeads(repo, remote, [formalBranch, currentCarrier], dependencies)).filter((entry: any) => entry[1] !== null) as [string, string][]);
    const prefix = `codex/release-main-${version}-g`;
    const localOutput = git(repo, ['for-each-ref', '--format=%(refname) %(objectname)', 'refs/heads/'], dependencies).stdout;
    const localRefs = new Map<string, string>(localOutput.trim().split(/\r?\n/u).filter(Boolean).map((line: string) => {
      const [ref, commit] = line.split(' ');
      return [ref.slice('refs/heads/'.length), requiredSha(commit, ref)] as [string, string];
    }).filter(([branch]: [string, string]) => branch === formalBranch || (allGenerations ? branch.startsWith(prefix) : branch === currentCarrier)));
    const names = [...new Set([formalBranch, releaseCarrierBranchFor(version, generation), ...remoteRefs.keys(), ...localRefs.keys()])].sort();
    const ownedWorktrees = releaseOwnedWorktrees(repo, names, dependencies);
    const repository = releaseActivityRepository(options, evidence, repo, remote, dependencies);
    const localReleaseTag = localTag(repo, evidence.release.tag, dependencies);
    if (localReleaseTag && (localReleaseTag.object !== preservation.tag.object || localReleaseTag.target !== preservation.tag.target)) {
      return blocked(operation, 'release-closeout-local-tag-drift', 'Local Tag differs from the official remote Tag and was retained.');
    }
    for (const branch of names) {
      const suffix = branch.slice(prefix.length);
      const branchGeneration = branch === formalBranch ? generation : /^(?:0|[1-9]\d*)$/u.test(suffix) ? Number(suffix) : -1;
      const expected = provenance.generationCommits[branchGeneration] ?? null;
      const actual = remoteRefs.get(branch) ?? null;
      const local = localRefs.get(branch) ?? null;
      const item: any = { ref: `refs/heads/${branch}`, generation: branchGeneration, expectedCommit: expected, observedCommit: actual,
        observedLocalCommit: local, remote: actual ? 'retained' : 'absent', disposition: 'retained' };
      branches.push(item);
      if (!actual && !local) { item.disposition = 'already-cleaned'; continue; }
      try {
        if (!expected || (actual && actual !== expected) || (local && local !== expected)) {
          throw new Error('Release branch identity does not match its published generation.');
        }
        const worktrees = ownedWorktrees.filter((entry: any) => entry.branch === item.ref);
        for (const worktree of worktrees) {
          if (sameFilesystemPath(worktree.worktree, repo) || worktree.HEAD !== expected
              || git(worktree.worktree, ['status', '--porcelain=v1', '--untracked-files=all'], dependencies).stdout.trim()) {
            throw new Error('Release worktree is active, dirty, or has changed identity.');
          }
        }
        const activity = inspectReleaseBranchActivity(repo, branch, repository, options, dependencies);
        if (activity.pullRequests.length || activity.runs.length) {
          item.activity = activity;
          throw new Error('Release branch is still used by an open pull request or unfinished workflow run.');
        }
        if (actual && (branch !== formalBranch || options.authorizeRemoteDelete === true)) {
          pushReleaseBranch({ repo, remote, branch, commit: expected, before: actual, remove: true }, dependencies, effects);
          effects.at(-1).type = branch === formalBranch ? 'remote-release-branch-deleted' : 'remote-release-carrier-deleted';
          item.remote = 'absent';
        }
        for (const worktree of worktrees) {
          const effect = { type: 'release-worktree-removed', path: worktree.worktree, ref: item.ref, commit: expected, state: 'unknown' };
          effects.push(effect);
          git(repo, ['worktree', 'remove', worktree.worktree], dependencies);
          effect.state = 'confirmed';
        }
        if (local && branch !== formalBranch) {
          git(repo, ['update-ref', '-d', item.ref, expected], dependencies);
          effects.push({ type: 'local-release-carrier-deleted', ref: item.ref, commit: expected, state: 'confirmed' });
        }
        item.disposition = branch === formalBranch && actual && options.authorizeRemoteDelete !== true ? 'retained-by-policy' : 'cleaned';
      } catch (error: any) {
        item.reason = error.message;
        findings.push({ code: 'release-branch-retained', ref: item.ref, expectedCommit: expected, observedCommit: actual, message: error.message });
      }
    }
    const formal = branches.find(item => item.ref === `refs/heads/${formalBranch}`);
    const formalReleaseRef = { ref: formal.ref, commit: expectedCommit, observedCommit: formal.observedCommit, disposition: formal.remote === 'absent' ? 'cleaned-and-verified' : formal.disposition === 'retained-by-policy' ? 'retained-and-verified' : 'retained' };
    if (findings.length) return blocked(operation, 'release-cleanup-partial', 'Some release resources were retained; independently safe resources were cleaned.', { version, generation, expectedCommit, formalReleaseRef, branches, findings, effects });
    const selectionCleanup = cleanupReleaseSelection({ repo, version, confirm: true, publicationEvidence: evidence }, dependencies);
    effects.push(...selectionCleanup.effects);
    if (selectionCleanup.status !== 'passed') return blocked(operation, 'release-selection-cleanup-blocked', selectionCleanup.diagnostic?.message ?? 'Local selection cleanup failed.', { version, branches, effects, selectionCleanup });
    if (localReleaseTag) {
      git(repo, ['update-ref', '-d', localReleaseTag.ref, localReleaseTag.object], dependencies);
      effects.push({ type: 'local-release-tag-deleted', ref: localReleaseTag.ref, object: localReleaseTag.object, target: localReleaseTag.target });
    }
    return result(operation, 'passed', { action: effects.length ? 'cleaned' : 'already-cleaned', version, generation, expectedCommit,
      identity: identity({ version, generation, expectedCommit, policy: options.cleanupPolicy ?? 'retain-formal-release-branch', remoteTag: preservation.tag.object, resources: 'absent' }),
      formalReleaseRef, branches, tag: { ...preservation.tag, remote: 'retained-and-verified', local: 'absent' },
      resources: { carrier: { ref: `refs/heads/${currentCarrier}`, local: 'absent', remote: 'absent' },
        ...(allGenerations ? { carriers: { scope: 'same-version', disposition: 'absent' } } : {}), selection: { localBranch: 'absent', lifecycleRefs: 'absent' } }, effects });
  } catch (error: any) {
    return blocked(operation, 'release-closeout-blocked', error.message, { branches, findings, effects });
  }
}

export function closeoutReleaseGitResources(options: any = {}, dependencies: any = {}): any {
  try {
    const evidence = passedPublication(options.publicationEvidence);
    const source = releaseSource(evidence.context);
    const generation = requiredGeneration(options.generation);
    if (source.version !== options.version || source.releaseCommit !== options.expectedCommit || evidence.context.selection?.generation !== generation) {
      return blocked('closeout', 'release-closeout-publication-mismatch', 'Publication evidence does not match the requested release source and generation.');
    }
    return closeoutPublishedReleaseBranches({ ...options, generation }, dependencies, evidence);
  } catch (error: any) {
    return blocked('closeout', 'release-closeout-blocked', error.message);
  }
}

export function cleanupRemoteReleaseBranch(options: any = {}, dependencies: any = {}): any  {
  const operation: any = 'cleanup-remote';
  const effects: any[] = [];
  try {
    const repo: any = path.resolve(options.repo ?? process.cwd());
    const remote: any = options.remote ?? 'origin';
    const evidence: any = passedPublication(options.publicationEvidence);
    const source: any = releaseSource(evidence.context);
    const version: any = requiredVersion(source.version ?? evidence.release.npmVersion);
    const branch: any = branchFor(version);
    const expected: any = requiredSha(source.releaseCommit, 'published release commit');
    const actual: any = remoteHeads(repo, remote, [branch], dependencies)[branch];
    const publicFacts: any = { publication: 'passed', tag: evidence.release.tag, npmVersion: evidence.release.npmVersion, githubRelease: evidence.release.githubRelease, evidenceIdentity: evidence.identity };
    if (actual !== null && actual !== expected) return blocked(operation, 'remote-release-ref-drift', `Remote ${branch} does not match the published release commit.`, { version, ref: `refs/heads/${branch}`, expectedCommit: expected, actualCommit: actual, publicFacts });
    verifyPublishedSourcePreservation(repo, remote, evidence, releaseBranchName(options.main ?? 'main', remote), dependencies);
    if (actual === null) return result(operation, 'passed', { action: 'already-cleaned', version, ref: `refs/heads/${branch}`, expectedCommit: expected, actualCommit: null, publicFacts });
    if (options.authorizeRemoteDelete !== true) {
      return blocked(operation, 'remote-release-delete-authorization-required', `Deleting ${remote}/${branch} requires independent explicit authorization.`, {
        version, ref: `refs/heads/${branch}`, expectedCommit: expected, actualCommit: actual, publicFacts,
        nextActions: [`确认删除${remote}/${branch}（${actual}）后重试。`],
      });
    }
    const activity = inspectReleaseBranchActivity(repo, branch, releaseActivityRepository(options, evidence, repo, remote, dependencies), options, dependencies);
    if (activity.pullRequests.length || activity.runs.length) return blocked(operation, 'release-branch-active', 'Release branch is still used by an open pull request or unfinished workflow run.', { version, activity });
    pushReleaseBranch({ repo, remote, branch, commit: expected, before: actual, remove: true }, dependencies, effects);
    effects.at(-1).type = 'remote-release-branch-deleted';
    const after: any = remoteHeads(repo, remote, [branch], dependencies)[branch];
    if (after !== null) throw new Error(`Remote ${branch} still exists after deletion.`);
    return result(operation, 'passed', {
      action: 'deleted', version, ref: `refs/heads/${branch}`, expectedCommit: expected, actualCommit: null, publicFacts,
      effects,
    });
  } catch (error: any) {
    return blocked(operation, 'remote-release-cleanup-blocked', error.message, { effects });
  }
}

function readJsonFile(filename: any): any  {
  const resolved: any = path.resolve(filename);
  const stat: any = fs.lstatSync(resolved);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Evidence must be a regular non-symlink file: ${resolved}`);
  return JSON.parse(fs.readFileSync(resolved, 'utf8'));
}

function parseArgs(argv: any): any  {
  const [operation, ...rest]: any = argv;
  const options: any = { operation };
  for (let index: any = 0; index < rest.length; index += 2) {
    const key: any = rest[index];
    const value: any = rest[index + 1];
    if (!key?.startsWith('--') || value === undefined) throw new Error(`Invalid argument: ${key || '<missing>'}`);
    options[key.slice(2)] = value;
  }
  const common: any = { repo: options.repo, remote: options.remote, main: options.main, dev: options.dev };
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
  if (operation === 'reconcile-main') return {
    ...common,
    version: options.version,
    mainRef: options['main-ref'],
    reason: options.reason,
    confirm: options.confirm === 'true',
  };
  if (operation === 'reconcile-dev' || operation === 'converge-dev' || operation === 'cleanup-remote') return {
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
    authorizeRemoteDelete: options['authorize-remote-delete'] === 'true',
  };
  throw new Error('Usage: release-git-convergence.ts <reconcile-main|inspect-main|ensure-main-pr|inspect-dev-policy|reconcile-dev|converge-dev|closeout|cleanup-remote> ...');
}

if (process.argv[1] && sameFilesystemPath(process.argv[1], fileURLToPath(import.meta.url))) {
  try {
    const operation: any = process.argv[2];
    const options: any = parseArgs(process.argv.slice(2));
    const value: any = operation === 'reconcile-main'
      ? reconcileReleaseToMain(options)
      : operation === 'inspect-main'
      ? inspectReleaseToMain(options)
      : operation === 'ensure-main-pr'
        ? ensureReleaseToMainPullRequest(options)
        : operation === 'inspect-dev-policy'
          ? inspectDevBranchPolicy(options)
        : operation === 'reconcile-dev' || operation === 'converge-dev'
          ? reconcilePublishedReleaseWithDev(options)
          : operation === 'closeout'
            ? closeoutReleaseGitResources(options)
            : cleanupRemoteReleaseBranch(options);
    process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
    if (value.status === 'blocked' || value.status === 'published-but-dev-reconciliation-blocked') process.exitCode = 1;
  } catch (error: any) {
    process.stderr.write(`${JSON.stringify(blocked('unknown', 'release-git-convergence-invalid-input', error.message), null, 2)}\n`);
    process.exitCode = 1;
  }
}
