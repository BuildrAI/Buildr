import { createGitBranchOperations, type GitBranchDependencies } from '@buildr-ai/buildr-harness/workbench';
import { codeFailure } from '../infrastructure/code-file-reader.ts';
import { acquireCodeGitOperation } from '../infrastructure/code-git-operation-lock.ts';
import { enumerateCodeWorktrees } from '../infrastructure/code-worktree-reader.ts';
import { assertCodeRevision } from '../infrastructure/source-control-git-reader.ts';
import { prepareServiceWorktree } from '../infrastructure/code-service-worktree.ts';

// Service checkout preparation is an engineering adapter, not a generic branch operation.
export function createCodeBranchApplication(dependencies: Omit<GitBranchDependencies,'worktrees'>) {
  const { branches, switchBranch, observe } = createGitBranchOperations({...dependencies,worktrees:source=>enumerateCodeWorktrees(source.location,source.repositoryId)});
  function prepareWorktree(root: string, input: { repositoryId: string; worktreeId: string; targetRef: string; expectedTargetHash: string; expectedRevision: string; requiredPath?: string }) {
    if (!/^refs\/(?:heads|remotes)\/.+/.test(input.targetRef || '') || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(input.expectedTargetHash || '') || !input.expectedRevision) throw codeFailure('code_branch_target_invalid', '必须提供目标分支与已观察版本。');
    const source = dependencies.source(root, { repositoryId: input.repositoryId, worktreeId: input.worktreeId });
    const release = acquireCodeGitOperation(source);
    try {
      const before = observe(root, { repositoryId: input.repositoryId, worktreeId: input.worktreeId });
      assertCodeRevision(before.observedRevision, input.expectedRevision);
      const target = before.entries.find(entry => entry.ref === input.targetRef);
      if (!target || target.hash !== input.expectedTargetHash) throw codeFailure('code_branch_target_changed', '目标分支已变化，请刷新后启动。', 409);
      return prepareServiceWorktree(root, before.source, target, before.entries, input.requiredPath);
    } finally { release(); }
  }
  return Object.freeze({ branches, switchBranch, prepareWorktree });
}
