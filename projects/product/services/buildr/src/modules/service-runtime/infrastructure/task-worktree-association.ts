import { sameFilesystemPath } from '../../../infrastructure/filesystem/filesystem-path-identity.ts';
import { observeGitCheckoutReadIdentity } from '../../../infrastructure/git/checkout-read-identity.ts';

export type TaskCheckoutEvidence = { sourceRepository: string; checkoutPath: string; branch?: string };

/** 任务证据只能关联当前 Git 观察已确认的成员，不能添加任意执行目录。 */
export function matchesTaskCheckout(repositoryLocation: string, worktree: { worktreeId: string; location: string; isMain: boolean; branch: string | null; head: string | null }, evidence: TaskCheckoutEvidence): boolean {
  if (worktree.isMain || !worktree.head || !evidence.branch || evidence.branch !== worktree.branch || !sameFilesystemPath(evidence.checkoutPath, worktree.location)) return false;
  try {
    const repository = observeGitCheckoutReadIdentity(repositoryLocation);
    const source = observeGitCheckoutReadIdentity(evidence.sourceRepository);
    const checkout = observeGitCheckoutReadIdentity(worktree.location);
    return checkout.id === worktree.worktreeId && sameFilesystemPath(repository.commonDirectory, source.commonDirectory)
      && sameFilesystemPath(repository.commonDirectory, checkout.commonDirectory);
  } catch { return false; }
}
