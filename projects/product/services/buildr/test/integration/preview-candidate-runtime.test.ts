import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { connectAgentProcess, stopAgentProcess } from '@buildr-ai/buildr-agent';

import { previewDataRoot, readPreviewOwner, startPreview, stopPreview, type PreviewRuntime } from '../../src/web/application/preview-lifecycle.ts';
import { computePreviewCandidateDigest, previewCandidateSourceDigest } from '../../src/web/application/preview-candidate.ts';
import { defaultWebDataRoot } from '../../src/modules/installation/contracts/web-profile.ts';

function coded(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code;
}

function seedPreparedCandidate(productRoot: string): void {
  const agentPackage = path.join(productRoot, 'node_modules', '@buildr-ai', 'buildr-agent');
  fs.mkdirSync(path.join(agentPackage, 'build', 'process'), { recursive: true });
  fs.writeFileSync(path.join(agentPackage, 'package.json'), '{"name":"@buildr-ai/buildr-agent","version":"0.0.0-fixture"}\n');
  fs.writeFileSync(path.join(agentPackage, 'build', 'index.js'), '// fixture public entry\n');
  fs.writeFileSync(path.join(agentPackage, 'build', 'process', 'entry.js'), '// fixture process entry\n');
  fs.mkdirSync(path.join(productRoot, 'web-dist'), { recursive: true });
  fs.writeFileSync(path.join(productRoot, 'web-dist', 'index.html'), '<!doctype html><title>fixture</title>\n');
  const sourceDigest = previewCandidateSourceDigest(productRoot);
  fs.writeFileSync(path.join(productRoot, 'node_modules', '.buildr-preview-candidate.json'),
    `${JSON.stringify({ schemaVersion: 'buildr.local-app-preview-candidate/v1', sourceDigest }, null, 2)}\n`);
}

function snapshotTree(root: string): Array<{ name: string; bytes: string }> {
  if (!fs.existsSync(root)) return [];
  const result: Array<{ name: string; bytes: string }> = [];
  const visit = (directory: string) => {
    for (const name of fs.readdirSync(directory).sort()) {
      if (name === '.git') continue;
      const file = path.join(directory, name);
      const info = fs.lstatSync(file);
      if (info.isDirectory()) visit(file);
      else if (info.isFile()) result.push({ name: path.relative(root, file), bytes: fs.readFileSync(file).toString('hex') });
    }
  };
  visit(root);
  return result.sort((left, right) => left.name.localeCompare(right.name));
}

// Real subprocess + HTTP boundary with only the Web worker replaced. The worker
// reports the candidate digest it was pinned with (or a stale/absent one), so the
// readiness gate and fail-closed recycle run against the real preview lifecycle.
function candidateFixture(t: test.TestContext, { candidateMode = 'ready' }: { candidateMode?: 'ready' | 'mismatch' | 'absent' } = {}) {
  const target = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-preview-candidate-')));
  const canonical = path.join(target, 'canonical');
  const worktree = path.join(target, 'task-worktree');
  const product = path.join(worktree, 'product');
  const dataRoot = path.join(target, 'app-data');
  const home = path.join(target, 'home');
  const worker = path.join(target, 'worker.mjs');
  const pidFile = path.join(target, 'worker.pid');
  const reuseOptions = { home, platform: process.platform, env: { LOCALAPPDATA: path.join(home, 'localappdata'), XDG_STATE_HOME: path.join(home, 'state') } as NodeJS.ProcessEnv };
  const developmentRoot = defaultWebDataRoot('development', reuseOptions);
  const modelAccess = path.join(developmentRoot, 'agent-service', 'model-access');
  fs.mkdirSync(modelAccess, { recursive: true });
  fs.writeFileSync(path.join(modelAccess, 'accounts.json'), '{"version":1,"preferences":{},"accounts":[{"id":"a","identity":"identity-a","provider":"fixture","label":"Fixture","revision":"r1","enabled":true,"status":"not-authenticated","models":[{"id":"m","label":"M"}]}]}\n');
  t.after(async () => {
    await stopAgentProcess({ dataRoot: previewDataRoot('candidate-demo', dataRoot) }).catch(() => {});
    if (fs.existsSync(pidFile)) {
      const pid = Number(fs.readFileSync(pidFile, 'utf8'));
      try { process.kill(pid, 'SIGKILL'); } catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ESRCH')) throw error; }
      for (let attempt = 0; attempt < 100; attempt++) {
        try { process.kill(pid, 0); } catch { break; }
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    }
    fs.rmSync(target, { recursive: true, force: true });
  });
  execFileSync('git', ['init', '--quiet', canonical]);
  execFileSync('git', ['-C', canonical, '-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '--quiet', '--allow-empty', '-m', 'fixture']);
  execFileSync('git', ['-C', canonical, 'worktree', 'add', '--quiet', '--detach', worktree, 'HEAD']);
  const storeDir = path.join(canonical, '.buildr', 'local');
  fs.mkdirSync(storeDir, { recursive: true });
  const canonicalStore = new DatabaseSync(path.join(storeDir, 'workspace.sqlite'));
  canonicalStore.exec('CREATE TABLE marker(id INTEGER PRIMARY KEY);');
  canonicalStore.close();
  fs.mkdirSync(path.join(product, 'bin'), { recursive: true });
  fs.writeFileSync(path.join(product, 'bin', 'buildr.mjs'), '// fixture cli\n');
  seedPreparedCandidate(product);
  fs.writeFileSync(worker, `
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
fs.writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));
const mode = ${JSON.stringify(candidateMode)};
const server = http.createServer((req, res) => {
  if (req.headers['x-buildr-instance'] !== 'fixture-secret') { res.writeHead(403).end(); return; }
  if (req.method === 'POST') { res.writeHead(202).end(); setImmediate(() => process.exit(0)); return; }
  const health = { schemaVersion: 'buildr.local-app-health/v1', status: 'ready', pid: process.pid };
  if (mode === 'ready') health.agentRuntime = { currentDigest: process.env.BUILDR_PREVIEW_AGENT_DIGEST || null, generation: 'candidate-gen', accepting: true, pendingDigest: null };
  else if (mode === 'mismatch') health.agentRuntime = { currentDigest: 'f'.repeat(64), generation: 'stale-gen', accepting: true, pendingDigest: null };
  res.end(JSON.stringify(health));
});
server.listen(0, '127.0.0.1', () => {
  fs.writeFileSync(path.join(process.env.BUILDR_APP_DATA_DIR, 'instance.json'), JSON.stringify({
    schemaVersion: 'buildr.local-app-instance/v1', pid: process.pid,
    url: 'http://127.0.0.1:' + server.address().port, secret: 'fixture-secret',
  }));
});
`);
  const runtime: PreviewRuntime = {
    assertNoUnknownOptions() {},
    optionValue(args: string[], key: string, fallback: string | null) { const index = args.indexOf(key); return index < 0 ? fallback : args[index + 1] || fallback; },
    assertInitializedBuildrWorkspace(root: string) { return root; },
    currentProductInvocation() { return { command: process.execPath, argsPrefix: [worker] }; },
    productRoot() { return path.join(canonical, 'product'); },
    assertCanonicalTaskWorkspace(root: string) { return root; },
    inspectGitWorktrees() {
      return { status: 'ready', repositories: [{ selector: 'workspace', checkoutPath: worktree, branch: 'codex/demo-task', head: 'a'.repeat(40), state: 'ready' }], diagnostic: null };
    },
    readGitWorktreeEvidence() {
      return { file: path.join(target, 'evidence.json'), evidence: { planDigest: 'sha256-' + 'b'.repeat(64), workspaceRoot: canonical } };
    },
    atomicWriteJson(file: string, value: unknown) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); },
    removePath(file: string) { fs.rmSync(file, { force: true }); },
  };
  const caller = { taskId: 'demo-task', workspaceRoot: canonical, worktree, worktreeEvidencePath: path.join(target, 'evidence.json'), worktreePlanDigest: 'sha256-' + 'b'.repeat(64) };
  return {
    target, canonical, worktree, product, dataRoot, developmentRoot, pidFile, runtime, caller,
    expectedDigest: computePreviewCandidateDigest({ serviceRoot: product, node: process.execPath }),
    start(options: { candidateReadyTimeoutMs?: number; extraArgs?: string[] } = {}) {
      const { extraArgs = ['--reuse', 'development'], ...rest } = options;
      return startPreview(runtime, 'candidate-demo', ['--target', canonical, '--task', 'demo-task', '--no-open', ...extraArgs], { dataRoot, reuse: reuseOptions, ...rest });
    },
  };
}

test('候选 digest 生效：后台以钉住 digest 就绪，owner 与 health 携带组件级来源', { timeout: 30_000 }, async (t) => {
  const fixture = candidateFixture(t);
  const started = await fixture.start();
  assert.equal(started.status, 'started');
  assert.equal(started.owner.agent?.digest, fixture.expectedDigest);
  assert.equal(started.owner.agent?.generation, 'candidate-gen');
  assert.equal(started.owner.agent?.accepting, true);
  assert.equal(started.owner.frontendSource, path.join(fixture.product, 'web-dist'));
  assert.equal(started.owner.workspaceMode, 'shared');
  assert.equal(started.owner.reuse?.source, 'development');
  const instance = JSON.parse(fs.readFileSync(path.join(previewDataRoot('candidate-demo', fixture.dataRoot), 'instance.json'), 'utf8'));
  const health = await (await fetch(`${instance.url}/api/v1/health`, { headers: { 'x-buildr-instance': instance.secret } })).json();
  assert.equal(health.agentRuntime.currentDigest, fixture.expectedDigest);
  assert.equal(health.agentRuntime.accepting, true);
  assert.equal(readPreviewOwner('candidate-demo', fixture.dataRoot)?.agent?.digest, fixture.expectedDigest);
  await stopPreview('candidate-demo', { dataRoot: fixture.dataRoot, caller: fixture.caller, purge: true });
});

test('digest 不符时 fail closed：报 codedError、回收宿主、清除 owner，不回退开发版后台', { timeout: 30_000 }, async (t) => {
  const fixture = candidateFixture(t, { candidateMode: 'mismatch' });
  await assert.rejects(fixture.start({ candidateReadyTimeoutMs: 800 }), (error) => {
    assert.equal(coded(error, 'preview_candidate_not_ready'), true);
    assert.match((error as Error).message, /未回退开发版后台/);
    return true;
  });
  const pid = Number(fs.readFileSync(fixture.pidFile, 'utf8'));
  for (let attempt = 0; attempt < 100; attempt++) {
    try { process.kill(pid, 0); } catch { break; }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.throws(() => process.kill(pid, 0), (error) => error instanceof Error && 'code' in error && error.code === 'ESRCH');
  assert.equal(readPreviewOwner('candidate-demo', fixture.dataRoot), null);
  assert.equal(fs.existsSync(path.join(previewDataRoot('candidate-demo', fixture.dataRoot), 'instance.json')), false);
});

test('后台未携带候选就绪快照时超时 fail closed，不冒充 started', { timeout: 30_000 }, async (t) => {
  const fixture = candidateFixture(t, { candidateMode: 'absent' });
  await assert.rejects(fixture.start({ candidateReadyTimeoutMs: 800 }), (error) => coded(error, 'preview_candidate_not_ready'));
  assert.equal(readPreviewOwner('candidate-demo', fixture.dataRoot), null);
});

test('准备、运行与 purge 对开发版数据根和 canonical Workspace 零写入', { timeout: 30_000 }, async (t) => {
  const fixture = candidateFixture(t);
  const developmentBefore = snapshotTree(fixture.developmentRoot);
  const canonicalBefore = snapshotTree(fixture.canonical);
  const started = await fixture.start();
  assert.equal(started.status, 'started');
  assert.deepEqual(snapshotTree(fixture.developmentRoot), developmentBefore, '开发版数据根在准备与运行期间零写入');
  assert.deepEqual(snapshotTree(fixture.canonical), canonicalBefore, 'shared 模式不写 canonical Workspace');
  const purged = await stopPreview('candidate-demo', { dataRoot: fixture.dataRoot, caller: fixture.caller, purge: true });
  assert.equal(purged.status, 'purged');
  assert.deepEqual(snapshotTree(fixture.developmentRoot), developmentBefore, 'purge 不触及开发版数据根');
  assert.deepEqual(snapshotTree(fixture.canonical), canonicalBefore);
  assert.equal(fs.existsSync(previewDataRoot('candidate-demo', fixture.dataRoot)), false);
});

test('purge 覆盖预览数据根的全部后台代次与 reuse 快照、日志、端口', { timeout: 30_000 }, async (t) => {
  const fixture = candidateFixture(t);
  const started = await fixture.start();
  const profileRoot = previewDataRoot('candidate-demo', fixture.dataRoot);
  const connection = await connectAgentProcess({ dataRoot: profileRoot, profileId: 'preview-candidate', sourceId: 'minimal' });
  const status = await connection.lifecycle.status();
  assert.ok(status.identity.pid > 0);
  await connection.disconnect();
  assert.equal(fs.existsSync(path.join(profileRoot, 'agent-service', 'process', 'instance.json')), true);
  assert.equal(fs.existsSync(path.join(profileRoot, 'reuse.json')), true);
  assert.equal(fs.existsSync(path.join(profileRoot, 'preview.log')), true);
  assert.equal(fs.existsSync(path.join(profileRoot, 'preferred-port.json')), true);
  const purged = await stopPreview('candidate-demo', { dataRoot: fixture.dataRoot, caller: fixture.caller, purge: true });
  assert.equal(purged.status, 'purged');
  assert.equal(fs.existsSync(profileRoot), false);
  assert.equal(readPreviewOwner('candidate-demo', fixture.dataRoot), null);
  const live = () => { try { process.kill(status.identity.pid, 0); return true; } catch { return false; } };
  for (let tick = 0; tick < 100 && live(); tick++) await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(live(), false, 'purge 必须停止该数据根的后台代次');
});