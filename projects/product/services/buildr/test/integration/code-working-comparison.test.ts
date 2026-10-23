import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createCodeApplication } from '../../src/modules/code/application/code-application.ts';
import { createCodeHttpContribution } from '../../src/modules/code/interfaces/http/code-http.ts';
import { CODE_HTTP_REQUESTS, CODE_HTTP_SCHEMAS, CODE_HTTP_VALIDATORS } from '../../src/modules/code/interfaces/http/code-http-contracts.ts';
function fixture(t: test.TestContext, format = 'sha1') {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-discard-operation-')), root = path.join(base, 'repository');
  fs.mkdirSync(root); t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const gitAt = (location: string, ...args: string[]) => execFileSync('git', ['-C', location, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const git = (...args: string[]) => gitAt(root, ...args);
  git('init', '--initial-branch=main', '--object-format=' + format); git('config', 'user.name', 'Commit Fixture'); git('config', 'user.email', 'fixture@example.com'); git('config', 'commit.gpgSign', 'false');
  const write = (file: string, value: string, directory = root) => fs.writeFileSync(path.join(directory, file), value);
  const commit = (message = 'base') => { git('add', '--all'); git('commit', '-qm', message); return git('rev-parse', 'HEAD'); };
  const app = createCodeApplication({ assetCatalog: () => ({ repositories: [{ id: 'repo-one', code: 'repo', name: 'Fixture', source: { type: 'workspace', path: root } }], services: [], projects: [] }), resolveSourceRoot: (_root, source) => source.path, readTaskScope: () => ({ projects: [], services: [] }), readGitWorktreeEvidence: () => null });
  const input = () => ({ repositoryId: 'repo-one', worktreeId: app.sourceControl(root).repositories[0].worktrees.find(item => item.isRegistered)!.worktreeId });
  const request = (message = 'all current changes', mode: 'commit' | 'commit-push' | 'commit-sync' = 'commit', location = input()) => ({ ...location, expectedRevision: app.commitContext(root, location).revision, message, mode });
  const index = () => { const file = git('rev-parse', '--path-format=absolute', '--git-path', 'index'); return fs.existsSync(file) ? crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') : null; };
  const remote = () => { const target = path.join(base, 'remote.git'); gitAt(base, 'init', '--bare', '--object-format=' + format, target); git('remote', 'add', 'origin', target); git('push', '-u', 'origin', 'main'); return target; };
  return { base, root, app, git, gitAt, write, commit, input, request, index, remote };
}

const read = (f: ReturnType<typeof fixture>, file: string) => f.app.diff(f.root, {...f.input(), path: file, area: 'working'});

test('working comparison includes staged and unstaged edits without changing index or HEAD', async t => {
  const f = fixture(t); f.write('one', 'base\n'); const head = f.commit(); f.write('one', 'staged\n'); f.git('add', 'one'); f.write('one', 'current\n');
  const index = f.index(), result = await read(f, 'one');
  assert.equal(result.area, 'working'); assert.equal(result.baseHash, head); assert.match(result.patch!, /-base/); assert.match(result.patch!, /\+current/); assert.doesNotMatch(result.patch!, /\+staged/);
  assert.match((await f.app.diff(f.root, {...f.input(), path:'one',area:'staged'})).patch!, /\+staged/);
  assert.match((await f.app.diff(f.root, {...f.input(), path:'one',area:'unstaged'})).patch!, /-staged/);
  assert.equal((await f.app.sourceFile(f.root, {...f.input(), path:'one',area:'working'})).content, 'current\n');
  assert.equal((await f.app.sourceFile(f.root, {...f.input(), path:'one',area:'commit',commitHash:result.baseHash!})).content, 'base\n');
  assert.equal(f.index(), index); assert.equal(f.git('rev-parse','HEAD'),head);
  assert.equal(CODE_HTTP_VALIDATORS.validate(CODE_HTTP_SCHEMAS.diff.$id,result).valid,true);
});

test('pure staged edits, staged additions and untracked contents use the final current file', async t => {
  const f = fixture(t); f.write('one','base\n'); f.commit(); f.write('one','staged\n'); f.git('add','one');
  assert.match((await read(f,'one')).patch!, /-base/); assert.match((await read(f,'one')).patch!, /\+staged/);
  for (const name of ['added','untracked']) {f.write(name,'new\n'); if(name==='added') f.git('add',name); const result=await read(f,name); assert.equal(result.file.status,'added'); assert.equal(result.baseHash,null); assert.match(result.patch!, /\+new/);}
});

test('rename baseline stays at HEAD old path and deletions use the committed content', async t => {
  const f = fixture(t); f.write('old','base\nkeep\n'); f.write('deleted','delete\n'); const head=f.commit(); f.git('mv','old','new'); f.write('new','base\nkeep\nfinal\n'); fs.unlinkSync(path.join(f.root,'deleted'));
  const renamed=await read(f,'new'); assert.equal(renamed.file.previousPath,'old'); assert.equal(renamed.file.status,'renamed'); assert.equal(renamed.baseHash,head); assert.match(renamed.patch!,/\+final/);
  const deleted=await read(f,'deleted'); assert.equal(deleted.file.status,'deleted'); assert.match(deleted.patch!,/-delete/);
});

test('empty repositories and added-then-deleted paths do not assume an existing HEAD or baseline', async t => {
  for(const format of ['sha1','sha256']) {const f=fixture(t,format); f.write('new','first\n'); f.git('add','new'); const added=await read(f,'new'); assert.equal(added.baseHash,null); assert.match(added.patch!,/\+first/); fs.unlinkSync(path.join(f.root,'new')); const removed=await read(f,'new'); assert.equal(removed.patch,''); assert.equal(removed.file.additions,0);}
  const f=fixture(t); f.write('base','base'); f.commit(); f.write('new.png','temporary'); f.git('add','new.png'); fs.unlinkSync(path.join(f.root,'new.png')); const result=await read(f,'new.png'); assert.equal(result.patch,null); assert.equal(result.baseHash,null); assert.equal(result.imagePreview?.before,null); assert.equal(result.imagePreview?.after,null);
});

test('working image comparison reads HEAD and disk rather than index content', async t => {
  const f=fixture(t); const gif=(tail:string)=>Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'+tail,'base64');
  const base=gif(''), staged=Buffer.concat([base,Buffer.from('staged')]), current=Buffer.concat([base,Buffer.from('current')]);
  fs.writeFileSync(path.join(f.root,'pixel.gif'),base); const head=f.commit(); fs.writeFileSync(path.join(f.root,'pixel.gif'),staged); f.git('add','pixel.gif'); fs.writeFileSync(path.join(f.root,'pixel.gif'),current);
  const result=await read(f,'pixel.gif'); assert.equal(result.baseHash,head); assert.equal(result.imagePreview?.before?.content,'data:image/gif;base64,'+base.toString('base64')); assert.equal(result.imagePreview?.after?.content,'data:image/gif;base64,'+current.toString('base64'));
});
