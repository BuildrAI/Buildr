import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { createTestContextRuntime } from '../../test-context.mjs';
import {
  buildrApplicationContext,
  buildrWorkspaceContext,
} from '../context/providers/task-application.mjs';

test('Buildr Application Context restores descriptors and reuses one worker assembly', async () => {
  const runtime = createTestContextRuntime();
  try {
    const first = await runtime.acquire({ application: buildrApplicationContext }, { testId: 'application-first' });
    const application = first.values.application;
    const original = application.inspectTaskRecord;
    application.inspectTaskRecord = () => ({ injected: true });
    application.transientTestProperty = 'must-be-removed';
    await first.release({ outcome: 'passed' });

    const second = await runtime.acquire({ application: buildrApplicationContext }, { testId: 'application-second' });
    assert.equal(second.values.application, application);
    assert.equal(second.values.application.inspectTaskRecord, original);
    assert.equal(Object.hasOwn(second.values.application, 'transientTestProperty'), false);
    await second.release({ outcome: 'passed' });

    assert.equal(runtime.events().filter((event) => event.operation === 'create').length, 1);
    assert.equal(runtime.events().filter((event) => event.operation === 'cache-hit').length, 1);
  } finally {
    await runtime.close();
  }
});

test('dirty Buildr Application lease is evicted before the next test', async () => {
  const runtime = createTestContextRuntime();
  try {
    const first = await runtime.acquire({ application: buildrApplicationContext }, { testId: 'dirty-first' });
    const firstApplication = first.values.application;
    first.markDirty('application', 'injected-provider-drift');
    await first.release({ outcome: 'failed' });

    const second = await runtime.acquire({ application: buildrApplicationContext }, { testId: 'dirty-second' });
    assert.notEqual(second.values.application, firstApplication);
    await second.release({ outcome: 'passed' });
    assert.equal(runtime.events().some((event) => event.operation === 'evict' && event.reason === 'injected-provider-drift'), true);
  } finally {
    await runtime.close();
  }
});

test('Buildr Workspace Context materializes isolated sandboxes and cleans failed leases', async () => {
  const runtime = createTestContextRuntime();
  let firstRoot;
  try {
    const first = await runtime.acquire({ workspace: buildrWorkspaceContext }, { testId: 'workspace-first' });
    firstRoot = first.values.workspace.root;
    assert.equal(fs.statSync(firstRoot).isDirectory(), true);
    fs.writeFileSync(`${firstRoot}/context-failure-marker`, 'dirty sandbox only\n');
    await first.release({ outcome: 'failed' });
    assert.equal(fs.existsSync(firstRoot), false);

    const second = await runtime.acquire({ workspace: buildrWorkspaceContext }, { testId: 'workspace-second' });
    assert.notEqual(second.values.workspace.root, firstRoot);
    assert.equal(fs.existsSync(`${second.values.workspace.root}/context-failure-marker`), false);
    await second.release({ outcome: 'passed' });
    assert.equal(fs.existsSync(second.values.workspace.root), false);

    const operations = runtime.events().map((event) => event.operation);
    assert.equal(operations.includes('provider-materialize'), true);
    assert.equal(operations.includes('provider-cleanup'), true);
  } finally {
    await runtime.close();
    if (firstRoot) assert.equal(fs.existsSync(firstRoot), false);
  }
});
