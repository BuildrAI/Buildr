import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {buildSync} from 'esbuild';
import {spawnSync} from 'node:child_process';

test('the pre-version workspace router does not bundle or initialize the Harness execution process', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-router-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const serviceRoot = path.resolve(import.meta.dirname, '../..'), output = path.join(root, 'router.cjs');
  const result = buildSync({
    absWorkingDir: serviceRoot,
    entryPoints: ['src/modules/installation/application/workspace-cli-routing.ts'],
    outfile: output, bundle: true, platform: 'node', format: 'cjs', target: 'node18',
    external: ['node:*'], metafile: true, logLevel: 'silent',
  });
  assert.equal(result.warnings.length, 0);
  assert.equal(Object.keys(result.metafile!.inputs).some(file => /buildr-agent\/build\/(?:process|application|model-access)\//u.test(file)), false);
  const loaded = spawnSync(process.execPath, ['-e', 'require(process.argv[1])', output], {cwd: root, encoding: 'utf8', timeout: 10000});
  assert.equal(loaded.status, 0, loaded.stderr);
});
