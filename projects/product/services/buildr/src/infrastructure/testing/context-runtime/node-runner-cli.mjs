#!/usr/bin/env node

import process from 'node:process';

import { runNodeTestContextHosts } from './node-runner.mjs';

function option(args, name, fallback = null) {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`Missing value for ${name}`);
  args.splice(index, 2);
  return value;
}

try {
  const args = process.argv.slice(2);
  const workers = Number.parseInt(option(args, '--workers', '1'), 10);
  const cwd = option(args, '--cwd', process.cwd());
  if (args.some((item) => item.startsWith('--'))) throw new Error(`Unknown option: ${args.find((item) => item.startsWith('--'))}`);
  const result = await runNodeTestContextHosts({ cwd, workers, files: args });
  for (const host of result.hosts) {
    process.stdout.write(`# Context Worker Host ${host.host}: ${host.files.length} file(s)\n`);
    process.stdout.write(host.stdout);
    process.stderr.write(host.stderr);
  }
  const count = (operation) => result.events.filter((event) => event.operation === operation).length;
  const duration = (operation) => result.events.filter((event) => event.operation === operation).reduce((total, event) => total + (event.durationMs ?? 0), 0);
  const summary = {
    schemaVersion: 'node.test-context-summary/v1',
    hosts: result.workerCount,
    creates: count('create'),
    cacheHits: count('cache-hit'),
    acquires: count('acquire'),
    releases: count('release'),
    resets: count('reset'),
    dirty: count('dirty'),
    destroys: count('destroy'),
    waits: count('wait'),
    materializeDurationMs: duration('provider-materialize'),
    cleanupDurationMs: duration('provider-cleanup'),
    testBodyDurationMs: duration('test-body'),
    durationMs: result.durationMs,
  };
  process.stdout.write(`# node-test-context-summary ${JSON.stringify(summary)}\n`);
  process.exitCode = result.status === 'passed' ? 0 : 1;
} catch (error) {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 2;
}
