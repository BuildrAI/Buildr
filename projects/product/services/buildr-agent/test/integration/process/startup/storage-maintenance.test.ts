import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { AgentProcessConnection } from '../../../../src/index.ts';
import { until, actor, prepareAgentRuntime, connectAgentProcess, copyPackage, prepared, cleanupProcessFixture } from '../../../support/process-fixture.ts';

test('packaged execution backend automatically reclaims closed diagnostics while authenticated control remains available', { skip: process.platform !== 'darwin', timeout: 30000 }, async t => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'agent-auto-storage-'))), dataRoot = path.join(root, 'profile'), workspace = path.join(root, 'work');
  fs.mkdirSync(workspace); const packageRoot = path.join(root, 'package'); copyPackage(prepared, packageRoot);
  fs.copyFileSync(path.join(import.meta.dirname, '../../fixtures/agent-process-entry.mjs'), path.join(packageRoot, 'build/process-fixture.mjs'));
  fs.writeFileSync(path.join(packageRoot, 'build/fixture-version.json'), JSON.stringify({ version: 'storage-test' }));
  const runtime = prepareAgentRuntime({ dataRoot, packageRoot, entry: 'build/process-fixture.mjs' }), profileId = 'storage-test';
  const runId = '2026-11-03T00-00-00-000+08-00-packaged-p2000000000';
  const config = path.join(dataRoot, 'agent-service/connections/qoder/qoder-config');
  const directory = path.join(config, 'logs/runs', runId); fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify({ run_id: runId, pid: 2_000_000_000, process_role: 'main', cli_version: '1.1.81', started_at: '2026-11-03T00:00:00Z' }));
  fs.writeFileSync(path.join(directory, 'qodercli.log'), 'diagnostic\n'.repeat(1000));
  for (const file of fs.readdirSync(directory)) fs.utimesSync(path.join(directory, file), 1, 1); fs.utimesSync(directory, 1, 1);
  const transcript = path.join(config, 'projects/bucket/original.jsonl'); fs.mkdirSync(path.dirname(transcript), { recursive: true }); fs.writeFileSync(transcript, 'original-native-history');
  let host: Awaited<ReturnType<typeof actor>> | undefined, observer: AgentProcessConnection | undefined;
  t.after(() => cleanupProcessFixture({ root, dataRoot, profileId, host, observer }));
  host = await actor({ dataRoot, workspace, profileId, runtime });
  observer = await connectAgentProcess({ dataRoot, profileId, runtime, sourceId: 'minimal' });
  await until(async () => {
    const status = await observer!.lifecycle.status();
    assert.equal(status.identity.instanceId, host!.info.identity.instanceId);
    return !fs.existsSync(directory);
  }, Boolean);
  assert.equal(fs.readFileSync(transcript, 'utf8'), 'original-native-history');
});
