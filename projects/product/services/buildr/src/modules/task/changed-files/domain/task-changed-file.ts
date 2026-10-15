export type ChangedFileStatus = 'modified' | 'untracked' | 'added' | 'deleted' | 'renamed' | 'conflicted';
export type TaskChangedFile = {
  repositoryId: string;
  /** Observed current checkout; committed files are pinned by their commit instead. */
  checkoutId?: string;
  path: string;
  previousPath: string | null;
  kind: 'tracked' | 'untracked';
  status: ChangedFileStatus;
  additions: number | null;
  deletions: number | null;
  preview: string | null;
  previewTruncated: boolean;
};
export type TaskCommitFile = TaskChangedFile;
export type TaskCommitWithFiles = {
  repositoryId: string;
  hash: string;
  shortHash: string;
  subject: string;
  message: string;
  authorName: string;
  authorEmail: string;
  authoredAt: string;
  committedAt: string;
  files: TaskCommitFile[];
};

/** Map git status --porcelain=v2 XY letters to the file status shown to users. */
export function changedFileStatus(ordinary: string, staged: string, unstaged: string): ChangedFileStatus | null {
  if (ordinary === 'u') return 'conflicted';
  if (ordinary === '?') return 'untracked';
  if (ordinary !== '1' && ordinary !== '2') return null;
  if (staged === 'R' || unstaged === 'R') return 'renamed';
  if (staged === 'D' || unstaged === 'D') return 'deleted';
  if (staged === 'A' || unstaged === 'A') return 'added';
  if (staged === 'M' || unstaged === 'M') return 'modified';
  if (staged === 'T' || unstaged === 'T') return 'modified';
  return null;
}
