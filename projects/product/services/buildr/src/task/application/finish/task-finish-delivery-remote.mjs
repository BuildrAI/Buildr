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

function remoteError(message, details) {
  const error = new Error(message);
  Object.assign(error, {
    code: 'task_finish.remote_unavailable',
    details,
    nextAction: 'Configure or explicitly select one retained Workspace delivery remote, then start Task Finish again.',
  });
  return error;
}

function configuredRemote(root, remote, source, configuredRemotes) {
  if (!configuredRemotes.includes(remote)) {
    throw remoteError(`Task Finish delivery remote ${remote} from ${source} is not configured in the retained Workspace.`, {
      source,
      remote,
      configuredRemotes,
    });
  }
  if (!gitText(root, ['config', '--get-all', `remote.${remote}.url`])) {
    throw remoteError(`Task Finish delivery remote ${remote} does not have a readable URL in the retained Workspace.`, {
      source,
      remote,
      configuredRemotes,
    });
  }
  return { remote, source, configuredRemotes };
}

export function resolveTaskFinishDeliveryRemote({ root, targetBranch, requestedRemote = null, environmentRemote = null }) {
  const retainedRoot = path.resolve(root);
  const remotes = gitText(retainedRoot, ['remote']);
  if (remotes === null) {
    throw remoteError('Task Finish could not inspect configured remotes in the retained Workspace.', {
      source: 'retained-workspace',
      configuredRemotes: [],
    });
  }
  const configuredRemotes = [...new Set(remotes.split('\n').map((value) => value.trim()).filter(Boolean))].sort();
  const requested = typeof requestedRemote === 'string' ? requestedRemote.trim() : '';
  if (requested) return configuredRemote(retainedRoot, requested, 'explicit', configuredRemotes);

  const environment = typeof environmentRemote === 'string' ? environmentRemote.trim() : '';
  if (environment) return configuredRemote(retainedRoot, environment, 'environment', configuredRemotes);

  const branch = typeof targetBranch === 'string' ? targetBranch.trim() : '';
  const upstreamRemote = branch ? gitText(retainedRoot, ['config', '--get', `branch.${branch}.remote`]) : null;
  if (upstreamRemote) {
    if (upstreamRemote === '.') {
      throw remoteError(`Task Finish target branch ${branch} uses a local upstream instead of a delivery remote.`, {
        source: 'branch-upstream',
        remote: upstreamRemote,
        targetBranch: branch,
        configuredRemotes,
      });
    }
    return configuredRemote(retainedRoot, upstreamRemote, 'branch-upstream', configuredRemotes);
  }

  if (configuredRemotes.length === 1) return configuredRemote(retainedRoot, configuredRemotes[0], 'unique-configured', configuredRemotes);
  if (configuredRemotes.length === 0) {
    throw remoteError('Task Finish requires a configured retained Workspace delivery remote.', {
      source: 'retained-workspace',
      targetBranch: branch || null,
      configuredRemotes,
    });
  }
  throw remoteError('Task Finish cannot choose between multiple retained Workspace delivery remotes.', {
    source: 'retained-workspace',
    targetBranch: branch || null,
    configuredRemotes,
  });
}
