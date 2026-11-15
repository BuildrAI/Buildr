import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {main} from '../src/cli.ts';

test('help and version never create a profile or start a shared process', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-cli-readonly-'));
  const profile = path.join(root, 'uncreated-profile'), previous = process.env.BUILDR_APP_DATA_DIR;
  process.env.BUILDR_APP_DATA_DIR = profile;
  const output: unknown[] = [], log = console.log;
  console.log = value => {output.push(value);};
  t.after(() => {console.log = log; if (previous === undefined) delete process.env.BUILDR_APP_DATA_DIR; else process.env.BUILDR_APP_DATA_DIR = previous; fs.rmSync(root, {recursive: true, force: true});});
  await main(['--help']); await main(['--version']);
  assert.match(String(output[0]), /Buildr Harness/u);
  assert.match(String(output[0]), /distribution-check/u);
  assert.equal(output[1], JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../package.json'), 'utf8')).version);
  assert.equal(fs.existsSync(profile), false);
});
test('unsupported host is rejected by the bin before loading the compiled runtime', () => {
  const entry = path.resolve(import.meta.dirname, '../bin/buildr-harness.mjs');
  const result = spawnSync(process.execPath, ['--input-type=module', '-e',
    `Object.defineProperty(process.versions,'node',{value:'18.20.0'});process.argv=[process.execPath,${JSON.stringify(entry)},'--help'];await import(${JSON.stringify(pathToFileURL(entry).href)});`],
  {encoding: 'utf8', timeout: 10000});
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stderr.trim()).code, 'harness_host_node_unsupported');
});
