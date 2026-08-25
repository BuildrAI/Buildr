import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const DRIVER = path.resolve(import.meta.dirname, '../../src/task/interfaces/internal/task-development-driver.mjs');
const RUNNER = path.resolve(import.meta.dirname, '../../src/task/interfaces/internal/task-development-driver-runner.mjs');

function run(args, expectedStatus = 0) {
  const result = spawnSync(process.execPath, [DRIVER, ...args], { encoding: 'utf8' });
  assert.equal(result.status, expectedStatus, result.stderr);
  return result;
}

test('全局与action帮助无需Task或Workspace', () => {
  const global = JSON.parse(run(['--help']).stdout);
  assert.equal(global.schemaVersion, 'buildr.task-development-driver-help/v1');
  assert.equal(global.action, null);
  assert.deepEqual(global.actions.map((item) => item.action), ['inspect', 'discover', 'begin', 'planning', 'observe', 'policy', 'knowledge', 'gate', 'freeze', 'decide', 'handoff', 'carrier']);
  assert.deepEqual(global.discovery, ['--help', '<action> --help', '<action> --schema', '<action> --example']);
  assert.match(global.usage, /--compact \| --profile/);

  const action = JSON.parse(run(['planning', '--help']).stdout);
  assert.equal(action.action, 'planning');
  assert.match(action.summary, /planning snapshot/);
  assert.deepEqual(action.discovery, ['planning --schema', 'planning --example']);
});

test('schema与example输出closed input contract', () => {
  const schema = JSON.parse(run(['planning', '--schema']).stdout);
  assert.equal(schema.schemaVersion, 'buildr.task-development-driver-schema/v1');
  assert.equal(schema.inputSchema.additionalProperties, false);
  assert.deepEqual(Object.keys(schema.inputSchema.properties), ['changeDispositions', 'planning', 'planningGate']);
  assert.deepEqual(schema.inputSchema.required, ['changeDispositions', 'planning']);

  const example = JSON.parse(run(['planning', '--example']).stdout);
  assert.equal(example.schemaVersion, 'buildr.task-development-driver-example/v1');
  assert.deepEqual(example.inputJson, { changeDispositions: [], planning: { targetIdentity: null, nodes: [] } });
  assert.deepEqual(JSON.parse(run(['inspect', '--example']).stdout).inputJson, {});
  const discover = JSON.parse(run(['discover', '--schema']).stdout);
  assert.deepEqual(discover.inputSchema.required, ['action']);
  assert.deepEqual(discover.inputSchema.properties.action.enum, ['observe', 'policy']);
  assert.deepEqual(JSON.parse(run(['discover', '--example']).stdout).inputJson, { action: 'observe' });

  const carrier = JSON.parse(run(['carrier', '--schema']).stdout);
  assert.deepEqual(carrier.inputSchema.required, ['handoffIdentity', 'candidateIdentity', 'candidateGeneration', 'contentTargetIdentity']);
  assert.equal(carrier.inputSchema.properties.candidateGeneration.minimum, 1);
  assert.deepEqual(Object.keys(JSON.parse(run(['carrier', '--example']).stdout).inputJson), ['handoffIdentity', 'candidateIdentity', 'candidateGeneration', 'contentTargetIdentity']);
});

test('发现路径在runtime dynamic import前返回', () => {
  const source = fs.readFileSync(RUNNER, 'utf8');
  const discoveryExit = source.indexOf('if (discoveryFlags.length === 1)');
  const runtimeImport = source.indexOf("await import('../../../bootstrap/runtime.mjs')");
  assert.equal(discoveryExit >= 0, true);
  assert.equal(runtimeImport > discoveryExit, true);
  const result = run(['policy', '--schema']);
  assert.equal(result.stderr, '');
});

test('未知、缺失或歧义发现请求失败关闭', () => {
  for (const args of [['unknown', '--schema'], ['--schema'], ['begin', '--schema', '--example']]) {
    const result = run(args, 2);
    assert.equal(result.stdout, '');
    const error = JSON.parse(result.stderr);
    assert.equal(error.schemaVersion, 'buildr.task-development-driver-error/v1');
    assert.equal(error.diagnostic.code, 'task_development_driver_usage_invalid');
  }
});
