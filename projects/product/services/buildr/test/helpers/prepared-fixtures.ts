import path from 'node:path';
import { createRuntime } from './runtime-harness.ts';
import { useLegacyAssetCatalog } from './legacy-asset-catalog.ts';

import { defaultTestContextPool } from '../context/node-test.ts';
import {
  GIT_REPOSITORY_CONTEXT_KEY,
  PROJECT_FOUNDATION_CONTEXT_KEY,
  WORKSPACE_FOUNDATION_CONTEXT_KEY,
} from '../context/profiles.ts';

function acquire(t: any, key: any, name: any): any  {
  const lease: any = defaultTestContextPool().acquire(key, { name });
  t.after(() => lease.release());
  return lease;
}

function foundation(lease: any): any  {
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

export function copyPreparedWorkspace(t: any, name: any = 'workspace-foundation'): any  {
  return foundation(acquire(t, WORKSPACE_FOUNDATION_CONTEXT_KEY, name));
}

export function copyPreparedProjectWorkspace(t: any, name: any = 'project-foundation'): any  {
  return foundation(acquire(t, PROJECT_FOUNDATION_CONTEXT_KEY, name));
}

export function copyPreparedLegacyWorkspace(t: any, name: any = 'legacy-workspace-foundation'): any {
  const prepared = copyPreparedWorkspace(t, name);
  useLegacyAssetCatalog(prepared.root);
  return prepared;
}

export function copyPreparedLegacyProjectWorkspace(t: any, name: any = 'legacy-project-foundation'): any {
  const prepared = copyPreparedProjectWorkspace(t, name);
  useLegacyAssetCatalog(prepared.root);
  createRuntime().createProjectAsset({ targetRoot: prepared.root, project: 'demo', repoRef: null, attachRef: null, name: null, description: null, remote: 'origin', remoteExplicit: false, integrationBranch: null });
  return prepared;
}

export function copyPreparedGitRepository(t: any, name: any = 'git-repository'): any  {
  const prepared: any = foundation(acquire(t, GIT_REPOSITORY_CONTEXT_KEY, name));
  return Object.freeze({
    ...prepared,
    remote: path.join(prepared.root, 'repository.git'),
    attached: path.join(prepared.root, 'attached'),
  });
}
