import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { codeFailure, codeGit, relativeCodePath, type CodeSource } from './code-file-reader.ts';
import { codeGitEnvironment } from './code-git-environment.ts';
import { assertNoExternalCheckoutFilters } from './code-branch-switch.ts';
import { enumerateCodeWorktrees } from './code-worktree-reader.ts';
import type { CodeBranchEntry } from '../domain/source-control.ts';

/** Only creates a new checkout. Git's live inventory owns reuse; existing files are never switched or reset. The caller holds the shared Git operation lease. */
export function prepareServiceWorktree(root: string, source: CodeSource, target: CodeBranchEntry, entries: CodeBranchEntry[], requiredPath = '') {
  relativeCodePath(requiredPath, true);
  if (requiredPath && codeGit(source.location, ['cat-file', '-t', target.hash + ':' + requiredPath]).toString().trim() !== 'tree') throw codeFailure('code_service_module_missing', '目标分支没有该服务目录，未创建工作树。');
  const localName = target.kind === 'local' ? target.name : target.name.slice(target.remote!.length + 1);
  const local = entries.find(entry => entry.kind === 'local' && entry.name === localName);
  if (local && local.hash !== target.hash) throw codeFailure('code_branch_target_conflict', '同名本地分支与所选引用不同，请选择实际需要的本地分支；未修改任何目录。', 409);
  const inventory = enumerateCodeWorktrees(source.location, source.repositoryId);
  const existing = inventory.worktrees.find(item => item.branch === localName);
  if (existing) {
    if (existing.head !== target.hash || !fs.existsSync(existing.location)) throw codeFailure('code_branch_target_changed', '分支对应工作树已变化，请刷新。', 409);
    return { ...existing, created: false };
  }
  assertNoExternalCheckoutFilters(source, target.hash);
  const digest = (value: string) => crypto.createHash('sha256').update(value).digest('hex').slice(0, 24);
  let directory = fs.realpathSync(root);
  for (const component of ['.buildr', 'local', 'service-worktrees', digest(inventory.commonDirectory)]) {
    directory = path.join(directory, component);
    if (fs.existsSync(directory)) {
      if (fs.lstatSync(directory).isSymbolicLink() || !fs.statSync(directory).isDirectory()) throw codeFailure('code_worktree_path_unsafe', '独立工作树父目录被替换，未写入。', 409);
    } else fs.mkdirSync(directory);
  }
  const destination = path.join(directory, digest(localName));
  if (fs.existsSync(destination)) throw codeFailure('code_worktree_path_occupied', '独立工作树位置已被占用，未覆盖已有文件。', 409);
  const args = target.kind === 'remote' && !local
    ? ['worktree', 'add', '--track', '-b', localName, '--', destination, target.ref]
    : ['worktree', 'add', '--', destination, localName];
  try {
    execFileSync('git', ['--no-replace-objects', '-c', 'core.hooksPath=/dev/null', '-c', 'submodule.recurse=false', '-C', source.location, ...args], { env: codeGitEnvironment(), timeout: 60000, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 8 * 1024 * 1024 });
  } catch {
    throw codeFailure('code_worktree_create_failed', '独立工作树创建失败；已有目录及改动保留，请刷新检查 Git 登记。', 409);
  }
  const created = enumerateCodeWorktrees(source.location, source.repositoryId).worktrees.find(item => item.location === fs.realpathSync(destination));
  if (!created || created.branch !== localName || created.head !== target.hash) throw codeFailure('code_worktree_identity_changed', '新工作树身份或目标提交已变化，未继续启动。', 409);
  return { ...created, created: true };
}
