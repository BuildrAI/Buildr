import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseHarnessDirectory} from '../../src/process/directory-picker.ts';

test('macOS chooser uses fixed native arguments and a finite timeout without a shell', async () => {
  const selected = await chooseHarnessDirectory('darwin', async (command, args, options) => {
    assert.equal(command, '/usr/bin/osascript');
    assert.match(args.join('\n'), /choose folder/);
    assert.match(args.join('\n'), /-128/);
    assert.equal(options.timeout, 120000);
    assert.equal('shell' in options, false);
    return {stdout: '/Users/example/工作目录/\n'};
  });
  assert.equal(selected, '/Users/example/工作目录/');
});
test('cancel returns no path and unsupported platforms never launch a process', async () => {
  assert.equal(await chooseHarnessDirectory('darwin', async () => ({stdout: '\n'})), null);
  await assert.rejects(chooseHarnessDirectory('linux', async () => {throw new Error('must not run');}), {code: 'agent_directory_picker_unsupported'});
});
test('Windows chooser returns absolute directory and failures do not become a selection', async () => {
  assert.equal(await chooseHarnessDirectory('win32', async (command, args) => {
    assert.equal(command, 'powershell.exe');
    assert.ok(args.includes('-STA'));
    return {stdout: 'C:\\Work\\项目\r\n'};
  }), 'C:\\Work\\项目');
  await assert.rejects(chooseHarnessDirectory('darwin', async () => {throw new Error('timeout');}), {code: 'agent_directory_picker_failed'});
  await assert.rejects(chooseHarnessDirectory('darwin', async () => ({stdout: 'relative'})), {code: 'agent_directory_picker_failed'});
});
