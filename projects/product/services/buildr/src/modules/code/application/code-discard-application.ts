import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { codeFailure, codeGit, relativeCodePath, type CodeSource } from '../infrastructure/code-file-reader.ts';
import { codeGitEnvironment } from '../infrastructure/code-git-environment.ts';
import { readCommitSnapshot, readCodeIndexDigest } from '../infrastructure/code-commit-snapshot.ts';
import { assertCodeRevision, observeSourceControl } from '../infrastructure/source-control-git-reader.ts';
import { readCodeCheckoutFilterConfig, assertNoExternalCheckoutFilters } from '../infrastructure/code-branch-switch.ts';
import { acquireCodeGitOperation } from '../infrastructure/code-git-operation-lock.ts';

export type CodeDiscardLocation = { repositoryId: string; worktreeId: string; path?: string };
export type CodeDiscardInput = CodeDiscardLocation & { expectedRevision: string };
export function createCodeDiscardApplication(dependencies: { source(root: string, input: CodeDiscardLocation): CodeSource }) {
  function snapshot(root: string, input: Partial<CodeDiscardLocation>) {
    if (!input.repositoryId || !/^checkout-[a-f0-9]{64}$/.test(input.worktreeId || '')) throw codeFailure('code_discard_location_invalid', '丢弃必须选择明确的代码库和工作树（Worktree）。');
    if (input.path !== undefined) relativeCodePath(input.path);
    const source = dependencies.source(root, input as CodeDiscardLocation), filters = readCodeCheckoutFilterConfig(source), status = observeSourceControl(source, {gitConfig: filters.overrides});
    const current = readCommitSnapshot(source, { includeDiff: false, gitConfig: filters.overrides });
    assertCodeRevision(observeSourceControl(source, {gitConfig: filters.overrides}).observedRevision, status.observedRevision);
    const selected = new Set(input.path === undefined ? current.paths : [input.path]);
    if (input.path !== undefined && !current.paths.includes(input.path)) throw codeFailure('code_discard_path_changed', '该文件已不在更改列表中，请刷新。', 409);
    // Renames can span both layers. Include every connected old/new path.
    let changed = true;
    while (changed) { changed = false; for (const file of status.files) if (file.previousPath && (selected.has(file.path) || selected.has(file.previousPath))) for (const name of [file.path, file.previousPath]) if (!selected.has(name)) { selected.add(name); changed = true; } }
    const paths = [...selected].sort();
    for (const name of paths) {
      relativeCodePath(name);
      let parent = path.dirname(name);
      while (parent !== '.') {
        try { if (fs.lstatSync(path.join(source.location, parent)).isSymbolicLink()) throw codeFailure('code_discard_path_unsupported', '不能丢弃经过符号链接目录的路径：' + name, 409); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
        parent = path.dirname(parent);
      }
    }
    const baseline = new Set<string>();
    if (current.head && paths.length) for (const entry of codeGit(source.location, ['ls-tree', '-r', '-z', current.head, '--', ...paths]).toString().split('\0').filter(Boolean)) {
      const separator = entry.indexOf('\t');
      if (!/^(100644|100755|120000) blob /.test(entry)) throw codeFailure('code_discard_path_unsupported', '不能丢弃子模块（Submodule）或特殊路径。', 409);
      baseline.add(entry.slice(separator + 1));
    }
    if (current.head) {
      try { assertNoExternalCheckoutFilters(source, current.head, paths); }
      catch { throw codeFailure('code_discard_filter_unsupported', '无法安全核对文件转换，或丢弃需要执行外部过滤器（Filter）；请使用对应 Git 工具处理。', 409); }
    }
    const verified = dependencies.source(root, input as CodeDiscardLocation);
    if (verified.location !== source.location || verified.worktreeId !== source.worktreeId) throw codeFailure('code_worktree_identity_changed', '工作位置身份已变化，请刷新。', 409);
    return { ...current, filterOverrides: filters.overrides, paths, removePaths: paths.filter(name => !baseline.has(name)) };
  }
  function discardContext(root: string, input: Partial<CodeDiscardLocation>) {
    const current = snapshot(root, input);
    return { source: current.source, revision: current.revision, paths: current.paths, removePaths: current.removePaths };
  }
  function discardChanges(root: string, input: CodeDiscardInput) {
    if (!input.expectedRevision) throw codeFailure('code_discard_revision_required', '丢弃需要确认时已观察的版本。');
    const before = snapshot(root, input), release = acquireCodeGitOperation(before.source);
    let lock: number | undefined;
    const lockPath = before.indexPath + '.lock', temporary = before.indexPath + '.buildr-discard-' + crypto.randomUUID();
    const completed: string[] = [];
    let started = false;
    try {
      assertCodeRevision(before.revision, input.expectedRevision);
      try { lock = fs.openSync(lockPath, 'wx', 0o600); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw codeFailure('code_discard_index_locked', '索引（Index）正在被其他操作使用，请刷新后重试。', 409); throw error; }
      assertCodeRevision(snapshot(root, input).revision, before.revision);
      const git = (args: string[]) => execFileSync('git', ['--literal-pathspecs', '--no-replace-objects', '-c', 'gc.auto=0', '-c', 'maintenance.auto=false', '-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=/dev/null', ...before.filterOverrides.flatMap(value => ['-c', value]), '-C', before.source.location, ...args], { env: { ...codeGitEnvironment(), GIT_INDEX_FILE: temporary }, timeout: 15_000, maxBuffer: 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
      if (before.indexDigest !== null) fs.copyFileSync(before.indexPath, temporary);
      else git(['read-tree', '--empty']);
      const restore = before.paths.filter(name => !before.removePaths.includes(name));
      started = true;
      if (restore.length) { git(['restore', '--source=' + before.head, '--staged', '--worktree', '--no-recurse-submodules', '--', ...restore]); completed.push(...restore); }
      for (const name of before.removePaths) {
        const file = before.files.find(file => file.path === name)!;
        const absolute = path.join(before.source.location, name);
        if (file.kind !== 'deleted') {
          const stat = fs.lstatSync(absolute);
          const content = stat.isSymbolicLink() ? Buffer.from(fs.readlinkSync(absolute)) : stat.isFile() ? fs.readFileSync(absolute) : null;
          if (!content || crypto.createHash('sha256').update(content).digest('hex') !== file.digest || stat.mode !== file.mode) throw codeFailure('code_source_changed', '执行期间文件已变化，剩余更改已保留。', 409);
          fs.unlinkSync(absolute);
        }
        git(['update-index', '--force-remove', '--', name]); completed.push(name);
      }
      const current = dependencies.source(root, input as CodeDiscardLocation);
      const optional = (args: string[]) => { try { return codeGit(current.location, args).toString().trim() || null; } catch { return null; } };
      if (optional(['rev-parse', '--verify', 'HEAD^{commit}']) !== before.head || optional(['symbolic-ref', '-q', 'HEAD']) !== before.branchRef) throw codeFailure('code_source_changed', '执行期间当前提交（Commit）或分支（Branch）已变化，请刷新核对。', 409);
      if (current.location !== before.source.location || current.worktreeId !== before.source.worktreeId || readCodeIndexDigest(before.indexPath) !== before.indexDigest) throw codeFailure('code_source_changed', '执行期间来源或索引（Index）已变化，请刷新核对。', 409);
      const identity = fs.fstatSync(lock), observed = fs.lstatSync(lockPath);
      if (identity.dev !== observed.dev || identity.ino !== observed.ino) throw codeFailure('code_discard_lock_changed', '索引（Index）锁身份已变化，请刷新核对。', 409);
      fs.writeFileSync(lock, fs.readFileSync(temporary)); fs.fsyncSync(lock); fs.renameSync(lockPath, before.indexPath);
      return { source: before.source, status: 'succeeded' as const, paths: completed, message: '已丢弃更改。' };
    } catch (error) {
      if (!started) throw error;
      return { source: before.source, status: 'partial' as const, paths: completed, message: '丢弃未全部完成，文件可能已发生变化；请刷新核对，勿直接重试。' + (error instanceof Error && 'status' in error ? error.message : '') };
    } finally {
      if (lock !== undefined) {
        try { const own = fs.fstatSync(lock), observed = fs.lstatSync(lockPath); if (own.dev === observed.dev && own.ino === observed.ino) fs.unlinkSync(lockPath); } catch { /* A renamed lock is already released. */ }
        fs.closeSync(lock);
      }
      for (const file of [temporary, temporary + '.lock']) { try { fs.unlinkSync(file); } catch { /* No temporary index remains after successful rename/cleanup. */ } }
      release();
    }
  }
  return { discardContext, discardChanges };
}
