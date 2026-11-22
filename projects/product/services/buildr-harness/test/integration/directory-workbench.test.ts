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
