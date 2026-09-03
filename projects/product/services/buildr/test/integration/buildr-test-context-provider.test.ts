import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { createTestContextRuntime } from '../../test-context.mjs';
import {
  createGitRepositoryContextProvider,
  createProjectFoundationContextProvider,
  createWorkspaceFoundationContextProvider,
} from '../context/providers/prepared-fixtures.ts';
import { createTestContextPool } from '../context/runtime.ts';
import {
  buildrApplicationContext,
  buildrWorkspaceContext,
} from '../context/providers/task-application.ts';

test('Buildr Application Context restores descriptors and reuses one worker assembly', async () => {
  const runtime: any = createTestContextRuntime();
  try {
    const first: any = await runtime.acquire({ application: buildrApplicationContext }, { testId: 'application-first' });
    const application: any = first.values.application;
    const original: any = application.inspectTaskRecord;
    application.inspectTaskRecord = () => ({ injected: true });
    application.transientTestProperty = 'must-be-removed';
    await first.release({ outcome: 'passed' });

    const second: any = await runtime.acquire({ application: buildrApplicationContext }, { testId: 'application-second' });
    assert.equal(second.values.application, application);
    assert.equal(second.values.application.inspectTaskRecord, original);
    assert.equal(Object.hasOwn(second.values.application, 'transientTestProperty'), false);
    await second.release({ outcome: 'passed' });

    assert.equal(runtime.events().filter((event: any) => event.operation === 'create').length, 1);
    assert.equal(runtime.events().filter((event: any) => event.operation === 'cache-hit').length, 1);
  } finally {
    await runtime.close();
  }
});

test('dirty Buildr Application lease is evicted before the next test', async () => {
  const runtime: any = createTestContextRuntime();
  try {
    const first: any = await runtime.acquire({ application: buildrApplicationContext }, { testId: 'dirty-first' });
    const firstApplication: any = first.values.application;
    first.markDirty('application', 'injected-provider-drift');
    await first.release({ outcome: 'failed' });

    const second: any = await runtime.acquire({ application: buildrApplicationContext }, { testId: 'dirty-second' });
    assert.notEqual(second.values.application, firstApplication);
    await second.release({ outcome: 'passed' });
    assert.equal(runtime.events().some((event: any) => event.operation === 'evict' && event.reason === 'injected-provider-drift'), true);
  } finally {
    await runtime.close();
  }
});

test('Buildr Workspace Context materializes isolated sandboxes and cleans failed leases', async () => {
  const runtime: any = createTestContextRuntime();
  let firstRoot: any;
  try {
    const first: any = await runtime.acquire({ workspace: buildrWorkspaceContext }, { testId: 'workspace-first' });
    firstRoot = first.values.workspace.root;
    assert.equal(fs.statSync(firstRoot).isDirectory(), true);
    fs.writeFileSync(`${firstRoot}/context-failure-marker`, 'dirty sandbox only\n');
    await first.release({ outcome: 'failed' });
    assert.equal(fs.existsSync(firstRoot), false);

    const second: any = await runtime.acquire({ workspace: buildrWorkspaceContext }, { testId: 'workspace-second' });
    assert.notEqual(second.values.workspace.root, firstRoot);
    assert.equal(fs.existsSync(`${second.values.workspace.root}/context-failure-marker`), false);
    await second.release({ outcome: 'passed' });
    assert.equal(fs.existsSync(second.values.workspace.root), false);

    const operations: any = runtime.events().map((event: any) => event.operation);
    assert.equal(operations.includes('provider-materialize'), true);
    assert.equal(operations.includes('provider-cleanup'), true);
  } finally {
    await runtime.close();
    if (firstRoot) assert.equal(fs.existsSync(firstRoot), false);
  }
});

test('Prepared Workspace and Project foundations prepare once and isolate every sandbox', () => {
  const providers: any[] = [createWorkspaceFoundationContextProvider(), createProjectFoundationContextProvider()];
  const pool: any = createTestContextPool({ providers, env: {} });
  try {
    const prepared: any = providers.map((provider: any) => pool.prepare(provider.key));
    assert.deepEqual(prepared.map((context: any) => context.marker.providerData), [
      { workspaceInitialized: true },
      { workspaceInitialized: true, projectCode: 'demo' },
    ]);
    for (const provider of providers) assert.equal(pool.prepare(provider.key), prepared.find((context: any) => context.provider.key === provider.key));

    const first: any = pool.acquire(providers[0].key, { name: 'foundation-first' });
    const second: any = pool.acquire(providers[0].key, { name: 'foundation-second' });
    fs.writeFileSync(path.join(first.root, 'first-only.txt'), 'isolated\n');
    assert.equal(fs.existsSync(path.join(second.root, 'first-only.txt')), false);
    first.release();
    second.release();

    const project: any = pool.acquire(providers[1].key, { name: 'project-foundation' });
    assert.equal(fs.statSync(path.join(project.root, 'projects', 'demo')).isDirectory(), true);
    project.release();
    assert.equal(pool.events().filter((event: any) => event.operation === 'prepare').length, 2);
  } finally {
    pool.cleanup();
  }
});

test('Prepared Git repositories expose independent remotes and working clones', () => {
  const provider: any = createGitRepositoryContextProvider();
  const pool: any = createTestContextPool({ providers: [provider], env: {} });
  const git: any = (cwd: any, args: any) => {
    const result: any = spawnSync('git', args, { cwd, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    return result.stdout.trim();
  };
  try {
    const first: any = pool.acquire(provider.key, { name: 'git-first' });
    const second: any = pool.acquire(provider.key, { name: 'git-second' });
    const firstRemote: any = path.join(first.root, 'repository.git');
    const secondRemote: any = path.join(second.root, 'repository.git');
    const firstClone: any = path.join(first.root, 'attached');
    const secondClone: any = path.join(second.root, 'attached');
    const baseline: any = git(secondClone, ['rev-parse', 'HEAD']);

    fs.writeFileSync(path.join(firstClone, 'first-only.txt'), 'independent\n');
    git(firstClone, ['add', 'first-only.txt']);
    git(firstClone, ['commit', '-m', 'advance first repository']);
    git(firstClone, ['push', 'origin', 'dev']);

    assert.notEqual(git(firstRemote, ['rev-parse', 'refs/heads/dev']), baseline);
    assert.equal(git(secondRemote, ['rev-parse', 'refs/heads/dev']), baseline);
    assert.equal(fs.existsSync(path.join(secondClone, 'first-only.txt')), false);
    first.release();
    second.release();
  } finally {
    pool.cleanup();
  }
});
