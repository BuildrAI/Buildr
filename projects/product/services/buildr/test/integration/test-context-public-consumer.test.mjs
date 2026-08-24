import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const serviceRoot = path.resolve(import.meta.dirname, '../..');
const fixtureRoot = path.join(serviceRoot, 'test/fixtures/test-context-consumer');
const node = process.execPath;
const tsc = path.join(serviceRoot, 'node_modules/typescript/bin/tsc');

test('checkout Test Context facade runs for JavaScript and strict external TypeScript consumers', () => {
  const runtime = spawnSync(node, [path.join(fixtureRoot, 'runtime.mjs')], { cwd: serviceRoot, encoding: 'utf8' });
  assert.equal(runtime.status, 0, `${runtime.stdout}\n${runtime.stderr}`);

  const types = spawnSync(node, [tsc, '--project', path.join(fixtureRoot, 'tsconfig.json')], { cwd: serviceRoot, encoding: 'utf8' });
  assert.equal(types.status, 0, `${types.stdout}\n${types.stderr}`);
});

test('generated Test Context projection is current and contains no raw TypeScript runtime dependency', () => {
  const check = spawnSync(node, [path.join(serviceRoot, 'tools/testing/test-context-build.mjs'), 'check'], { cwd: serviceRoot, encoding: 'utf8' });
  assert.equal(check.status, 0, `${check.stdout}\n${check.stderr}`);
  const generatedRoot = path.join(serviceRoot, 'package/targets/test-context');
  const files = fs.readdirSync(generatedRoot).sort();
  assert.equal(files.some((file) => file.endsWith('.ts') && !file.endsWith('.d.ts')), false);
  for (const file of files.filter((candidate) => candidate.endsWith('.js'))) {
    assert.equal(fs.readFileSync(path.join(generatedRoot, file), 'utf8').includes("from './src/"), false, file);
    assert.equal(fs.readFileSync(path.join(generatedRoot, file), 'utf8').includes('.ts\''), false, file);
  }
});
