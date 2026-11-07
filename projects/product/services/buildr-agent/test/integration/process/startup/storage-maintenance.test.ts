import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import { registerToolCache } from '../../../../src/storage/toolchain-locations.ts';
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
  const cache=createRequire(import.meta.url)('cacache') as {put(directory:string,key:string,data:string):Promise<unknown>;get(directory:string,key:string):Promise<{data:Buffer}>};
  const serviceRoot=path.join(dataRoot,'agent-service'),oldNpm=path.join(serviceRoot,'connections/dsh/cache/npm/_cacache'),hostNpm=path.join(root,'host-npm');fs.mkdirSync(hostNpm);
  registerToolCache(serviceRoot,'npm',hostNpm);await cache.put(oldNpm,'offline-package','reused without download');
  const codexLog=path.join(serviceRoot,'connections/codex/codex-home/logs_2.sqlite');fs.mkdirSync(path.dirname(codexLog),{recursive:true});
  const logs=new DatabaseSync(codexLog);logs.exec('CREATE TABLE logs(ts INTEGER,feedback_log_body TEXT,thread_id TEXT,process_uuid TEXT)');logs.close();fs.utimesSync(codexLog,1,1);
  let host: Awaited<ReturnType<typeof actor>> | undefined, observer: AgentProcessConnection | undefined;
  t.after(() => cleanupProcessFixture({ root, dataRoot, profileId, host, observer }));
  host = await actor({ dataRoot, workspace, profileId, runtime });
  // Establish an authoritative empty conversation store. A missing store is
  // deliberately not evidence that native consumers can be discarded.
  await host.call('conversations.create',[host.info.scope,{}]);
  observer = await connectAgentProcess({ dataRoot, profileId, runtime, sourceId: 'minimal' });
  await until(async () => {
    const status = await observer!.lifecycle.status();
    assert.equal(status.identity.instanceId, host!.info.identity.instanceId);
    let maintenance:unknown;
    try{maintenance=JSON.parse(fs.readFileSync(path.join(serviceRoot,'process/storage-observation.json'),'utf8')).npmCaches;}catch{}
    return {qoderGone:!fs.existsSync(directory),npmGone:!fs.existsSync(oldNpm),codexGone:!fs.existsSync(codexLog),maintenance};
  }, value=>value.qoderGone&&value.npmGone&&value.codexGone);
  assert.equal(fs.readFileSync(transcript, 'utf8'), 'original-native-history');
  assert.equal((await cache.get(path.join(hostNpm,'_cacache'),'offline-package')).data.toString(),'reused without download');
});
