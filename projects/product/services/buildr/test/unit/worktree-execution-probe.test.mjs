import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { probeTaskEnvironmentExecutionCli } from '../../src/application/worktree/worktree-application.mjs';

test('executionReady probe 不把存在但缺少运行依赖的 checkout CLI 判为可执行', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-cli-probe-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const broken = path.join(root, 'broken.mjs');
  fs.writeFileSync(broken, "import 'buildr-deliberately-missing-package';\n");
  const failed = probeTaskEnvironmentExecutionCli({ invocation: { command: process.execPath, argsPrefix: [broken] } }, root);
  assert.equal(failed.status, 'failed');
  assert.notEqual(failed.exitCode, 0);
  assert.match(failed.diagnostic.message, /buildr-deliberately-missing-package|ERR_MODULE_NOT_FOUND/);

  const ready = path.join(root, 'ready.mjs');
  fs.writeFileSync(ready, "process.stdout.write(JSON.stringify({version:'9.9.9'}));\n");
  const passed = probeTaskEnvironmentExecutionCli({ invocation: { command: process.execPath, argsPrefix: [ready] } }, root);
  assert.deepEqual({ status: passed.status, exitCode: passed.exitCode, version: passed.version }, { status: 'passed', exitCode: 0, version: '9.9.9' });
});
