import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import test from 'node:test';
import { defaultExecute, runDirectSelfBootstrapCloseout, runSelfBootstrapCloseoutCommand } from '../../../../../../skills/buildr-self-bootstrap-sync/scripts/closeout.mjs';
import { runDetachedCloseout } from '../../../../../../skills/buildr-self-bootstrap-sync/scripts/detached-execution.mjs';
import { run, git, executor, waitForExecutionFile, detachedFixture, createSelfBootstrapCloseoutFixtures } from '../helpers/self-bootstrap-closeout-fixture.ts';

const { fixture, directFixture } = createSelfBootstrapCloseoutFixtures();

for (const mode of ['passed', 'blocked']) {
  test(`detached closeout returns the original ${mode} result and preserves a readable output`, async (t: any) => {
    const fixture = detachedFixture(t);
    let handoff: any;
    const result = await runDetachedCloseout({args:[fixture.directory,mode,'literal value with spaces'],runnerModule:fixture.runnerModule,onHandoff(value: any){handoff=value;}});
    t.after(() => fs.rmSync(path.dirname(handoff.resultFile), { recursive: true, force: true }));
    assert.equal(result.status, mode === 'passed'?'passed':'blocked');
    assert.deepEqual(JSON.parse(fs.readFileSync(handoff.resultFile,'utf8')),result);
    assert.equal(fs.existsSync(path.join(fixture.directory,'activation.lock')),false);
    assert.deepEqual(result.args,[fixture.directory,mode,'literal value with spaces']);
    if (process.platform !== 'win32') assert.equal(fs.statSync(path.dirname(handoff.resultFile)).mode & 0o777,0o700);
  });
}

test('detached closeout preserves driver exceptions and saves their original diagnostic', async (t: any) => {
  const fixture=detachedFixture(t);let handoff: any;
  await assert.rejects(runDetachedCloseout({args:[fixture.directory,'throw'],runnerModule:fixture.runnerModule,onHandoff(value: any){handoff=value;}}),
    (error: any) => error.code === 'owner-mismatch' && error.message === 'identity changed; preserved');
  t.after(()=>fs.rmSync(path.dirname(handoff.resultFile),{recursive:true,force:true}));
  assert.equal(JSON.parse(fs.readFileSync(handoff.resultFile,'utf8')).diagnostic.code,'owner-mismatch');
  assert.equal(fs.existsSync(path.join(fixture.directory,'activation.lock')),false);
});

test('detached closeout never reports success when the worker exits without a result', async (t: any) => {
  const fixture=detachedFixture(t);let handoff: any;
  await assert.rejects(runDetachedCloseout({args:[fixture.directory,'crash'],runnerModule:fixture.runnerModule,onHandoff(value: any){handoff=value;}}),
    (error: any) => error.code === 'self-bootstrap-closeout.worker-result-missing' && error.details.code === 23);
  t.after(() => fs.rmSync(path.dirname(handoff.resultFile), { recursive: true, force: true }));
  assert.equal(fs.existsSync(path.join(fixture.directory,'activation.lock')),true,'an uncompleted operation keeps its recovery evidence');
});

test('independent closeout finishes restoration and releases its lock after the initiating process group is terminated', {skip:process.platform === 'win32'}, async (t: any) => {
  const fixture=detachedFixture(t),handoffFile=path.join(fixture.directory,'handoff.json');
  const entry=path.join(fixture.directory,'caller.mjs');
  const helper=path.resolve(import.meta.dirname,'../../../../../../skills/buildr-self-bootstrap-sync/scripts/detached-execution.mjs');
  fs.writeFileSync(entry, `
    import fs from 'node:fs';
    import {runDetachedCloseout} from ${JSON.stringify(helper)};
    await runDetachedCloseout({args:${JSON.stringify([fixture.directory,'wait'])},runnerModule:${JSON.stringify(fixture.runnerModule)},
      onHandoff(value){fs.writeFileSync(${JSON.stringify(handoffFile)},JSON.stringify(value));}});
  `);
  const caller=spawn(process.execPath,[entry],{detached:true,stdio:'ignore'});
  const callerExit=new Promise(resolve=>caller.once('exit',resolve));
  t.after(()=>{try{process.kill(-caller.pid!,'SIGKILL');}catch{}});
  await waitForExecutionFile(handoffFile);
  const handoff=JSON.parse(fs.readFileSync(handoffFile,'utf8'));
  t.after(()=>{try{process.kill(handoff.pid,'SIGKILL');}catch{}fs.rmSync(path.dirname(handoff.resultFile),{recursive:true,force:true});});
  await waitForExecutionFile(path.join(fixture.directory,'worker-ready'));
  process.kill(-caller.pid!,'SIGTERM');
  await callerExit;
  process.kill(handoff.pid,0);
  fs.writeFileSync(path.join(fixture.directory,'continue'),'old host has exited');
  await waitForExecutionFile(handoff.resultFile);
  assert.equal(fs.readFileSync(path.join(fixture.directory,'replacement-started'),'utf8'),'healthy');
  assert.equal(fs.existsSync(path.join(fixture.directory,'activation.lock')),false);
  assert.equal(JSON.parse(fs.readFileSync(handoff.resultFile,'utf8')).status,'passed');
});

test('the real closeout CLI transfers ownership before parsing and returns the worker failure unchanged', async (t: any) => {
  const script=path.resolve(import.meta.dirname,'../../../../../../skills/buildr-self-bootstrap-sync/scripts/closeout.mjs');
  const result=run(process.execPath,[script,'--unsupported','value'],process.cwd());
  assert.equal(result.status,1);
  const [handoffLine,...errorLines]=result.stderr.trim().split('\n');
  const handoff=JSON.parse(handoffLine);
  t.after(()=>fs.rmSync(path.dirname(handoff.resultFile),{recursive:true,force:true}));
  assert.equal(handoff.schemaVersion,'buildr.self-bootstrap-execution/v1');
  assert.equal(result.stdout,'');
  const output=JSON.parse(errorLines.join('\n'));
  assert.equal(output.status,'blocked');
  assert.equal(output.primaryFailure.code,'self-bootstrap-closeout.option-unknown');
  assert.equal(JSON.parse(fs.readFileSync(handoff.resultFile,'utf8')).diagnostic.code,'self-bootstrap-closeout.option-unknown');
});

test('file-backed command capture parses complete large JSON and preserves binary, failure and signal evidence', () => {
  const output: any = defaultExecute(process.execPath, ['-e', `
    const fs = require('node:fs');
    if (process.platform !== 'win32' && [1,2].some(fd => (fs.fstatSync(fd).mode & 0o777) !== 0o600)) process.exit(9);
    process.stdout.write(JSON.stringify({ value: 'x'.repeat(3 * 1024 * 1024) }));
    process.stderr.write('e'.repeat(2 * 1024 * 1024));
  `], { cwd: process.cwd() });
  assert.equal(output.status, 0); assert.equal(output.signal, null);
  assert.equal(JSON.parse(output.stdout).value.length, 3 * 1024 * 1024);
  assert.equal(output.stderr.length, 2 * 1024 * 1024);
  const binary = defaultExecute(process.execPath, ['-e', 'process.stdout.write(Buffer.from([0,255,1]))'], { cwd: process.cwd(), binary: true });
  assert.deepEqual(binary.stdout, Buffer.from([0,255,1]));
  const failed = defaultExecute(process.execPath, ['-e', 'process.exit(23)'], { cwd: process.cwd() });
  assert.equal(failed.status, 23);
  const missing = defaultExecute(path.join(os.tmpdir(), 'buildr-nonexistent-executable'), [], { cwd: process.cwd() });
  assert.equal(missing.status, 1); assert.equal(missing.errorCode, 'ENOENT');
  if (process.platform !== 'win32') {
    const killed = defaultExecute(process.execPath, ['-e', "process.kill(process.pid, 'SIGTERM')"], { cwd: process.cwd() });
    assert.equal(killed.status, 1); assert.equal(killed.signal, 'SIGTERM');
  }
});

test('phase and operation timing remains nonnegative with a regressing wall clock and summaries stay bounded', t => {
  const f = directFixture(t), perform = executor(f.root);
  const originalNow = Date.now; let wall = originalNow();
  Date.now = () => wall -= 100000;
  let result: any;
  try {
    result = runDirectSelfBootstrapCloseout({ ...f.input, execute: (executable: string, args: string[], context: any) => {
      const output = perform(executable, args, context);
      if (args[0]?.endsWith('/prepare-development-agent.ts')) output.stdout = 'x'.repeat(3 * 1024 * 1024);
      return output;
    } });
  } finally { Date.now = originalNow; }
  assert.equal(result.status, 'passed');
  assert.ok(result.durationMs > 0, 'a regressing wall clock must not clamp real execution duration to zero');
  assert.ok(result.phases.some((stage: any) => stage.durationMs > 0));
  for (const item of [result, ...result.phases, ...result.phases.flatMap((stage: any) => stage.operations)]) {
    assert.equal(Number.isNaN(Date.parse(item.startedAt)), false);
    assert.equal(Number.isNaN(Date.parse(item.finishedAt)), false);
    assert.ok(Number.isFinite(item.durationMs) && item.durationMs >= 0);
  }
  for (const item of result.phases.flatMap((stage: any) => stage.operations)) {
    assert.ok(item.stdout.length <= 2000); assert.ok(item.stderr.length <= 2000);
  }
});

test('worker log exposes fixed phase and operation start before a synchronous child completes without secrets', async t => {
  const f = directFixture(t), directory = path.dirname(f.root), runnerModule = path.join(directory, 'progress-runner.mjs');
  const ready = path.join(directory, 'synchronous-child-ready'), release = path.join(directory, 'release-child');
  const helper = path.resolve(import.meta.dirname, '../../../../../../skills/buildr-self-bootstrap-sync/scripts/closeout.mjs');
  fs.writeFileSync(runnerModule, `
    import fs from 'node:fs';
    import { runDirectSelfBootstrapCloseout, defaultExecute } from ${JSON.stringify(helper)};
    export function runSelfBootstrapCloseoutCommand({args}) {
      return runDirectSelfBootstrapCloseout({ ...JSON.parse(args[0]), execute(executable, argv, options) {
        if (argv[0]?.endsWith('/prepare-development-agent.ts')) return defaultExecute(process.execPath, ['-e',
          ${JSON.stringify(`const fs = require('node:fs'); if (process.env.BUILDR_DEVELOPMENT_PROGRESS_FD !== '3') process.exit(13); fs.writeSync(3, JSON.stringify({schemaVersion:'buildr.self-bootstrap-progress/v1',scope:'phase',event:'started',id:'nested-web-preparation',phaseId:null,status:null,startedAt:new Date().toISOString(),finishedAt:null,durationMs:null}) + '\\n'); process.stdout.write('secret-raw-output'); process.stderr.write('secret-raw-stderr'); fs.writeFileSync(${JSON.stringify(ready)}, 'ready'); while (!fs.existsSync(${JSON.stringify(release)})) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 15);`)}, 'secret-argument'], { ...options, env: { ...options.env, SECRET_ENV: 'secret-environment' } });
        return defaultExecute(executable, argv, options);
      } });
    }
  `);
  let handoff: any;
  const pending = runDetachedCloseout({ args: [JSON.stringify(f.input)], runnerModule, onHandoff(value: any) { handoff = value; } });
  try {
    await waitForExecutionFile(ready);
    const log = fs.readFileSync(handoff.logFile, 'utf8');
    const events = log.trim().split('\n').map(line => JSON.parse(line));
    assert.ok(events.some(event => event.scope === 'phase' && event.event === 'started' && event.id === 'preflight'));
    assert.ok(events.some(event => event.scope === 'operation' && event.event === 'started' && event.id === 'prepare-agent-package'));
    assert.ok(events.some(event => event.scope === 'phase' && event.event === 'started' && event.id === 'nested-web-preparation'));
    assert.equal(events.some(event => event.event === 'finished' && event.id === 'prepare-agent-package'), false);
    assert.doesNotMatch(log, /secret-argument|secret-environment|secret-raw-output|secret-raw-stderr|SECRET_ENV/);
    for (const event of events) assert.deepEqual(Object.keys(event).sort(), ['schemaVersion','scope','event','id','phaseId','status','startedAt','finishedAt','durationMs'].sort());
  } finally {
    fs.writeFileSync(release, 'continue');
    await pending;
    if (handoff) t.after(() => fs.rmSync(path.dirname(handoff.resultFile), { recursive: true, force: true }));
  }
  const finalLog = fs.readFileSync(handoff.logFile, 'utf8');
  assert.doesNotMatch(finalLog, /secret-argument|secret-environment|secret-raw-output|secret-raw-stderr|SECRET_ENV/);
  assert.ok(finalLog.includes('"event":"finished","id":"prepare-agent-package"'));
});

test('explicit restart reaches the owned continuity path even without runtime changes', t => {
  const f=fixture(t),calls: any[]=[];
  const perform=executor(f.root,{runningDevelopmentInstance:true});
  const result=runSelfBootstrapCloseoutCommand({
    args:['--target',f.root,'--base-ref',f.baseRef,'--delivered-ref',git(f.root,'rev-parse','HEAD'),'--branch','dev','--remote','origin','--agent','codex','--node-executable',process.execPath,'--restart-development-web','true'],
    environment:f.environment,execute:(executable: string,args: string[],context: any)=>{calls.push(args);return perform(executable,args,context);},
  });
  assert.equal(result.status,'passed',JSON.stringify(result));
  assert.ok(result.phases.some((p: any)=>p.id==='install-buildr-web'));
  const restart=calls.find(args=>args[0].endsWith('development-web-continuity.mjs')&&args[1]==='restart');
  assert.ok(restart);assert.deepEqual(restart.slice(-2),['--force-restart','true']);
  assert.throws(()=>runSelfBootstrapCloseoutCommand({args:['--target',f.root,'--node-executable',process.execPath,'--restart-development-web','yes']}), (e: any)=>e.code==='self-bootstrap-closeout.restart-value-invalid');
});

test('install-buildr-web refreshes installed owned Harness Dev launcher, activates running agent runtime, and verifies enabled standalone Harness Web', t => {
  const f = fixture(t);
  const harnessEntry = path.join(f.root, 'projects/product/services/buildr-harness/bin/buildr-harness.mjs');
  fs.mkdirSync(path.dirname(harnessEntry), { recursive: true });
  fs.writeFileSync(harnessEntry, '#!/usr/bin/env node\n', { mode: 0o755 });
  git(f.root, 'add', '--', 'projects/product/services/buildr-harness/bin/buildr-harness.mjs');
  git(f.root, 'commit', '-m', 'add harness cli entrypoint');
  git(f.root, 'push', 'origin', 'dev');
  const deliveredRef = git(f.root, 'rev-parse', 'HEAD');

  const testHome = path.join(path.dirname(f.root), 'harness-home');
  const dataRoot = path.join(path.dirname(f.root), 'harness-data-root');
  const launcherTarget = process.platform === 'win32'
    ? path.join(testHome, 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Buildr Harness Dev.lnk')
    : path.join(testHome, 'Applications', 'Buildr Harness Dev.app');
  const bindingFile = process.platform === 'win32'
    ? path.join(`${launcherTarget}.buildr-harness`, 'harness-launcher.json')
    : path.join(launcherTarget, 'Contents', 'Resources', 'harness-launcher.json');
  fs.mkdirSync(path.dirname(bindingFile), { recursive: true });
  if (process.platform === 'win32') fs.writeFileSync(launcherTarget, 'lnk');
  fs.writeFileSync(bindingFile, JSON.stringify({ schemaVersion: 1, productId: 'buildr-harness', profile: 'development', entry: harnessEntry, dataRoot, target: launcherTarget }));

  const instanceFile = path.join(dataRoot, 'agent-service', 'process', 'instance.json');
  fs.mkdirSync(path.dirname(instanceFile), { recursive: true });
  fs.writeFileSync(instanceFile, JSON.stringify({ identity: { pid: process.pid } }));

  const sessionStateFile = path.join(dataRoot, 'agent-service', 'harness-web', 'session-state.json');
  fs.mkdirSync(path.dirname(sessionStateFile), { recursive: true });
  fs.writeFileSync(sessionStateFile, JSON.stringify({ version: 1, endpointId: 'ep-1', enabled: true, port: 9519, tickets: [], sessions: [] }));

  const environment = {
    ...f.environment,
    HOME: testHome,
    ...(process.platform === 'win32' ? { APPDATA: path.join(testHome, 'AppData', 'Roaming') } : {}),
    BUILDR_APP_DATA_DIR: dataRoot,
  };
  delete environment.BUILDR_HOST_HOME;

  const harnessCalls: any[] = [];
  const baseExecute = executor(f.root);
  const result: any = runDirectSelfBootstrapCloseout({
    workspaceRoot: f.root,
    taskId: 'harness-sync-owned',
    baseRef: f.baseRef,
    deliveredRef,
    targetBranch: 'dev',
    remote: 'origin',
    agent: 'codex',
    nodeExecutable: process.execPath,
    environment,
    execute(executable: string, args: string[], context: any) {
      if (executable === process.execPath && args[0] === harnessEntry) {
        harnessCalls.push(args.slice(1));
        if (args[1] === 'launcher' && args[2] === 'install') {
          return { status: 0, stdout: JSON.stringify({ status: 'installed', binding: { target: launcherTarget } }), stderr: '' };
        }
        if (args[1] === 'activate') {
          return { status: 0, stdout: JSON.stringify({ status: 'ready', targetDigest: 'sha256-next', currentDigest: 'sha256-next', generation: 'gen-2', accepting: true }), stderr: '' };
        }
        if (args[1] === 'web') {
          return { status: 0, stdout: JSON.stringify({ status: 'ready', web: { enabled: true, ready: true, origin: 'http://127.0.0.1:9519' } }), stderr: '' };
        }
      }
      return baseExecute(executable, args, context);
    },
  });

  assert.equal(result.status, 'passed', JSON.stringify(result));
  assert.ok(harnessCalls.some(args => args[0] === 'launcher' && args[1] === 'install' && args.includes('--target') && args.includes(launcherTarget)));
  assert.ok(harnessCalls.some(args => args[0] === 'activate' && args.includes('--profile') && args.includes('development')));
  assert.ok(harnessCalls.some(args => args[0] === 'web' && args.includes('--port') && args.includes('9519') && args.includes('--no-open')));
  const webPhase = result.phases.find((stage: any) => stage.id === 'install-buildr-web');
  assert.ok(webPhase.effects.some((effect: any) => effect.type === 'harness-launcher-refreshed' && effect.target === launcherTarget));
  assert.ok(webPhase.effects.some((effect: any) => effect.type === 'harness-runtime-activated' && effect.digest === 'sha256-next'));
  assert.ok(webPhase.effects.some((effect: any) => effect.type === 'harness-web-verified' && effect.port === 9519));
});

test('install-buildr-web skips absent or foreign Harness launcher, idle backend, and disabled standalone Harness Web', t => {
  const f = fixture(t);
  const harnessEntry = path.join(f.root, 'projects/product/services/buildr-harness/bin/buildr-harness.mjs');
  fs.mkdirSync(path.dirname(harnessEntry), { recursive: true });
  fs.writeFileSync(harnessEntry, '#!/usr/bin/env node\n', { mode: 0o755 });
  git(f.root, 'add', '--', 'projects/product/services/buildr-harness/bin/buildr-harness.mjs');
  git(f.root, 'commit', '-m', 'add harness cli entrypoint');
  git(f.root, 'push', 'origin', 'dev');
  const deliveredRef = git(f.root, 'rev-parse', 'HEAD');

  const testHome = path.join(path.dirname(f.root), 'harness-home-absent');
  const dataRoot = path.join(path.dirname(f.root), 'harness-data-absent');
  const foreignTarget = process.platform === 'win32'
    ? path.join(testHome, 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Buildr Harness Dev.lnk')
    : path.join(testHome, 'Applications', 'Buildr Harness Dev.app');
  const foreignBindingFile = process.platform === 'win32'
    ? path.join(`${foreignTarget}.buildr-harness`, 'harness-launcher.json')
    : path.join(foreignTarget, 'Contents', 'Resources', 'harness-launcher.json');
  fs.mkdirSync(path.dirname(foreignBindingFile), { recursive: true });
  if (process.platform === 'win32') fs.writeFileSync(foreignTarget, 'lnk');
  fs.writeFileSync(foreignBindingFile, JSON.stringify({ schemaVersion: 1, productId: 'buildr-harness', profile: 'development', entry: '/foreign/checkout/bin/buildr-harness.mjs', dataRoot, target: foreignTarget }));

  const sessionStateFile = path.join(dataRoot, 'agent-service', 'harness-web', 'session-state.json');
  fs.mkdirSync(path.dirname(sessionStateFile), { recursive: true });
  fs.writeFileSync(sessionStateFile, JSON.stringify({ version: 1, endpointId: 'ep-1', enabled: false, port: 9519, tickets: [], sessions: [] }));

  const environment = {
    ...f.environment,
    HOME: testHome,
    ...(process.platform === 'win32' ? { APPDATA: path.join(testHome, 'AppData', 'Roaming') } : {}),
    BUILDR_APP_DATA_DIR: dataRoot,
  };
  delete environment.BUILDR_HOST_HOME;

  const harnessCalls: any[] = [];
  const baseExecute = executor(f.root);
  const result: any = runDirectSelfBootstrapCloseout({
    workspaceRoot: f.root,
    taskId: 'harness-sync-absent',
    baseRef: f.baseRef,
    deliveredRef,
    targetBranch: 'dev',
    remote: 'origin',
    agent: 'codex',
    nodeExecutable: process.execPath,
    environment,
    execute(executable: string, args: string[], context: any) {
      if (executable === process.execPath && args[0] === harnessEntry) harnessCalls.push(args.slice(1));
      return baseExecute(executable, args, context);
    },
  });

  assert.equal(result.status, 'passed', JSON.stringify(result));
  assert.deepEqual(harnessCalls, []);
  const webPhase = result.phases.find((stage: any) => stage.id === 'install-buildr-web');
  assert.equal(webPhase.effects.some((effect: any) => String(effect.type).startsWith('harness-')), false);
});

test('install-buildr-web upgrades owned legacy Harness Dev launcher to the prepared runtime entry while skipping foreign entries', t => {
  const f = fixture(t);
  const legacyEntry = path.join(f.root, 'projects/product/services/buildr-harness/bin/buildr-harness.mjs');
  const preparedEntry = path.join(f.root, 'projects/product/services/buildr/node_modules/@buildr-ai/buildr-harness/bin/buildr-harness.mjs');
  for (const file of [legacyEntry, preparedEntry]) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '#!/usr/bin/env node\n', { mode: 0o755 });
  }
  git(f.root, 'add', '--', 'projects/product/services/buildr-harness/bin/buildr-harness.mjs');
  git(f.root, 'commit', '-m', 'add harness entry');
  git(f.root, 'push', 'origin', 'dev');
  const deliveredRef = git(f.root, 'rev-parse', 'HEAD');

  const testHome = path.join(path.dirname(f.root), 'harness-home-upgrade');
  const dataRoot = path.join(path.dirname(f.root), 'harness-data-upgrade');
  const ownedTarget = process.platform === 'win32'
    ? path.join(testHome, 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Buildr Harness Dev.lnk')
    : path.join(testHome, 'Applications', 'Buildr Harness Dev.app');
  const ownedBindingFile = process.platform === 'win32'
    ? path.join(`${ownedTarget}.buildr-harness`, 'harness-launcher.json')
    : path.join(ownedTarget, 'Contents', 'Resources', 'harness-launcher.json');
  fs.mkdirSync(path.dirname(ownedBindingFile), { recursive: true });
  if (process.platform === 'win32') fs.writeFileSync(ownedTarget, 'lnk');
  fs.writeFileSync(ownedBindingFile, JSON.stringify({ schemaVersion: 1, productId: 'buildr-harness', profile: 'development', entry: legacyEntry, dataRoot, target: ownedTarget }));

  const foreignTarget = '/Applications/Buildr Harness Dev.app';
  const foreignBindingFile = process.platform === 'win32'
    ? path.join(`${foreignTarget}.buildr-harness`, 'harness-launcher.json')
    : path.join(foreignTarget, 'Contents', 'Resources', 'harness-launcher.json');
  const instanceFile = path.join(dataRoot, 'agent-service', 'process', 'instance.json');
  fs.mkdirSync(path.dirname(instanceFile), { recursive: true });
  fs.writeFileSync(instanceFile, JSON.stringify({ identity: { pid: process.pid } }));

  const environment = {
    ...f.environment,
    HOME: testHome,
    ...(process.platform === 'win32' ? { APPDATA: path.join(testHome, 'AppData', 'Roaming') } : {}),
    BUILDR_APP_DATA_DIR: dataRoot,
  };
  delete environment.BUILDR_HOST_HOME;

  const harnessCalls: Array<{ executable: string; args: string[] }> = [];
  const baseExecute = executor(f.root);
  const result: any = runDirectSelfBootstrapCloseout({
    workspaceRoot: f.root,
    taskId: 'harness-sync-upgrade-prepared',
    baseRef: f.baseRef,
    deliveredRef,
    targetBranch: 'dev',
    remote: 'origin',
    agent: 'codex',
    nodeExecutable: process.execPath,
    environment,
    execute(executable: string, args: string[], context: any) {
      if (executable === process.execPath && (args[0] === preparedEntry || args[0] === legacyEntry)) {
        harnessCalls.push({ executable: args[0], args: args.slice(1) });
        if (args[1] === 'launcher' && args[2] === 'install') {
          return { status: 0, stdout: JSON.stringify({ status: 'installed', binding: { target: ownedTarget, entry: args[0] } }), stderr: '' };
        }
        if (args[1] === 'activate') {
          return { status: 0, stdout: JSON.stringify({ status: 'ready', targetDigest: 'sha256-unified', currentDigest: 'sha256-unified', generation: 'gen-3', accepting: true }), stderr: '' };
        }
      }
      return baseExecute(executable, args, context);
    },
  });

  assert.equal(result.status, 'passed', JSON.stringify(result));
  assert.ok(harnessCalls.every(call => sameOrExact(call.executable, preparedEntry)));
  assert.ok(harnessCalls.some(call => call.args[0] === 'launcher' && call.args[1] === 'install' && call.args.includes(ownedTarget)));
  assert.ok(harnessCalls.some(call => call.args[0] === 'activate' && call.args.includes('--profile') && call.args.includes('development')));
  assert.equal(fs.existsSync(foreignBindingFile) && harnessCalls.some(call => call.args.includes(foreignTarget)), false);
  function sameOrExact(left: string, right: string) { return path.resolve(left) === path.resolve(right); }
});
