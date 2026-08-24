import path from 'node:path';

import { defaultTestContextPool } from '../context/node-test.mjs';
import {
  GIT_REPOSITORY_CONTEXT_KEY,
  PROJECT_FOUNDATION_CONTEXT_KEY,
  WORKSPACE_FOUNDATION_CONTEXT_KEY,
} from '../context/profiles.mjs';

function acquire(t, key, name) {
  const lease = defaultTestContextPool().acquire(key, { name });
  t.after(() => lease.release());
  return lease;
}

function foundation(lease) {
  return Object.freeze({
    base: lease.base,
    root: lease.root,
    context: Object.freeze({
      id: lease.provider,
      identity: lease.context.identity,
      root: lease.context.root,
      prepareDurationMs: lease.context.marker.prepareDurationMs,
      materializeDurationMs: lease.timing.materializeDurationMs,
    }),
  });
}

export function copyPreparedWorkspace(t, name = 'workspace-foundation') {
  return foundation(acquire(t, WORKSPACE_FOUNDATION_CONTEXT_KEY, name));
}

export function copyPreparedProjectWorkspace(t, name = 'project-foundation') {
  return foundation(acquire(t, PROJECT_FOUNDATION_CONTEXT_KEY, name));
}

export function copyPreparedGitRepository(t, name = 'git-repository') {
  const prepared = foundation(acquire(t, GIT_REPOSITORY_CONTEXT_KEY, name));
  return Object.freeze({
    ...prepared,
    remote: path.join(prepared.root, 'repository.git'),
    attached: path.join(prepared.root, 'attached'),
  });
}
