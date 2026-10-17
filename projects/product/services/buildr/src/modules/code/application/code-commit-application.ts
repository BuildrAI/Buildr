import crypto from 'node:crypto';
import fs from 'node:fs';
import { codeFailure, codeGit, type CodeSource } from '../infrastructure/code-file-reader.ts';
import { assertCodeRevision } from '../infrastructure/source-control-git-reader.ts';
import { readCommitSnapshot, readCodeIndexDigest, readCodePushSnapshot, type CodeCommitSnapshot, type CodeCommitSnapshotOptions } from '../infrastructure/code-commit-snapshot.ts';
import { runCodeGitMutation } from '../infrastructure/code-git-mutation-runner.ts';
import { pushObservedCodeSource } from './code-push-operation.ts';
import { acquireCodeGitOperation } from '../infrastructure/code-git-operation-lock.ts';
import type { CodeCommitLocation, CodeCommitContext, CodeCommitChangesInput, CodePushInput, CodeGitMutationResult } from './code-commit-model.ts';
import type { PreparedCodeCommitSync, CodeSyncResult } from './code-sync-model.ts';

type Dependencies = { source(root: string, input: CodeCommitLocation): CodeSource; prepareCommitSync?(root: string, input: CodeCommitLocation): PreparedCodeCommitSync };
const text = (source: CodeSource, args: string[]) => codeGit(source.location, args).toString('utf8').trim();
const safeMessage = (value: string) => value.replace(/(https?:\/\/)[^\s/@]+(?::[^\s/@]*)?@/gi, '$1[redacted]@').trim().slice(0, 4000);
const emptyPush = (target: string | null = null): CodeGitMutationResult['push'] => ({ status: 'not-requested', target, message: '', retry: null });

export function createCodeCommitApplication(dependencies: Dependencies) {
  function source(root: string, input: Partial<CodeCommitLocation>) {
    if (!input.repositoryId || !/^checkout-[a-f0-9]{64}$/.test(input.worktreeId || '')) throw codeFailure('code_commit_location_invalid', '操作必须明确已登记代码库与具体工作位置。');
    return dependencies.source(root, input as CodeCommitLocation);
  }
  function commitSnapshot(root: string, input: Partial<CodeCommitLocation>, options: CodeCommitSnapshotOptions = {}): CodeCommitSnapshot {
    const current = source(root, input), snapshot = readCommitSnapshot(current, options), verified = source(root, input);
    if (verified.location !== current.location || verified.worktreeId !== current.worktreeId) throw codeFailure('code_worktree_identity_changed', '工作位置身份已变化，请刷新。', 409);
    return snapshot;
  }
  function commitContext(root: string, input: Partial<CodeCommitLocation>): CodeCommitContext {
    const snapshot = commitSnapshot(root, input, { includeDiff: false }), push = readCodePushSnapshot(snapshot.source);
    return { source: snapshot.source, revision: snapshot.revision, head: snapshot.head, branch: snapshot.branch, hasChanges: snapshot.hasChanges, fileCount: snapshot.paths.length, push: { revision: push.revision, target: push.target, available: push.available, reason: push.reason, ahead: push.ahead } };
  }
  function failedSync(root: string, input: CodeCommitLocation, response: CodeGitMutationResult, error: unknown, status: 'unavailable' | 'unknown'): CodeSyncResult {
    let current = response.source, head: string | null = null, branch: string | null = null, upstream: string | null = null;
    try {
      const verified = source(root, input), state = readCodePushSnapshot(verified);
      current = verified; head = state.head; branch = state.branchRef?.replace(/^refs\/heads\//, '') || null; upstream = state.target;
    } catch { /* The established commit remains true even when the current checkout is unavailable. */ }
    const stageStatus = status === 'unknown' ? 'unknown' : 'not-requested';
    return { source: current, readAt: new Date().toISOString(), branch, head, upstream, status, message: (status === 'unknown' ? '提交已成立；同步阶段结果尚无法确认，请刷新核对。' : '提交已成立；同步未执行。') + safeMessage(String((error as { message?: unknown } | undefined)?.message || error || '尚无法确认同步来源。')), fetch: { status: stageStatus, message: status === 'unknown' ? '获取结果尚无法确认。' : '尚未获取远程。' }, rebase: { status: stageStatus, message: status === 'unknown' ? '拉取整合结果尚无法确认。' : '尚未拉取整合。' }, push: { status: stageStatus, message: status === 'unknown' ? '推送结果尚无法确认。' : '尚未推送。' } };
  }
  async function push(root: string, input: CodePushInput): Promise<CodeGitMutationResult> {
    const current = source(root, input), observed = readCodePushSnapshot(current);
    if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(input.expectedHead || '') || !input.expectedPushRevision) throw codeFailure('code_push_input_invalid', '推送必须提供已观察的完整提交和目标版本。');
    assertCodeRevision(observed.revision, input.expectedPushRevision);
    if (observed.head !== input.expectedHead) throw codeFailure('code_source_changed', '当前提交已变化，请刷新推送范围。', 409);
    return { source: current, commit: { completed: true, status: 'succeeded', hash: observed.head, message: text(current, ['show', '-s', '--format=%B', observed.head]) }, push: await pushObservedCodeSource(root, input, observed, source), sync: null, effects: { indexUpdated: false, warnings: [] } };
  }
  async function commitChanges(root: string, input: CodeCommitChangesInput): Promise<CodeGitMutationResult> {
    if (typeof input.message !== 'string' || !input.message.trim() || Buffer.byteLength(input.message) > 32 * 1024 || input.message.includes('\0') || !['commit', 'commit-push', 'commit-sync'].includes(input.mode) || !input.expectedRevision) throw codeFailure('code_commit_input_invalid', '提交需要非空说明、明确操作和已观察版本；说明不能超过 32 KiB。');
    const before = commitSnapshot(root, input, { includeDiff: false }); assertCodeRevision(before.revision, input.expectedRevision);
    if (!before.hasChanges) throw codeFailure('code_commit_no_changes', '当前来源没有未提交变更。', 409);
    const pushBefore = readCodePushSnapshot(before.source), lockPath = before.indexPath + '.lock', temporary = before.indexPath + '.buildr-' + crypto.randomUUID();
    let lock: number;
    try { lock = fs.openSync(lockPath, 'wx', 0o600); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw codeFailure('code_commit_index_locked', '索引正在被其他操作使用，请稍后刷新。', 409); throw error; }
    const lockIdentity = fs.fstatSync(lock), ownedLock = () => { try { const stat = fs.lstatSync(lockPath); return stat.dev === lockIdentity.dev && stat.ino === lockIdentity.ino; } catch { return false; } };
    const env = { GIT_INDEX_FILE: temporary }, warnings: string[] = [];
    let indexUpdated = false;
    try {
      assertCodeRevision(commitSnapshot(root, input, { includeDiff: false }).revision, before.revision);
      if (before.indexDigest !== null) {
        fs.copyFileSync(before.indexPath, temporary);
        const originalTree = await runCodeGitMutation(before.source, ['write-tree'], { env });
        if (!originalTree.ok) throw codeFailure('code_commit_index_prepare_failed', safeMessage(originalTree.stderr) || '无法准备临时索引。', 409);
        fs.unlinkSync(temporary);
        const rebuilt = await runCodeGitMutation(before.source, ['read-tree', originalTree.stdout.trim()], { env });
        if (!rebuilt.ok) throw codeFailure('code_commit_index_prepare_failed', safeMessage(rebuilt.stderr) || '无法准备临时索引。', 409);
      }
      else { const initialized = await runCodeGitMutation(before.source, ['read-tree', ...(before.head ? [before.head] : ['--empty'])], { env }); if (!initialized.ok) throw codeFailure('code_commit_index_prepare_failed', safeMessage(initialized.stderr) || '无法准备临时索引。', 409); }
      const staged = await runCodeGitMutation(before.source, ['add', '--all', '--', '.'], { env });
      if (!staged.ok) throw codeFailure('code_commit_stage_failed', safeMessage(staged.stderr) || '无法准备全部变更；原有索引已保留。', 409);
      assertCodeRevision(commitSnapshot(root, input, { includeDiff: false }).revision, before.revision);
      const tree = await runCodeGitMutation(before.source, ['write-tree'], { env });
      if (!tree.ok) throw codeFailure('code_commit_tree_failed', safeMessage(tree.stderr) || '无法确认拟提交内容。', 409);
      if (before.head && tree.stdout.trim() === text(before.source, ['rev-parse', before.head + '^{tree}'])) throw codeFailure('code_commit_no_changes', '全部当前内容与已有提交相同，没有可创建的新提交。', 409);
      assertCodeRevision(commitSnapshot(root, input, { includeDiff: false }).revision, before.revision);
      const action = 'buildr-commit-' + crypto.randomUUID();
      const result = await runCodeGitMutation(before.source, ['commit', '--file=-'], { env: { ...env, GIT_REFLOG_ACTION: action }, input: input.message, timeoutMs: 60_000 });
      let hash: string | null = null;
      try { hash = text(before.source, ['reflog', 'show', '-n', '32', '--format=%H%x00%gs', before.branchRef || 'HEAD']).split('\n').find(line => line.split('\0')[1]?.startsWith(action + ':'))?.split('\0')[0] || null; } catch { /* Reflogs may intentionally be disabled. */ }
      if (!hash && result.ok) { try { const currentHead = text(before.source, ['rev-parse', '--verify', 'HEAD^{commit}']); if (currentHead !== before.head) hash = currentHead; } catch { /* Preserve the unknown outcome below. */ } }
      if (!hash) {
        let unchanged = false;
        try { const current = source(root, input), now = readCodePushSnapshot(current); unchanged = current.location === before.source.location && current.worktreeId === before.source.worktreeId && now.head === before.head && now.branchRef === before.branchRef; } catch { /* Unknown source means an unknown operation outcome. */ }
        const unknown = result.timedOut || result.ok || !unchanged;
        return { source: before.source, commit: { completed: false, hash: null, status: unknown ? 'unknown' : 'failed', message: safeMessage(result.stderr) || (unknown ? '提交结果尚无法确认，请刷新核对后再决定。' : 'Git 未完成提交；原有索引已保留。') }, push: emptyPush(pushBefore.target), sync: null, effects: { indexUpdated: false, warnings } };
      }
      let identityMatches = false;
      try { const current = source(root, input); identityMatches = current.location === before.source.location && current.worktreeId === before.source.worktreeId && text(current, ['rev-parse', '--verify', 'HEAD^{commit}']) === hash; } catch { /* An independently changed source must not receive an index replacement. */ }
      try {
        if (identityMatches && ownedLock() && readCodeIndexDigest(before.indexPath) === before.indexDigest) {
          const aligned = await runCodeGitMutation(before.source, ['read-tree', hash], { env });
          if (aligned.ok && ownedLock() && readCodeIndexDigest(before.indexPath) === before.indexDigest) {
            fs.writeFileSync(lock, fs.readFileSync(temporary)); fs.fsyncSync(lock); fs.renameSync(lockPath, before.indexPath); indexUpdated = true;
          }
        }
      } catch { warnings.push('索引同步失败，已成立的提交保持。'); }
      if (!indexUpdated) warnings.push('提交已成立，索引同步尚未确认；原有索引保留，请刷新核对。');
      let message = input.message;
      try { message = text(before.source, ['show', '-s', '--format=%B', hash]); } catch { warnings.push('提交标识已确认，完整说明暂不可重读。'); }
      const response: CodeGitMutationResult = { source: before.source, commit: { completed: true, hash, status: 'succeeded', message }, push: emptyPush(pushBefore.target), sync: null, effects: { indexUpdated, warnings } };
      if (input.mode === 'commit-push') {
        try {
          const after = readCodePushSnapshot(source(root, input));
          if (after.head !== hash || after.configurationRevision !== pushBefore.configurationRevision) response.push = { status: 'unavailable', target: pushBefore.target, message: '提交已成立，但当前提交或推送目标已变化；请刷新后重新判断。', retry: null };
          else response.push = await pushObservedCodeSource(root, input, after, source);
        } catch (error) { response.push = { status: 'unavailable', target: pushBefore.target, message: (error as Error).message, retry: null }; }
      }
      return response;
    } finally {
      try { fs.closeSync(lock); } catch { warnings.push('索引锁句柄关闭未确认。'); }
      if (ownedLock()) { try { fs.unlinkSync(lockPath); } catch { warnings.push('自有索引锁清理未完成。'); } }
      for (const file of [temporary, temporary + '.lock']) { try { fs.unlinkSync(file); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') warnings.push('临时索引清理未完成。'); } }
    }
  }
  return Object.freeze({ commitContext, commitSnapshot,
    async commitChanges(root: string, input: CodeCommitChangesInput) {
      const release = acquireCodeGitOperation(source(root, input));
      try {
        let prepared: PreparedCodeCommitSync | undefined, preparationError: unknown;
        if (input.mode === 'commit-sync') {
          try {
            if (!dependencies.prepareCommitSync) throw codeFailure('code_sync_unavailable', '当前来源尚无法准备同步。', 409);
            prepared = dependencies.prepareCommitSync(root, input);
          } catch (error) { preparationError = error; }
        }
        // commitChanges releases its owned index lock before the sync continuation.
        const response = await commitChanges(root, input);
        if (input.mode === 'commit-sync' && response.commit.completed && response.commit.hash) {
          try { response.sync = prepared ? await prepared(response.commit.hash) : failedSync(root, input, response, preparationError, 'unavailable'); }
          catch (error) { response.sync = failedSync(root, input, response, error, 'unknown'); }
        }
        return response;
      } finally { release(); }
    },
    async push(root: string, input: CodePushInput) { const release = acquireCodeGitOperation(source(root, input)); try { return await push(root, input); } finally { release(); } },
  });
}
