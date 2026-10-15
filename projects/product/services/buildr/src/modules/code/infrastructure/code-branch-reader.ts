import { codeGit, type CodeSource } from './code-file-reader.ts';
import type { CodeGitWorktrees } from './code-worktree-reader.ts';
import { codeRevision, SOURCE_CONTROL_LIMITS } from './source-control-git-reader.ts';

export type CodeBranchSourceObservation = {
  source: CodeSource;
  worktrees: Pick<CodeGitWorktrees, 'worktrees'>;
  verify(): void;
};

/** Branch observation pairs these refs with status, which already binds HEAD and the current branch. */
export function readCodeBranchRefs(source: CodeSource) {
  const raw = codeGit(source.location, ['for-each-ref', '--format=%(refname)%00%(objectname)%00%(*objectname)%00%(objecttype)%00%(upstream:short)%00%(*objecttype)%00%(symref)%00%(upstream)', 'refs/heads/', 'refs/remotes/', 'refs/tags/'], SOURCE_CONTROL_LIMITS.bytes).toString('utf8');
  return { rows: raw.split('\n').filter(Boolean).map(line => line.split('\0')), revision: codeRevision([source.repositoryId, source.location, raw]) };
}
