import fs from 'node:fs';
import path from 'node:path';
import { codeFailure, codeGit, type CodeSource } from '../infrastructure/code-file-reader.ts';
import { enumerateCodeWorktrees } from '../infrastructure/code-worktree-reader.ts';
import { assertCodeRevision, codeRevision, observeSourceControl, readSourceControlRefs } from '../infrastructure/source-control-git-reader.ts';
import { assertNoExternalCheckoutFilters, readCodeCheckoutFilterConfig, switchCodeBranch } from '../infrastructure/code-branch-switch.ts';
import type { CodeBranchEntry, CodeLocalBranch } from '../domain/source-control.ts';
import type { CodeBranchesResponse, CodeBranchSwitchInput, CodeBranchSwitchResponse, CodeSourceControlInput } from './source-control-model.ts';

const BRANCH_LIMIT = 1000;
type Dependencies = { source(root: string, input: CodeSourceControlInput): CodeSource };
const progressFiles = ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'REBASE_HEAD', 'rebase-merge', 'rebase-apply', 'sequencer', 'BISECT_START'];

export function createCodeBranchApplication(dependencies: Dependencies) {
  function observe(root: string, input: CodeSourceControlInput) {
    if (!input.repositoryId) throw codeFailure('code_repository_required', '必须选择已登记代码库（Repository）。');
    const source = dependencies.source(root, input);
    if (source.commitHash) throw codeFailure('code_branch_source_invalid', '分支（Branch）操作必须选择当前工作位置。');
    const refs = readSourceControlRefs(source), filters = readCodeCheckoutFilterConfig(source), status = observeSourceControl(source, { gitConfig: filters.overrides });
    const worktrees = enumerateCodeWorktrees(source.location, source.repositoryId);
    const currentIdentity = dependencies.source(root, { repositoryId: source.repositoryId, worktreeId: source.worktreeId || undefined });
    if (currentIdentity.location !== source.location || currentIdentity.worktreeId !== source.worktreeId) throw codeFailure('code_worktree_identity_changed', '工作位置身份已变化，请刷新后继续。', 409);
    const gitDirectory = codeGit(source.location, ['rev-parse', '--absolute-git-dir']).toString().trim();
    const progress = progressFiles.filter(name => fs.existsSync(path.join(gitDirectory, name)));
    const occupants = new Map(worktrees.worktrees.filter(worktree => worktree.branch).map(worktree => [worktree.branch, worktree]));
    const locals: CodeLocalBranch[] = refs.rows.filter(row => row[0].startsWith('refs/heads/') && row[3] === 'commit').map(row => {
      const name = row[0].slice(11), used = occupants.get(name);
      return { ref: row[0], name, hash: row[1], upstream: row[4] || null, worktreeId: used?.worktreeId || null, worktreeLocation: used?.location || null };
    });
    const remoteNames = new Set(codeGit(source.location, ['remote']).toString().trim().split('\n').filter(Boolean));
    const rowsByRef = new Map(refs.rows.map(row => [row[0], row])), trackingByRemote = new Map<string, CodeLocalBranch[]>();
    for (const local of locals) {
      const upstream = rowsByRef.get(local.ref)?.[7];
      if (upstream) { const tracked = trackingByRemote.get(upstream) || []; tracked.push(local); trackingByRemote.set(upstream, tracked); }
    }
    const entries: CodeBranchEntry[] = locals.map(local => ({ ...local, kind: 'local', remote: null, current: local.name === status.branch, localBranch: null }));
    for (const row of refs.rows.filter(row => row[0].startsWith('refs/remotes/') && row[3] === 'commit' && !row[6])) {
      const name = row[0].slice(13); let remote = name.split('/')[0];
      for (let index = name.indexOf('/'); index >= 0; index = name.indexOf('/', index + 1)) if (remoteNames.has(name.slice(0, index))) remote = name.slice(0, index);
      const defaultName = name.slice(remote.length + 1);
      const tracked = trackingByRemote.get(row[0]) || [];
      const localBranch = tracked.find(local => local.name === defaultName) || (tracked.length === 1 ? tracked[0] : null);
      entries.push({ ref: row[0], name, kind: 'remote', remote, hash: row[1], current: localBranch?.name === status.branch, upstream: null, worktreeId: null, worktreeLocation: null, localBranch });
    }
    const observedRevision = codeRevision([source.worktreeId, refs.revision, status.observedRevision, filters.revision, worktrees.worktrees.map(worktree => [worktree.worktreeId, worktree.location, worktree.branch, worktree.head]), progress]);
    assertCodeRevision(refs.revision, readSourceControlRefs(source).revision);
    const verifiedFilters = readCodeCheckoutFilterConfig(source); assertCodeRevision(filters.revision, verifiedFilters.revision);
    assertCodeRevision(status.observedRevision, observeSourceControl(source, { gitConfig: verifiedFilters.overrides }).observedRevision);
    const verifiedIdentity = dependencies.source(root, { repositoryId: source.repositoryId, worktreeId: source.worktreeId || undefined });
    if (verifiedIdentity.location !== source.location || verifiedIdentity.worktreeId !== source.worktreeId) throw codeFailure('code_worktree_identity_changed', '读取期间工作位置身份已变化，请刷新后继续。', 409);
    return { source, refs, status, worktrees, entries, progress, trackingByRemote, observedRevision, readAt: new Date().toISOString() };
  }
  const currentState = (observed: ReturnType<typeof observe>, effects = { switched: false, createdLocalBranch: null as string | null }): CodeBranchSwitchResponse => ({ source: observed.source, branch: observed.status.branch, head: observed.status.head, upstream: observed.status.upstream, observedRevision: observed.observedRevision, readAt: observed.readAt, effects });
  function branches(root: string, input: CodeSourceControlInput): CodeBranchesResponse {
    const observed = observe(root, input), truncated = observed.entries.length > BRANCH_LIMIT;
    return { source: observed.source, readAt: observed.readAt, observedRevision: observed.observedRevision, coverage: { limit: BRANCH_LIMIT, truncated, nextCursor: null }, diagnostics: truncated ? [{ code: 'code_branches_truncated', message: '只返回前 1000 个本地与远程分支（Branch）记录。', repositoryId: observed.source.repositoryId }] : [], branches: observed.entries.slice(0, BRANCH_LIMIT) };
  }
  function switchBranch(root: string, input: CodeBranchSwitchInput): CodeBranchSwitchResponse {
    if (!input.repositoryId || !/^checkout-[a-f0-9]{64}$/.test(input.worktreeId || '') || !/^refs\/(?:heads|remotes)\/.+/.test(input.targetRef || '') || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(input.expectedTargetHash || '') || !input.expectedRevision) throw codeFailure('code_branch_switch_invalid', '切换必须明确代码库（Repository）、工作位置、目标引用（Ref）与已观察版本。');
    // Inspect the actual local tip used by a remote item before any switch-state read.
    const initialSource = dependencies.source(root, input), initialRefs = readSourceControlRefs(initialSource);
    const initialTarget = initialRefs.rows.find(row => row[0] === input.targetRef && row[3] === 'commit' && !row[6]);
    if (!initialTarget || initialTarget[1] !== input.expectedTargetHash) throw codeFailure('code_branch_target_changed', '目标分支（Branch）已变化，请刷新清单。', 409);
    let checkoutHash = initialTarget[1];
    if (input.targetRef.startsWith('refs/remotes/')) {
      const tracked = initialRefs.rows.filter(row => row[0].startsWith('refs/heads/') && row[7] === input.targetRef);
      const name = initialTarget[0].slice(13), names = new Set(codeGit(initialSource.location, ['remote']).toString().trim().split('\n')); let remote = name.split('/')[0];
      for (let index = name.indexOf('/'); index >= 0; index = name.indexOf('/', index + 1)) if (names.has(name.slice(0, index))) remote = name.slice(0, index);
      const preferred = input.localName ? initialRefs.rows.find(row => row[0] === 'refs/heads/' + input.localName && row[7] === input.targetRef) : tracked.find(row => row[0].slice(11) === name.slice(remote.length + 1)) || (tracked.length === 1 ? tracked[0] : undefined);
      if (preferred) checkoutHash = preferred[1];
    }
    assertNoExternalCheckoutFilters(initialSource, checkoutHash);
    const before = observe(root, input);
    try {
      assertCodeRevision(before.observedRevision, input.expectedRevision);
      const target = before.entries.find(entry => entry.ref === input.targetRef);
      if (!target || target.hash !== input.expectedTargetHash) throw codeFailure('code_branch_target_changed', '目标分支（Branch）已变化，请刷新清单。', 409);
      if (before.progress.length || before.status.files.some(file => file.status === 'conflicted')) throw codeFailure('code_branch_operation_in_progress', '当前位置有尚未结束的 Git 操作或冲突，请处理后再切换。', 409);
      if (before.status.truncated) throw codeFailure('code_branch_observation_incomplete', '当前位置改动超过读取上限，尚无法核对切换保护，请先减少或处理改动。', 409);
      let local: CodeLocalBranch | undefined, createLocal: string | undefined;
      if (target.kind === 'local') {
        if (input.localName) throw codeFailure('code_branch_local_name_invalid', '切换已有本地项不接受新名称。');
        if (target.name === '-') throw codeFailure('code_branch_local_name_invalid', '此分支（Branch）名称与 Git 快捷切换语法冲突，不能精确切换，请交给智能体（Agent）处理。');
        local = target;
      } else {
        const tracking = before.trackingByRemote.get(target.ref) || [];
        const name = input.localName || target.localBranch?.name || target.name.slice(target.remote!.length + 1);
        if (!name || name.length + 11 > 1024 || name.startsWith('-') || /[\0\r\n]/.test(name)) throw codeFailure('code_branch_local_name_invalid', '本地分支（Branch）名称无效。');
        try { codeGit(before.source.location, ['check-ref-format', 'refs/heads/' + name]); } catch { throw codeFailure('code_branch_local_name_invalid', '本地分支（Branch）名称无效。'); }
        const named = before.entries.find(entry => entry.ref === 'refs/heads/' + name);
        if (named && !tracking.some(entry => entry.ref === named.ref)) throw codeFailure('code_branch_local_name_conflict', '同名本地分支（Branch）未跟踪所选远程项，请明确另选名称。', 409);
        if (!input.localName && !target.localBranch && tracking.length > 1) throw codeFailure('code_branch_tracking_ambiguous', '多个本地项跟踪所选远程项，请明确要使用的本地名称。', 409);
        if (named) local = named; else createLocal = name;
      }
      if (local?.worktreeId && local.worktreeId !== before.source.worktreeId) {
        const error = codeFailure('code_branch_occupied', '该本地分支（Branch）已在其他工作位置使用。', 409);
        Object.assign(error, { details: { worktreeId: local.worktreeId, location: local.worktreeLocation } }); throw error;
      }
      // Revalidate the registered source after planning, immediately before the sole write.
      const refreshed = observe(root, input); assertCodeRevision(refreshed.observedRevision, before.observedRevision);
      let writeError: unknown;
      if (createLocal || local?.name !== before.status.branch) {
        assertNoExternalCheckoutFilters(before.source, createLocal ? target.hash : local!.hash, before.status.files.flatMap(file => [file.path, ...(file.previousPath ? [file.previousPath] : [])]));
        try { switchCodeBranch(before.source, createLocal ? target.ref : local!.name, createLocal, before.status.files.map(file => file.path)); } catch (error) { writeError = error; }
      }
      let after: ReturnType<typeof observe>;
      try { after = observe(root, input); }
      catch (error) {
        const failure = codeFailure('code_branch_result_unconfirmed', '切换后无法确认当前工作位置，请刷新核对；不能假定没有发生变化。', 409);
        Object.assign(failure, { details: { resultUnconfirmed: true, cause: (error as { code?: string }).code || 'code_source_unavailable' } }); throw failure;
      }
      const response = currentState(after, { switched: after.status.branch !== before.status.branch || after.status.head !== before.status.head, createdLocalBranch: createLocal && after.entries.some(entry => entry.ref === 'refs/heads/' + createLocal) ? createLocal : null });
      if (writeError) {
        Object.assign(writeError as object, { details: { ...((writeError as { details?: object }).details || {}), current: response, effects: response.effects } }); throw writeError;
      }
      const expectedName = createLocal || local!.name, expectedHead = createLocal ? target.hash : local!.hash;
      if (after.status.branch !== expectedName || after.status.head !== expectedHead) {
        const failure = codeFailure('code_branch_result_changed', '切换结果已发生并发变化，请刷新当前工作位置。', 409);
        Object.assign(failure, { details: { current: response, effects: response.effects } }); throw failure;
      }
      return response;
    } catch (error) {
      const failure = error as Error & { details?: Record<string, unknown> };
      if (!failure.details?.current && !failure.details?.resultUnconfirmed) {
        try {
          const observed = observe(root, input), current = currentState(observed);
          failure.details = { ...failure.details, current, effects: current.effects };
        } catch {
          failure.details = { ...failure.details, current: null, resultUnconfirmed: true, effects: { switched: false, createdLocalBranch: null } };
        }
      }
      throw failure;
    }
  }
  return Object.freeze({ branches, switchBranch });
}
