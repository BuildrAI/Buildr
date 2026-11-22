import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { HarnessDirectoryHost } from '../../src/application/directory-host.ts';
import { LocalWorkspaceAuthority } from '../../src/application/local-workspaces.ts';
import { createDirectoryWorkbench } from '../../src/application/directory-workbench.ts';
import { codeGitEnvironment } from '../../src/workbench/code-git-environment.ts';

test('directory files are independent of Git and stale writes cannot replace content', async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'harness-workbench-files-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const dir=path.join(root,'ordinary');fs.mkdirSync(dir);
  const filename=path.join(dir,'note.md');fs.writeFileSync(filename,'before\n');
  const guarded=path.join(dir,'AGENTS.md');fs.writeFileSync(guarded,'<!-- buildr:required begin -->\nprotected\n<!-- buildr:required end -->\n');
  const outside=path.join(root,'outside.txt');fs.writeFileSync(outside,'outside\n');
  if(process.platform!=='win32')fs.symlinkSync(outside,path.join(dir,'out'));
  const host=new HarnessDirectoryHost(path.join(root,'profile'));
  const scope=host.register(dir);
  const run=createDirectoryWorkbench(host);
  const call=async(operation:string,input={})=>await run(operation,{scopeId:scope.ref.id,scopeRevision:scope.revision,...input}) as any;
  assert.ok((await call('directory')).entries.some((item:{path:string})=>item.path==='note.md'));
  await assert.rejects(call('status'),{code:'code_checkout_unavailable'});
  await assert.rejects(call('directory',{rootPath:root}),{code:'agent_directory_workbench_input_invalid'});
  await assert.rejects(call('file',{path:'../outside.txt'}),{code:'code_path_forbidden'});
  if(process.platform!=='win32')await assert.rejects(call('file',{path:'out'}),{code:'code_path_forbidden'});
  const observe=(p:string)=>call('editor',{path:p});
  const save=(p:string,observation:any,content:string)=>call('save',{path:p,expectedFileId:observation.fileId,expectedSourceRevision:observation.sourceRevision,expectedRevision:observation.revision,content});
  const first=await observe('note.md');
  const saved=await save('note.md',first,'saved\n');assert.equal(saved.content,'saved\n');
  fs.writeFileSync(filename,'external\n');
  await assert.rejects(save('note.md',saved,'lost\n'),{code:'file_revision_conflict'});
  assert.equal(fs.readFileSync(filename,'utf8'),'external\n');
  await assert.rejects(save('AGENTS.md',await observe('AGENTS.md'),'overwritten\n'),{code:'file_managed_block_changed'});
  fs.renameSync(dir,dir+'-original');fs.mkdirSync(dir);fs.writeFileSync(filename,'replacement\n');
  await assert.rejects(call('file',{path:'note.md'}),{code:'agent_scope_binding_changed'});
  assert.equal(fs.readFileSync(filename,'utf8'),'replacement\n');
});

test('local Git workbench reads comparisons and commits only the staged tree', async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'harness-workbench-git-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const dir=path.join(root,'repo');fs.mkdirSync(dir);
  const git=(...args:string[])=>execFileSync('git',['-C',dir,...args],{env:codeGitEnvironment(),encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  git('-c','init.templateDir=','init','-q','-b','main');
  git('config','user.name','Workbench Fixture');git('config','user.email','workbench@example.invalid');git('config','commit.gpgSign','false');
  for(const name of ['take.txt','keep.txt'])fs.writeFileSync(path.join(dir,name),'base\n');
  git('add','--','take.txt','keep.txt');git('commit','-m','base');
  const original=git('rev-parse','HEAD');
  fs.writeFileSync(path.join(dir,'take.txt'),'selected\n');fs.writeFileSync(path.join(dir,'keep.txt'),'unselected\n');
  const host=new HarnessDirectoryHost(path.join(root,'profile'));
  const scope=host.register(dir);
  const run=createDirectoryWorkbench(host);
  const call=async(operation:string,input:object={})=>await run(operation,{scopeId:scope.ref.id,scopeRevision:scope.revision,...input}) as any;
  const first=await call('status');
  const target={repositoryId:first.repositoryId,worktreeId:first.worktreeId};
  const write=(state:any,action:string,input:object={})=>call('git-write',{worktreeId:state.worktreeId,action,expectedRevision:state.writeRevision,...input});
  assert.match((await call('diff',{...target,path:'take.txt',area:'unstaged'})).patch,/\+selected/);
  assert.equal((await call('history',target)).commits[0].hash,original);
  await assert.rejects(call('directory',{path:'.git'}),{code:'code_path_forbidden'});
  await write(first,'stage',{path:'take.txt'});
  assert.equal(git('diff','--cached','--name-only'),'take.txt');
  await assert.rejects(write(first,'stage',{path:'keep.txt'}),{code:'code_source_changed'});
  await write(await call('status'),'unstage',{path:'take.txt'});
  assert.equal(git('diff','--cached','--name-only'),'');
  await write(await call('status'),'stage',{path:'take.txt'});
  const stale=await call('status');
  git('add','--','keep.txt');
  await assert.rejects(write(stale,'commit',{message:'stale'}),{code:'code_source_changed'});
  await write(await call('status'),'unstage',{path:'keep.txt'});
  const receipt=await write(await call('status'),'commit',{message:'selected only'});
  assert.equal(receipt.hash,git('rev-parse','HEAD'));
  assert.equal(git('show','--format=','--name-only','HEAD'),'take.txt');
  assert.equal(git('show','HEAD:keep.txt'),'base');
  assert.equal(git('diff','--name-only'),'keep.txt');
  assert.equal(git('diff','--cached','--name-only'),'');
  assert.equal(git('remote'),'');
  assert.equal((await call('history',target)).commits[0].subject,'selected only');
  const child=path.join(dir,'child');fs.mkdirSync(child);const childScope=host.register(child);
  await assert.rejects(run('status',{scopeId:childScope.ref.id,scopeRevision:childScope.revision}),{code:'code_checkout_unavailable'});
  assert.deepEqual((await run('directory',{scopeId:childScope.ref.id,scopeRevision:childScope.revision}) as any).entries,[]);
});

test('local registered buildr workspace can be inspected in workbench without Development running', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-workbench-local-ws-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dataRoot = path.join(root, 'data');
  const workDir = path.join(root, 'ws');
  fs.mkdirSync(path.join(workDir, '.buildr'), { recursive: true });
  const workspaceId = '66666666-6666-4666-8666-666666666666';
  fs.writeFileSync(path.join(workDir, '.buildr', 'workspace.yml'), `schemaVersion: buildr.workspace/v1\nid: ${workspaceId}\nname: 独立空间\n`);
  fs.writeFileSync(path.join(workDir, 'readme.txt'), 'hello standalone workbench\n');
  fs.mkdirSync(dataRoot, { recursive: true });
  fs.writeFileSync(path.join(dataRoot, 'workspace-registry.json'), JSON.stringify({
    schemaVersion: 'buildr.local-workspace-registry/v1',
    roots: [workDir],
    lastOpenedRoot: workDir,
  }));

  const authority = new LocalWorkspaceAuthority(dataRoot);
  const scope = authority.resolveExecutionScope({ ref: { sourceId: 'buildr', id: workspaceId } })!;
  const run = createDirectoryWorkbench({
    resolveDirectory: () => ({ ...scope, name: '独立空间', selectedPath: workDir }),
  });
  const listing = await run('directory', { scopeId: workspaceId, scopeRevision: scope.revision }) as { entries: Array<{ path: string }> };
  assert.ok(listing.entries.some(item => item.path === 'readme.txt'));
  const file = await run('file', { scopeId: workspaceId, scopeRevision: scope.revision, path: 'readme.txt' }) as { content: string };
  assert.equal(file.content, 'hello standalone workbench\n');
});

test('directory discovery finds real nested repositories and linked checkouts without engineering registration', async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'harness-repositories-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const directory=path.join(root,'folder'), first=path.join(directory,'first'), second=path.join(directory,'second'), peer=path.join(root,'linked');
  const git=(where:string,...args:string[])=>execFileSync('git',['-C',where,...args],{env:codeGitEnvironment(),encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  for(const repo of [first,second]){
    fs.mkdirSync(repo,{recursive:true});
    git(repo,'-c','init.templateDir=','init','-q','-b','main');
    git(repo,'config','user.name','Fixture');git(repo,'config','user.email','fixture@example.invalid');git(repo,'config','commit.gpgSign','false');
    fs.writeFileSync(path.join(repo,'same.txt'),path.basename(repo)+'\n');git(repo,'add','same.txt');git(repo,'-c','core.hooksPath=/dev/null','commit','-qm','base');
  }
  git(first,'worktree','add','-qb','linked',peer);
  fs.writeFileSync(path.join(peer,'same.txt'),'linked checkout\n');
  if(process.platform!=='win32')fs.symlinkSync(peer,path.join(directory,'must-not-follow'));
  const host=new HarnessDirectoryHost(path.join(root,'profile'));
  const scope=host.register(directory);
  let opened:string|undefined;
  const run=createDirectoryWorkbench(host,async value=>{opened=value;return {requested:true};});
  const call=async(operation:string,input:object={})=>await run(operation,{scopeId:scope.ref.id,scopeRevision:scope.revision,...input}) as any;
  const catalog=await call('checkouts');
  assert.deepEqual(catalog.repositories.map((item:{path:string})=>item.path).sort(),['first','second']);
  const repo=catalog.repositories.find((item:{path:string})=>item.path==='first');
  const linked=repo.checkouts.members.find((member:{branch:string})=>member.branch==='linked');
  const main={repositoryPath:'first',checkoutId:repo.checkouts.defaultId};
  const selected={repositoryPath:'first',checkoutId:linked.id};
  const identity={repositoryId:repo.id,worktreeId:linked.id};
  assert.equal((await call('file',{...main,path:'same.txt'})).content,'first\n');
  assert.equal((await call('file',{...selected,path:'same.txt'})).content,'linked checkout\n');
  assert.match((await call('diff',{...selected,...identity,path:'same.txt',area:'unstaged'})).patch,/\+linked checkout/);
  await call('open-folder',{...selected,path:'same.txt'});
  assert.equal(opened,fs.realpathSync(peer));
  await assert.rejects(call('file',{...selected,repositoryPath:'second',path:'same.txt'}),{code:'code_worktree_identity_changed'});
  await assert.rejects(call('file',{...selected,repositoryPath:'../linked',path:'same.txt'}),{code:'code_path_forbidden'});
  if(process.platform!=='win32')await assert.rejects(call('file',{...selected,repositoryPath:'must-not-follow',path:'same.txt'}),{code:'code_worktree_identity_changed'});
  const branch=await call('branches',main);
  const occupied=branch.branches.find((item:{name:string})=>item.name==='linked');
  await assert.rejects(call('branch-switch',{...main,targetRef:occupied.ref,expectedTargetHash:occupied.hash,expectedRevision:branch.observedRevision}),{code:'code_branch_occupied'});
  git(first,'branch','next');
  const refreshed=await call('branches',main);
  const next=refreshed.branches.find((item:{name:string})=>item.name==='next');
  const switched=await call('branch-switch',{...main,targetRef:next.ref,expectedTargetHash:next.hash,expectedRevision:refreshed.observedRevision});
  assert.equal(switched.branch,'next');assert.equal(git(peer,'branch','--show-current'),'linked');
  const large=path.join(peer,'large.txt');fs.writeFileSync(large,'first segment\n'.repeat(450000));
  const start=await call('file',{...selected,path:'large.txt'});
  assert.equal(start.page.index,0);
  assert.equal((await call('file',{...selected,path:'large.txt',page:1,expectedRevision:start.revision})).page.index,1);
  fs.appendFileSync(large,'changed');
  await assert.rejects(call('file',{...selected,path:'large.txt',page:1,expectedRevision:start.revision}),{code:'code_file_changed'});
  fs.unlinkSync(large);fs.writeFileSync(path.join(peer,'same.txt'),'first\n');git(first,'worktree','remove',peer);
  await assert.rejects(call('file',{...selected,path:'same.txt'}),{code:'code_worktree_identity_changed'});
  assert.equal((await call('file',{...main,path:'same.txt'})).content,'first\n');
});

test('standalone worktree management leaves the original checkout and branches intact', async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'harness-worktree-actions-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const git=(...args:string[])=>execFileSync('git',['-C',root,...args],{env:codeGitEnvironment(),encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  git('-c','init.templateDir=','init','-q','-b','main');
  git('config','user.name','Fixture');git('config','user.email','fixture@example.invalid');git('config','commit.gpgSign','false');
  fs.writeFileSync(path.join(root,'.gitignore'),'.worktrees/\n*.ignored\n');git('add','.gitignore');git('-c','core.hooksPath=/dev/null','commit','-qm','base');
  const host=new HarnessDirectoryHost(path.join(root,'.git','fixture'));
  const scope=host.register(root), run=createDirectoryWorkbench(host);
  const call=async(operation:string,input:object={})=>await run(operation,{scopeId:scope.ref.id,scopeRevision:scope.revision,...input}) as any;
  const context=await call('worktree-context');assert.ok(context.removeReason);
  const added=await call('worktree-write',{action:'create',name:'new-tree',expectedRevision:context.revision});
  assert.equal(added.status,'succeeded');assert.equal(git('branch','--show-current'),'main');
  const selection={repositoryPath:'',checkoutId:added.checkoutId}, peer=path.join(root,'.worktrees','new-tree');
  const clean=await call('worktree-context',selection);assert.equal(clean.removeReason,null);
  fs.writeFileSync(path.join(peer,'keep.ignored'),'must preserve');
  await assert.rejects(call('worktree-write',{...selection,action:'remove',expectedRevision:clean.revision}),{code:'code_source_changed'});
  const dirty=await call('worktree-context',selection);assert.ok(dirty.removeReason);
  await assert.rejects(call('worktree-write',{...selection,action:'remove',expectedRevision:dirty.revision}),{code:'code_worktree_action_unavailable'});
  assert.equal(fs.readFileSync(path.join(peer,'keep.ignored'),'utf8'),'must preserve');
  fs.unlinkSync(path.join(peer,'keep.ignored'));
  const fresh=await call('worktree-context',selection);
  const removed=await call('worktree-write',{...selection,action:'remove',expectedRevision:fresh.revision});
  assert.equal(removed.status,'succeeded');assert.equal(fs.existsSync(peer),false);
  assert.equal(git('branch','--list','new-tree'),'new-tree');
});

test('Git-aware catalog discovery scales beyond 2048 directories, preserves error details, and runs commit/generate/discard/fetch/history filters', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-workbench-scale-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const remoteBare = path.join(root, 'origin.git');
  const repo = path.join(root, 'workspace', 'big-repo');
  const peer = path.join(repo, '.worktrees', 'peer');
  fs.mkdirSync(remoteBare, { recursive: true });
  fs.mkdirSync(repo, { recursive: true });
  const git = (cwd: string, ...args: string[]) =>
    execFileSync('git', ['-C', cwd, ...args], { env: codeGitEnvironment(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

  git(remoteBare, 'init', '--bare', '-q');
  git(repo, '-c', 'init.templateDir=', 'init', '-q', '-b', 'main');
  git(repo, 'config', 'user.name', 'Scale Tester');
  git(repo, 'config', 'user.email', 'scale@example.invalid');
  git(repo, 'config', 'commit.gpgSign', 'false');
  git(repo, 'remote', 'add', 'origin', remoteBare);

  // Create 2120 nested tracked subdirectories (> maxDirectories = 2048) to prove Git-aware skipping avoids truncation.
  for (let i = 0; i < 2120; i++) {
    const dir = path.join(repo, 'packages', `p-${String(i).padStart(4, '0')}`);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.txt'), `item-${i}\n`);
  }
  fs.writeFileSync(path.join(repo, '.gitignore'), '.worktrees/\n');
  fs.writeFileSync(path.join(repo, 'shared.txt'), 'v1\n');
  git(repo, 'add', '.');
  git(repo, '-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'initial scaled commit');
  git(repo, 'push', '-q', '-u', 'origin', 'main');
  git(repo, 'branch', 'side-branch');
  git(repo, 'worktree', 'add', '-qb', 'peer-branch', peer);
  fs.writeFileSync(path.join(repo, 'shared.txt'), 'dirty-main\n');
  fs.writeFileSync(path.join(peer, 'shared.txt'), 'dirty-peer\n');
  fs.writeFileSync(path.join(peer, 'temp.txt'), 'remove-me\n');

  const host = new HarnessDirectoryHost(path.join(root, 'profile'));
  const scope = host.register(path.join(root, 'workspace'));
  const { CodeGeneration } = await import('../../src/workbench/code-generation.ts');
  const { workbenchError } = await import('../../src/application/directory-workbench.ts');
  let resolveSlowModel: ((value: string) => void) | undefined;
  const generation = new CodeGeneration(async input => {
    if (input.modelId === 'slow-model') {
      return await new Promise<string>(resolve => { resolveSlowModel = resolve; });
    }
    return JSON.stringify({ commitMessage: 'feat: generated message\n\nfrom mock model' });
  });
  t.after(() => generation.close());

  const run = createDirectoryWorkbench(host, { generation });
  const call = (operation: string, input: object = {}) => run(operation, { scopeId: scope.ref.id, scopeRevision: scope.revision, ...input }) as Promise<any>;

  // 1. Repository & catalog discovery with >2100 tracked folders does not truncate and observes all members
  const checkouts = await call('checkouts');
  assert.equal(checkouts.truncated, false);
  assert.equal(checkouts.repositories.length, 1);

  const catalog = await call('catalog');
  assert.equal(catalog.truncated, false);
  assert.equal(catalog.repositories.length, 1);
  const catalogRepo = catalog.repositories[0];
  assert.equal(catalogRepo.members.length, 2);
  const mainMember = catalogRepo.members.find((m: any) => m.isMain);
  const peerMember = catalogRepo.members.find((m: any) => m.branch === 'peer-branch');
  assert.ok(mainMember && peerMember);
  assert.equal(mainMember.fileCount, 1);
  assert.equal(peerMember.fileCount, 2);

  // 2. Batch fetch
  const fetched = await call('fetch', {
    repositories: [{ repositoryId: catalogRepo.id, expectedGitId: catalogRepo.gitId, expectedCheckoutId: mainMember.id }],
  });
  assert.equal(fetched.repositories[0].status, 'succeeded');

  // 3. Authors & history filters
  const peerTarget = { repositoryPath: 'big-repo', checkoutId: peerMember.id, repositoryId: catalogRepo.id, worktreeId: peerMember.id };
  const authors = await call('authors', peerTarget);
  assert.equal(authors.currentAuthor?.email, 'scale@example.invalid');
  assert.ok(authors.authors.some((a: any) => a.email === 'scale@example.invalid'));
  const filteredHistory = await call('history', { ...peerTarget, branch: 'refs/heads/main', authorEmail: 'scale@example.invalid' });
  assert.equal(filteredHistory.commits.length, 1);
  assert.equal(filteredHistory.commits[0].subject.trim(), 'initial scaled commit');

  // 4. Commit message generation + cancel + commit-context / commit-changes
  const commitCtx = await call('commit-context', peerTarget);
  assert.equal(commitCtx.hasChanges, true);
  assert.equal(commitCtx.fileCount, 2);

  const slowRun = await call('commit-message', {
    ...peerTarget, expectedRevision: commitCtx.revision,
    modelAccountId: 'acct', modelId: 'slow-model', accountIdentity: 'id', accountRevision: 'rev', label: 'Slow',
  });
  assert.equal(slowRun.status, 'running');
  const cancelledRun = await call('commit-message-cancel', { runId: slowRun.id });
  assert.equal(cancelledRun.status, 'cancelled');
  resolveSlowModel?.('{}');

  const fastRun = await call('commit-message', {
    ...peerTarget, expectedRevision: commitCtx.revision,
    modelAccountId: 'acct', modelId: 'fast-model', accountIdentity: 'id', accountRevision: 'rev', label: 'Fast',
  });
  let observedRun = fastRun;
  for (let i = 0; i < 20 && observedRun.status === 'running'; i++) {
    await new Promise(r => setTimeout(r, 10));
    observedRun = await call('commit-message-run', { runId: fastRun.id });
  }
  assert.equal(observedRun.status, 'succeeded');
  assert.equal(observedRun.output.commitMessage, 'feat: generated message\n\nfrom mock model');

  // Discard temp.txt in peer, then commit shared.txt
  const discardCtx = await call('discard-context', { ...peerTarget, path: 'temp.txt' });
  assert.deepEqual(discardCtx.removePaths, ['temp.txt']);
  const discarded = await call('discard-changes', { ...peerTarget, expectedRevision: discardCtx.revision, path: 'temp.txt' });
  assert.equal(discarded.status, 'succeeded');
  assert.equal(fs.existsSync(path.join(peer, 'temp.txt')), false);

  const commitCtx2 = await call('commit-context', peerTarget);
  const committed = await call('commit-changes', { ...peerTarget, expectedRevision: commitCtx2.revision, message: 'feat: peer commit', mode: 'commit' });
  assert.equal(committed.commit.completed, true);
  assert.equal(git(peer, 'show', '--format=%s', '-s', 'HEAD'), 'feat: peer commit');

  // 5. File read attaches editorSnapshot with selector, and workbenchError preserves details on conflict
  const readFile = await call('file', { repositoryPath: 'big-repo', checkoutId: mainMember.id, path: 'shared.txt' });
  assert.equal(readFile.editorSnapshot?.selector.kind, 'code');
  assert.equal(readFile.editorSnapshot?.selector.checkoutId, mainMember.id);
  fs.writeFileSync(path.join(repo, 'shared.txt'), 'external-main-edit\n');
  await assert.rejects(
    async () => {
      try {
        await call('save', {
          repositoryPath: 'big-repo', checkoutId: mainMember.id, path: 'shared.txt',
          content: 'stale-write\n',
          expectedFileId: readFile.editorSnapshot.fileId,
          expectedSourceRevision: readFile.editorSnapshot.sourceRevision,
          expectedRevision: readFile.editorSnapshot.revision,
        });
      } catch (err) {
        workbenchError(err);
      }
    },
    (err: any) => err?.code === 'agent_workbench_file_revision_conflict' && err?.details?.current?.selector?.checkoutId === mainMember.id,
  );
});
