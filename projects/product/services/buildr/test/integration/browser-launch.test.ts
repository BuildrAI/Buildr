import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const serviceRoot = path.resolve(import.meta.dirname, '../..');

test('缺少配套 Chromium 时指出准备入口，不下载或改用本机浏览器', (t) => {
  const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-browser-missing-'));
  t.after(() => fs.rmSync(cache, { recursive: true, force: true }));
  const env: NodeJS.ProcessEnv = { ...process.env, PLAYWRIGHT_BROWSERS_PATH: cache };
  delete env.BUILDR_BROWSER_EXECUTABLE;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', "import { launchTestBrowser } from './test/browser-smoke/browser-launch.ts'; await launchTestBrowser();"], {
    cwd: serviceRoot, env, encoding: 'utf8', timeout: 15_000,
  });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /缺少当前 Playwright 版本配套的 Chromium/);
  assert.match(result.stderr, /test:browser:install/);
  assert.deepEqual(fs.readdirSync(cache), []);
});

test('显式浏览器路径无效时保留具体错误，不静默回退', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-browser-override-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const executable of ['', root, path.join(root, 'missing-browser')]) {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', "import { launchTestBrowser } from './test/browser-smoke/browser-launch.ts'; await launchTestBrowser();"], {
      cwd: serviceRoot, env: { ...process.env, BUILDR_BROWSER_EXECUTABLE: executable }, encoding: 'utf8', timeout: 15_000,
    });
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, executable ? /BUILDR_BROWSER_EXECUTABLE 不是可执行文件/ : /BUILDR_BROWSER_EXECUTABLE 不能为空/);
    assert.doesNotMatch(result.stderr, /test:browser:install/);
  }
});
