import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { runNodeTestContextHosts } from '../../test-context.mjs';

const serviceRoot: any = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fixture: any = (name: any) => path.join(serviceRoot, 'test/fixtures/node-test-context', name);

test('one persistent Host reuses a worker Context across two node:test files', async () => {
  const result: any = await runNodeTestContextHosts({
    cwd: serviceRoot,
    workers: 1,
    files: [fixture('host-first.fixture.mjs'), fixture('host-second.fixture.mjs')],
  });
  assert.equal(result.status, 'passed', result.hosts.map((host: any) => host.stderr || host.stdout).join('\n'));
  assert.equal(result.workerCount, 1);
  assert.equal(result.events.filter((event: any) => event.operation === 'create').length, 1);
  assert.equal(result.events.filter((event: any) => event.operation === 'cache-hit').length, 1);
  assert.equal(result.events.filter((event: any) => event.operation === 'runtime-close').length, 1);
});

test('worker grant bounds parallel Hosts and each Host owns its cache', async () => {
  const result: any = await runNodeTestContextHosts({
    cwd: serviceRoot,
    workers: 2,
    files: [fixture('host-first.fixture.mjs'), fixture('host-second.fixture.mjs')],
  });
  assert.equal(result.status, 'passed', result.hosts.map((host: any) => host.stderr || host.stdout).join('\n'));
  assert.equal(result.workerCount, 2);
  assert.equal(result.events.filter((event: any) => event.operation === 'create').length, 2);
  assert.equal(new Set(result.events.filter((event: any) => event.operation === 'create').map((event: any) => event.pid)).size, 2);
});

test('a failing Host makes the aggregate fail without hiding other Host results', async () => {
  const result: any = await runNodeTestContextHosts({
    cwd: serviceRoot,
    workers: 2,
    files: [fixture('host-first.fixture.mjs'), fixture('host-failure.fixture.mjs')],
  });
  assert.equal(result.status, 'failed');
  assert.equal(result.hosts.filter((host: any) => host.status === 'failed').length, 1);
  assert.equal(result.hosts.filter((host: any) => host.status === 'passed').length, 1);
  assert.match(result.hosts.find((host: any) => host.status === 'failed').stdout, /intentional host fixture failure/);
});
