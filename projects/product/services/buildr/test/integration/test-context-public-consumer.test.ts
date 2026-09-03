import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const serviceRoot: any = path.resolve(import.meta.dirname, '../..');
const fixtureRoot: any = path.join(serviceRoot, 'test/fixtures/test-context-consumer');
const node: any = process.execPath;
const tsc: any = path.join(serviceRoot, 'node_modules/typescript/bin/tsc');

test('checkout Test Context facade runs for JavaScript and strict external TypeScript consumers', () => {
  const runtime: any = spawnSync(node, [path.join(fixtureRoot, 'runtime.mjs')], { cwd: serviceRoot, encoding: 'utf8' });
  assert.equal(runtime.status, 0, `${runtime.stdout}\n${runtime.stderr}`);

  const types: any = spawnSync(node, [tsc, '--project', path.join(fixtureRoot, 'tsconfig.json')], { cwd: serviceRoot, encoding: 'utf8' });
  assert.equal(types.status, 0, `${types.stdout}\n${types.stderr}`);
});

test('generated Test Context projection is current and contains no raw TypeScript runtime dependency', () => {
  const check: any = spawnSync(node, [path.join(serviceRoot, 'tools/testing/test-context-build.ts'), 'check'], { cwd: serviceRoot, encoding: 'utf8' });
  assert.equal(check.status, 0, `${check.stdout}\n${check.stderr}`);
  const generatedRoot: any = path.join(serviceRoot, 'package/targets/test-context');
  const files: any = fs.readdirSync(generatedRoot).sort();
  assert.equal(files.some((file: any) => file.endsWith('.ts') && !file.endsWith('.d.ts')), false);
  for (const file of files.filter((candidate: any) => candidate.endsWith('.js'))) {
    assert.equal(fs.readFileSync(path.join(generatedRoot, file), 'utf8').includes("from './src/"), false, file);
    assert.equal(fs.readFileSync(path.join(generatedRoot, file), 'utf8').includes('.ts\''), false, file);
  }
});
