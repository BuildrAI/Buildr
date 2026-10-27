import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import test from 'node:test';
import { createRepositoryCloneSupervisor } from '../../src/modules/workspace/infrastructure/repository-clone-supervisor.ts';
import { createCodeApplication } from '../../src/modules/code/application/code-application.ts';

async function until(check: () => boolean, message: string) {
  const deadline = Date.now() + 8_000;
  while (!check()) { assert.ok(Date.now() < deadline, message); await new Promise(resolve => setTimeout(resolve, 10)); }
}
function fixture(t: test.TestContext) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-direct-clone-')));
  const location = path.join(root, 'repositories', 'code');
  const repository = { id: crypto.randomUUID(), source: { type: 'git', path: 'repositories/code', git: { url: 'unused:test', integrationBranch: 'main' } } };
  const supervisors: ReturnType<typeof createRepositoryCloneSupervisor>[] = [];
  t.after(async () => { await Promise.all(supervisors.map(supervisor => supervisor.close())); fs.rmSync(root, { recursive: true, force: true }); });
  const calls: string[][] = [];
  function supervisor(script?: string, timeoutMs?: number) {
    const spawnGit: typeof spawn = ((command: string, args: string[], options: any) => {
      assert.equal(command, 'git'); calls.push(args);
      return spawn(process.execPath, ['-e', script!, '--', ...args], options);
    }) as typeof spawn;
    const result = createRepositoryCloneSupervisor({ ...(script ? { spawnGit } : {}), ...(timeoutMs ? { timeoutMs } : {}) });
    supervisors.push(result); return result;
  }
  const git = (directory: string, ...args: string[]) => execFileSync('git', ['-C', directory, ...args], { env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: os.devNull }, stdio: 'pipe' }).toString().trim();
  const record = () => JSON.parse(fs.readFileSync(path.join(root, '.buildr/local/repository-clones', fs.readdirSync(path.join(root, '.buildr/local/repository-clones')).find(file => file.endsWith('.json'))!), 'utf8'));
  return { root, location, repository, supervisor, calls, git, record };
}
function slowClone(root: string, exitCode = 0, ignoreTerm = false) {
  return `const fs = require('node:fs'),path = require('node:path');
    const location=process.argv.at(-1); fs.mkdirSync(path.join(location,'.git'),{recursive:true});
    fs.writeFileSync(path.join(location,'partial.txt'),'partial'); fs.writeFileSync(${JSON.stringify(path.join(root, 'started'))},'started');
    ${ignoreTerm ? "process.on('SIGTERM',()=>{});" : ''}
    const timer=setInterval(()=>{if(fs.existsSync(${JSON.stringify(path.join(root, 'release'))})){clearInterval(timer);process.exit(${exitCode});}},10);`;
}

test('real Git clones directly into the final directory and completion survives a new supervisor', async t => {
  const f = fixture(t), origin = path.join(f.root, 'origin'); fs.mkdirSync(origin);
  f.git(origin, 'init', '--initial-branch=main'); fs.writeFileSync(path.join(origin, 'README.md'), 'complete\n');
  f.git(origin, 'add', '.'); f.git(origin, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.com', '-c', 'commit.gpgsign=false', 'commit', '-m', 'initial');
  f.repository.source.git.url = origin;
  const supervisor = f.supervisor(); assert.equal(supervisor.ensure(f.root, f.repository).status, 'started');
  assert.equal(supervisor.ensure(f.root, f.repository).status, 'already-running');
  await supervisor.idle();
  assert.equal(supervisor.status(f.root, f.repository.id, f.repository).state, null);
  assert.equal(fs.readFileSync(path.join(f.location, 'README.md'), 'utf8'), 'complete\n');
  assert.equal(f.record().location, f.location); assert.equal(f.record().state, 'ready');
  const observer = f.supervisor(); assert.equal(observer.ensure(f.root, f.repository).status, 'ready');
  assert.deepEqual(fs.readdirSync(path.join(f.root, 'repositories')), ['code']);
});

test('an empty real Git repository also completes without requiring a commit', async t => {
  const f = fixture(t), origin = path.join(f.root, 'origin.git'); fs.mkdirSync(origin); f.git(origin, 'init', '--bare', '--initial-branch=main');
  f.repository.source.git.url = origin;
  // An unborn remote has no branch to select explicitly.
  f.repository.source.git.integrationBranch = '';
  const supervisor = f.supervisor(); supervisor.ensure(f.root, f.repository); await supervisor.idle();
  assert.equal(supervisor.status(f.root, f.repository.id, f.repository).state, null);
  assert.equal(f.record().state, 'ready'); assert.ok(fs.existsSync(path.join(f.location, '.git')));
});

test('partial target files never mean ready; another supervisor observes the running child', async t => {
  const f = fixture(t), owner = f.supervisor(slowClone(f.root));
  assert.equal(owner.ensure(f.root, f.repository).status, 'started');
  await until(() => fs.existsSync(path.join(f.root, 'started')), 'child writes partial files');
  assert.equal(f.calls[0].at(-1), f.location, 'Git receives the final destination');
  assert.equal(owner.ensure(f.root, f.repository).status, 'already-running');
  const observer = f.supervisor();
  assert.equal(observer.status(f.root, f.repository.id, f.repository).state, 'cloning');
  assert.equal(observer.ensure(f.root, f.repository).status, 'already-running');
  fs.writeFileSync(path.join(f.root, 'release'), 'finish'); await owner.idle();
  assert.equal(observer.status(f.root, f.repository.id, f.repository).state, null);
});

test('failed leftovers remain failed across restart and user files are never deleted on retry', async t => {
  const f = fixture(t), owner = f.supervisor(slowClone(f.root, 1));
  owner.ensure(f.root, f.repository); await until(() => fs.existsSync(path.join(f.root, 'started')), 'partial target exists');
  fs.writeFileSync(path.join(f.location, 'user.txt'), 'keep'); fs.writeFileSync(path.join(f.root, 'release'), 'finish'); await owner.idle();
  const observer = f.supervisor(); assert.equal(observer.status(f.root, f.repository.id, f.repository).state, 'failed');
  assert.equal(observer.ensure(f.root, f.repository).status, 'unavailable');
  assert.equal(fs.readFileSync(path.join(f.location, 'user.txt'), 'utf8'), 'keep');
  assert.equal(fs.readFileSync(path.join(f.location, 'partial.txt'), 'utf8'), 'partial');
  // The user can move the failed directory away; retry then starts in the empty target.
  fs.renameSync(f.location, path.join(f.root, 'preserved'));
  f.repository.source.git.url = path.join(f.root, 'missing-origin');
  assert.equal(observer.ensure(f.root, f.repository).status, 'started'); await observer.idle();
  assert.equal(observer.status(f.root, f.repository.id, f.repository).state, 'failed');
});

for (const reason of ['close', 'timeout']) test(`interruption by ${reason} waits for child exit and persists failure`, async t => {
  const f = fixture(t), supervisor = f.supervisor(slowClone(f.root, 0, true), reason === 'timeout' ? 500 : undefined);
  supervisor.ensure(f.root, f.repository); await until(() => fs.existsSync(path.join(f.root, 'started')), 'child starts');
  if (reason === 'close') await supervisor.close(); else await supervisor.idle();
  assert.equal(f.record().state, 'failed');
  assert.equal(f.supervisor().status(f.root, f.repository.id, f.repository).state, 'failed');
  assert.ok(fs.existsSync(path.join(f.location, 'partial.txt')));
});

test('existing contents are preserved and never passed to Git', t => {
  const f = fixture(t), supervisor = f.supervisor(); fs.mkdirSync(f.location, { recursive: true });
  fs.writeFileSync(path.join(f.location, 'existing.txt'), 'keep');
  assert.equal(supervisor.ensure(f.root, f.repository).status, 'ready');
  assert.equal(fs.readFileSync(path.join(f.location, 'existing.txt'), 'utf8'), 'keep');
  assert.equal(fs.existsSync(path.join(f.root, '.buildr/local/repository-clones')), true);
});

test('missing executable reports failure, preserves registration semantics and permits an empty-target retry', async t => {
  const f = fixture(t);
  const spawnGit: typeof spawn = ((_command: string, args: string[], options: any) => spawn(path.join(f.root, 'missing-git'), args, options)) as typeof spawn;
  const supervisor = createRepositoryCloneSupervisor({ spawnGit }); t.after(() => supervisor.close());
  supervisor.ensure(f.root, f.repository); await supervisor.idle();
  assert.equal(supervisor.status(f.root, f.repository.id, f.repository).state, 'failed');
  assert.equal(supervisor.ensure(f.root, f.repository).status, 'started'); await supervisor.idle();
});

test('source control, browsing and fetch refuse an unfinished directory even when Git can read it', async t => {
  const f = fixture(t), supervisor = f.supervisor(slowClone(f.root)); supervisor.ensure(f.root, f.repository);
  await until(() => fs.existsSync(path.join(f.root, 'started')), 'partial target exists');
  f.git(f.location, 'init', '--initial-branch=main');
  const app = createCodeApplication({ assetCatalog: () => ({ repositories: [{ ...f.repository, code: 'code', name: 'Code' }], services: [], projects: [] }), resolveSourceRoot: (root, source) => path.resolve(root, source.path), readTaskScope: () => ({ projects: [], services: [] }), readGitWorktreeEvidence: () => null, repositoryCloneStatus: (root, id) => supervisor.status(root, id, f.repository) });
  const result = app.sourceControl(f.root, { repositoryId: f.repository.id }).repositories[0];
  assert.equal(result.available, false); assert.equal(result.clone?.state, 'cloning');
  assert.throws(() => app.directory(f.root, { repositoryId: f.repository.id }), /正在克隆/);
  const fetched = await app.fetch(f.root, { repositories: [{ repositoryId: f.repository.id, expectedGitId: null, expectedCheckoutId: null }] });
  assert.equal(fetched.repositories[0].status, 'unavailable');
  fs.writeFileSync(path.join(f.root, 'release'), 'finish'); await supervisor.idle();
  assert.equal(app.sourceControl(f.root, { repositoryId: f.repository.id }).repositories[0].available, true);
});

test('after host death a live orphan remains cloning, then becomes interrupted rather than ready', { skip: process.platform === 'win32' }, async t => {
  const f = fixture(t);
  const moduleUrl = new URL('../../src/modules/workspace/infrastructure/repository-clone-supervisor.ts', import.meta.url).href;
  const script = `import {spawn} from 'node:child_process';
    import {createRepositoryCloneSupervisor} from ${JSON.stringify(moduleUrl)};
    const spawnGit=(command,args,options)=>spawn(process.execPath,['-e',${JSON.stringify(slowClone(f.root))},'--',...args],options);
    const supervisor=createRepositoryCloneSupervisor({spawnGit,timeoutMs:30000});
    supervisor.ensure(${JSON.stringify(f.root)},${JSON.stringify(f.repository)});`;
  const host = spawn(process.execPath, ['--input-type=module', '-e', script], { stdio: 'ignore' });
  let childPid: number | null = null;
  t.after(() => { try { host.kill('SIGKILL'); } catch {} if (childPid) { try { process.kill(-childPid, 'SIGKILL'); } catch {} } });
  await until(() => fs.existsSync(path.join(f.root, 'started')), 'host actually launches its Git child');
  childPid = f.record().childPid;
  const exited = new Promise(resolve => host.once('close', resolve)); host.kill('SIGKILL'); await exited;
  const observer = f.supervisor();
  assert.equal(observer.status(f.root, f.repository.id, f.repository).state, 'cloning');
  assert.equal(observer.ensure(f.root, f.repository).status, 'already-running');
  fs.writeFileSync(path.join(f.root, 'release'), 'finish');
  await until(() => observer.status(f.root, f.repository.id, f.repository).state === 'failed', 'unconfirmed completion after host death cannot become ready');
  assert.equal(observer.ensure(f.root, f.repository).status, 'unavailable');
  assert.equal(fs.readFileSync(path.join(f.location, 'partial.txt'), 'utf8'), 'partial');
});

test('a local bookkeeping failure does not negate an observed successful Git exit', async t => {
  const f = fixture(t), supervisor = f.supervisor(slowClone(f.root));
  supervisor.ensure(f.root, f.repository); await until(() => fs.existsSync(path.join(f.root, 'started')), 'partial target exists');
  const rename = fs.renameSync;
  fs.renameSync = ((source: fs.PathLike, destination: fs.PathLike) => {
    if (String(destination).includes('repository-clones') && JSON.parse(fs.readFileSync(source, 'utf8')).state === 'ready') throw new Error('simulated result-record write failure');
    return rename(source, destination);
  }) as typeof fs.renameSync;
  try {
    fs.writeFileSync(path.join(f.root, 'release'), 'finish'); await supervisor.idle();
    assert.equal(supervisor.status(f.root, f.repository.id, f.repository).state, null, 'observed Git success remains true');
    assert.equal(supervisor.ensure(f.root, f.repository).status, 'ready');
    assert.equal(fs.readFileSync(path.join(f.location, 'partial.txt'), 'utf8'), 'partial');
  } finally { fs.renameSync = rename; }
});

test('an interrupted startup with an unknown child cannot launch a duplicate into an empty target', async t => {
  const f = fixture(t), supervisor = f.supervisor();
  f.repository.source.git.url = path.join(f.root, 'missing-origin');
  supervisor.ensure(f.root, f.repository); await supervisor.idle();
  const record = f.record();
  const exited = spawn(process.execPath, ['-e', ''], { stdio: 'ignore' });
  await new Promise(resolve => exited.once('close', resolve));
  record.state = 'cloning'; record.ownerPid = exited.pid; record.childPid = null;
  const file = fs.readdirSync(path.join(f.root, '.buildr/local/repository-clones')).find(file => file.endsWith('.json'))!;
  fs.writeFileSync(path.join(f.root, '.buildr/local/repository-clones', file), JSON.stringify(record));
  const observer = f.supervisor();
  assert.equal(observer.status(f.root, f.repository.id, f.repository).state, 'failed');
  assert.equal(observer.ensure(f.root, f.repository).status, 'unavailable');
});
