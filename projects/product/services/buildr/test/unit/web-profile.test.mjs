import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import { productDataRoot } from '../../src/infrastructure/filesystem/product-data-root.mjs';
import {
  assertLauncherWebProfile,
  defaultWebDataRoot,
  oppositeWebProfile,
  resolveWebProfile,
  webProfileName,
} from '../../src/system/installation/contracts/web-profile.mjs';

const npmIdentity = { channel: 'npm', runtime: { role: 'host' } };
const developmentIdentity = { channel: 'development', runtime: { role: 'development' } };

test('Web profile只接受closed product channel与runtime role组合', () => {
  assert.equal(webProfileName(npmIdentity), 'released');
  assert.equal(webProfileName(developmentIdentity), 'development');
  for (const identity of [
    { channel: 'npm', runtime: { role: 'development' } },
    { channel: 'development', runtime: { role: 'host' } },
    { channel: 'unknown', runtime: { role: 'unknown' } },
  ]) assert.throws(() => webProfileName(identity), (error) => error.code === 'web_profile_identity_invalid');
});

test('macOS、Windows和Linux为released/development解析不同默认Web Root', () => {
  assert.equal(defaultWebDataRoot('released', { platform: 'darwin', home: '/example/demo', env: {} }), '/example/demo/Library/Application Support/Buildr');
  assert.equal(defaultWebDataRoot('development', { platform: 'darwin', home: '/example/demo', env: {} }), '/example/demo/Library/Application Support/Buildr Dev');
  assert.equal(defaultWebDataRoot('released', { platform: 'win32', home: 'C:\\Users\\demo', env: { LOCALAPPDATA: 'D:\\State' } }), 'D:\\State\\Buildr');
  assert.equal(defaultWebDataRoot('development', { platform: 'win32', home: 'C:\\Users\\demo', env: { LOCALAPPDATA: 'D:\\State' } }), 'D:\\State\\Buildr Dev');
  assert.equal(defaultWebDataRoot('released', { platform: 'linux', home: '/home/demo', env: {} }), '/home/demo/.local/state/buildr');
  assert.equal(defaultWebDataRoot('development', { platform: 'linux', home: '/home/demo', env: { XDG_STATE_HOME: '/state' } }), '/state/buildr-dev');
});

test('BUILDR_APP_DATA_DIR只覆盖Web Root且不改变profile或共享Product Root', () => {
  const env = { BUILDR_APP_DATA_DIR: '/tmp/buildr-web', BUILDR_PRODUCT_DATA_DIR: '/tmp/buildr-product' };
  const profile = resolveWebProfile(developmentIdentity, { platform: 'linux', home: '/home/demo', env });
  assert.equal(profile.profile, 'development');
  assert.equal(profile.channel, 'development');
  assert.equal(profile.runtimeRole, 'development');
  assert.equal(profile.dataRoot, path.resolve('/tmp/buildr-web'));
  assert.equal(profile.overridden, true);
  assert.equal(productDataRoot({ platform: 'linux', home: '/home/demo', env }), path.resolve('/tmp/buildr-product'));
});

test('显式Web Root把对侧Profile限制在同一隔离命名空间', () => {
  const current = resolveWebProfile(developmentIdentity, { env: { BUILDR_APP_DATA_DIR: '/tmp/buildr-web' } });
  const peer = oppositeWebProfile(current, developmentIdentity, { env: { BUILDR_APP_DATA_DIR: '/tmp/buildr-web' } });
  assert.equal(peer.profile, 'released');
  assert.equal(peer.dataRoot, path.join('/tmp/buildr-web', '.peer', 'released'));
});

test('Launcher identity必须与Web profile的channel和runtime role一致', () => {
  const development = resolveWebProfile(developmentIdentity, { env: { BUILDR_APP_DATA_DIR: '/tmp/dev' } });
  assert.equal(assertLauncherWebProfile({ channel: 'development', developmentRuntime: {} }, development).channel, 'development');
  assert.throws(
    () => assertLauncherWebProfile({ channel: 'npm', runtimeRole: 'host' }, development),
    (error) => error.code === 'web_launcher_profile_mismatch',
  );
});

test('Development Launcher必须绑定当前protocol、checkout与Host Node', () => {
  const sourceRoot = path.resolve('/tmp/buildr-development');
  const productIdentity = {
    ...developmentIdentity,
    protocolIdentity: 'buildr.web-protocol/v1',
    runtime: { role: 'development', executable: process.execPath, version: process.versions.node },
  };
  const profile = resolveWebProfile(productIdentity, { env: { BUILDR_APP_DATA_DIR: '/tmp/dev' } });
  const launcher = {
    channel: 'development', runtimeRole: 'development', protocolIdentity: 'buildr.web-protocol/v1',
    sourceRoot,
    developmentRuntime: { executable: process.execPath, version: process.versions.node },
  };
  assert.equal(assertLauncherWebProfile(launcher, profile, { productIdentity, productRoot: sourceRoot }), launcher);
  assert.throws(
    () => assertLauncherWebProfile({ ...launcher, protocolIdentity: 'buildr.web-protocol/v2' }, profile, { productIdentity, productRoot: sourceRoot }),
    (error) => error.code === 'web_launcher_profile_mismatch',
  );
  assert.throws(
    () => assertLauncherWebProfile({ ...launcher, sourceRoot: path.resolve('/tmp/other') }, profile, { productIdentity, productRoot: sourceRoot }),
    (error) => error.code === 'web_launcher_profile_mismatch',
  );
  assert.throws(
    () => assertLauncherWebProfile({ ...launcher, developmentRuntime: { ...launcher.developmentRuntime, version: '0.0.0' } }, profile, { productIdentity, productRoot: sourceRoot }),
    (error) => error.code === 'web_launcher_profile_mismatch',
  );
});
