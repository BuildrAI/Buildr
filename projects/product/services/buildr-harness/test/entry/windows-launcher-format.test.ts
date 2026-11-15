import test from 'node:test';
import assert from 'node:assert/strict';
import {windowsHarnessArguments, windowsHarnessRunner} from '../../src/windows-launcher.ts';

test('Windows wrapper is UTF-8 BOM/CRLF, binds explicit Node and entry without command-string evaluation', () => {
  const script = windowsHarnessRunner();
  assert.ok(script.startsWith('\uFEFF'));
  assert.doesNotMatch(script.replaceAll('\r\n', ''), /\n/u);
  assert.match(script, /Get-Content -LiteralPath \$bindingFile/u);
  assert.match(script, /& \$binding\.node \$binding\.entry web --launcher-binding \$bindingFile/u);
  assert.doesNotMatch(script, /Invoke-Expression|cmd\.exe|npm|Stop-Process/u);
  assert.equal(windowsHarnessArguments('C:\\应用目录\\Harness\\runner.ps1'), '-NoProfile -NonInteractive -WindowStyle Hidden -File "C:\\应用目录\\Harness\\runner.ps1"');
  assert.throws(() => windowsHarnessArguments('C:\\bad"\npath'), {code: 'harness_launcher_identity_invalid'});
});
