import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { inodeIdentity, reanchorSharedDentries, storageInUse, type StorageUse } from '../../src/storage/files.ts';

test('shared hard-link inodes do not block removing another alias', t => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-storage-inode-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const live = path.join(root, 'live'), candidate = path.join(root, 'candidate');
  fs.mkdirSync(live);
  fs.mkdirSync(candidate);
  const protectedFile = path.join(live, 'node');
  fs.writeFileSync(protectedFile, 'runtime');
  const alias = path.join(candidate, 'node');
  fs.linkSync(protectedFile, alias);
  const unique = path.join(candidate, 'unique');
  fs.writeFileSync(unique, 'owned');
  const protectedInodes = reanchorSharedDentries(live);
  assert.deepEqual([...protectedInodes], [inodeIdentity(fs.lstatSync(protectedFile))]);

  const aliasUse: StorageUse = { complete: true, paths: [alias] };
  assert.equal(storageInUse(candidate, aliasUse, protectedInodes), false);
  assert.equal(storageInUse(candidate, { complete: true, paths: [unique] }, protectedInodes), true);
  assert.equal(storageInUse(candidate, { complete: true, paths: [candidate] }, protectedInodes), true);
  assert.equal(storageInUse(candidate, aliasUse, new Set([inodeIdentity(fs.lstatSync(unique))])), true);
  assert.equal(storageInUse(candidate, { ...aliasUse, complete: false }, protectedInodes), true);
  assert.equal(storageInUse(candidate, { complete: true, paths: [path.join(live, 'node')] }, protectedInodes), false);
});
