import path from 'node:path';
import { spawnSync } from 'node:child_process';

const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;

function gitText(root, args) {
  const result = spawnSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: MAX_OUTPUT_BYTES,
  });
  return result.status === 0 ? result.stdout.trim() : null;
}

function targetBranchError(code, message, details) {
  const error = new Error(message);
  Object.assign(error, {
    code,
    details,
    nextAction: 'Check out the intended retained Workspace delivery branch, then start Task Finish again.',
  });
  return error;
}

export function resolveTaskFinishTargetBranch({ root, requestedTargetBranch = null }) {
  const retainedRoot = path.resolve(root);
  const retainedBranch = gitText(retainedRoot, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
  if (!retainedBranch) {
    throw targetBranchError('task_finish.target_branch_unavailable', 'Task Finish requires the retained Workspace to be checked out on a local delivery branch.', {
      source: 'retained-current',
      retainedBranch: null,
    });
  }
  if (!gitText(retainedRoot, ['rev-parse', '--verify', `refs/heads/${retainedBranch}^{commit}`])) {
    throw targetBranchError('task_finish.target_branch_unavailable', `Task Finish retained branch ${retainedBranch} does not resolve to a commit.`, {
      source: 'retained-current',
      retainedBranch,
    });
  }

  const requested = typeof requestedTargetBranch === 'string' ? requestedTargetBranch.trim() : '';
  if (requested && requested !== retainedBranch) {
    throw targetBranchError('task_finish.target_branch_mismatch', `Task Finish target branch ${requested} does not match retained Workspace branch ${retainedBranch}.`, {
      source: 'explicit',
      requestedTargetBranch: requested,
      retainedBranch,
    });
  }
  return {
    targetBranch: requested || retainedBranch,
    source: requested ? 'explicit' : 'retained-current',
  };
}
