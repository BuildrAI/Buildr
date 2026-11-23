import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {launcherFileHash} from '../../buildr-harness/src/launcher-binding.ts';
import {discoverReleased, supportsHarness} from '../src/installation.ts';

test('released discovery accepts only the matching, unchanged released launcher', () => {
  const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'harness-discovery-')));
  try {
    assert.deepEqual(discoverReleased(home, 'darwin'), {code:'harness-not-installed'});
    assert.deepEqual(discoverReleased(home, 'linux'), {code:'harness-platform'});
    const packageRoot = path.join(home, 'package');
    const entry = path.join(packageRoot,'bin','buildr-harness.mjs');
    const node = path.join(home, 'node');
    const dataRoot = path.join(home,'data');
    const target = path.join(home,'Applications/Buildr Harness.app');
    const marker = path.join(target,'Contents/Resources/harness-launcher.json');
    fs.mkdirSync(path.dirname(entry),{recursive:true});
    fs.mkdirSync(path.dirname(marker),{recursive:true});
    fs.writeFileSync(entry,'#!/usr/bin/env node');
    fs.writeFileSync(node,'node fixture');
    const manifest = (version: string, isPrivate = false) => fs.writeFileSync(path.join(packageRoot,'package.json'), JSON.stringify({name:'@buildr-ai/buildr-harness',version,private:isPrivate}));
    const binding = {schemaVersion:1, productId:'buildr-harness', target, entry, node, dataRoot,
      profile:'released', entrySha256:launcherFileHash(entry), nodeSha256:launcherFileHash(node)};
    manifest('0.1.0-rc.1');
    fs.writeFileSync(marker,JSON.stringify(binding));
    assert.deepEqual(discoverReleased(home,'darwin'),{installation:{node,packageRoot,dataRoot,port:'9518'}});
    manifest('0.2.0-rc.1');
    assert.deepEqual(discoverReleased(home,'darwin'),{code:'harness-incompatible'});
    manifest('0.1.0-rc.1',true);
    assert.deepEqual(discoverReleased(home,'darwin'),{code:'harness-installation-invalid'});
    manifest('0.1.0');
    fs.writeFileSync(marker,JSON.stringify({...binding,profile:'development'}));
    assert.deepEqual(discoverReleased(home,'darwin'),{code:'harness-installation-invalid'});
    fs.writeFileSync(marker,JSON.stringify(binding));
    fs.appendFileSync(entry,'\nchanged');
    assert.deepEqual(discoverReleased(home,'darwin'),{code:'harness-installation-invalid'});
    assert.equal(supportsHarness('0.1.1-rc.2'),true);
    assert.equal(supportsHarness('0.1.0-beta.1'),false);
  } finally { fs.rmSync(home,{recursive:true,force:true}); }
});
