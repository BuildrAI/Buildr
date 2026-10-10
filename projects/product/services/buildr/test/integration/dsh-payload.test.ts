import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { createGeneratedReleaseInputs } from '../helpers/generated-release-inputs.ts';
import { createGeneratedArtifactManifest } from '../../tools/build/generated-artifacts.ts';
import { buildApplicationPayload } from '../../tools/release/application-payload.ts';
import { dshRuntimeInvocation } from '../../src/modules/agent-operations/infrastructure/dsh-entry.ts';

test('Buildr release payload excludes the independently published DSH plugin', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-without-dsh-plugin-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const generated = createGeneratedReleaseInputs(path.join(root, 'generated'));
  const manifest = createGeneratedArtifactManifest({ inputs: { source: 'fixture:no-dsh' }, artifacts: [
    { id: 'test-context', root: generated.testContextRoot },
    { id: 'web-dist', root: generated.webDistRoot },
  ] });
  const result = await buildApplicationPayload(path.join(root, 'payload'), 'b'.repeat(40), {
    generatedArtifactManifest: manifest, webDistRoot: generated.webDistRoot,
  });
  assert.equal(result.manifest.files.some((file: { path: string }) => file.path.includes('/dsh-plugin/')), false);
  assert.ok(result.manifest.files.some((file: { path: string }) => file.path === 'resources/runtime/dsh-agent.mts'), 'The installed carrier needs the separate native DSH composition.');
  const nativeEntry = process.env.BUILDR_DSH_NATIVE_TEST_ENTRY;
  if (nativeEntry) {
    const native = dshRuntimeInvocation(nativeEntry);
    const temporary = path.join(root, 'native-probe'); fs.mkdirSync(temporary);
    const observed = execFileSync(native.executable, ['--expose-internals', path.join(root, 'payload/resources/runtime/dsh-agent.mts'), '--probe'], {
      encoding: 'utf8', timeout: 10_000, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...(native.electron ? { ELECTRON_RUN_AS_NODE: '1' } : {}), DSH_HOME: process.env.DSH_HOME || path.join(os.homedir(), '.dsh'), BUILDR_DSH_INSTALL_ANCHOR: native.anchor, BUILDR_DSH_TEMP_DIR: temporary },
    });
    assert.ok(observed.split('\n').filter(Boolean).map(line => JSON.parse(line)).some(message => message.method === '$buildr/inspected' && message.params.protocolVersion === 1), 'Packaged native inspection: ' + observed.trim());
    assert.equal(fs.existsSync(path.join(temporary, 'cordis.yml')), false, 'Packaged inspection must not boot a service or write native configuration.');
  }
  await assert.rejects(buildApplicationPayload(path.join(root, 'rejected'), 'b'.repeat(40), {
    generatedArtifactManifest: manifest, webDistRoot: generated.webDistRoot, dshPluginRoot: root,
  }), /independently released DSH plugin/);
});
