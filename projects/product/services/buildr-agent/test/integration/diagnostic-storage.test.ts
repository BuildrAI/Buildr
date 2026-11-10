import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { createQoderExecutor } from '../../src/executors/qoder/index.ts';
import { diagnosticCandidates, diagnosticStabilityMs } from '../../src/storage/diagnostics.ts';
import { removeStorageCandidate, removeDiagnosticFileBatch, safeStorageResource, type StorageUse } from '../../src/storage/files.ts';
import { ConversationRepository } from '../../src/persistence/conversation-repository.ts';
import { inspectAgentStorage, collectAgentStorage } from '../../src/application/storage-maintenance.ts';
import { StorageMaintenance } from '../../src/process/storage-maintenance.ts';
import type { StoredConversation } from '../../src/domain/agent-state.ts';

const unused = { complete: true, paths: [] };
const deadPid = 2_000_000_000;
function file(name: string, text = 'diagnostic') { fs.mkdirSync(path.dirname(name), { recursive: true }); fs.writeFileSync(name, text); }
function age(directory: string) {
  for (const name of fs.readdirSync(directory)) { const p = path.join(directory, name); if (fs.lstatSync(p).isDirectory()) age(p); else if (!fs.lstatSync(p).isSymbolicLink()) fs.utimesSync(p, 1, 1); }
  fs.utimesSync(directory, 1, 1);
}
function fixture(t: test.TestContext) {
  const dataRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'diagnostic-storage-'))), root = path.join(dataRoot, 'agent-service');
  const config = path.join(root, 'connections/qoder'), logs = path.join(config, 'qoder-config/logs');
  fs.mkdirSync(logs, { recursive: true });
  const repo = new ConversationRepository(root);
  const record: StoredConversation = { view: { id: randomUUID(), workspaceId: 'ws', revision: 'r1', cwd: '/work', title: 'history', hidden: true, updatedAt: '2026-11-03T00:00:00Z', entries: [], participants: [], requests: [] }, participants: [], sources: {}, requests: {}, attempts: [], attachments: {} };
  repo.saveConversation(record);
  t.after(() => { repo.stopReadModels(); fs.rmSync(dataRoot, { recursive: true, force: true }); });
  const run = (pid = deadPid, suffix = 'sample') => {
    const id = `2026-11-03T00-00-00-000+08-00-${suffix}-p${pid}`, directory = path.join(logs, 'runs', id);
    file(path.join(directory, 'manifest.json'), JSON.stringify({ run_id: id, pid, process_role: 'main', cli_version: '1.1.81', started_at: '2026-11-03T00:00:00Z' }));
    file(path.join(directory, 'qodercli.log'), 'startup trace\n'.repeat(100)); age(directory); return directory;
  };
  const segment = (context = randomUUID(), pid = deadPid) => {
    const name = path.join(logs, 'sessions/ns', context, 'segments', `2026-11-03T00-00-00-000+08-00-events-p${pid}.jsonl`);
    file(name, '{"seq":1,"type":"turn.finished"}\n'); age(path.dirname(name)); return { name, context };
  };
  const candidates = (dependencies = { complete: true, contexts: [] as string[] }, use: StorageUse = unused) => diagnosticCandidates(root, createQoderExecutor(), config, use, dependencies, Date.now());
  return { dataRoot, root, config, logs, repo, record, run, segment, candidates };
}

test('small diagnostic batches share observation while independently retaining held, changed and newly protected files',t=>{
  const f=fixture(t),paths=Array.from({length:128},(_,i)=>path.join(f.logs,`sdk-daemon-${deadPid}-${i}.log`));
  for(const name of paths){file(name);fs.utimesSync(name,1,1);}
  const items=f.candidates();let observations=0;
  const removed=removeDiagnosticFileBatch(f.root,items,item=>item.path!==paths[2],()=>{
    observations++;
    if(observations===1){fs.appendFileSync(paths[1]!, 'changed after inventory');return unused;}
    const retired=fs.readdirSync(f.logs).filter(name=>name.startsWith('.reclaim-'));
    return {complete:true,paths:[path.join(f.logs,retired[0]!)]};
  });
  assert.equal(observations,2,'observations are per batch, not per file');
  assert.equal(removed.length,125);assert.ok(fs.existsSync(paths[1]!));assert.ok(fs.existsSync(paths[2]!));
  assert.equal(fs.readdirSync(f.logs).some(name=>name.startsWith('.reclaim-')),false,'held renamed object is restored');
});

test('slow system observation cannot consume a small diagnostic batch file-work budget',t=>{
  const f=fixture(t);
  for(let i=0;i<128;i++){const name=path.join(f.logs,`sdk-daemon-${deadPid}-${i}.log`);file(name);fs.utimesSync(name,1,1);}
  const items=f.candidates();let clock=0,observations=0;
  t.mock.method(Date,'now',()=>clock);
  const observe=()=>{observations++;clock+=5000;return unused;};
  assert.equal(removeDiagnosticFileBatch(f.root,items,()=>true,observe,100).length,128);
  assert.equal(observations,2,'both system observations still occur');
  assert.deepEqual(removeDiagnosticFileBatch(f.root,items,()=>true,observe,clock),[]);
  assert.equal(observations,2,'an already exhausted caller budget starts no batch');
});

test('a public diagnostic batch drains hundreds of small logs and respects an item budget', {skip:process.platform!=='darwin'},t=>{
  const f=fixture(t);
  for(let i=0;i<20;i++)f.run(deadPid,'small-directory-'+i);
  for(let i=0;i<320;i++){const name=path.join(f.logs,`sdk-daemon-${deadPid}-${i}.log`);file(name);fs.utimesSync(name,1,1);}
  const first=collectAgentStorage(inspectAgentStorage({dataRoot:f.dataRoot}),256,{budgetMs:10000});
  assert.equal(first.results.filter(item=>item.status==='removed').length,256);
  assert.ok(first.results.some(item=>item.reason==='storage_batch_deferred'));
  const next=collectAgentStorage(inspectAgentStorage({dataRoot:f.dataRoot}),256,{budgetMs:10000});
  assert.equal(next.results.filter(item=>item.status==='removed').length,84);
  assert.equal(f.candidates().length,0);
});

test('small diagnostic directories retain opened descendants and do not batch unbounded trees',t=>{
  const f=fixture(t),held=f.run(deadPid,'held'),free=f.run(deadPid,'free'),late=f.run(deadPid,'late'),large=f.run(deadPid,'many');
  for(let i=0;i<64;i++)file(path.join(large,'empty-'+i),'');
  age(large);assert.equal(safeStorageResource(f.root,large,64),false);
  const items=f.candidates();let observations=0;
  const removed=removeDiagnosticFileBatch(f.root,items,()=>true,()=>{
    observations++;const paths=[path.join(held,'qodercli.log')];
    if(observations===2){
      const renamed=fs.readdirSync(path.dirname(late)).find(name=>name.startsWith('.reclaim-')&&JSON.parse(fs.readFileSync(path.join(path.dirname(late),name,'manifest.json'),'utf8')).run_id===path.basename(late));
      assert.ok(renamed);paths.push(path.join(path.dirname(late),renamed,'qodercli.log'));
    }
    return {complete:true,paths};
  });
  assert.equal(observations,2);assert.deepEqual(removed,[free]);
  assert.ok(fs.existsSync(path.join(held,'qodercli.log')));assert.ok(fs.existsSync(path.join(late,'qodercli.log')));assert.ok(fs.existsSync(large));
  assert.equal(fs.readdirSync(path.dirname(held)).some(name=>name.startsWith('.reclaim-')),false);
});

test('known closed diagnostics are separate from native history, credentials, unknown content and live producers', t => {
  const f = fixture(t), old = f.run(), live = f.run(process.pid, 'live'), events = f.segment();
  const sdk = path.join(f.logs, `sdk-daemon-${deadPid}-1.log`); file(sdk); fs.utimesSync(sdk, 1, 1);
  const transcript = path.join(f.config, 'qoder-config/projects/bucket/history.jsonl'), credential = path.join(f.config, 'qoder-config/auth.json');
  file(transcript, 'original history'); file(credential, 'private fixture');
  const unknown = f.run(deadPid, 'unknown'); file(path.join(unknown, 'user-file.txt'), 'must retain'); age(unknown);
  const items = f.candidates();
  assert.equal(items.find(x => x.path === old)?.eligible, true);
  assert.equal(items.find(x => x.path === events.name)?.eligible, true);
  assert.equal(items.find(x => x.path === live)?.reason, 'diagnostic_producer_alive');
  assert.equal(items.find(x => x.path === unknown)?.reason, 'diagnostic_identity_unknown');
  for (const item of items.filter(x => x.eligible)) assert.equal(removeStorageCandidate(f.root, item, () => unused), true);
  assert.equal(fs.readFileSync(transcript, 'utf8'), 'original history'); assert.equal(fs.readFileSync(credential, 'utf8'), 'private fixture');
  assert.ok(fs.existsSync(live)); assert.ok(fs.existsSync(unknown)); assert.equal(fs.existsSync(sdk), false);
});

test('unknown protection or occupancy retains only dependent evidence; age is not proof of quiescence', t => {
  const f = fixture(t), run = f.run(), events = f.segment();
  assert.equal(f.candidates({ complete: false, contexts: [] }).find(x => x.path === run)?.eligible, true);
  assert.equal(f.candidates({ complete: false, contexts: [] }).find(x => x.path === events.name)?.reason, 'diagnostic_dependencies_unknown');
  const held = { complete: true, contexts: [`qoder:${events.context}`] };
  assert.equal(f.candidates(held).find(x => x.path === events.name)?.reason, 'diagnostic_recovery_evidence');
  assert.equal(f.candidates(held).find(x => x.path === run)?.eligible, true);
  assert.equal(f.candidates(undefined, { complete: false, paths: [] }).every(x => !x.eligible), true);
  assert.equal(f.candidates(undefined, { complete: true, paths: [events.name] }).find(x => x.path === events.name)?.reason, 'storage_in_use');
  fs.utimesSync(events.name, Date.now() / 1000, Date.now() / 1000);
  assert.equal(f.candidates().find(x => x.path === events.name)?.reason, 'storage_recent');
  assert.ok(diagnosticStabilityMs > 0);
});

test('links, hard links, metadata mismatch and observation drift never authorize deletion', t => {
  const f = fixture(t), old = f.run(), events = f.segment();
  const preview = f.candidates().find(x => x.path === old)!;
  file(path.join(old, 'qodercli.log'), 'late append');
  assert.equal(removeStorageCandidate(f.root, preview, () => unused), false);
  const current = f.candidates().find(x => x.path === events.name)!;
  let calls = 0;
  assert.equal(removeStorageCandidate(f.root, current, () => unused, () => ++calls === 1), false);
  assert.equal(fs.readFileSync(events.name, 'utf8'), '{"seq":1,"type":"turn.finished"}\n', 'dependency appearing after rename restores exact source');
  const oldFile = f.candidates().find(x => x.path === events.name)!;
  const times = fs.statSync(events.name);
  fs.writeFileSync(events.name, 'x'.repeat(times.size)); fs.utimesSync(events.name, times.atime, times.mtime);
  assert.equal(removeStorageCandidate(f.root, oldFile, () => unused), false, 'same-size rewrite with restored mtime still changes ctime');
  const changed = f.segment(), before = f.candidates().find(x => x.path === changed.name)!;
  let observations = 0;
  assert.equal(removeStorageCandidate(f.root, before, () => unused, () => {
    if (++observations === 2) {
      const retired = path.join(path.dirname(changed.name), fs.readdirSync(path.dirname(changed.name)).find(name => name.startsWith('.reclaim-'))!);
      const stat = fs.statSync(retired); fs.writeFileSync(retired, 'x'.repeat(stat.size)); fs.utimesSync(retired, stat.atime, stat.mtime);
    }
    return true;
  }), false, 'a rewrite after the collector rename must not hide behind its ctime normalization');
  assert.ok(fs.existsSync(changed.name));
  fs.linkSync(events.name, path.join(f.root, 'retained-link'));
  assert.equal(safeStorageResource(f.root, events.name), false);
  const external = path.join(f.dataRoot, 'external'); file(external, 'external');
  fs.unlinkSync(path.join(old, 'qodercli.log')); fs.symlinkSync(external, path.join(old, 'qodercli.log'));
  assert.equal(f.candidates().find(x => x.path === old)?.eligible, false);
  assert.equal(fs.readFileSync(external, 'utf8'), 'external');
  fs.unlinkSync(path.join(old, 'qodercli.log')); file(path.join(old, 'qodercli.log'));
  file(path.join(old, 'manifest.json'), JSON.stringify({ run_id: path.basename(old), pid: 1, started_at: '2026-11-03' })); age(old);
  assert.equal(f.candidates().find(x => x.path === old)?.reason, 'diagnostic_identity_unknown');
});

test('canonical dependencies protect hidden, retained, unresolved and unreleased native contexts even with stale projections', t => {
  const f = fixture(t), context = randomUUID();
  f.record.participants = [{ id: 'q', provider: 'qoder', connectionId: 'qoder', label: 'q', bindingIdentity: 'binding', contextRef: { id: context }, deliveredThrough: 0 }];
  f.record.view.run = { id: 'run', participantId: 'q', provider: 'qoder', generation: 'g', status: 'unknown', accepted: true, tools: [], startedAt: 'now', updatedAt: 'now' };
  f.record.view.revision = 'r2'; f.repo.saveConversation(f.record, 'r1');
  assert.deepEqual(f.repo.storageDependencies(), { complete: true, contexts: [`qoder:${context}`] });
  f.record.view.run.status = 'completed'; f.record.view.revision = 'r3'; f.repo.saveConversation(f.record, 'r2');
  assert.equal(f.repo.storageDependencies().contexts.length, 1, 'terminal text alone does not release control');
  f.record.view.run.resourcesReleased = true; f.record.view.revision = 'r4'; f.repo.saveConversation(f.record, 'r3');
  assert.equal(f.repo.storageDependencies().contexts.length, 0);
  f.record.view.retainedRuns = [{ ...f.record.view.run, id: 'old', status: 'tools-active', tools: [{ id: 'job', label: 'job', status: 'unknown' }] }];
  f.record.view.revision = 'r5'; f.repo.saveConversation(f.record, 'r4');
  const db = new DatabaseSync(f.repo.filename); db.exec('DELETE FROM conversation_read_states'); db.close();
  assert.deepEqual(f.repo.storageDependencies().contexts, [`qoder:${context}`]);
  f.record.view.retainedRuns = [];
  const priorContext = randomUUID();
  f.record.attempts = [{ clientRequestId: 'old-request', inputDigest: 'digest', runId: 'historical', participantId: 'q', through: 0, userEntryId: 'input', accepted: true,
    executionRef: { id: 'old-execution', data: { resourceContext: priorContext } } }];
  f.record.runOutcomes = { historical: { provider: 'qoder', status: 'unknown', updatedAt: 'now' } };
  f.record.view.revision = 'r6'; f.repo.saveConversation(f.record, 'r5');
  assert.deepEqual(f.repo.storageDependencies().contexts, [`qoder:${priorContext}`]);
  f.record.runOutcomes.historical.status = 'completed'; f.record.view.revision = 'r7'; f.repo.saveConversation(f.record, 'r6');
  assert.deepEqual(f.repo.storageDependencies().contexts, []);
  const broken = new DatabaseSync(f.repo.filename); broken.prepare("UPDATE conversations SET body=json_set(body,'$.participants',NULL)").run(); broken.close();
  assert.equal(f.repo.storageDependencies().complete, false);
});

test('retained rounds protect their original native context after the current context changes or is cleared', t => {
  const f = fixture(t), current = randomUUID(), previous = randomUUID();
  f.record.participants = [{ id: 'q', provider: 'qoder', connectionId: 'qoder', label: 'q', bindingIdentity: 'b', contextRef: { id: current }, deliveredThrough: 0 }];
  f.record.view.retainedRuns = [{ id: 'old', participantId: 'q', provider: 'qoder', generation: 'g', status: 'unknown', accepted: true, tools: [], startedAt: 'now', updatedAt: 'now' }];
  f.record.attempts = [{ clientRequestId: 'input', inputDigest: 'digest', runId: 'old', participantId: 'q', through: 0, userEntryId: 'input', accepted: true,
    executionRef: { id: 'execution', data: { resourceContext: previous } } }];
  f.record.view.revision = 'r2'; f.repo.saveConversation(f.record, 'r1');
  assert.deepEqual(f.repo.storageDependencies().contexts.sort(), [`qoder:${current}`, `qoder:${previous}`].sort());
  delete f.record.participants[0].contextRef;
  f.record.view.revision = 'r3'; f.repo.saveConversation(f.record, 'r2');
  assert.deepEqual(f.repo.storageDependencies().contexts, [`qoder:${previous}`]);
  f.record.view.retainedRuns[0].status = 'completed'; f.record.view.retainedRuns[0].resourcesReleased = true;
  f.record.view.retainedRuns[0].executionState = 'unknown';
  f.record.view.revision = 'r4'; f.repo.saveConversation(f.record, 'r3');
  assert.deepEqual(f.repo.storageDependencies().contexts, [`qoder:${previous}`], 'explicit unknown execution is still protected');
});

test('an exited producer does not authorize reclaim while a different process holds its diagnostic', { skip: process.platform !== 'darwin' }, async t => {
  const f = fixture(t), run = f.run(), held = path.join(run, 'qodercli.log');
  const child = spawn(process.execPath, ['-e', "require('fs').openSync(process.argv[1],'r');process.stdout.write('ready');setInterval(()=>{},1000)", held], { stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(async () => { if (child.exitCode === null && child.signalCode === null) { const end = once(child, 'exit'); child.kill(); await end; } });
  await once(child.stdout!, 'data');
  assert.equal(inspectAgentStorage({ dataRoot: f.dataRoot }).items.find(item => item.path === run)?.reason, 'storage_in_use');
  const preview = f.candidates().find(item => item.path === run)!;
  assert.equal(removeStorageCandidate(f.root, preview), false);
  const end = once(child, 'exit'); child.kill(); await end;
  assert.equal(collectAgentStorage(inspectAgentStorage({ dataRoot: f.dataRoot })).results.find(item => item.path === run)?.status, 'removed');
});

test('public collection rechecks dependency changes and applies a bounded batch without accepting forged account paths', { skip: process.platform !== 'darwin' }, t => {
  const f = fixture(t), run = f.run(), second = f.run(deadPid, 'second'), events = f.segment();
  const plan = inspectAgentStorage({ dataRoot: f.dataRoot }); assert.ok(plan.items.find(x => x.path === events.name)?.eligible);
  f.record.participants = [{ id: 'q', provider: 'qoder', connectionId: 'qoder', label: 'q', bindingIdentity: 'b', contextRef: { id: events.context }, deliveredThrough: 0 }];
  f.record.view.run = { id: 'r', participantId: 'q', provider: 'qoder', generation: 'g', status: 'unknown', accepted: true, tools: [], startedAt: 'now', updatedAt: 'now' };
  f.record.view.revision = 'r2'; f.repo.saveConversation(f.record, 'r1');
  plan.items.push({ ...plan.items.find(x => x.path === run)!, path: f.config });
  const result = collectAgentStorage(plan, 1);
  assert.equal(result.results.filter(x => x.status === 'removed').length, 1);
  assert.ok([run, second].some(p => fs.existsSync(p)));
  assert.ok(fs.existsSync(events.name)); assert.ok(fs.existsSync(f.config));
  assert.ok(result.results.some(x => x.reason === 'storage_batch_deferred'));
  f.record.view.run.status = 'completed'; f.record.view.run.resourcesReleased = true; f.record.view.revision = 'r3'; f.repo.saveConversation(f.record, 'r2');
  const next = collectAgentStorage(inspectAgentStorage({ dataRoot: f.dataRoot }));
  assert.equal(next.results.find(x => x.path === events.name)?.status, 'removed');
});

test('independent maintenance retries after the exact writer exits, and close stops future passes', { skip: process.platform !== 'darwin', timeout: 20000 }, async t => {
  const f = fixture(t), held = path.join(f.root, 'holder'); file(held);
  const child = spawn(process.execPath, ['-e', "require('fs').openSync(process.argv[1],'r');process.stdout.write('ready');setInterval(()=>{},1000)", held], { stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(async () => { if (child.exitCode === null && child.signalCode === null) { const end = once(child, 'exit'); child.kill(); await end; } });
  await once(child.stdout!, 'data'); const run = f.run(child.pid!, 'delayed');
  assert.equal(inspectAgentStorage({ dataRoot: f.dataRoot }).items.find(x => x.path === run)?.eligible, false);
  const maintenance = new StorageMaintenance(f.dataRoot, { initialMs: 0, intervalMs: 30 }); t.after(() => maintenance.close());
  const end = once(child, 'exit'); child.kill(); await end;
  const deadline = Date.now() + 15000;
  while (fs.existsSync(run) && Date.now() < deadline) await delay(25);
  assert.equal(fs.existsSync(run), false, 'later autonomous pass deletes an eligible closed run');
  maintenance.close();
  const retained = f.run(deadPid, 'after-close'); await delay(100);
  assert.ok(fs.existsSync(retained));
});
