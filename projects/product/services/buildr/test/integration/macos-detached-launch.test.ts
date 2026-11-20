import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import test from 'node:test';
import { stopAgentProcess } from '@buildr-ai/buildr-harness';
import { launchDetachedProcess, parseLaunchctlPrint } from '../../src/infrastructure/detached-launch.ts';
import { buildLauncher } from '../../tools/build/launcher/build.ts';

const PRODUCT_ROOT = path.resolve(import.meta.dirname, '../..');

function parseResourceCoalitionId(launchctlPrintOutput: string): string | null {
  const match = /\tresource coalition = \{\s*\n[^\}]*?\bID = (\d+)/m.exec(launchctlPrintOutput);
  return match?.[1] ?? null;
}

test('launchDetachedProcess 在真实 macOS 通过 launchd 启动独立 coalition 作业，清理 plist 并可 bootout', { skip: process.platform !== 'darwin' }, async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-macos-launchd-it-'));
  const stateDir = path.join(dir, 'jobs');
  const observedFile = path.join(dir, 'observed.json');
  const outLog = path.join(dir, 'worker.log');
  let handle: ReturnType<typeof launchDetachedProcess> | null = null;
  let handle2: ReturnType<typeof launchDetachedProcess> | null = null;
  t.after(() => {
    try { handle?.bootout(); } catch { /* Best-effort cleanup. */ }
    try { handle2?.bootout(); } catch { /* Best-effort cleanup. */ }
    fs.rmSync(dir, { recursive: true, force: true });
  });

  handle = launchDetachedProcess({
    command: process.execPath,
    args: [
      '-e',
      `const fs=require('node:fs');fs.writeFileSync(${JSON.stringify(observedFile)},JSON.stringify({pid:process.pid,ppid:process.ppid,marker:process.env.ISOLATION_MARKER}));setInterval(()=>{},5000);`,
    ],
    cwd: dir,
    env: { ...process.env, ISOLATION_MARKER: 'secret-isolated-token' },
    labelPrefix: 'it-detached',
    stateDir,
    standardOutPath: outLog,
    standardErrorPath: outLog,
  }, {
    env: { ...process.env, BUILDR_DETACHED_ISOLATION: 'launchd' },
  });

  assert.equal(handle.isolationMode, 'launchd');
  assert.ok(handle.pid > 1);
  assert.ok(handle.jobLabel);
  assert.ok(handle.domainTarget);

  const files = fs.readdirSync(stateDir);
  assert.ok(!files.some(name => name.endsWith('.plist')), 'staging plist must not remain on disk');
  const recordFile = files.find(name => name.endsWith('.json'));
  assert.ok(recordFile);
  assert.doesNotMatch(fs.readFileSync(path.join(stateDir, recordFile!), 'utf8'), /secret-isolated-token/);

  const deadline = Date.now() + 5000;
  while (!fs.existsSync(observedFile) && Date.now() < deadline) await new Promise(r => setTimeout(r, 25));
  assert.equal(fs.existsSync(observedFile), true);
  const observed = JSON.parse(fs.readFileSync(observedFile, 'utf8'));
  assert.equal(observed.pid, handle.pid);
  assert.equal(observed.ppid, 1, 'launchd-bootstrapped process must be reparented to PID 1');
  assert.equal(observed.marker, 'secret-isolated-token');

  const printed = execFileSync('/bin/launchctl', ['print', `${handle.domainTarget}/${handle.jobLabel}`], { encoding: 'utf8' });
  const parsed = parseLaunchctlPrint(printed);
  assert.equal(parsed.state, 'running');
  assert.equal(parsed.pid, handle.pid);
  const coalition1 = parseResourceCoalitionId(printed);
  assert.ok(coalition1, `expected resource coalition ID in launchctl print output:\n${printed}`);

  handle2 = launchDetachedProcess({
    command: process.execPath,
    args: ['-e', 'setInterval(()=>{},5000);'],
    cwd: dir,
    env: { ...process.env },
    labelPrefix: 'it-detached-peer',
    stateDir,
  }, {
    env: { ...process.env, BUILDR_DETACHED_ISOLATION: 'launchd' },
  });
  assert.equal(handle2.isolationMode, 'launchd');
  assert.ok(handle2.pid > 1);
  const printed2 = execFileSync('/bin/launchctl', ['print', `${handle2.domainTarget}/${handle2.jobLabel}`], { encoding: 'utf8' });
  const coalition2 = parseResourceCoalitionId(printed2);
  assert.ok(coalition2, `expected resource coalition ID for peer job:\n${printed2}`);
  assert.notEqual(coalition1, coalition2, 'each launchd-isolated job must receive a distinct macOS resource coalition');

  handle2.bootout();
  handle2 = null;

  handle.bootout();
  const exitedDeadline = Date.now() + 5000;
  while (Date.now() < exitedDeadline) {
    try {
      process.kill(handle.pid, 0);
      await new Promise(r => setTimeout(r, 25));
    } catch {
      break;
    }
  }
  const afterPrint = spawnSync('/bin/launchctl', ['print', `${handle.domainTarget}/${handle.jobLabel}`], { encoding: 'utf8' });
  assert.notEqual(afterPrint.status, 0, 'bootout must unload temporary launchd job');
});

test('Buildr Web Dev.app macOS 入口在真实 launchd 模式下以独立作业运行并保留私有辅助 PATH', { skip: process.platform !== 'darwin' }, async (t) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-macos-app-launchd-'));
  const home = path.join(base, 'home');
  const jobsDir = path.join(home, 'Library', 'Logs', 'Buildr Dev', 'launchd-jobs');
  const sourceRoot = path.join(base, 'checkout/projects/product/services/buildr');
  const output = path.join(base, 'launcher');
  const defaultBin = path.join(base, 'npm-bin');
  const observation = path.join(base, 'observed.json');
  t.after(() => {
    try {
      if (fs.existsSync(jobsDir)) {
        for (const name of fs.readdirSync(jobsDir)) {
          if (!name.endsWith('.json')) continue;
          const rec = JSON.parse(fs.readFileSync(path.join(jobsDir, name), 'utf8'));
          if (rec?.domain && rec?.label) spawnSync('/bin/launchctl', ['bootout', `${rec.domain}/${rec.label}`], { stdio: 'ignore' });
        }
      }
    } catch { /* Best-effort cleanup. */ }
    fs.rmSync(base, { recursive: true, force: true });
  });

  fs.mkdirSync(path.join(sourceRoot, 'tools/development/programs'), { recursive: true });
  fs.mkdirSync(path.join(sourceRoot, 'bin'), { recursive: true });
  fs.mkdirSync(path.join(sourceRoot, 'src'), { recursive: true });
  fs.mkdirSync(path.join(sourceRoot, 'resources'), { recursive: true });
  fs.mkdirSync(defaultBin, { recursive: true });
  fs.mkdirSync(home, { recursive: true });
  fs.writeFileSync(path.join(sourceRoot, 'resources/manifest.yml'), 'fixture\n');
  fs.writeFileSync(
    path.join(sourceRoot, 'bin/buildr.mjs'),
    `import fs from 'node:fs';fs.writeFileSync(${JSON.stringify(observation)},JSON.stringify({pid:process.pid,ppid:process.ppid,args:process.argv.slice(2),path:process.env.PATH,identity:process.env.BUILDR_LAUNCHER_IDENTITY}));\n`,
  );

  buildLauncher({
    platform: 'darwin',
    output,
    identity: {
      schemaVersion: 'buildr.launcher-identity/v1',
      version: '0.0.0',
      channel: 'development',
      runtimeRole: 'development',
      source: 'checkout',
      buildId: 'launchd-wrapper-it',
      buildNumber: '1',
      protocolVersion: 1,
      protocolIdentity: 'buildr.web-protocol/v1',
      platform: 'darwin',
      builtAt: new Date().toISOString(),
      sourceRoot,
      developmentRuntime: {
        executable: process.execPath,
        version: process.versions.node,
        identity: `development-host:${process.execPath}:${process.versions.node}`,
      },
    },
  });

  const wrapper = path.join(output, 'Buildr Web Dev.app/Contents/MacOS/Buildr');
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    HOME: home,
    PATH: [defaultBin, '/usr/bin', '/bin'].join(path.delimiter),
    BUILDR_LAUNCHER_NO_OPEN: '1',
    BUILDR_DETACHED_ISOLATION: 'launchd',
  };
  delete env.BUILDR_NODE;
  const res = spawnSync('/bin/sh', [wrapper], { env, encoding: 'utf8', timeout: 10_000 });
  assert.equal(res.status, 0, res.stderr);

  const deadline = Date.now() + 8000;
  while (!fs.existsSync(observation) && Date.now() < deadline) await new Promise(r => setTimeout(r, 25));
  assert.equal(fs.existsSync(observation), true);
  const observed = JSON.parse(fs.readFileSync(observation, 'utf8'));
  assert.equal(observed.ppid, 1);
  assert.deepEqual(observed.args, ['web', '--port', '4458', '--no-open']);
  assert.deepEqual(observed.path.split(path.delimiter), [
    path.join(sourceRoot, 'tools/development/programs'),
    path.dirname(process.execPath),
    defaultBin,
    '/usr/bin',
    '/bin',
  ]);
  assert.ok(fs.existsSync(jobsDir));
  assert.ok(!fs.readdirSync(jobsDir).some(name => name.endsWith('.plist')));
});

test('runDetachedCloseout 在真实 launchd 模式下独立运行自举 worker 并正常回收结果', { skip: process.platform !== 'darwin' }, async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-macos-worker-launchd-'));
  const previousIsolation = process.env.BUILDR_DETACHED_ISOLATION;
  let resultDir: string | null = null;
  t.after(() => {
    if (previousIsolation === undefined) delete process.env.BUILDR_DETACHED_ISOLATION;
    else process.env.BUILDR_DETACHED_ISOLATION = previousIsolation;
    fs.rmSync(dir, { recursive: true, force: true });
    if (resultDir) fs.rmSync(resultDir, { recursive: true, force: true });
  });

  const runnerModule = path.join(dir, 'runner.mjs');
  const workerObserved = path.join(dir, 'worker-observed.json');
  fs.writeFileSync(
    runnerModule,
    `import fs from 'node:fs';export async function runSelfBootstrapCloseoutCommand({ args }) { fs.writeFileSync(${JSON.stringify(workerObserved)}, JSON.stringify({ ppid: process.ppid, args })); return { schemaVersion: 'buildr.self-bootstrap-closeout-result/v1', status: 'passed' }; }\n`,
  );

  const { runDetachedCloseout } = await import('../../../../../../skills/buildr-self-bootstrap-sync/scripts/detached-execution.mjs');
  process.env.BUILDR_DETACHED_ISOLATION = 'launchd';
  let handoffPid: number | undefined;
  const result = await runDetachedCloseout({
    args: ['--check', 'yes'],
    runnerModule,
    onHandoff: (evidence: { pid?: number; resultFile: string }) => {
      handoffPid = evidence.pid;
      resultDir = path.dirname(evidence.resultFile);
    },
  });

  assert.equal(result.status, 'passed');
  assert.ok((handoffPid ?? 0) > 1);
  const observed = JSON.parse(fs.readFileSync(workerObserved, 'utf8'));
  assert.equal(observed.ppid, 1);
  assert.deepEqual(observed.args, ['--check', 'yes']);
});

test('stopAgentProcess 在真实 macOS 停服后自动注销并清理已退出的 launchd 作业', { skip: process.platform !== 'darwin' }, async (t) => {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-macos-stop-prune-'));
  const jobsDir = path.join(dataRoot, 'agent-service', 'process', 'launchd-jobs');
  let handle: ReturnType<typeof launchDetachedProcess> | null = null;
  t.after(() => {
    try { handle?.bootout(); } catch { /* Best-effort cleanup. */ }
    fs.rmSync(dataRoot, { recursive: true, force: true });
  });

  handle = launchDetachedProcess({
    command: process.execPath,
    args: ['-e', 'process.exit(0)'],
    cwd: dataRoot,
    labelPrefix: 'it-stop-prune',
    stateDir: jobsDir,
  }, {
    env: { ...process.env, BUILDR_DETACHED_ISOLATION: 'launchd' },
  });

  assert.equal(handle.isolationMode, 'launchd');
  assert.ok(handle.jobLabel);
  assert.ok(handle.domainTarget);

  const deadline = Date.now() + 5000;
  while (Date.now() < deadline && handle.pollStatus().running) {
    await new Promise(r => setTimeout(r, 25));
  }
  assert.equal(handle.pollStatus().running, false);
  const beforePrint = spawnSync('/bin/launchctl', ['print', `${handle.domainTarget}/${handle.jobLabel}`], { encoding: 'utf8' });
  assert.equal(beforePrint.status, 0, 'exited launchd job remains registered until pruned');
  assert.deepEqual(fs.readdirSync(jobsDir), [`${handle.jobLabel}.json`]);

  await stopAgentProcess({ dataRoot });

  const afterPrint = spawnSync('/bin/launchctl', ['print', `${handle.domainTarget}/${handle.jobLabel}`], { encoding: 'utf8' });
  assert.notEqual(afterPrint.status, 0, 'stopAgentProcess must boot out exited launchd jobs');
  assert.deepEqual(fs.readdirSync(jobsDir), []);
  handle = null;
});
