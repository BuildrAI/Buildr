import path from 'node:path';
import { codeFailure, codeGit } from './code-file-reader.ts';

export function parseGitWorktreeRecord(record: string) {
  const fields = record.split('\0'), declared = fields.find(field => field.startsWith('worktree '))?.slice(9);
  if (!declared || !path.isAbsolute(declared)) throw codeFailure('code_worktree_list_invalid', 'Git 工作树清单包含无效目录。', 409);
  const branch = fields.find(field => field.startsWith('branch '))?.slice(7);
  return { declared, branch: branch?.startsWith('refs/heads/') ? branch.slice(11) : null,
    head: fields.find(field => field.startsWith('HEAD '))?.slice(5) || null };
}

export function readGitWorktreeRecords(root: string) {
  return codeGit(root, ['worktree', 'list', '--porcelain', '-z'], 8 * 1024 * 1024)
    .toString('utf8').split('\0\0').filter(Boolean).map(parseGitWorktreeRecord);
}
