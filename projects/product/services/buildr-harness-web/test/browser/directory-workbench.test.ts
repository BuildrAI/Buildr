import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import { createServer } from 'node:net';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { connectHarnessProcess, prepareAgentRuntime, stopAgentProcess } from '../../../buildr-harness/src/index.ts';
import { agentRuntimePackageTree } from '../../../buildr-harness/tools/package-runtime.ts';
import { codeGitEnvironment } from '../../../buildr-harness/src/workbench/code-git-environment.ts';

test('production Harness browses, edits, reviews and commits with no Development or model', {timeout:120000}, async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'harness-workbench-browser-'));
  const dataRoot=path.join(root,'profile'), packageRoot=path.join(root,'package'), repo=path.join(root,'repo');
  const profileId='workbench-browser';
  let client:Awaited<ReturnType<typeof connectHarnessProcess>>|undefined;
  let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
  let ownerPid:number|undefined;
  t.after(async()=>{
    try { await browser?.close(); } finally { await client?.disconnect(); }
    if(ownerPid){
      let failure:unknown;
      try{await stopAgentProcess({dataRoot,profileId,mode:'stop-owned'});}catch(error){failure=error;}
      const deadline=Date.now()+5000;
      while(Date.now()<deadline){
        try{process.kill(ownerPid,0);}catch(error){if((error as NodeJS.ErrnoException).code==='ESRCH'){ownerPid=undefined;break;}throw error;}
        await new Promise(resolve=>setTimeout(resolve,25));
      }
      if(ownerPid)throw new Error('Isolated Harness process still present: '+root,{cause:failure});
    }
    fs.rmSync(root,{recursive:true,force:true});
  });
  fs.mkdirSync(repo);
  const git=(...args:string[])=>execFileSync('git',['-C',repo,...args],{env:codeGitEnvironment(),encoding:'utf8'}).trim();
  git('-c','init.templateDir=','init','-q','-b','main');
  git('config','user.name','Browser Fixture');git('config','user.email','workbench@example.invalid');git('config','commit.gpgSign','false');
  fs.writeFileSync(path.join(repo,'note.txt'),'before\n');fs.writeFileSync(path.join(repo,'untouched.txt'),'base\n');
  git('add','--','note.txt','untouched.txt');git('commit','-qm','initial test revision');
  fs.writeFileSync(path.join(repo,'untouched.txt'),'external change\n');
  const coreRoot=path.resolve(import.meta.dirname,'../../../buildr-harness');
  agentRuntimePackageTree(coreRoot).materialize(packageRoot);
  const runtime=prepareAgentRuntime({dataRoot,packageRoot});
  client=await connectHarnessProcess({dataRoot,profileId,runtime,sourceId:'harness-local',caller:{kind:'first-party-user',product:'buildr-harness'}});
  ownerPid=(await client.lifecycle.identity()).pid;
  const scope=await client.directories.register(repo,'工作台验收仓库');
  const probe=createServer();
  await new Promise<void>(resolve=>probe.listen(0,'127.0.0.1',resolve));
  const port=(probe.address() as {port:number}).port;
  await new Promise<void>((resolve,reject)=>probe.close(error=>error?reject(error):resolve()));
  const ready=await client.web.enable({port});assert.equal(ready.ready,true);
  const login=await client.web.login();
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  await page.goto(login.url);
  await page.getByRole('button',{name:'打开目录工作台',exact:true}).click();
  const explorer=page.getByRole('region',{name:'资源管理器',exact:true});
  await explorer.locator('.repository-tree-file[data-file-path="note.txt"]').click();
  await page.getByRole('button',{name:'编辑文件',exact:true}).click();
  const editor=page.getByRole('textbox',{name:'文件原文'});
  await editor.fill('changed in real Harness\n');
  await page.getByRole('button',{name:'保存文件',exact:true}).click();
  await page.getByText('与已观察版本一致',{exact:true}).waitFor();
  assert.equal(fs.readFileSync(path.join(repo,'note.txt'),'utf8'),'changed in real Harness\n');
  // Observe a competing edit, keep the local draft, then explicitly discard only the draft.
  await editor.fill('must not overwrite\n');fs.writeFileSync(path.join(repo,'note.txt'),'external version\n');
  await page.getByRole('button',{name:'保存文件',exact:true}).click();
  await page.getByText('磁盘文件已变化，已暂停保存并保留输入。',{exact:true}).waitFor();
  assert.equal(await editor.inputValue(),'must not overwrite\n');
  assert.equal(fs.readFileSync(path.join(repo,'note.txt'),'utf8'),'external version\n');
  page.once('dialog',dialog=>void dialog.accept());
  await page.getByRole('button',{name:'关闭编辑',exact:true}).click();
  await page.getByText('源代码管理',{exact:true}).click();
  const scm=page.locator('.source-control-workbench');
  const changes=scm.locator('.source-control-list');
  await changes.locator('.task-changed-row').filter({has:page.locator('[data-file-path="note.txt"]')}).first().click();
  await scm.locator('.task-diff-reader').getByText('external version',{exact:true}).first().waitFor();
  await scm.getByRole('button',{name:'在资源管理器打开',exact:true}).click();
  await explorer.getByText('note.txt',{exact:true}).first().waitFor();
  await page.getByText('源代码管理',{exact:true}).click();
  await page.getByRole('button',{name:'暂存 note.txt',exact:true}).click();
  await page.getByRole('button',{name:'取消暂存 note.txt',exact:true}).waitFor();
  assert.equal(git('diff','--cached','--name-only'),'note.txt');
  await page.getByRole('textbox',{name:'本地提交说明',exact:true}).fill('directory workbench commit');
  await page.getByRole('button',{name:'提交暂存内容（1）',exact:true}).click();
  await page.getByText(/本地提交完成 .*未推送/).waitFor();
  assert.equal(git('show','--format=','--name-only','HEAD'),'note.txt');
  assert.equal(git('diff','--name-only'),'untouched.txt');
  await scm.locator('.source-control-browse-tabs').getByText('提交历史',{exact:true}).click();
  await scm.getByRole('button',{name:'查看提交 directory workbench commit',exact:true}).click();
  if(process.env.BUILDR_HARNESS_SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.BUILDR_HARNESS_SCREENSHOT_DIR,'directory-workbench.png')});
  const denied=await fetch(new URL('/api/v1/harness/directory-workbench/status',login.url),{method:'POST',headers:{origin:new URL(login.url).origin,'content-type':'application/json'},body:JSON.stringify({scopeId:scope.ref.id,scopeRevision:scope.revision})});
  assert.equal(denied.status,403,'directory endpoints do not inherit a login or a scope from proximity');
  assert.equal(fs.existsSync(path.join(repo,'.buildr')),false);
});
