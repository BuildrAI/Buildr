import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { recordDesktopActivation } from '../src/desktop-activation.ts';

test('development host writes a private load receipt and never removes a newer one', { skip: process.platform === 'win32' }, t => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-dsh-activation-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const oldHome = process.env.DSH_HOME;
  const oldNonce = process.env.BUILDR_HARNESS_DSH_LAUNCH_NONCE;
  t.after(() => {
    if (oldHome === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = oldHome;
    if (oldNonce === undefined) delete process.env.BUILDR_HARNESS_DSH_LAUNCH_NONCE; else process.env.BUILDR_HARNESS_DSH_LAUNCH_NONCE = oldNonce;
  });
  process.env.DSH_HOME = root;
  const state = path.join(root, 'agent-service'); fs.mkdirSync(state);
  const entry = path.join(root, 'index.js'); fs.writeFileSync(entry, 'loaded entry');
  const input = { node:process.execPath, packageRoot:root, dataRoot:root, port:'9519', entry };
  const receipt = path.join(state, 'dsh-development-desktop.json');
  process.env.BUILDR_HARNESS_DSH_LAUNCH_NONCE = 'a'.repeat(32);
  const first = recordDesktopActivation(input); assert.ok(first);
  assert.equal(fs.statSync(receipt).mode & 0o777, 0o600);
  const observed = JSON.parse(fs.readFileSync(receipt, 'utf8'));
  assert.equal(observed.desktopPid, process.ppid);
  assert.equal(observed.hostPid, process.pid);
  assert.equal(observed.entryDigest, createHash('sha256').update('loaded entry').digest('hex'));
  process.env.BUILDR_HARNESS_DSH_LAUNCH_NONCE = 'b'.repeat(32);
  const second = recordDesktopActivation(input); assert.ok(second);
  first();
  assert.equal(JSON.parse(fs.readFileSync(receipt, 'utf8')).nonce, 'b'.repeat(32));
  second(); assert.equal(fs.existsSync(receipt), false);
});
