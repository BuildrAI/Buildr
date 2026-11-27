import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { discoverReleased, supportsDevelopment } from '../src/installation.ts';

const sha = (file: string) => `sha256-${createHash('sha256').update(fs.readFileSync(file)).digest('hex')}`;

test('supportsDevelopment accepts >= 0.1.0-rc.67 and < 0.2.0-0', () => {
  assert.equal(supportsDevelopment('0.1.0-rc.67'), true);
  assert.equal(supportsDevelopment('0.1.0-rc.80'), true);
  assert.equal(supportsDevelopment('0.1.0'), true);
  assert.equal(supportsDevelopment('0.1.2-rc.1'), true);
  assert.equal(supportsDevelopment('0.1.0-rc.66'), false);
  assert.equal(supportsDevelopment('0.1.0-rc.65'), false);
  assert.equal(supportsDevelopment('0.1.0-rc.64'), false);
  assert.equal(supportsDevelopment('0.1.0-beta.1'), false);
  assert.equal(supportsDevelopment('0.2.0-rc.1'), false);
});

test('discoverReleased verifies Buildr launcher binding or product-installations registry', () => {
  const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-dev-discovery-')));
  const systemApps = path.join(home, 'SystemApplications');
  fs.mkdirSync(systemApps, { recursive: true });
  try {
    assert.deepEqual(discoverReleased(home, 'darwin', systemApps), { code: 'development-not-installed' });
    assert.deepEqual(discoverReleased(home, 'linux', systemApps), { code: 'development-platform' });

    const dataRoot = path.join(home, 'Library', 'Application Support', 'Buildr');
    const packageRoot = path.join(home, 'npm', 'lib', 'node_modules', '@buildr-ai', 'buildr');
    const entry = path.join(packageRoot, 'bin', 'buildr.mjs');
    const node = path.join(home, 'node');
    fs.mkdirSync(dataRoot, { recursive: true });
    fs.mkdirSync(path.dirname(entry), { recursive: true });
    fs.writeFileSync(entry, '#!/usr/bin/env node\n');
    fs.writeFileSync(node, 'node fixture');
    const writeManifest = (version: string, isPrivate = false) =>
      fs.writeFileSync(path.join(packageRoot, 'package.json'), JSON.stringify({ name: '@buildr-ai/buildr', version, private: isPrivate }));
    writeManifest('0.1.0-rc.67');

    const registryFile = path.join(dataRoot, 'product-installations.json');
    fs.writeFileSync(registryFile, JSON.stringify({
      schemaVersion: 'buildr.product-installation-registry/v1',
      installations: [
        { origin: { package: '@buildr-ai/buildr', channel: 'npm' }, entryPath: entry, runtime: { executable: node } },
      ],
    }));
    assert.deepEqual(discoverReleased(home, 'darwin', systemApps), {
      installation: { node, packageRoot, dataRoot, port: '4457' },
    });

    writeManifest('0.1.0-rc.66');
    assert.deepEqual(discoverReleased(home, 'darwin', systemApps), { code: 'development-incompatible' });

    writeManifest('0.1.0-rc.67');
    const appTarget = path.join(systemApps, 'Buildr.app');
    const marker = path.join(appTarget, 'Contents', 'Resources', 'launcher-binding.json');
    fs.mkdirSync(path.dirname(marker), { recursive: true });
    const binding = {
      schemaVersion: 'buildr.npm-launcher-binding/v2',
      channel: 'npm',
      platform: 'darwin',
      target: appTarget,
      package: '@buildr-ai/buildr',
      hostNode: { path: node, sha256: sha(node) },
      packageEntry: { path: entry, sha256: sha(entry) },
      webPort: { preferred: 4460, fallback: 'random' },
    };
    fs.writeFileSync(marker, JSON.stringify(binding));
    assert.deepEqual(discoverReleased(home, 'darwin', systemApps), {
      installation: { node, packageRoot, dataRoot, port: '4460' },
    });

    // Per-user ~/Applications takes precedence over system /Applications when present.
    const userAppTarget = path.join(home, 'Applications', 'Buildr.app');
    const userMarker = path.join(userAppTarget, 'Contents', 'Resources', 'launcher-binding.json');
    fs.mkdirSync(path.dirname(userMarker), { recursive: true });
    fs.writeFileSync(userMarker, JSON.stringify({
      ...binding,
      target: userAppTarget,
      webPort: { preferred: 4461, fallback: 'random' },
    }));
    assert.deepEqual(discoverReleased(home, 'darwin', systemApps), {
      installation: { node, packageRoot, dataRoot, port: '4461' },
    });

    fs.appendFileSync(entry, '\ntampered');
    assert.deepEqual(discoverReleased(home, 'darwin', systemApps), { code: 'development-installation-invalid' });
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});
