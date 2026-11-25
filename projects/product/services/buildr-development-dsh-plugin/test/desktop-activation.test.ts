import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { recordDesktopActivation } from '../src/desktop-activation.ts';

test('development host writes a private load receipt and never removes a newer one', { skip: process.platform === 'win32' }, t => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-dev-dsh-activation-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const oldNonce = process.env.BUILDR_DEVELOPMENT_DSH_LAUNCH_NONCE;
  t.after(() => {
    if (oldNonce === undefined) delete process.env.BUILDR_DEVELOPMENT_DSH_LAUNCH_NONCE;
    else process.env.BUILDR_DEVELOPMENT_DSH_LAUNCH_NONCE = oldNonce;
  });
  const entry = path.join(root, 'index.js');
  fs.writeFileSync(entry, 'loaded development entry');
  const input = { node: process.execPath, packageRoot: root, dataRoot: root, port: '4458', entry };
  const receipt = path.join(root, 'dsh-desktop', 'dsh-development-web-desktop.json');
  process.env.BUILDR_DEVELOPMENT_DSH_LAUNCH_NONCE = 'a'.repeat(32);
  const first = recordDesktopActivation(input);
  assert.ok(first);
  assert.equal(fs.statSync(receipt).mode & 0o777, 0o600);
  const observed = JSON.parse(fs.readFileSync(receipt, 'utf8'));
  assert.equal(observed.schemaVersion, 'buildr.dsh-development-web-desktop/v1');
  assert.equal(observed.desktopPid, process.ppid);
  assert.equal(observed.hostPid, process.pid);
  assert.equal(observed.port, '4458');
  assert.equal(observed.entryDigest, createHash('sha256').update('loaded development entry').digest('hex'));
  process.env.BUILDR_DEVELOPMENT_DSH_LAUNCH_NONCE = 'b'.repeat(32);
  const second = recordDesktopActivation(input);
  assert.ok(second);
  first();
  assert.equal(JSON.parse(fs.readFileSync(receipt, 'utf8')).nonce, 'b'.repeat(32));
  second();
  assert.equal(fs.existsSync(receipt), false);
});
