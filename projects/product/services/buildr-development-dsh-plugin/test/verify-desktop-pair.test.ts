import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { parseVerifyDesktopPairArgs } from '../tools/verify-desktop-pair.ts';

test('verify-desktop-pair CLI exposes --help without side effects and parses pair arguments cleanly', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-dev-desktop-pair-help-'));
  try {
    const tool = path.resolve(import.meta.dirname, '../tools/verify-desktop-pair.ts');
    const result = spawnSync(process.execPath, [tool, '--help'], { cwd: dir, encoding: 'utf8', timeout: 15_000 });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /--buildr-tarball/);
    assert.match(result.stdout, /--plugin-dir/);
    assert.deepEqual(fs.readdirSync(dir), []);

    const parsed = parseVerifyDesktopPairArgs([
      '--buildr-tarball', '/tmp/buildr.tgz',
      '--plugin-dir', '/tmp/p',
      '--buildr-version', '0.1.0-rc.67',
      '--buildr-integrity', 'sha512-abc==',
      '--summary', '/tmp/s.json',
    ]);
    assert.equal(parsed.help, false);
    assert.equal(parsed.buildrTarball, path.resolve('/tmp/buildr.tgz'));
    assert.equal(parsed.pluginDir, path.resolve('/tmp/p'));
    assert.equal(parsed.buildrVersion, '0.1.0-rc.67');
    assert.equal(parsed.buildrIntegrity, 'sha512-abc==');
    assert.equal(parsed.outputFile, path.resolve('/tmp/p/verification.json'));
    assert.equal(parsed.summaryFile, path.resolve('/tmp/s.json'));

    assert.throws(() => parseVerifyDesktopPairArgs(['--buildr-tarball', '/tmp/buildr.tgz']), /required/);
    assert.throws(() => parseVerifyDesktopPairArgs(['--unknown', '1']), /Unknown option/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
