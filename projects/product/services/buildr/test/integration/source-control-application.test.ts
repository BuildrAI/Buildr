import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { createCodeApplication } from '../../src/modules/code/application/code-application.ts';
import { createCodeHttpContribution } from '../../src/modules/code/interfaces/http/code-http.ts';
import { createCodeCliContributions } from '../../src/modules/code/interfaces/cli/code-cli.ts';
import { CODE_HTTP_SCHEMAS, CODE_HTTP_VALIDATORS } from '../../src/modules/code/interfaces/http/code-http-contracts.ts';
import { gitCheckoutReadId } from '../../src/infrastructure/git/checkout-read-identity.ts';
import { registerGitWorktreeProvider } from '../../src/modules/task/infrastructure/git-worktree-provider.ts';
import { CODE_LIMITS } from '../../src/modules/code/infrastructure/code-file-reader.ts';
import { readSourceControlTaskAssociations } from '../../src/modules/code/infrastructure/code-worktree-catalog.ts';

function fixture(t: test.TestContext, format = 'sha1') {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-source-control-')), root = path.join(base, 'repository');
  fs.mkdirSync(root); t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const git = (...args: string[]) => execFileSync('git', ['--no-optional-locks', '-C', root, ...args], { encoding: 'utf8', env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '--initial-branch=main', '--object-format=' + format); git('config', 'user.name', 'Fixture Person'); git('config', 'user.email', 'fixture@example.com'); git('config', 'commit.gpgSign', 'false');
  const write = (relative: string, content: string) => { fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true }); fs.writeFileSync(path.join(root, relative), content); };
  const commit = (message: string) => { git('add', '--', '.'); git('commit', '-m', message); return git('rev-parse', 'HEAD'); };
  const tasks = new Map([['task-one', { taskId: 'task-one', title: '当前明确任务' }]]);
  let evidence:{evidence:{repositories:Array<{sourceRepository:string;checkoutPath:string}>}}|null=null;
  const catalog = { repositories: [{ id: 'repo-one', code: 'repo', name: 'Fixture Repository', source: { type: 'workspace', path: root } }], services: [{ id: 's1', code: 'one', repositoryId: 'repo-one' }, { id: 's2', code: 'two', repositoryId: 'repo-one' }], projects: [{ id: 'p-id', code: 'p', serviceIds: ['s1', 's2'] }] };
  const app = createCodeApplication({ assetCatalog: () => catalog, resolveSourceRoot: (_root, source) => source.path,
    readTaskScope: (_root, id) => { if (!tasks.has(id)) throw Error('missing task'); return { projects: ['p'], services: [] }; },
    readTask: (_root, id) => { const task = tasks.get(id); if (!task) throw Error('missing task'); return task; }, readGitWorktreeEvidence: () => evidence });
  const snapshot = () => ({ status: git('status', '--porcelain=v2', '-z'), head: (() => { try { return git('rev-parse', 'HEAD'); } catch { return ''; } })(), index: fs.existsSync(path.join(root, '.git/index')) ? crypto.createHash('sha256').update(fs.readFileSync(path.join(root, '.git/index'))).digest('hex') : '', refs: git('for-each-ref', '--format=%(refname) %(objectname)') });
  return { base, root, git, write, commit, app, catalog, snapshot,setEvidence:(value:typeof evidence)=>{evidence=value;}, input: { repositoryId: 'repo-one' } };
}
const hasCode = (code: string) => (error: unknown) => (error as { code?: string }).code === code;
function checkoutGit(checkout:string,...args:string[]){return execFileSync('git',['--no-optional-locks','-C',checkout,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();}
function checkoutSnapshot(checkout:string){return {status:checkoutGit(checkout,'status','--porcelain=v2','-z'),index:crypto.createHash('sha256').update(fs.readFileSync(checkoutGit(checkout,'rev-parse','--path-format=absolute','--git-path','index'))).digest('hex'),body:fs.readFileSync(path.join(checkout,'same.ts'),'utf8'),head:checkoutGit(checkout,'rev-parse','HEAD')};}

function pngPixel(red:number,green:number,blue:number) {
  const chunk = (type:string,data:Buffer) => {
    const body=Buffer.concat([Buffer.from(type),data]);let crc=0xffffffff;
    for(const byte of body){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
    const length=Buffer.alloc(4),checksum=Buffer.alloc(4);length.writeUInt32BE(data.length);checksum.writeUInt32BE((crc^0xffffffff)>>>0);
    return Buffer.concat([length,body,checksum]);
  };
  const header=Buffer.alloc(13);header.writeUInt32BE(1,0);header.writeUInt32BE(1,4);header[8]=8;header[9]=2;
  return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',header),chunk('IDAT',deflateSync(Buffer.from([0,red,green,blue]))),chunk('IEND',Buffer.alloc(0))]);
}

test('image diffs preserve actual PNG bytes in index/worktree/untracked layers and pinned history',async t=>{
  const f=fixture(t),red=pngPixel(255,0,0),blue=pngPixel(0,0,255),green=pngPixel(0,255,0);
  const write=(file:string,bytes:Buffer)=>fs.writeFileSync(path.join(f.root,file),bytes);
  const bytes=(image:{content:string}|null|undefined)=>image&&Buffer.from(image.content.split(',')[1],'base64');
  write('image.png',red);const base=f.commit('red image');write('image.png',blue);f.git('add','--','image.png');write('image.png',green);write('new.png',green);
  const before=f.snapshot(),expectedRevision=f.app.sourceControl(f.root).repositories[0].observedRevision!;
  const staged=await f.app.diff(f.root,{...f.input,path:'image.png',area:'staged',expectedRevision}),unstaged=await f.app.diff(f.root,{...f.input,path:'image.png',area:'unstaged',expectedRevision}),untracked=await f.app.diff(f.root,{...f.input,path:'new.png',area:'untracked',expectedRevision});
  assert.deepEqual(bytes(staged.imagePreview?.before),red);assert.deepEqual(bytes(staged.imagePreview?.after),blue);assert.equal(staged.imagePreview?.before?.source.commitHash,base);assert.match(staged.imagePreview!.after!.revision,/^index:/);
  assert.deepEqual(bytes(unstaged.imagePreview?.before),blue);assert.deepEqual(bytes(unstaged.imagePreview?.after),green);assert.match(unstaged.imagePreview!.after!.revision,/^current:/);
  assert.equal(untracked.imagePreview?.before,null);assert.deepEqual(bytes(untracked.imagePreview?.after),green);
  for(const result of [staged,unstaged,untracked]){assert.equal(result.binary,true);assert.equal(result.patch,null);assert.equal(result.imagePreview?.after?.mediaType,'image/png');assert.equal(CODE_HTTP_VALIDATORS.validate(CODE_HTTP_SCHEMAS.diff.$id,result).valid,true);}
  assert.deepEqual(bytes(await f.app.sourceFile(f.root,{...f.input,path:'image.png',area:'staged',expectedRevision})),blue);assert.deepEqual(bytes(await f.app.sourceFile(f.root,{...f.input,path:'image.png',area:'unstaged',expectedRevision})),green);assert.deepEqual(f.snapshot(),before);
  f.git('commit','-m','blue image');const pinned=f.git('rev-parse','HEAD');write('image.png',green);f.commit('green image');
  const history=await f.app.diff(f.root,{...f.input,path:'image.png',area:'commit',commitHash:pinned});assert.equal(history.baseHash,base);assert.deepEqual(bytes(history.imagePreview?.before),red);assert.deepEqual(bytes(history.imagePreview?.after),blue);assert.equal(history.imagePreview?.after?.source.commitHash,pinned);
  const full=await f.app.sourceFile(f.root,{...f.input,path:'image.png',area:'commit',commitHash:pinned});assert.deepEqual(bytes(full),blue);assert.equal(full.source.commitHash,pinned);
  await assert.rejects(f.app.diff(f.root,{...f.input,path:'image.png',area:'unstaged',expectedRevision}),hasCode('code_source_changed'));
});

test('image additions, root commits, renames and deletions describe actual missing sides without Git writes',async t=>{
  const f=fixture(t),png=pngPixel(10,20,30);fs.writeFileSync(path.join(f.root,'old.png'),png);f.git('add','--','old.png');
  const added=await f.app.diff(f.root,{...f.input,path:'old.png',area:'staged'});assert.equal(added.imagePreview?.before,null);assert.equal(added.imagePreview?.after?.kind,'image');
  const root=f.commit('first image'),initial=await f.app.diff(f.root,{...f.input,path:'old.png',area:'commit',commitHash:root});assert.equal(initial.imagePreview?.before,null);
  f.git('mv','--','old.png','new.png');const rename=await f.app.diff(f.root,{...f.input,path:'new.png',area:'staged'});assert.equal(rename.file.previousPath,'old.png');assert.equal(rename.imagePreview?.before?.path,'old.png');assert.equal(rename.imagePreview?.after?.path,'new.png');assert.equal(rename.imagePreview?.before?.content,rename.imagePreview?.after?.content);
  const renamed=f.commit('rename image');fs.unlinkSync(path.join(f.root,'new.png'));let before=f.snapshot();
  const workingDelete=await f.app.diff(f.root,{...f.input,path:'new.png',area:'unstaged'});assert.equal(workingDelete.imagePreview?.after,null);assert.match(workingDelete.imagePreview!.before!.revision,/^index:/);assert.deepEqual(f.snapshot(),before);
  f.git('add','--','new.png');before=f.snapshot();const stagedDelete=await f.app.diff(f.root,{...f.input,path:'new.png',area:'staged'});assert.equal(stagedDelete.imagePreview?.after,null);assert.equal(stagedDelete.imagePreview?.before?.source.commitHash,renamed);assert.deepEqual(f.snapshot(),before);
  const removed=f.commit('delete image');before=f.snapshot();const history=await f.app.diff(f.root,{...f.input,path:'new.png',area:'commit',commitHash:removed});assert.equal(history.imagePreview?.after,null);assert.equal(history.imagePreview?.before?.source.commitHash,renamed);assert.notEqual(history.imagePreview?.before?.source.commitHash,removed);assert.deepEqual(f.snapshot(),before);
});

test('image preview limits remain 8 MiB per side and unsupported binary/text retain their existing behavior',async t=>{
  const f=fixture(t),png=pngPixel(1,2,3),limit=Buffer.alloc(CODE_LIMITS.imageBytes);png.copy(limit);fs.writeFileSync(path.join(f.root,'image.png'),limit);f.commit('large image');
  const tooLarge=Buffer.alloc(CODE_LIMITS.imageBytes+1);png.copy(tooLarge);fs.writeFileSync(path.join(f.root,'image.png'),tooLarge);
  let before=f.snapshot();const modified=await f.app.diff(f.root,{...f.input,path:'image.png',area:'unstaged'});assert.equal(modified.imagePreview?.before?.kind,'image');assert.equal(modified.imagePreview?.before?.sizeBytes,CODE_LIMITS.imageBytes);assert.equal(modified.imagePreview?.after?.kind,'unsupported');assert.equal(modified.imagePreview?.after?.content,'');assert.equal(modified.imagePreview?.after?.limitBytes,CODE_LIMITS.imageBytes);assert.match(modified.imagePreview!.after!.message,/图片超过完整读取上限/);assert.equal(modified.coverage.truncated,true);assert.deepEqual(f.snapshot(),before);
  fs.writeFileSync(path.join(f.root,'new.png'),tooLarge);const untracked=await f.app.diff(f.root,{...f.input,path:'new.png',area:'untracked'});assert.equal(untracked.imagePreview?.before,null);assert.equal(untracked.imagePreview?.after?.truncated,true);
  fs.writeFileSync(path.join(f.root,'other.bin'),Buffer.from([0,1,2]));f.write('normal.txt','text\n');before=f.snapshot();const binary=await f.app.diff(f.root,{...f.input,path:'other.bin',area:'untracked'}),text=await f.app.diff(f.root,{...f.input,path:'normal.txt',area:'untracked'});assert.equal(binary.binary,true);assert.equal(binary.imagePreview,undefined);assert.equal(text.binary,false);assert.equal(text.imagePreview,undefined);assert.match(text.patch!,/\+text/);assert.deepEqual(f.snapshot(),before);
});

test('image diffs reject external paths and changed observations instead of converting failures to missing sides',async t=>{
  const f=fixture(t);fs.writeFileSync(path.join(f.root,'image.png'),pngPixel(9,8,7));f.commit('base image');const external=path.join(f.base,'external.png');fs.writeFileSync(external,pngPixel(6,5,4));fs.unlinkSync(path.join(f.root,'image.png'));fs.symlinkSync(external,path.join(f.root,'image.png'));
  const before=f.snapshot();await assert.rejects(f.app.diff(f.root,{...f.input,path:'image.png',area:'unstaged'}),hasCode('code_path_forbidden'));assert.deepEqual(f.snapshot(),before);
  await assert.rejects(f.app.diff(f.root,{...f.input,path:'../external.png',area:'untracked'}),hasCode('code_path_forbidden'));
  fs.unlinkSync(path.join(f.root,'image.png'));fs.writeFileSync(path.join(f.root,'image.png'),pngPixel(4,5,6));const expectedRevision=f.app.sourceControl(f.root).repositories[0].observedRevision!;fs.unlinkSync(path.join(f.root,'image.png'));await assert.rejects(f.app.diff(f.root,{...f.input,path:'image.png',area:'unstaged',expectedRevision}),hasCode('code_source_changed'));
});

test('catalog keeps shared-instance identity, both index/worktree layers, nullable upstream and no Git writes', async t => {
  const f = fixture(t); f.write('a.ts', 'base\n'); f.commit('base'); f.write('a.ts', 'index\n'); f.git('add', '--', 'a.ts'); f.write('a.ts', 'working\n'); f.write('new.ts', 'new\n');
  const before = f.snapshot(), catalog = f.app.sourceControl(f.root);
  assert.equal(catalog.repositories.length, 1); const repository = catalog.repositories[0];
  assert.equal(repository.fileCount, 2); assert.equal(repository.branch, 'main'); assert.equal(repository.ahead, null); assert.equal(repository.behind, null); assert.equal(repository.upstream, null);
  assert.deepEqual(repository.changes.filter(file => file.path === 'a.ts').map(file => file.area).sort(), ['staged', 'unstaged']); assert.ok(repository.changes.every(file => file.preview === null));
  const expectedRevision = repository.observedRevision!;
  const staged = await f.app.diff(f.root, { ...f.input, area: 'staged', path: 'a.ts', expectedRevision });
  const unstaged = await f.app.diff(f.root, { ...f.input, area: 'unstaged', path: 'a.ts', expectedRevision });
  assert.match(staged.patch!, /-base\n\+index/); assert.match(unstaged.patch!, /-index\n\+working/);
  const indexFile = await f.app.sourceFile(f.root, { ...f.input, area: 'staged', path: 'a.ts', expectedRevision });
  const workFile = await f.app.sourceFile(f.root, { ...f.input, area: 'unstaged', path: 'a.ts', expectedRevision });
  assert.equal(indexFile.content, 'index\n'); assert.equal(workFile.content, 'working\n'); assert.match(indexFile.revision, /^index:/); assert.match(indexFile.source.version, /已暂存版本/); assert.equal(indexFile.observedRevision, indexFile.revision);
  assert.deepEqual(f.snapshot(), before);
  f.write('a.ts', 'new working\n'); await assert.rejects(f.app.diff(f.root, { ...f.input, area: 'unstaged', path: 'a.ts', expectedRevision }), hasCode('code_source_changed'));
  f.git('add', '--', 'a.ts'); await assert.rejects(f.app.sourceFile(f.root, { ...f.input, area: 'staged', path: 'a.ts', expectedRevision: indexFile.revision }), hasCode('code_file_changed'));
});

test('unborn repository and untracked file use actual new contents while unavailable instances remain local', async t => {
  const f = fixture(t); f.write('first.ts', 'initial\n'); f.git('add', '--', 'first.ts'); f.write('new.ts', 'fresh\n');
  f.catalog.repositories.push({ id: 'missing', code: 'missing', name: 'Missing', source: { type: 'workspace', path: path.join(f.base, 'missing') } });
  const catalog = f.app.sourceControl(f.root); assert.equal(catalog.repositories.length, 2); assert.equal(catalog.repositories[0].head, null); assert.equal(catalog.repositories[0].fileCount, 2); assert.equal(catalog.repositories[1].fileCount, null); assert.equal(catalog.repositories[1].status, 'unavailable');
  assert.match((await f.app.diff(f.root, { ...f.input, area: 'staged', path: 'first.ts' })).patch!, /\+initial/);
  const untracked = await f.app.diff(f.root, { ...f.input, area: 'untracked', path: 'new.ts' }); assert.match(untracked.patch!, /\+fresh/); assert.equal(untracked.file.additions, 1);
  assert.deepEqual(f.app.history(f.root, f.input).commits, []);
  assert.deepEqual(f.app.history(f.root, { ...f.input, branch: 'main' }).commits, [], 'the current unborn branch is an empty history rather than a missing branch');
});

test('special filenames, renames, path/area rejection and external symlinks preserve index, refs and files', async t => {
  const f = fixture(t), special = '中文 空格\t换行\n--name.ts'; f.write(special, 'before\n'); const hash = f.commit('special filename');
  f.write(special, 'after\n'); const before = f.snapshot();
  const current = await f.app.diff(f.root, { ...f.input, area: 'unstaged', path: special }); assert.match(current.patch!, /\+after/); assert.equal(current.file.path, special);
  const history = f.app.commit(f.root, { ...f.input, commitHash: hash }); assert.equal(history.files[0].path, special);
  const historicFile = await f.app.sourceFile(f.root, { ...f.input, area: 'commit', path: special, commitHash: hash }); assert.equal(historicFile.content, 'before\n');
  for (const filePath of ['../secret', '/etc/passwd', '.git/config', 'dir/../a.ts']) await assert.rejects(f.app.sourceFile(f.root, { ...f.input, path: filePath }), hasCode('code_path_forbidden'));
  for (const area of ['unstaged', 'staged', 'untracked'] as const) await assert.rejects(f.app.sourceFile(f.root, { ...f.input, path: special, area, commitHash: hash }), hasCode('code_area_commit_conflict'));
  await assert.rejects(f.app.sourceFile(f.root, { repositoryId: 'foreign', path: special }), hasCode('code_repository_not_registered'));
  fs.writeFileSync(path.join(f.base, 'outside'), 'private'); fs.symlinkSync(path.join(f.base, 'outside'), path.join(f.root, 'link'));
  await assert.rejects(f.app.sourceFile(f.root, { ...f.input, path: 'link' }), hasCode('code_path_forbidden'));
  fs.unlinkSync(path.join(f.root, 'link')); assert.deepEqual(f.snapshot(), before); assert.equal(fs.readFileSync(path.join(f.base, 'outside'), 'utf8'), 'private');
  f.commit('before pure rename'); f.git('mv', '--', special, 'renamed.ts'); const renamed = f.app.sourceControl(f.root).repositories[0].changes.find(file => file.area === 'staged'); assert.equal(renamed?.previousPath, special);
});

test('branch history contains ancestors, parses actual task trailers, scopes search and rejects stale cursors', t => {
  const f = fixture(t); f.write('a.ts', 'one\n'); const root = f.commit('first\n\nBuildr-Task: task-one');
  f.write('a.ts', 'two\n'); const body = f.commit('second\n\nBody mentions Buildr-Task: task-one as example.');
  f.write('a.ts', 'three\n'); const missing = f.commit('third\n\nBuildr-Task: missing-task');
  f.write('a.ts', 'four\n'); const conflict = f.commit('fourth\n\nBuildr-Task: task-one\nBuildr-Task: other-task');
  const result = f.app.history(f.root, { ...f.input, branch: 'main' }); assert.equal(result.commits.length, 4); assert.ok(result.commits.some(commit => commit.hash === root));
  assert.equal(result.commits.find(commit => commit.hash === root)?.taskId, 'task-one'); assert.equal(result.commits.find(commit => commit.hash === root)?.taskTitle, '当前明确任务');
  for (const hash of [body, missing, conflict]) assert.equal(result.commits.find(commit => commit.hash === hash)?.taskId, null);
  assert.equal(f.app.history(f.root, { ...f.input, query: 'Fixture Person' }).commits.length, 4);
  const first = f.app.history(f.root, { ...f.input, limit: 1 }); assert.ok(first.coverage.nextCursor);
  const next = f.app.history(f.root, { ...f.input, limit: 1, cursor: first.coverage.nextCursor! }); assert.notEqual(next.commits[0].hash, first.commits[0].hash);
  f.write('a.ts', 'five\n'); f.commit('new tip'); assert.throws(() => f.app.history(f.root, { ...f.input, cursor: first.coverage.nextCursor! }), hasCode('code_history_cursor_changed'));
  assert.throws(() => f.app.history(f.root, { ...f.input, branch: '--all' }), hasCode('code_branch_missing'));
});

test('default history follows the selected checkout HEAD and excludes commits unique to other branches and tags', t => {
  const f = fixture(t); f.write('base.ts', 'base\n'); const base = f.commit('shared base');
  const linked = path.join(f.base, 'topic'); f.git('worktree', 'add', '-b', 'topic', linked);
  fs.writeFileSync(path.join(linked, 'topic.ts'), 'topic\n'); checkoutGit(linked, 'add', '.'); checkoutGit(linked, 'commit', '-m', 'topic only');
  const topic = checkoutGit(linked, 'rev-parse', 'HEAD'); f.git('tag', 'topic-tag', topic);
  f.write('main.ts', 'main\n'); const main = f.commit('main only');
  const catalog = f.app.sourceControl(f.root), worktree = catalog.repositories[0].worktrees.find(item => !item.isMain)!;
  const mainHistory = f.app.history(f.root, f.input).commits.map(item => item.hash);
  assert.ok(mainHistory.includes(main) && mainHistory.includes(base)); assert.ok(!mainHistory.includes(topic));
  const topicInput = { ...f.input, worktreeId: worktree.worktreeId };
  const topicHistory = f.app.history(f.root, topicInput).commits.map(item => item.hash);
  assert.ok(topicHistory.includes(topic) && topicHistory.includes(base)); assert.ok(!topicHistory.includes(main));
  assert.deepEqual(f.app.history(f.root, { ...topicInput, branch: 'HEAD' }).commits.map(item => item.hash), topicHistory);
  checkoutGit(linked, 'checkout', '--detach', base);
  assert.deepEqual(f.app.history(f.root, { ...topicInput, branch: 'HEAD' }).commits.map(item => item.hash), [base]);
  assert.ok(f.app.history(f.root, { ...topicInput, branch: 'main' }).commits.some(item => item.hash === main), 'explicit named branches remain supported');
});

test('current task links use repository and checkout evidence across repositories without guessing same names', t => {
  const f = fixture(t); f.write('base.ts', 'base\n'); f.commit('base');
  const second = path.join(f.base, 'second'); fs.mkdirSync(second); checkoutGit(second, 'init', '--initial-branch=main'); checkoutGit(second, 'config', 'user.name', 'Fixture Person'); checkoutGit(second, 'config', 'user.email', 'fixture@example.com'); checkoutGit(second, 'config', 'commit.gpgSign', 'false');
  fs.writeFileSync(path.join(second, 'base.ts'), 'base\n'); checkoutGit(second, 'add', '.'); checkoutGit(second, 'commit', '-m', 'base');
  const firstTopic = path.join(f.base, 'first-group', 'topic'), secondTopic = path.join(f.base, 'second-group', 'topic');
  f.git('worktree', 'add', '-b', 'task/topic', firstTopic); checkoutGit(second, 'worktree', 'add', '-b', 'task/topic', secondTopic);
  f.catalog.repositories.push({ id: 'repo-two', code: 'second', name: 'Second Repository', source: { type: 'workspace', path: second } });
  const directory = path.join(f.base, 'task-evidence'); fs.mkdirSync(directory);
  const evidence = new Map<string, { evidence: { repositories: Array<{ sourceRepository: string; checkoutPath: string; branch: string }> } }>();
  const register = (id: string, repositories: Array<{ sourceRepository: string; checkoutPath: string; branch: string }>) => { fs.writeFileSync(path.join(directory, id + '.json'), '{}'); evidence.set(id, { evidence: { repositories } }); };
  register('task-one', [{ sourceRepository: f.root, checkoutPath: firstTopic, branch: 'task/topic' }, { sourceRepository: second, checkoutPath: secondTopic, branch: 'task/topic' }]);
  register('retired-other', [{ sourceRepository: f.root, checkoutPath: path.join(f.base, 'retired'), branch: 'old' }]);
  const app = createCodeApplication({ assetCatalog: () => f.catalog, resolveSourceRoot: (_root, source) => source.path,
    readTaskScope: () => ({ projects: ['p'], services: [] }), readTask: (_root, id) => { if (id === 'missing-task') throw Error('missing task'); return { taskId: id, title: '任务 ' + id }; },
    gitWorktreeEvidencePath: (_root, id) => path.join(directory, id + '.json'), readGitWorktreeEvidence: (_root, id) => evidence.get(id) || null });
  const linked = () => app.sourceControl(f.root).repositories.flatMap(repository => repository.worktrees.filter(worktree => !worktree.isMain));
  assert.deepEqual(linked().map(worktree => [worktree.name, worktree.taskId, worktree.taskTitle]), [['topic', 'task-one', '任务 task-one'], ['topic', 'task-one', '任务 task-one']]);
  assert.deepEqual(app.sourceControl(f.root).diagnostics, [], 'retired evidence does not add unrelated failures to current Git status');
  register('second-task', [{ sourceRepository: f.root, checkoutPath: firstTopic, branch: 'task/topic' }]);
  const ambiguous = linked().find(worktree => worktree.location === fs.realpathSync(firstTopic))!;
  assert.equal(ambiguous.taskId, null); assert.match(ambiguous.taskDiagnostic!, /多个任务/);
  evidence.delete('second-task'); evidence.delete('task-one');
  register('foreign-task', [{ sourceRepository: second, checkoutPath: firstTopic, branch: 'task/topic' }]);
  assert.ok(linked().every(worktree => worktree.taskId === null), 'same directory name and branch do not establish task ownership');
  register('stale-task', [{ sourceRepository: f.root, checkoutPath: firstTopic, branch: 'old-branch' }]);
  assert.match(linked().find(worktree => worktree.location === fs.realpathSync(firstTopic))!.taskDiagnostic!, /分支与任务记录不同/);
  evidence.delete('stale-task');
  register('missing-task', [{ sourceRepository: f.root, checkoutPath: firstTopic, branch: 'task/topic' }]);
  const missing = linked().find(worktree => worktree.location === fs.realpathSync(firstTopic))!;
  assert.equal(missing.taskId, null); assert.match(missing.taskDiagnostic!, /任务记录当前不可读取/);
});

test('task association limits cannot assert a unique task from an incomplete scan, while unrelated invalid evidence stays local', t => {
  const f = fixture(t); f.write('base.ts', 'base\n'); f.commit('base');
  const linked = path.join(f.base, 'topic'); f.git('worktree', 'add', '-b', 'task/topic', linked);
  const current = f.app.sourceControl(f.root).repositories;
  const directory = path.join(f.base, 'task-evidence'); fs.mkdirSync(directory);
  for (const id of ['a-task', 'z-task']) fs.writeFileSync(path.join(directory, id + '.json'), '{}');
  const value = { evidence: { repositories: [{ sourceRepository: f.root, checkoutPath: linked, branch: 'task/topic' }] } };
  const before = Date.now(), deadline = before + 10000; let expired = false;
  const clock = t.mock.method(Date, 'now', () => expired ? deadline + 1 : before);
  const dependencies = { gitWorktreeEvidencePath: (_root: string, id: string) => path.join(directory, id + '.json'),
    readGitWorktreeEvidence: (_root: string, id: string) => { if (id === 'a-task') expired = true; return value; }, readTask: (_root: string, id: string) => ({ taskId: id, title: id }) };
  const timedOut = [...readSourceControlTaskAssociations(f.root, current, dependencies, undefined, deadline).values()][0];
  assert.equal(timedOut.taskId, null); assert.match(timedOut.taskDiagnostic!, /尚未完整读取/);
  clock.mock.restore();
  fs.unlinkSync(path.join(directory, 'z-task.json')); fs.writeFileSync(path.join(directory, 'invalid-retired.json'), '{}');
  const unaffected = [...readSourceControlTaskAssociations(f.root, current, { ...dependencies, readGitWorktreeEvidence: (_root, id) => { if (id === 'invalid-retired') throw Error('invalid retired evidence'); return value; } }).values()][0];
  assert.equal(unaffected.taskId, 'a-task'); assert.equal(unaffected.taskDiagnostic, null);
  const entries = ['a-task.json', ...Array.from({ length: 999 }, (_, index) => `filler-${index}.json`), 'z-task.json']; let position = 0;
  const handle = { readSync: () => position < entries.length ? { name: entries[position++] } : null, closeSync: () => {} };
  t.mock.method(fs, 'opendirSync', () => handle as unknown as fs.Dir);
  const limited = [...readSourceControlTaskAssociations(f.root, current, { ...dependencies, readGitWorktreeEvidence: (_root, id) => id === 'a-task' || id === 'z-task' ? value : null }).values()][0];
  assert.equal(limited.taskId, null); assert.match(limited.taskDiagnostic!, /尚未完整读取/);
});

test('root and merge commits compare the actual empty tree and first parent in SHA-1 and SHA-256 repositories', async t => {
  for (const format of ['sha1', 'sha256']) {
    const f = fixture(t, format); f.write('base.ts', 'base\n'); const root = f.commit('root');
    const first = f.app.commit(f.root, { ...f.input, commitHash: root }); assert.equal(first.baseHash, null); assert.equal(first.files[0].status, 'added');
    assert.match((await f.app.diff(f.root, { ...f.input, commitHash: root, area: 'commit', path: 'base.ts' })).patch!, /\+base/);
    f.git('branch', 'side'); f.write('main.ts', 'main\n'); const parent = f.commit('main');
    f.git('checkout', 'side'); f.write('side.ts', 'side\n'); f.commit('side'); f.git('checkout', 'main'); f.git('merge', '--no-ff', 'side', '-m', 'merge'); const hash = f.git('rev-parse', 'HEAD');
    const merged = f.app.commit(f.root, { ...f.input, commitHash: hash }); assert.equal(merged.baseHash, parent); assert.equal(merged.commit.parents.length, 2); assert.deepEqual(merged.files.map(file => file.path), ['side.ts']);
    assert.match((await f.app.diff(f.root, { ...f.input, commitHash: hash, area: 'commit', path: 'side.ts' })).patch!, /\+side/);
    f.write('side.ts', 'current\n'); assert.equal((await f.app.sourceFile(f.root, { ...f.input, commitHash: hash, area: 'commit', path: 'side.ts' })).content, 'side\n');
  }
});

test('staged and historical paged full files preserve their actual object revisions', async t => {
  const f = fixture(t); const body = 'a'.repeat(CODE_LIMITS.textBytes + 2048); f.write('large.txt', body); const hash = f.commit('large'); f.write('large.txt', 'b'.repeat(body.length)); f.git('add', '--', 'large.txt');
  const before = f.snapshot(), index = await f.app.sourceFile(f.root, { ...f.input, path: 'large.txt', area: 'staged' });
  assert.equal(index.page?.index, 0); assert.equal(index.content, 'b'.repeat(CODE_LIMITS.pageBytes));
  const next = await f.app.sourceFile(f.root, { ...f.input, path: 'large.txt', area: 'staged', page: 1, expectedRevision: index.revision }); assert.equal(next.page?.index, 1); assert.equal(next.revision, index.revision);
  const historical = await f.app.sourceFile(f.root, { ...f.input, path: 'large.txt', area: 'commit', commitHash: hash }); assert.equal(historical.content, 'a'.repeat(CODE_LIMITS.pageBytes));
  const nextHistory = await f.app.sourceFile(f.root, { ...f.input, path: 'large.txt', area: 'commit', commitHash: hash, page: 1, expectedRevision: historical.revision }); assert.equal(nextHistory.revision, historical.revision);
  assert.deepEqual(f.snapshot(), before);
});

test('conflicted files keep their identity and current full content without pretending to have a two-way index diff',async t=>{
  const f=fixture(t);f.write('a.ts','base\n');f.commit('base');f.git('branch','side');f.write('a.ts','main\n');f.commit('main');f.git('checkout','side');f.write('a.ts','side\n');f.commit('side');f.git('checkout','main');assert.throws(()=>f.git('merge','side'));
  const before=f.snapshot(),catalog=f.app.sourceControl(f.root),file=catalog.repositories[0].changes.find(file=>file.path==='a.ts');assert.equal(file?.status,'conflicted');assert.equal(file?.area,'unstaged');
  const diff=await f.app.diff(f.root,{...f.input,path:'a.ts',area:'unstaged'});assert.equal(diff.patch,null);assert.equal(diff.file.status,'conflicted');assert.ok(diff.diagnostics.some(item=>item.code==='code_file_conflicted'));
  assert.match((await f.app.sourceFile(f.root,{...f.input,path:'a.ts',area:'unstaged'})).content,/<<<<<<< HEAD/);
  await assert.rejects(f.app.sourceFile(f.root,{...f.input,path:'a.ts',area:'staged'}),hasCode('code_index_file_missing'));assert.deepEqual(f.snapshot(),before);
});

test('HTTP contracts, bounded worker dispatch and CLI share all five source-control application operations', async t => {
  const f = fixture(t); f.write('a.ts', 'base\n'); const hash = f.commit('base\n\nBuildr-Task: task-one'); f.write('a.ts', 'changed\n');
  const http = createCodeHttpContribution(f.app); const cases = [
    ['source-control', {}, 'sourceControl'], ['history', { repositoryId: 'repo-one' }, 'history'], ['commit', { repositoryId: 'repo-one', commitHash: hash }, 'commit'],
    ['diff', { repositoryId: 'repo-one', filePath: 'a.ts', area: 'unstaged' }, 'diff'], ['source-file', { repositoryId: 'repo-one', filePath: 'a.ts', area: 'unstaged' }, 'sourceFile'],
  ] as const;
  for (const [operation, input, method] of cases) {
    const response: any = await http.handle({ request: { method: 'GET' }, root: f.root, suffix: '/code/' + operation, searchParams: new URLSearchParams(input) });
    assert.equal(response.status, 200); const checked = CODE_HTTP_VALIDATORS.validate(CODE_HTTP_SCHEMAS[method].$id, response.body); assert.equal(checked.valid, true, JSON.stringify(checked));
    let dispatched = '';
    await http.handle({ request: { method: 'GET' }, root: f.root, suffix: '/code/' + operation, searchParams: new URLSearchParams(input), submitTaskRead: async (name, _id, payload) => { dispatched = name; return f.app[method](f.root, JSON.parse(payload.input)); } });
    assert.equal(dispatched, 'code-' + operation);
    const cli = createCodeCliContributions(f.app).find(contribution => contribution.match({ domain: 'code', action: operation })); assert.ok(cli);
    const cliFlags: Record<string,string> = {repositoryId:'--repository',filePath:'--path',commitHash:'--commit',area:'--area'};
    let printed = ''; const originalWrite=process.stdout.write.bind(process.stdout);const capture = t.mock.method(process.stdout, 'write', (chunk: any,...rest:any[]) => { if(typeof chunk==='string'){printed += chunk; return true;}return (originalWrite as (...args:any[])=>boolean)(chunk,...rest); });
    try { await cli.run(null, {argv:['node','buildr','code',operation,'--target',f.root,'--json',...Object.entries(input).flatMap(([key,value])=>[cliFlags[key],value])]}); }
    finally { capture.mock.restore(); }
    const cliBody = JSON.parse(printed); assert.equal(cliBody.observedRevision,response.body.observedRevision);
  }
  await assert.rejects(http.handle({ request: { method: 'GET' }, root: f.root, suffix: '/code/diff', searchParams: new URLSearchParams('repositoryId=repo-one&repositoryId=other&filePath=a.ts&area=unstaged') }), hasCode('code_query_invalid'));
});

test('all Git checkouts retain independent same-path index/worktree versions, sources, history and task preselection',async t=>{
  const f=fixture(t);f.write('same.ts','root-base\n');const first=f.commit('root');
  const a=path.join(f.base,'group-a','topic'),b=path.join(f.base,'group-b','topic');f.git('worktree','add','-b','topic-a',a);f.git('worktree','add','-b','topic-b',b);
  for(const [directory,label]of [[f.root,'main'],[a,'a'],[b,'b']]){
    if(directory!==f.root){fs.writeFileSync(path.join(directory,'same.ts'),label+'-base\n');checkoutGit(directory,'add','--','same.ts');checkoutGit(directory,'commit','-m',label+' base');}
    fs.writeFileSync(path.join(directory,'same.ts'),label+'-index\n');checkoutGit(directory,'add','--','same.ts');fs.writeFileSync(path.join(directory,'same.ts'),label+'-working\n');fs.writeFileSync(path.join(directory,'new.txt'),label+'-new\n');
  }
  const before=[f.root,a,b].map(checkoutSnapshot);f.setEvidence({evidence:{repositories:[{sourceRepository:f.root,checkoutPath:a}]}});
  const catalog=f.app.sourceControl(f.root,{taskId:'task-one'}),repository=catalog.repositories[0];assert.equal(repository.worktrees.length,3);assert.equal(repository.worktreeCount,3);assert.equal(repository.fileCount,6);assert.deepEqual(repository.worktreeCoverage,{limit:128,total:3,read:3,truncated:false});assert.equal(catalog.worktreeCoverage.total,3);
  const find=(directory:string)=>repository.worktrees.find(worktree=>worktree.location===fs.realpathSync(directory))!;
  assert.equal(find(f.root).isMain,true);assert.equal(find(f.root).isRegistered,true);assert.equal(find(a).name,find(b).name);assert.notEqual(find(a).worktreeId,find(b).worktreeId);assert.deepEqual(catalog.selectedWorktreeIds,[find(a).worktreeId]);assert.deepEqual(catalog.selectedWorktrees,[{repositoryId:'repo-one',worktreeId:find(a).worktreeId}]);
  for(const [directory,label]of [[f.root,'main'],[a,'a'],[b,'b']]){
    const checkout=find(directory),input={...f.input,worktreeId:checkout.worktreeId,path:'same.ts',expectedRevision:checkout.observedRevision!};assert.equal(checkout.fileCount,2);assert.equal(checkout.changes.filter(file=>file.path==='same.ts').length,2);assert.ok(checkout.changes.every(file=>file.worktreeId===checkout.worktreeId));
    assert.equal(checkout.worktreeId,gitCheckoutReadId(directory));assert.equal(checkout.source!.checkoutId,checkout.worktreeId);
    assert.equal(f.app.repositories(f.root).worktrees.find(member=>member.path===fs.realpathSync(directory))!.id,checkout.worktreeId);
    const staged=await f.app.sourceFile(f.root,{...input,area:'staged'}),working=await f.app.sourceFile(f.root,{...input,area:'unstaged'});assert.equal(staged.content,label+'-index\n');assert.equal(working.content,label+'-working\n');assert.equal(staged.source.worktreeId,checkout.worktreeId);
    assert.match((await f.app.diff(f.root,{...input,area:'staged'})).patch!,new RegExp('\\+'+label+'-index'));assert.match((await f.app.diff(f.root,{...input,area:'unstaged'})).patch!,new RegExp('\\+'+label+'-working'));assert.match((await f.app.diff(f.root,{...input,path:'new.txt',area:'untracked'})).patch!,new RegExp('\\+'+label+'-new'));
    const explorerInput={...f.input,checkoutId:checkout.worktreeId,path:'same.ts'};const explorer=await f.app.file(f.root,explorerInput);assert.equal(explorer.content,label+'-working\n');assert.equal(explorer.source.checkoutId,working.source.worktreeId);assert.equal(explorer.source.location,working.source.location);assert.equal(f.app.directory(f.root,{...explorerInput,path:undefined}).source.checkoutId,checkout.worktreeId);assert.ok(f.app.search(f.root,{...explorerInput,query:label+'-working',mode:'content'}).matches.some(match=>match.path==='same.ts'));
    assert.equal((await f.app.file(f.root,{...f.input,worktreeId:checkout.worktreeId,path:'same.ts'})).content,label+'-working\n');assert.equal(f.app.directory(f.root,{...f.input,worktreeId:checkout.worktreeId}).source.worktreeId,checkout.worktreeId);assert.ok(f.app.search(f.root,{...f.input,worktreeId:checkout.worktreeId,query:label+'-working',mode:'content'}).matches.some(match=>match.path==='same.ts'));
  }
  await assert.rejects(f.app.diff(f.root,{...f.input,worktreeId:find(b).worktreeId,path:'same.ts',area:'unstaged',expectedRevision:find(a).observedRevision!}),hasCode('code_source_changed'));
  const branchHistory=f.app.history(f.root,{...f.input,worktreeId:find(a).worktreeId,branch:'topic-a'});assert.equal(branchHistory.source.worktreeId,find(a).worktreeId);assert.ok(branchHistory.commits.some(commit=>commit.hash===first));assert.ok(branchHistory.commits.every(commit=>commit.taskId===null));assert.ok(branchHistory.branches.find(branch=>branch.name==='topic-a')?.current);
  const pinned=await f.app.sourceFile(f.root,{...f.input,worktreeId:find(b).worktreeId,path:'same.ts',area:'commit',commitHash:first});assert.equal(pinned.content,'root-base\n');assert.equal(pinned.source.worktreeId,find(b).worktreeId);
  assert.equal((await f.app.file(f.root,{...f.input,path:'same.ts'})).content,'main-working\n');assert.equal((await f.app.file(f.root,{...f.input,path:'same.ts',taskId:'task-one'})).content,'a-working\n');
  assert.equal(f.app.sourceControl(f.root,{taskId:'missing-task'}).repositories[0].worktrees.length,3);assert.deepEqual([f.root,a,b].map(checkoutSnapshot),before);
});

test('opaque worktree identities reject forged, removed, reused and foreign directories without inventing Git inventory',async t=>{
  const f=fixture(t);f.write('same.ts','base\n');f.commit('base');const linked=path.join(f.base,'linked');f.git('worktree','add','-b','topic',linked);const worktree=f.app.sourceControl(f.root).repositories[0].worktrees.find(worktree=>!worktree.isMain)!;
  fs.mkdirSync(path.join(f.root,'.worktrees','unregistered'),{recursive:true});fs.writeFileSync(path.join(f.root,'.worktrees','unregistered','same.ts'),'must not appear');assert.equal(f.app.sourceControl(f.root).repositories[0].worktrees.length,2);
  const before=f.snapshot();await assert.rejects(f.app.sourceFile(f.root,{...f.input,worktreeId:'checkout-'+'0'.repeat(64),path:'same.ts'}),hasCode('code_worktree_not_registered'));assert.deepEqual(f.snapshot(),before);
  await assert.rejects(f.app.sourceFile(f.root,{...f.input,worktreeId:worktree.worktreeId,taskId:'missing-task',path:'same.ts'}),/missing task/);
  await assert.rejects(f.app.sourceFile(f.root,{...f.input,worktreeId:worktree.worktreeId,taskId:'../task',path:'same.ts'}),/Task ID/);
  assert.equal((await f.app.sourceFile(f.root,{...f.input,worktreeId:worktree.worktreeId,taskId:'task-one',path:'same.ts'})).source.taskId,null);
  f.git('worktree','remove',linked);await assert.rejects(f.app.sourceFile(f.root,{...f.input,worktreeId:worktree.worktreeId,path:'same.ts'}),hasCode('code_worktree_not_registered'));
  f.git('worktree','add',linked,'topic');const replacement=f.app.sourceControl(f.root).repositories[0].worktrees.find(worktree=>!worktree.isMain)!;assert.notEqual(replacement.worktreeId,worktree.worktreeId);await assert.rejects(f.app.sourceFile(f.root,{...f.input,worktreeId:worktree.worktreeId,path:'same.ts'}),hasCode('code_worktree_not_registered'));
  const displaced=linked+'-displaced';fs.renameSync(linked,displaced);fs.mkdirSync(linked);checkoutGit(linked,'init');fs.writeFileSync(path.join(linked,'same.ts'),'foreign');
  const catalog=f.app.sourceControl(f.root),failed=catalog.repositories[0].worktrees.find(worktree=>!worktree.isMain)!;assert.equal(failed.status,'unavailable');assert.equal(failed.fileCount,null);assert.equal(catalog.repositories[0].status,'partial');assert.ok(failed.diagnostics.length);
  await assert.rejects(f.app.sourceFile(f.root,{...f.input,worktreeId:replacement.worktreeId,path:'same.ts'}),hasCode('code_worktree_not_registered'));
});

test('retired task checkout gets an explicit registered-source fallback while missing Git checkout stays visible',async t=>{
  const f=fixture(t);f.write('same.ts','base\n');f.commit('base');const linked=path.join(f.base,'topic');f.git('worktree','add','-b','topic',linked);f.setEvidence({evidence:{repositories:[{sourceRepository:f.root,checkoutPath:linked}]}});
  const original=f.app.sourceControl(f.root,{taskId:'task-one'});assert.equal(original.selectedWorktreeIds.length,1);f.git('worktree','remove',linked);
  const retired=f.app.sourceControl(f.root,{taskId:'task-one'});assert.equal(retired.repositories[0].worktrees.length,1);assert.deepEqual(retired.selectedWorktreeIds,[retired.repositories[0].worktrees[0].worktreeId]);assert.match(retired.scopeReason,/登记目录/);assert.ok(retired.diagnostics.some(diagnostic=>diagnostic.code==='code_task_location_unavailable'));
  f.git('worktree','add',linked,'topic');fs.renameSync(linked,linked+'-moved');const missing=f.app.sourceControl(f.root);assert.equal(missing.repositories[0].worktreeCount,2);assert.equal(missing.repositories[0].worktrees.find(worktree=>!worktree.isMain)?.status,'unavailable');assert.equal(missing.repositories[0].fileCount,null);
});


test('SCM registry reads ignore unrelated retired-task evidence while Explorer and requested-task diagnostics remain', t => {
  const f=fixture(t);f.write('a.ts','base\n');const head=f.commit('base');
  const provider=registerGitWorktreeProvider({assertCanonicalTaskWorkspace:root=>root,readProjectRegistryRecord:()=>({registry:{migrationRequired:false},projects:{}}),readServiceRegistryRecord:()=>({services:{}}),sameGitIdentity:(a,b)=>a===b,atomicWriteJson:(file,value)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(value));},removePath:file=>fs.rmSync(file,{force:true})});
  for(const taskId of ['retired-other','task-one']){const retired=path.join(f.base,taskId);f.git('worktree','add','-b',taskId,retired);provider.writeGitWorktreeEvidence(f.root,{schemaVersion:'buildr.git-worktree-evidence/v1',taskId,workspaceRoot:fs.realpathSync(f.root),branch:taskId,planDigest:'sha256-'+'0'.repeat(64),status:'ready',repositories:[{selector:'workspace',entityType:'workspace',sourcePath:'.',sourceRepository:fs.realpathSync(f.root),checkoutPath:fs.realpathSync(retired),branch:taskId,startPoint:head,head,clean:true,registered:true,state:'ready',diagnostic:null,remote:null,remoteUrl:null}],effects:[],updatedAt:new Date().toISOString()});f.git('worktree','remove',retired);}
  f.write('a.ts','current\n');const before=f.snapshot(),reads:string[]=[];let associationDiscovery=0;
  const app=createCodeApplication({assetCatalog:()=>f.catalog,resolveSourceRoot:(_root,source)=>source.path,readTaskScope:(_root,id)=>{if(id!=='task-one')throw Error('missing task');return {projects:['p'],services:[]};},gitWorktreeEvidencePath:(root,id)=>{associationDiscovery++;return provider.gitWorktreeEvidencePath(root,id);},readGitWorktreeEvidence:(root,id,options)=>{reads.push(id);return provider.readGitWorktreeEvidence(root,id,options);}});
  const global=app.sourceControl(f.root);assert.equal(global.repositories[0].status,'complete');assert.equal(global.repositories[0].worktreeCount,1);assert.equal(global.repositories[0].fileCount,1);assert.deepEqual(global.diagnostics,[]);assert.deepEqual(reads,[]);assert.equal(associationDiscovery,0);
  const explorer=app.repositories(f.root);assert.ok(explorer.diagnostics.some(item=>item.code==='code_task_location_unavailable'&&item.message.includes('retired-other')));assert.ok(explorer.worktrees.some(item=>item.taskId==='retired-other'&&!item.available));
  reads.length=0;associationDiscovery=0;const scoped=app.sourceControl(f.root,{taskId:'task-one'});assert.equal(scoped.repositories[0].status,'complete');assert.ok(scoped.diagnostics.some(item=>item.code==='code_task_location_unavailable'));assert.ok(scoped.diagnostics.every(item=>!item.message.includes('retired-other')));assert.deepEqual(reads,['task-one']);assert.equal(associationDiscovery,0);assert.deepEqual(scoped.selectedWorktrees,[{repositoryId:'repo-one',worktreeId:scoped.repositories[0].worktrees[0].worktreeId}]);assert.match(scoped.scopeReason,/登记目录/);assert.deepEqual(f.snapshot(),before);
  f.catalog.repositories.push({id:'unavailable',code:'unavailable',name:'Unavailable',source:{type:'workspace',path:path.join(f.base,'missing')}});const partial=app.sourceControl(f.root);assert.ok(partial.diagnostics.some(item=>item.code==='code_repository_unavailable'&&item.repositoryId==='unavailable'));assert.equal(partial.repositories[0].status,'complete');assert.equal(partial.repositories[1].status,'unavailable');
});
