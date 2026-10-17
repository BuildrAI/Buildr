import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { codeFailure, codeGit, type CodeSource } from '../infrastructure/code-file-reader.ts';
import { assertCodeRevision, codeRevision, observeSourceControl } from '../infrastructure/source-control-git-reader.ts';
import { readCodePushSnapshot } from '../infrastructure/code-commit-snapshot.ts';
import { assertNoExternalCheckoutFilters, readCodeCheckoutFilterConfig } from '../infrastructure/code-branch-switch.ts';
import { fetchCodeRemoteRefs } from '../infrastructure/code-fetch-refs.ts';
import { runCodeGitMutation } from '../infrastructure/code-git-mutation-runner.ts';
import { acquireCodeGitOperation } from '../infrastructure/code-git-operation-lock.ts';
import { pushObservedCodeSource } from './code-push-operation.ts';
import type { CodeSyncLocation, CodeSyncInput, CodeSyncStatus, CodeSyncStage, CodeSyncContext, CodeSyncResult, PreparedCodeCommitSync } from './code-sync-model.ts';

export type { CodeSyncLocation, CodeSyncInput, CodeSyncStatus, CodeSyncStage, CodeSyncContext, CodeSyncResult } from './code-sync-model.ts';
type Dependencies = {
  source(root: string, input: CodeSyncLocation): CodeSource;
  observation?(root: string, input: CodeSyncLocation): { source: CodeSource; verify(): void } | undefined;
  run?: typeof runCodeGitMutation;
};
const progressNames = ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'REBASE_HEAD', 'rebase-merge', 'rebase-apply', 'sequencer', 'BISECT_START'];
const text = (source: CodeSource, args: string[]) => codeGit(source.location, args).toString('utf8').trim();
const hash = (value: Buffer) => crypto.createHash('sha256').update(value).digest('hex');
const optional = (source: CodeSource, args: string[]) => { try { return text(source, args) || null; } catch { return null; } };
const notRequested = (message: string): CodeSyncStage => ({ status: 'not-requested', message });

export function createCodeSyncApplication(dependencies: Dependencies) {
  const run = dependencies.run || runCodeGitMutation;
  function assertLocation(input: Partial<CodeSyncLocation>) {
    if (!input.repositoryId || !/^checkout-[a-f0-9]{64}$/.test(input.worktreeId || '')) throw codeFailure('code_sync_location_invalid', '同步必须明确已登记代码库与具体工作位置。');
  }
  function source(root: string, input: Partial<CodeSyncLocation>) {
    assertLocation(input);
    const current = dependencies.source(root, input as CodeSyncLocation);
    if (current.commitHash || current.worktreeId !== input.worktreeId) throw codeFailure('code_sync_source_invalid', '同步必须选择当前真实工作位置。', 409);
    return current;
  }
  function observe(root: string, input: Partial<CodeSyncLocation>) {
    assertLocation(input);
    const observation = dependencies.observation?.(root, input as CodeSyncLocation);
    const current = observation?.source || source(root, input);
    if (current.commitHash || current.worktreeId !== input.worktreeId) throw codeFailure('code_sync_source_invalid', '同步必须选择当前真实工作位置。', 409);
    const configuration = codeGit(current.location, ['config', '--null', '--list'], 1024 * 1024);
    const filters = readCodeCheckoutFilterConfig(current, configuration);
    const status = observeSourceControl(current, { gitConfig: filters.overrides }), push = readCodePushSnapshot(current);
    const index = codeGit(current.location, ['ls-files', '--stage', '-v', '-z']);
    const gitDirectory = text(current, ['rev-parse', '--absolute-git-dir']);
    const progress = progressNames.filter(name => fs.existsSync(path.join(gitDirectory, name)));
    const fetchUrls = push.remote && push.remote !== '.' ? optional(current, ['remote', 'get-url', '--all', '--', push.remote])?.split('\n') || [] : [];
    const fetchUrl = fetchUrls[0] && !/[\0\r\n]/.test(fetchUrls[0]) ? fetchUrls[0] : null;
    const directUpstream = push.upstreamRef?.startsWith('refs/remotes/') && !optional(current, ['symbolic-ref', '--quiet', push.upstreamRef]);
    let reason = progress.length || status.files.some(file => file.status === 'conflicted') ? '当前位置有尚未结束的 Git 操作或冲突，请处理后再同步。'
      : push.reason || (!fetchUrl ? '上游远端没有可核对的获取地址。' : !directUpstream ? '上游不是可核对的直接远程跟踪分支。' : null);
    let ahead: number | null = null, behind: number | null = null;
    if (push.head && push.upstreamHead) {
      const counts = text(current, ['rev-list', '--left-right', '--count', push.head + '...' + push.upstreamHead]).split(/\s+/).map(Number);
      if (counts.length !== 2 || counts.some(value => !Number.isSafeInteger(value) || value < 0)) reason = '当前分支与上游差异尚无法确认。';
      else [ahead, behind] = counts;
    }
    const targetRevision = codeRevision([current.repositoryId, current.worktreeId, current.location, push.branchRef, hash(configuration), fetchUrls, push.remote, push.url, push.destinationRef, push.upstreamRef]);
    const fileMetadata = [...new Set(status.files.map(file => file.path))].map(file => {
      try { const stat = fs.lstatSync(path.join(current.location, file), { bigint: true }); return [file, stat.dev.toString(), stat.ino.toString(), stat.size.toString(), stat.mtimeNs.toString(), stat.ctimeNs.toString()]; }
      catch { return [file, 'missing']; }
    });
    const localRevision = codeRevision([current.worktreeId, current.location, push.branchRef, status.head, status.files, fileMetadata, hash(index), progress, filters.revision]);
    const contentRevision = codeRevision([localRevision, status.observedRevision]);
    const revision = codeRevision([targetRevision, contentRevision, push.revision]);
    function verifyIdentity() {
      if (observation) { observation.verify(); return; }
      const verified = source(root, input);
      if (verified.location !== current.location || verified.worktreeId !== current.worktreeId) throw codeFailure('code_worktree_identity_changed', '同步观察期间工作位置身份已变化，请刷新。', 409);
    }
    verifyIdentity();
    assertCodeRevision(status.observedRevision, observeSourceControl(current, { gitConfig: filters.overrides }).observedRevision);
    if (hash(codeGit(current.location, ['config', '--null', '--list'])) !== hash(configuration) || hash(codeGit(current.location, ['ls-files', '--stage', '-v', '-z'])) !== hash(index)) throw codeFailure('code_source_changed', '同步观察期间索引或配置已变化，请刷新。', 409);
    verifyIdentity();
    if (observation) { const version = status.branch || status.head; current.version = version ? version + ' · 当前文件' : '当前文件'; }
    return { source: current, status, push, fetchUrl, progress, reason, ahead, behind, targetRevision, localRevision, revision, unsafeIndex: index.toString().split('\0').some(entry => /^[a-zS] /.test(entry)) };
  }
  function syncContext(root: string, input: Partial<CodeSyncLocation>): CodeSyncContext {
    const observed = observe(root, input);
    return { source: observed.source, revision: observed.revision, head: observed.status.head, branch: observed.status.branch, target: observed.status.upstream || observed.push.target, available: !observed.reason, reason: observed.reason, ahead: observed.ahead, behind: observed.behind, hasChanges: observed.status.fileCount > 0 };
  }
  function verifyTarget(root: string, input: CodeSyncLocation, before: ReturnType<typeof observe>, expectedHead: string | null, expectedUpstream: string | null) {
    const after = observe(root, input);
    assertCodeRevision(after.targetRevision, before.targetRevision);
    if (after.status.head !== expectedHead || after.push.upstreamHead !== expectedUpstream) throw codeFailure('code_source_changed', '当前提交或上游记录已被其他操作改变，请刷新核对。', 409);
    return after;
  }
  function ancestor(current: CodeSource, base: string, tip: string) {
    try { return text(current, ['merge-base', '--all', base, tip]).split('\n').includes(base); } catch { return false; }
  }
  function assertSafeIntegration(observed: ReturnType<typeof observe>, targetHash: string, replay: string[]) {
    if (observed.status.truncated || observed.unsafeIndex) throw codeFailure('code_sync_observation_incomplete', '索引含隐藏变化标记或观察不完整，未开始整合。', 409);
    if (observed.status.fileCount) throw codeFailure('code_sync_dirty', '需要拉取整合，请先提交或处理当前位置的未提交变更；现有文件与索引已保留。', 409);
    const targets = [targetHash, ...replay];
    const changed = new Set<string>();
    for (const target of targets) {
      assertNoExternalCheckoutFilters(observed.source, target);
      const paths = codeGit(observed.source.location, ['diff-tree', '-r', '--no-commit-id', '--name-only', '--no-ext-diff', '--no-textconv', '-z', observed.status.head!, target, '--']).toString().split('\0').filter(Boolean);
      for (const file of paths) changed.add(file);
      if (changed.size > 1000) throw codeFailure('code_sync_path_limit', '本次整合超过 1000 个变化路径，无法完整核对现存内容保护。', 409);
    }
    // Rebase may overwrite ignored files. Check actual write paths and parent obstructions too.
    const tracked = new Set(codeGit(observed.source.location, ['ls-files', '-z']).toString().split('\0').filter(Boolean));
    for (const file of changed) {
      let relative = file;
      while (relative && relative !== '.') {
        const absolute = path.join(observed.source.location, relative);
        try {
          const stat = fs.lstatSync(absolute);
          if (!tracked.has(relative) && (!stat.isDirectory() || relative === file)) throw codeFailure('code_sync_untracked_overlap', '整合可能覆盖现存未跟踪或忽略内容，未开始整合：' + relative, 409);
        } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
        relative = path.posix.dirname(relative);
      }
    }
  }
  async function syncWithinOperation(root: string, input: CodeSyncInput): Promise<CodeSyncResult> {
    if (!input.expectedRevision) throw codeFailure('code_sync_input_invalid', '同步需要已观察的来源版本。');
    const before = observe(root, input); assertCodeRevision(before.revision, input.expectedRevision);
    let expectedFinalHead = before.status.head;
    const response: CodeSyncResult = { source: before.source, readAt: new Date().toISOString(), branch: before.status.branch, head: before.status.head, upstream: before.status.upstream, status: 'unavailable', message: '', fetch: notRequested('尚未获取远程。'), rebase: notRequested('尚未拉取整合。'), push: notRequested('尚未推送。') };
    const finish = (status: CodeSyncStatus, message: string) => {
      response.status = status; response.message = message; response.readAt = new Date().toISOString();
      try {
        const final = status === 'succeeded' ? observe(root, input) : null;
        const current = final?.source || source(root, input), state = final?.status || observeSourceControl(current, { gitConfig: readCodeCheckoutFilterConfig(current).overrides });
        response.source = current; response.branch = state.branch; response.head = state.head; response.upstream = state.upstream;
        if (final) {
          if (state.branch !== before.status.branch || state.head !== expectedFinalHead || final.push.upstreamHead !== expectedFinalHead || final.targetRevision !== before.targetRevision) {
            response.status = 'unknown'; response.message = '已确认的操作阶段结果保留；当前来源或目标已发生后续变化，请刷新核对。';
          }
        }
      }
      catch { response.status = 'unknown'; response.message += ' 当前来源结果尚无法重新确认，请刷新核对。'; }
      return response;
    };
    if (before.reason) return finish('unavailable', before.reason);
    response.fetch = await fetchCodeRemoteRefs(before.source, { url: before.fetchUrl!, refspecs: ['+' + before.push.destinationRef + ':' + before.push.upstreamRef] }, { run, verify: () => { assertCodeRevision(observe(root, input).revision, before.revision); } });
    if (response.fetch.status !== 'succeeded') return finish(response.fetch.status as CodeSyncStatus, '获取上游未完成，整合与推送未执行。');
    let fetched: ReturnType<typeof observe>;
    try {
      fetched = observe(root, input); assertCodeRevision(fetched.targetRevision, before.targetRevision);
      // Fetch legitimately changes status ahead/behind, but not local files, index, HEAD or configuration.
      assertCodeRevision(fetched.localRevision, before.localRevision);
      if (fetched.reason || !fetched.push.upstreamHead) throw codeFailure('code_sync_upstream_unavailable', fetched.reason || '获取后上游提交尚无法确认。', 409);
      if (!ancestor(fetched.source, before.push.upstreamHead!, fetched.push.upstreamHead)) throw codeFailure('code_sync_upstream_rewritten', '上游历史已被改写，已保留获取结果；未自动整合或推送，请核对后处理。', 409);
    } catch (error) { response.rebase = { status: 'unavailable', message: (error as Error).message }; return finish('unavailable', '已获取上游；本地整合与推送未执行。'); }
    let integrated = fetched;
    if (fetched.behind) {
      let integrationStarted = false;
      try {
        const replay = text(fetched.source, ['rev-list', '--reverse', fetched.push.upstreamHead + '..' + fetched.status.head]).split('\n').filter(Boolean);
        if (!optional(fetched.source, ['merge-base', fetched.status.head!, fetched.push.upstreamHead!])) throw codeFailure('code_sync_history_unrelated', '当前分支与上游没有可核实的共同历史，未自动整合。', 409);
        if (replay.length > 10_000) throw codeFailure('code_sync_commit_limit', '待整合提交超过完整核对上限。', 409);
        if (replay.length && text(fetched.source, ['rev-list', '--merges', fetched.push.upstreamHead + '..' + fetched.status.head])) throw codeFailure('code_sync_merge_replay', '待重放范围包含合并提交，未自动改变合并结构；请核对后处理。', 409);
        assertSafeIntegration(fetched, fetched.push.upstreamHead!, replay);
        assertCodeRevision(observe(root, input).revision, fetched.revision);
        const settings = ['-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false', '-c', 'submodule.recurse=false', '-c', 'rebase.autoStash=false', '-c', 'rebase.updateRefs=false', '-c', 'rebase.autoSquash=false', '-c', 'rerere.enabled=false'];
        const args = fetched.ahead ? [...settings, 'rebase', '--no-autostash', '--no-update-refs', '--no-fork-point', '--no-rebase-merges', fetched.push.upstreamHead!]
          : [...settings, 'merge', '--ff-only', '--no-edit', fetched.push.upstreamHead!];
        integrationStarted = true;
        const result = await run(fetched.source, args, { timeoutMs: 60_000 });
        if (!result.ok) {
          response.rebase = { status: result.timedOut ? 'unknown' : 'failed', message: result.timedOut ? '拉取整合超时，现场已保留；请刷新核对，不会自动重试。' : 'Git 未完成拉取整合；冲突及当前现场已保留，请查看改动后继续处理。' };
          return finish(response.rebase.status as CodeSyncStatus, '已获取上游，拉取整合尚未完成；推送未执行。');
        }
        integrated = observe(root, input); assertCodeRevision(integrated.targetRevision, before.targetRevision);
        if (integrated.push.upstreamHead !== fetched.push.upstreamHead || !integrated.status.head || !ancestor(integrated.source, fetched.push.upstreamHead!, integrated.status.head) || (!fetched.ahead && integrated.status.head !== fetched.push.upstreamHead)) throw codeFailure('code_sync_integration_changed', '整合后当前提交或上游发生变化，请刷新核对。', 409);
        response.rebase = { status: 'succeeded', message: fetched.ahead ? '已将当前分支相对固定上游未推送的提交变基。' : '已快进到本次获取的上游提交。' };
      } catch (error) { response.rebase = { status: integrationStarted ? 'unknown' : 'unavailable', message: (error as Error).message }; return finish(integrationStarted ? 'unknown' : 'unavailable', '已获取上游；整合未确认，推送未执行。'); }
    } else response.rebase = notRequested('当前分支无需拉取整合。');
    expectedFinalHead = integrated.status.head;
    try {
      const ready = verifyTarget(root, input, before, integrated.status.head, fetched.push.upstreamHead);
      if (ready.push.ahead === 0) response.push = notRequested('当前分支没有待推送提交。');
      else { const pushed = await pushObservedCodeSource(root, input, ready.push, source, run); response.push = { status: pushed.status === 'not-requested' ? 'not-requested' : pushed.status, message: pushed.message }; }
    } catch (error) { response.push = { status: 'unavailable', message: (error as Error).message }; }
    const status = response.push.status === 'not-requested' ? 'succeeded' : response.push.status;
    return finish(status, status === 'succeeded' ? '当前分支已与固定上游同步。' : '已完成的获取与本地整合保留；推送尚未完成。');
  }
  /** The caller holds the shared Git operation lock across commit and sync. */
  function prepareCommitSync(root: string, input: CodeSyncLocation): PreparedCodeCommitSync {
    const before = observe(root, input);
    return async committedHead => {
      let after: ReturnType<typeof observe> | undefined;
      try {
        after = observe(root, input);
        assertCodeRevision(after.targetRevision, before.targetRevision);
        if (after.status.head !== committedHead || after.push.upstreamHead !== before.push.upstreamHead) throw codeFailure('code_source_changed', '提交已成立，但当前提交或原同步上游记录已变化；请刷新后重新判断。', 409);
      } catch (error) {
        return { source: after?.source || before.source, readAt: new Date().toISOString(), branch: after?.status.branch || null, head: after?.status.head || null, upstream: after?.status.upstream || null, status: 'unavailable', message: '提交已成立；同步未执行。' + (error as Error).message, fetch: notRequested('尚未获取远程。'), rebase: notRequested('尚未拉取整合。'), push: notRequested('尚未推送。') };
      }
      return syncWithinOperation(root, { ...input, expectedRevision: after.revision });
    };
  }
  return Object.freeze({ syncContext, prepareCommitSync,
    async sync(root: string, input: CodeSyncInput) {
      if (!input.expectedRevision) throw codeFailure('code_sync_input_invalid', '同步需要已观察的来源版本。');
      const release = acquireCodeGitOperation(source(root, input));
      try { return await syncWithinOperation(root, input); } finally { release(); }
    },
  });
}
