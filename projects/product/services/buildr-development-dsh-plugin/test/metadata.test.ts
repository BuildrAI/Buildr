import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pluginIconSvg, pluginLocales, pluginPackageName } from '../src/metadata.ts';

const serviceRoot = path.resolve(import.meta.dirname, '..');

function inspectTarball(tgzPath: string) {
  const readEntry = (entry: string) => execFileSync('tar', ['-xOzf', tgzPath, `package/${entry}`], { encoding: 'utf8' });
  return {
    pkg: JSON.parse(readEntry('package.json')) as Record<string, any>,
    patch: readEntry('cordis.patch.yml'),
    en: JSON.parse(readEntry('locale/en.json')) as { meta?: { title?: string; description?: string } },
    zh: JSON.parse(readEntry('locale/zh.json')) as { meta?: { title?: string; description?: string } },
    icon: readEntry('icon.svg'),
    client: readEntry('lib/client.js'),
  };
}

test('build-dev emits DSH metadata (package name, locales, icon) for both dev and release packages', t => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-dev-dsh-meta-'));
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const devOut = path.join(tmpDir, 'dev');
  const devMeta = JSON.parse(execFileSync(process.execPath, [path.join(serviceRoot, 'tools/build-dev.ts'), devOut], {
    cwd: serviceRoot,
    encoding: 'utf8',
  }));
  assert.equal(devMeta.name, '@buildr-ai/dsh-buildr-dev');
  const devTar = inspectTarball(devMeta.path);
  assert.equal(devTar.pkg.name, pluginPackageName(false));
  assert.equal(devTar.pkg.icon, './icon.svg');
  assert.equal(devTar.pkg.exports['./icon'], './icon.svg');
  assert.equal(devTar.pkg.exports['./locale/*.json'], './locale/*.json');
  assert.ok(devTar.pkg.files.includes('locale'));
  assert.ok(devTar.pkg.files.includes('icon.svg'));
  assert.match(devTar.patch, /id: buildr-dev\b/);
  assert.match(devTar.patch, /name: ['"]?@buildr-ai\/dsh-buildr-dev['"]?/);
  assert.equal(devTar.en.meta?.title, 'Buildr Dev');
  assert.deepEqual(devTar.en, pluginLocales(false).en);
  assert.deepEqual(devTar.zh, pluginLocales(false).zh);
  assert.equal(devTar.icon, pluginIconSvg);
  assert.ok(Buffer.byteLength(devTar.icon, 'utf8') <= 256 * 1024);
  assert.ok(devTar.client.includes(JSON.stringify('@buildr-ai/dsh-buildr-dev')));

  const relOut = path.join(tmpDir, 'rel');
  const relMeta = JSON.parse(execFileSync(process.execPath, [path.join(serviceRoot, 'tools/build-dev.ts'), '--release', '0.1.0-rc.1', relOut], {
    cwd: serviceRoot,
    encoding: 'utf8',
  }));
  assert.equal(relMeta.name, '@buildr-ai/dsh-buildr');
  const relTar = inspectTarball(relMeta.path);
  assert.equal(relTar.pkg.name, pluginPackageName(true));
  assert.equal(relTar.pkg.icon, './icon.svg');
  assert.match(relTar.patch, /id: dsh-buildr\b/);
  assert.match(relTar.patch, /name: ['"]?@buildr-ai\/dsh-buildr['"]?/);
  assert.equal(relTar.en.meta?.title, 'Buildr');
  assert.deepEqual(relTar.en, pluginLocales(true).en);
  assert.deepEqual(relTar.zh, pluginLocales(true).zh);
  assert.equal(relTar.icon, pluginIconSvg);
  assert.ok(relTar.client.includes(JSON.stringify('@buildr-ai/dsh-buildr')));
});
