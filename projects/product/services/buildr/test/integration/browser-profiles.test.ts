import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { BrowserProfiles } from '../../src/modules/browser-authorization/persistence/profiles.ts';
import { assertProfileAvailable } from '../../src/modules/browser-authorization/infrastructure/browser.ts';
import { spawn } from 'node:child_process';
function fixture(t: any) { const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-browser-profile-'))); t.after(() => fs.rmSync(root, { recursive: true, force: true })); return new BrowserProfiles(root); }
test('explicit adoption retains existing login data and path, rejects duplicate and overlapping ownership', t => {
  const profiles = fixture(t), relative = '.buildr/local/legacy/provider';
  fs.mkdirSync(path.join(profiles.root, relative), { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(profiles.root, relative, 'fixture-cookie'), 'preserve', { mode: 0o600 });
  const result = profiles.create('personal', 'absent', relative);
  assert.equal(result.profile!.directory, relative);
  assert.equal(fs.readFileSync(path.join(profiles.root, relative, 'fixture-cookie'), 'utf8'), 'preserve');
  assert.throws(() => profiles.create('other', 'absent', relative), { code: 'browser_authorization_profile_owned' });
  assert.throws(() => profiles.create('other', 'absent', '.buildr/local/legacy'), { code: 'browser_authorization_profile_owned' });
  assert.throws(() => profiles.create('personal', 'absent'), { code: 'browser_authorization_revision_conflict' });
  assert.equal(profiles.list().profiles.length, 1);
});
test('reset checks revision and active owners before clearing the shared profile', t => {
  const profiles = fixture(t), created = profiles.create('work', 'absent');
  const directory = path.join(profiles.root, created.profile!.directory), cookie = path.join(directory, 'cookie');
  fs.writeFileSync(cookie, 'preserve');
  assert.throws(() => profiles.reset('work', 'old'), { code: 'browser_authorization_revision_conflict' });
  fs.writeFileSync(profiles.runtimeFile('work'), JSON.stringify({ pid: process.pid }), { mode: 0o600 });
  assert.throws(() => profiles.reset('work', created.revision), { code: 'browser_authorization_in_use' });
  assert.equal(fs.readFileSync(cookie, 'utf8'), 'preserve'); fs.unlinkSync(profiles.runtimeFile('work'));
  if (process.platform === 'win32') { assert.throws(() => profiles.reset('work', created.revision), { code: 'browser_authorization_reset_unverified' }); return; }
  fs.symlinkSync('external-999', path.join(directory, 'SingletonLock'));
  assert.throws(() => profiles.reset('work', created.revision), { code: 'browser_authorization_in_use' });
  fs.unlinkSync(path.join(directory, 'SingletonLock'));
  const reset = profiles.reset('work', created.revision);
  assert.notEqual(reset.revision, created.revision); assert.deepEqual(fs.readdirSync(directory), []);
});
test('path traversal, symlinks and private-state overwrite are rejected without deleting target data', t => {
  const profiles = fixture(t); profiles.create('personal', 'absent');
  for (const directory of ['../outside', '.buildr/local/../outside', '.buildr/local/browser-authorization', '.buildr/local//alias']) assert.throws(() => profiles.create('invalid', 'absent', directory));
  if (process.platform !== 'win32') {
    const link = path.join(profiles.root, '.buildr/local/link'); fs.symlinkSync(profiles.state, link);
    assert.throws(() => profiles.create('linked', 'absent', '.buildr/local/link'), { code: 'browser_authorization_path_insecure' });
  }
  assert.equal(profiles.list().profiles.length, 1);
});
test('one unreadable profile does not hide healthy profiles, replaced data directories are not reset', t => {
  const profiles=fixture(t), selected=profiles.create('good','absent');
  fs.writeFileSync(path.join(profiles.state,'broken.json'),'{', {mode:0o600});
  const listing=profiles.list().profiles;
  assert.equal(listing.find(row=>row.id==='good')!.revision,selected.revision);
  assert.equal(listing.find(row=>row.id==='broken')!.diagnostic?.code,'browser_authorization_profile_unreadable');
  const directory=path.join(profiles.root,selected.profile!.directory);
  fs.renameSync(directory,directory+'-preserved');fs.mkdirSync(directory,{mode:0o700});
  assert.throws(()=>profiles.get('good'),{code:'browser_authorization_directory_changed'});
  assert.throws(()=>profiles.reset('good',selected.revision),{code:'browser_authorization_directory_changed'});
  assert.equal(fs.existsSync(directory+'-preserved'),true);
});
test('only a dead local browser lock may be left for Chromium to reclaim; no lock is deleted', async t => {
  if (process.platform === 'win32') return;
  const profiles = fixture(t), selected = profiles.create('work', 'absent'), directory = path.join(profiles.root, selected.profile!.directory);
  const lock = path.join(directory, 'SingletonLock');
  for (const owner of [os.hostname() + '-' + process.pid, 'unknown-host-42', os.hostname() + '-invalid']) {
    fs.symlinkSync(owner, lock);
    assert.throws(() => assertProfileAvailable(directory), { code: 'browser_authorization_externally_owned' });
    assert.equal(fs.readlinkSync(lock), owner); fs.unlinkSync(lock);
  }
  const child = spawn(process.execPath, ['-e', 'process.exit(0)']);
  const pid = child.pid!; await new Promise<void>((resolve, reject) => { child.once('exit', () => resolve()); child.once('error', reject); });
  const owner = os.hostname() + '-' + pid; fs.symlinkSync(owner, lock);
  assertProfileAvailable(directory);
  assert.equal(fs.readlinkSync(lock), owner);
  fs.unlinkSync(lock); fs.writeFileSync(lock, 'unknown');
  assert.throws(() => assertProfileAvailable(directory), { code: 'browser_authorization_externally_owned' });
  assert.equal(fs.readFileSync(lock, 'utf8'), 'unknown');
});
