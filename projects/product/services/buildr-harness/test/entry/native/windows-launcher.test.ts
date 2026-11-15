import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {installHarnessLauncher, readHarnessLauncher, uninstallHarnessLauncher} from '../../../src/launcher.ts';

test('native Windows shortcut executes its exact Node/entry and owned uninstall retains data', {skip: process.platform !== 'win32', timeout: 45000}, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-windows-native-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const entry = path.join(root, 'entry.mjs'), output = path.join(root, 'invocations.txt');
  const target = path.join(root, 'Buildr Harness.lnk'), dataRoot = path.join(root, 'profile');
  fs.mkdirSync(dataRoot); fs.writeFileSync(path.join(dataRoot, 'history'), 'preserved');
  fs.writeFileSync(entry, `import fs from 'node:fs';import {verifyHarnessLauncherFile} from ${JSON.stringify(pathToFileURL(path.resolve(import.meta.dirname, '../../../../src/launcher.ts')).href)};\nconst binding=verifyHarnessLauncherFile(process.argv[4],process.argv[1]);if(binding.dataRoot!==${JSON.stringify(dataRoot)})throw Error('wrong domain');fs.appendFileSync(${JSON.stringify(output)},'verified\\n');\n`);
  installHarnessLauncher({target, entry, dataRoot, profile: 'released'});
  assert.equal(readHarnessLauncher(target)?.binding.platform, 'win32');
  const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
  for (let count = 1; count <= 2; count++) {
    const launched = spawnSync(powershell, ['-NoProfile', '-NonInteractive', '-Command', 'Start-Process -FilePath $env:BUILDR_HARNESS_SHORTCUT -Wait'], {
      env: {...process.env, BUILDR_HARNESS_SHORTCUT: target, BUILDR_LAUNCHER_NO_NOTIFY: '1'}, encoding: 'utf8', timeout: 15000,
    });
    assert.equal(launched.status, 0, launched.stderr);
    const deadline = Date.now() + 10000;
    while (!fs.existsSync(output) || fs.readFileSync(output, 'utf8').trim().split('\n').length < count) {
      if (Date.now() > deadline) assert.fail('native shortcut entry did not produce a verified invocation');
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
  assert.equal(uninstallHarnessLauncher(target).status, 'removed');
  assert.equal(fs.readFileSync(path.join(dataRoot, 'history'), 'utf8'), 'preserved');
});
