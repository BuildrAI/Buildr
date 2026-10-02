import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import test from 'node:test';
import {createCodeApplication} from '../../src/modules/code/application/code-application.ts';
import {createCodeHttpContribution} from '../../src/modules/code/interfaces/http/code-http.ts';
import {CODE_HTTP_SCHEMAS,CODE_HTTP_VALIDATORS} from '../../src/modules/code/interfaces/http/code-http-contracts.ts';
import {CODE_LIMITS} from '../../src/modules/code/infrastructure/code-file-reader.ts';
function fixture(t:any){
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'buildr-code-explorer-'));t.after(()=>fs.rmSync(temporary,{recursive:true,force:true}));
  const root=path.join(temporary,'repo');fs.mkdirSync(root);const git=(...args:string[])=>execFileSync('git',['-C',root,...args],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
  git('init');git('config','user.email','fixture@example.invalid');git('config','user.name','Fixture');
  fs.mkdirSync(path.join(root,'src'));fs.writeFileSync(path.join(root,'src','main.ts'),'export const answer = 1;\n');fs.writeFileSync(path.join(root,'README.md'),'# Code\n');fs.writeFileSync(path.join(root,'.gitignore'),'ignored.txt\n');fs.writeFileSync(path.join(root,'ignored.txt'),'ignored content');fs.writeFileSync(path.join(root,'wild*.txt'),'literal');fs.writeFileSync(path.join(root,'wild-other.txt'),'other');git('add','.');git('commit','-m','initial');const hash=git('rev-parse','HEAD');
  const repo={id:'repo-id',code:'repo',name:'Repo',source:{type:'local',path:root}};
  let evidence:any=null;
  const app=createCodeApplication({assetCatalog:()=>({repositories:[repo],services:[{id:'s1',code:'one',repositoryId:repo.id,legacyRefs:['p/one']},{id:'s2',code:'two',repositoryId:repo.id,legacyRefs:['p/two']}],projects:[{id:'p-id',code:'p',serviceIds:['s1','s2']}]}),resolveSourceRoot:(_root,source)=>source.path,readTaskScope:(_root,id)=>(id==='empty'?{projects:[],services:[]}:id==='project'?{projects:['p'],services:[]}:id==='broken'?{projects:['p'],services:[{project:'p',service:'missing'}]}:{projects:['p'],services:[{project:'p',service:'one'},{project:'p',service:'two'}]}),readGitWorktreeEvidence:()=>evidence});
  return {temporary,root,git,hash,app,input:{repositoryId:repo.id},setEvidence:(value:any)=>{evidence=value;}};
}
test('task preselection deduplicates services, expands project-only and leaves empty scope at all',async t=>{
  const f=fixture(t);assert.deepEqual(f.app.repositories(f.root,'task').selectedRepositoryIds,['repo-id']);assert.deepEqual(f.app.repositories(f.root,'project').selectedRepositoryIds,['repo-id']);assert.deepEqual(f.app.repositories(f.root,'empty').selectedRepositoryIds,[]);assert.equal(f.app.repositories(f.root,'broken').diagnostics[0].code,'code_task_service_unresolved');assert.ok(f.app.repositories(f.root).repositories[0].gitId?.startsWith('sha256-'));
});
test('lazy tree, ignored toggle and complete text/Markdown/image reads preserve Git and bytes',async t=>{
  const f=fixture(t),before=f.git('status','--porcelain');const tree=f.app.directory(f.root,f.input);
  assert.ok(tree.entries.some(e=>e.path==='src'&&e.kind==='directory'));assert.ok(!tree.entries.some(e=>e.path==='.git'||e.path==='ignored.txt'));
  assert.ok(f.app.directory(f.root,{...f.input,showIgnored:true}).entries.some(e=>e.path==='ignored.txt'));
  assert.equal((await f.app.file(f.root,{...f.input,path:'src/main.ts'})).content,'export const answer = 1;\n');assert.equal((await f.app.file(f.root,{...f.input,path:'README.md'})).kind,'markdown');
  fs.writeFileSync(path.join(f.root,'image.png'),Buffer.from('89504e470d0a1a0a','hex'));assert.ok((await f.app.file(f.root,{...f.input,path:'image.png'})).content.startsWith('data:image/png;base64,'));
  fs.unlinkSync(path.join(f.root,'image.png'));assert.equal(f.git('status','--porcelain'),before);
});
test('ignored hidden directories appear only when requested in the selected checkout and remain readable',async t=>{
  const f=fixture(t),directories=['.agents','.worktrees','.pnpm-store'];
  fs.appendFileSync(path.join(f.root,'.gitignore'),'.agents/\n');fs.appendFileSync(path.join(f.root,'.git','info','exclude'),'.pnpm-store/\n');
  for(const directory of directories){fs.mkdirSync(path.join(f.root,directory));fs.writeFileSync(path.join(f.root,directory,'visible.txt'),'hiddenDirectoryNeedle');}
  fs.mkdirSync(path.join(f.root,'.source'));fs.writeFileSync(path.join(f.root,'.source','visible.ts'),'ordinaryHiddenNeedle');
  const before=f.git('status','--porcelain'),defaultTree=f.app.directory(f.root,f.input),expandedTree=f.app.directory(f.root,{...f.input,showIgnored:true});
  assert.ok(defaultTree.entries.some(entry=>entry.path==='.source'&&!entry.ignored));
  for(const directory of directories){
    assert.ok(!defaultTree.entries.some(entry=>entry.path===directory));
    assert.ok(expandedTree.entries.some(entry=>entry.path===directory&&entry.kind==='directory'&&entry.ignored));
    assert.deepEqual(f.app.directory(f.root,{...f.input,path:directory,showIgnored:true}).entries.map(entry=>entry.path),[directory+'/visible.txt']);
    assert.equal((await f.app.file(f.root,{...f.input,path:directory+'/visible.txt'})).content,'hiddenDirectoryNeedle');
  }
  assert.ok(!expandedTree.entries.some(entry=>entry.path==='.git'));
  assert.throws(()=>f.app.directory(f.root,{...f.input,path:'.git',showIgnored:true}),(error:any)=>error.code==='code_path_forbidden');
  assert.deepEqual(f.app.search(f.root,{...f.input,query:'hiddenDirectoryNeedle',mode:'content'}).matches,[]);
  assert.deepEqual(f.app.search(f.root,{...f.input,query:'hiddenDirectoryNeedle',mode:'content',showIgnored:true}).matches.map(match=>match.path).sort(),directories.map(directory=>directory+'/visible.txt').sort());
  assert.equal(f.git('status','--porcelain'),before);
});
test('traversal, absolute paths, external symlinks and aliases into Git metadata fail locally',async t=>{
  const f=fixture(t);fs.writeFileSync(path.join(f.temporary,'secret'),'secret');fs.symlinkSync(path.join(f.temporary,'secret'),path.join(f.root,'escape'));fs.symlinkSync(path.join(f.root,'.git'),path.join(f.root,'metadata'));
  for(const target of ['../secret','/etc/passwd','.git/config','metadata/config','escape'])await assert.rejects(async()=>(await f.app.file(f.root,{...f.input,path:target})),(error:any)=>error.code==='code_path_forbidden');
  await assert.rejects(async()=>(await f.app.file(f.root,{repositoryId:'unregistered',path:'README.md'})),(error:any)=>error.code==='code_repository_not_registered');
});
test('historical tree and file share full commit identity and literal paths; missing file never falls back',async t=>{
  const f=fixture(t);fs.writeFileSync(path.join(f.root,'src/main.ts'),'current');fs.writeFileSync(path.join(f.root,'new.txt'),'new');
  const input={...f.input,commitHash:f.hash};assert.equal(f.app.directory(f.root,input).source.commitHash,f.hash);assert.equal((await f.app.file(f.root,{...input,path:'src/main.ts'})).content,'export const answer = 1;\n');assert.equal((await f.app.file(f.root,{...input,path:'wild*.txt'})).content,'literal');
  await assert.rejects(async()=>(await f.app.file(f.root,{...input,path:'new.txt'})),(error:any)=>error.code==='code_file_missing');await assert.rejects(async()=>(await f.app.file(f.root,{...f.input,commitHash:f.hash.slice(0,7),path:'README.md'})),(error:any)=>error.code==='code_commit_invalid');
});
test('task file reads actual registered checkout and refuses changed evidence',async t=>{
  const f=fixture(t),checkout=path.join(f.temporary,'task');f.git('worktree','add','--detach',checkout,'HEAD');fs.writeFileSync(path.join(checkout,'src/main.ts'),'task content');f.setEvidence({evidence:{repositories:[{sourceRepository:f.root,checkoutPath:checkout}]}});
  const file=(await f.app.file(f.root,{...f.input,taskId:'task',path:'src/main.ts'}));assert.equal(file.content,'task content');assert.equal(file.source.kind,'task');assert.equal(file.source.location,fs.realpathSync(checkout));
  f.setEvidence({evidence:{repositories:[{sourceRepository:f.root,checkoutPath:f.temporary}]}});await assert.rejects(async()=>(await f.app.file(f.root,{...f.input,taskId:'task',path:'src/main.ts'})));assert.equal((await f.app.file(f.root,{...f.input,taskId:'task',commitHash:f.hash,path:'src/main.ts'})).content,'export const answer = 1;\n');
});
test('large text and bounded searches report actual partial coverage and binary unsupported',async t=>{
  const f=fixture(t);fs.writeFileSync(path.join(f.root,'large.txt'),'x'.repeat(CODE_LIMITS.textBytes+20));fs.writeFileSync(path.join(f.root,'binary.bin'),Buffer.from([1,0,2]));
  const large=(await f.app.file(f.root,{...f.input,path:'large.txt'}));assert.equal(large.truncated,true);assert.equal(large.content.length,CODE_LIMITS.pageBytes);assert.equal((await f.app.file(f.root,{...f.input,path:'binary.bin'})).kind,'unsupported');
  const result=f.app.search(f.root,{...f.input,query:'answer',mode:'content'});assert.equal(result.matches.find(m=>m.path==='src/main.ts')?.line,1);assert.equal(result.truncated,false);
  fs.mkdirSync(path.join(f.root,'many'));for(let i=0;i<CODE_LIMITS.entries+2;i++)fs.writeFileSync(path.join(f.root,'many',String(i)),'');const tree=f.app.directory(f.root,{...f.input,path:'many'});assert.equal(tree.entries.length,CODE_LIMITS.entries);assert.equal(tree.truncated,true);
});
test('text reads preserve full current and historical files through the five-MiB boundary',async t=>{
  const f=fixture(t),cases=[{name:'previous-limit.txt',bytes:1024*1024+1},{name:'exact-limit.txt',bytes:5*1024*1024},{name:'over-limit.txt',bytes:5*1024*1024+1}];
  assert.equal(CODE_LIMITS.textBytes,5*1024*1024);assert.equal(CODE_LIMITS.imageBytes,8*1024*1024);
  for(const value of cases)fs.writeFileSync(path.join(f.root,value.name),'x'.repeat(value.bytes));
  f.git('add',...cases.map(value=>value.name));f.git('commit','-m','text size boundaries');const commitHash=f.git('rev-parse','HEAD');
  for(const value of cases){
    const current=(await f.app.file(f.root,{...f.input,path:value.name})),history=(await f.app.file(f.root,{...f.input,path:value.name,commitHash}));
    for(const result of [current,history]){assert.equal(result.kind,'text');assert.equal(result.sizeBytes,value.bytes);assert.equal(result.limitBytes,5*1024*1024);assert.equal(result.truncated,value.bytes>CODE_LIMITS.textBytes);}
    if(value.bytes<=CODE_LIMITS.textBytes){assert.equal(current.content,'x'.repeat(value.bytes));assert.equal(history.content,current.content);assert.equal(current.message,'');assert.equal(history.message,'');}
    else {assert.equal(current.content.length,CODE_LIMITS.pageBytes);assert.equal(history.content,current.content);assert.ok(current.page);assert.deepEqual(history.page,current.page);assert.ok(current.message);assert.ok(history.message);}
  }
  fs.writeFileSync(path.join(f.root,cases[0].name),'changed current');assert.equal((await f.app.file(f.root,{...f.input,path:cases[0].name,commitHash})).content.length,cases[0].bytes);
});
test('large current and historical pages preserve every UTF-8 byte, global line number and bounded segment',async t=>{
  const f=fixture(t),text='a'.repeat(CODE_LIMITS.pageBytes-1)+'界😀\n'+('row '+'b'.repeat(32760)+'\n').repeat(161),original=Buffer.from(text);
  fs.writeFileSync(path.join(f.root,'paged.md'),original);f.git('add','paged.md');f.git('commit','-m','paged unicode source');const commitHash=f.git('rev-parse','HEAD');
  for(const location of [{...f.input,path:'paged.md'},{...f.input,path:'paged.md',commitHash}]){
    const first=await f.app.file(f.root,location);assert.equal(first.kind,'markdown');assert.equal(first.truncated,true);assert.ok(first.page);assert.equal(first.page.index,0);assert.equal(first.page.startLine,1);assert.equal(first.page.startsMidLine,false);assert.equal(first.page.endsMidLine,true);assert.ok(first.content.endsWith('a'));
    let joined='',end=0;
    for(let index=0;index<first.page.total;index++){
      const current=index===0?first:await f.app.file(f.root,{...location,page:index,expectedRevision:first.revision});assert.ok(current.page);assert.equal(current.revision,first.revision);assert.equal(current.page.index,index);assert.equal(current.page.offset,end);assert.ok(current.page.endOffset-current.page.offset<=CODE_LIMITS.pageBytes+3);assert.equal(current.content,original.subarray(current.page.offset,current.page.endOffset).toString('utf8'));assert.ok(!current.content.includes('�'));
      assert.equal(current.page.startLine,1+original.subarray(0,current.page.offset).filter(byte=>byte===10).length);assert.equal(current.page.startsMidLine,current.page.offset>0&&original[current.page.offset-1]!==10);assert.equal(current.page.endsMidLine,current.page.endOffset<original.length&&original[current.page.endOffset-1]!==10);
      joined+=current.content;end=current.page.endOffset;
    }
    assert.equal(end,original.length);assert.equal(joined,text);assert.equal((await f.app.file(f.root,{...location,page:0,expectedRevision:first.revision})).content,first.content);
    const target=await f.app.file(f.root,{...location,line:150,expectedRevision:first.revision});assert.ok(target.page);assert.ok(target.page.startLine<=150&&target.page.endLine>=150);assert.ok(target.page.index>0);
    await assert.rejects(f.app.file(f.root,{...location,line:10000}),(error:any)=>error.code==='code_file_line_missing');
    await assert.rejects(f.app.file(f.root,{...location,page:1}),(error:any)=>error.code==='code_file_revision_required');
    await assert.rejects(f.app.file(f.root,{...location,page:first.page.total,expectedRevision:first.revision}),(error:any)=>error.code==='code_file_page_invalid');
    await assert.rejects(f.app.file(f.root,{...location,page:0,line:1,expectedRevision:first.revision}),(error:any)=>error.code==='code_file_location_invalid');
  }
});
test('UTF-8 continuation tails keep the final page nonempty and locate matches in their actual page',async t=>{
  const f=fixture(t),cases=[1,2,3].map(tail=>({name:'tail-'+tail+'.txt',text:'x'.repeat(CODE_LIMITS.textBytes-(4-tail))+'😀',tail}));
  for(const value of cases)fs.writeFileSync(path.join(f.root,value.name),value.text);
  f.git('add',...cases.map(value=>value.name));f.git('commit','-m','UTF-8 final page boundaries');const commitHash=f.git('rev-parse','HEAD');
  for(const value of cases)for(const location of [{...f.input,path:value.name},{...f.input,path:value.name,commitHash}]){
    const first=await f.app.file(f.root,location);assert.ok(first.page);assert.equal(first.sizeBytes,CODE_LIMITS.textBytes+value.tail);
    const last=await f.app.file(f.root,{...location,page:first.page.total-1,expectedRevision:first.revision}),previous=await f.app.file(f.root,{...location,page:first.page.total-2,expectedRevision:first.revision});
    assert.ok(last.page);assert.ok(previous.page);assert.equal(last.content,'😀');assert.equal(last.page.endOffset,first.sizeBytes);assert.equal(previous.page.endOffset,last.page.offset);assert.equal(last.page.startLine,1);assert.equal(last.page.endLine,1);assert.equal(last.page.startsMidLine,true);assert.equal(last.page.endsMidLine,false);assert.ok(!previous.content.includes('�'));
    const located=await f.app.file(f.root,{...location,line:1,matchQuery:'😀'});assert.ok(located.page);assert.equal(located.page.index,last.page.index);assert.equal(located.page.offset,last.page.offset);assert.equal(located.page.matchOffset,last.page.offset);assert.equal(located.page.matchEndOffset,last.page.endOffset);assert.equal(located.content,'😀');
  }
});
test('large-file literal matches locate long-line content and report cross-page byte ranges',async t=>{
  const f=fixture(t),query='[界😀Needle]',prefix='x'.repeat(CODE_LIMITS.pageBytes*2-5),text=prefix+query+' suffix\n'+'tail\n'+'z'.repeat(CODE_LIMITS.textBytes),original=Buffer.from(text),matchOffset=Buffer.byteLength(prefix),matchEndOffset=matchOffset+Buffer.byteLength(query);
  fs.writeFileSync(path.join(f.root,'long-line.ts'),text);f.git('add','long-line.ts');f.git('commit','-m','long line match');const commitHash=f.git('rev-parse','HEAD');
  for(const location of [{...f.input,path:'long-line.ts'},{...f.input,path:'long-line.ts',commitHash}]){
    const target=await f.app.file(f.root,{...location,line:1,matchQuery:'[界😀NEEDLE]'});assert.ok(target.page);assert.equal(target.page.index,1);assert.equal(target.page.startLine,1);assert.equal(target.page.matchOffset,matchOffset);assert.equal(target.page.matchEndOffset,matchEndOffset);assert.ok(target.page.endOffset<matchEndOffset);assert.equal(target.content,original.subarray(target.page.offset,target.page.endOffset).toString('utf8'));
    const next=await f.app.file(f.root,{...location,page:2,expectedRevision:target.revision});assert.ok(next.page);assert.equal(next.page.offset,target.page.endOffset);assert.equal(next.page.startLine,1);assert.ok(next.page.startsMidLine);assert.equal(next.content,original.subarray(next.page.offset,next.page.endOffset).toString('utf8'));
    await assert.rejects(f.app.file(f.root,{...location,line:2,matchQuery:query}),(error:any)=>error.code==='code_file_match_missing');
    await assert.rejects(f.app.file(f.root,{...location,matchQuery:query}),(error:any)=>error.code==='code_file_match_invalid');
  }
});
test('continued current pages reject real file mutations while pinned historical pages stay unchanged',async t=>{
  const f=fixture(t),file=path.join(f.root,'mutable.txt'),text='a'.repeat(CODE_LIMITS.textBytes+123);
  fs.writeFileSync(file,text);f.git('add','mutable.txt');f.git('commit','-m','versioned pages');const commitHash=f.git('rev-parse','HEAD');
  const first=await f.app.file(f.root,{...f.input,path:'mutable.txt'}),history=await f.app.file(f.root,{...f.input,path:'mutable.txt',commitHash});
  const stat=fs.statSync(file);fs.writeFileSync(file,'b'.repeat(text.length));fs.utimesSync(file,stat.atime,stat.mtime);
  await assert.rejects(f.app.file(f.root,{...f.input,path:'mutable.txt',page:1,expectedRevision:first.revision}),(error:any)=>error.code==='code_file_changed'&&error.status===409);
  const fixed=await f.app.file(f.root,{...f.input,path:'mutable.txt',commitHash,page:1,expectedRevision:history.revision});assert.equal(fixed.revision,history.revision);assert.equal(fixed.content,'a'.repeat(CODE_LIMITS.pageBytes));
  const current=await f.app.file(f.root,{...f.input,path:'mutable.txt'});assert.notEqual(current.revision,first.revision);assert.equal(current.content,'b'.repeat(CODE_LIMITS.pageBytes));
  fs.renameSync(file,file+'.old');fs.writeFileSync(file,'b'.repeat(text.length));
  await assert.rejects(f.app.file(f.root,{...f.input,path:'mutable.txt',line:1,expectedRevision:current.revision}),(error:any)=>error.code==='code_file_changed');
  const reopened=await f.app.file(f.root,{...f.input,path:'mutable.txt'});fs.unlinkSync(file);
  await assert.rejects(f.app.file(f.root,{...f.input,path:'mutable.txt',page:1,expectedRevision:reopened.revision}),(error:any)=>error.code==='code_file_changed');
});
test('HTTP validates closed paged queries, numeric conversion and real observed revision',async t=>{
  const f=fixture(t),http=createCodeHttpContribution(f.app);fs.writeFileSync(path.join(f.root,'http-pages.txt'),'first\n'+'x'.repeat(CODE_LIMITS.textBytes)+'\nHTTP [needle]\n');
  const request=(values:Record<string,string>)=>http.handle({request:{method:'GET'},root:f.root,suffix:'/code/file',searchParams:new URLSearchParams({repositoryId:'repo-id',filePath:'http-pages.txt',...values})});
  const first:any=await request({});assert.equal(first.status,200);assert.equal(first.body.page.index,0);assert.equal(CODE_HTTP_VALIDATORS.validate(CODE_HTTP_SCHEMAS.file.$id,first.body).valid,true);
  const next:any=await request({page:'1',expectedRevision:first.body.revision});assert.equal(next.body.page.index,1);
  const match:any=await request({line:'3',matchQuery:'http [NEEDLE]'});assert.equal(match.body.page.startLine,2);assert.equal(match.body.page.endLine,3);assert.ok(match.body.page.matchOffset>CODE_LIMITS.textBytes);
  for(const values of [{page:'-1'},{line:'0'},{page:'1.0'},{unexpected:'field'}])await assert.rejects(request(values),(error:any)=>error.code==='code_query_invalid');
  await assert.rejects(request({page:'1'}),(error:any)=>error.code==='code_file_revision_required');
  await assert.rejects(request({page:'1',expectedRevision:'stale'}),(error:any)=>error.code==='code_file_changed');
});
test('ripgrep finds source beyond old file and byte budgets without mutating the checkout',async t=>{
  const f=fixture(t);fs.mkdirSync(path.join(f.root,'aaaa-source'));fs.mkdirSync(path.join(f.root,'zz-data'));
  for(let i=0;i<3100;i++)fs.writeFileSync(path.join(f.root,'zz-data',i+'.txt'),'unrelated '.repeat(850));
  fs.writeFileSync(path.join(f.root,'aaaa-source','diagnostics.ts'),'// ordinary source\nexport function registerApplicationDoctor() {}\n');
  const before=f.git('status','--porcelain');const result=f.app.search(f.root,{...f.input,query:'registerApplicationDoctor',mode:'content'});
  assert.equal(result.truncated,false);assert.ok(result.scannedFiles>3000);assert.deepEqual(result.matches,[{path:'aaaa-source/diagnostics.ts',line:2,excerpt:'export function registerApplicationDoctor() {}',occurrences:[{line:2,excerpt:'export function registerApplicationDoctor() {}'}]}]);
  assert.equal(f.git('status','--porcelain'),before);
});
test('ripgrep honors ignore toggle, searches hidden code and skips links and Git metadata',async t=>{
  const f=fixture(t);fs.writeFileSync(path.join(f.temporary,'outside'),'boundaryNeedle');fs.symlinkSync(path.join(f.temporary,'outside'),path.join(f.root,'escape'));fs.symlinkSync(path.join(f.root,'.git'),path.join(f.root,'metadata'));fs.writeFileSync(path.join(f.root,'.git','private.txt'),'boundaryNeedle');
  fs.mkdirSync(path.join(f.root,'node_modules'));fs.writeFileSync(path.join(f.root,'node_modules','dependency.txt'),'ignored content');fs.writeFileSync(path.join(f.root,'.hidden.ts'),'hiddenNeedle');
  assert.deepEqual(f.app.search(f.root,{...f.input,query:'boundaryNeedle',mode:'content',showIgnored:true}).matches,[]);
  assert.deepEqual(f.app.search(f.root,{...f.input,query:'ignored content',mode:'content'}).matches,[]);
  assert.equal(f.app.search(f.root,{...f.input,query:'ignored content',mode:'content',showIgnored:true}).matches.length,2);
  assert.equal(f.app.search(f.root,{...f.input,query:'hiddenNeedle',mode:'content'}).matches[0].path,'.hidden.ts');
  assert.equal(f.app.search(f.root,{...f.input,query:'.hidden',mode:'name'}).matches[0].path,'.hidden.ts');
});
test('ripgrep searches literal content, handles unusual file names, ignores external configuration and reports result cap',async t=>{
  const f=fixture(t),name='odd:\nname.ts';fs.writeFileSync(path.join(f.root,name),'literal --[.*]\n');const config=path.join(f.temporary,'rgconfig');fs.writeFileSync(config,'--glob=!**\n');
  const previous=process.env.RIPGREP_CONFIG_PATH;process.env.RIPGREP_CONFIG_PATH=config;
  try{const result=f.app.search(f.root,{...f.input,query:'--[.*]',mode:'content'});assert.deepEqual(result.matches,[{path:name,line:1,excerpt:'literal --[.*]',occurrences:[{line:1,excerpt:'literal --[.*]'}]}]);assert.equal(result.truncated,false);}finally{if(previous===undefined)delete process.env.RIPGREP_CONFIG_PATH;else process.env.RIPGREP_CONFIG_PATH=previous;}
  for(let i=0;i<CODE_LIMITS.matches+5;i++)fs.writeFileSync(path.join(f.root,'match'+i+'.txt'),'boundedNeedle');
  const capped=f.app.search(f.root,{...f.input,query:'boundedNeedle',mode:'content'});assert.equal(capped.matches.length,CODE_LIMITS.matches);assert.equal(capped.truncated,true);
  const empty=f.app.search(f.root,{...f.input,query:'absentNeedle',mode:'content'});assert.deepEqual(empty.matches,[]);assert.equal(empty.truncated,false);
});
test('content search groups every matching line once per file while retaining its first match',async t=>{
  const f=fixture(t),lines=['// [Needle] [needle]','// unrelated','export const value = "[NEEDLE]";','// last [needle]'];
  fs.writeFileSync(path.join(f.root,'src/main.ts'),lines.join('\n')+'\n');
  const result=f.app.search(f.root,{...f.input,query:'[needle]',mode:'content'});
  assert.deepEqual(result.matches,[{path:'src/main.ts',line:1,excerpt:lines[0],occurrences:[{line:1,excerpt:lines[0]},{line:3,excerpt:lines[2]},{line:4,excerpt:lines[3]}]}]);
  assert.equal(result.truncated,false);
  const names=f.app.search(f.root,{...f.input,query:'MAIN.TS',mode:'name'});assert.deepEqual(names.matches,[{path:'src/main.ts',line:null,excerpt:'',occurrences:[]}]);
});
test('long matching-line excerpts retain the full literal query in current and pinned historical searches',async t=>{
  const f=fixture(t),queries=['[FarNeedle]','Match'.repeat(40)];
  const lines=queries.flatMap(query=>['prefix '.repeat(90)+query+' suffix'.repeat(80),'prefix '.repeat(110)+query.toUpperCase()+' suffix'.repeat(80)]);
  fs.writeFileSync(path.join(f.root,'src/main.ts'),lines.join('\n')+'\n');f.git('add','src/main.ts');f.git('commit','-m','long matching lines');const commitHash=f.git('rev-parse','HEAD');
  for(const query of queries) {
    const input={...f.input,query,mode:'content' as const},current=f.app.search(f.root,input),history=f.app.search(f.root,{...input,commitHash});
    assert.equal(current.truncated,false);assert.deepEqual(history.matches,current.matches);assert.equal(current.matches.length,1);assert.equal(current.matches[0].occurrences.length,2);
    for(const occurrence of current.matches[0].occurrences){assert.ok(occurrence.excerpt.length<=240);assert.ok(occurrence.excerpt.toLowerCase().includes(query.toLowerCase()));assert.ok(occurrence.excerpt.startsWith('…'));assert.ok(occurrence.excerpt.endsWith('…'));}
    assert.equal(current.matches[0].excerpt,current.matches[0].occurrences[0].excerpt);
  }
  fs.writeFileSync(path.join(f.root,'src/main.ts'),'no matching current content');
  assert.equal(f.app.search(f.root,{...f.input,query:queries[0],mode:'content',commitHash}).matches[0].occurrences[1].line,2);
});
test('current and pinned historical content searches enforce the total matching-line budget honestly',async t=>{
  const f=fixture(t),file=path.join(f.root,'src/main.ts'),input={...f.input,query:'lineBudgetNeedle',mode:'content' as const};
  assert.equal(CODE_LIMITS.matchLines,200);
  fs.writeFileSync(file,'lineBudgetNeedle\n'.repeat(CODE_LIMITS.matchLines));
  const exact=f.app.search(f.root,input);assert.equal(exact.matches.length,1);assert.equal(exact.matches[0].occurrences.length,CODE_LIMITS.matchLines);assert.equal(exact.truncated,false);
  f.git('add','src/main.ts');f.git('commit','-m','exact matching-line budget');const exactHash=f.git('rev-parse','HEAD');
  const exactHistory=f.app.search(f.root,{...input,commitHash:exactHash});assert.deepEqual(exactHistory.matches,exact.matches);assert.equal(exactHistory.truncated,false);
  fs.writeFileSync(file,'lineBudgetNeedle\n'.repeat(CODE_LIMITS.matchLines+1));
  const capped=f.app.search(f.root,input);assert.equal(capped.matches.length,1);assert.equal(capped.matches[0].occurrences.length,CODE_LIMITS.matchLines);assert.equal(capped.matches[0].occurrences.at(-1)?.line,CODE_LIMITS.matchLines);assert.equal(capped.truncated,true);
  f.git('add','src/main.ts');f.git('commit','-m','matching-line budget');const commitHash=f.git('rev-parse','HEAD');fs.writeFileSync(file,'current content');
  const history=f.app.search(f.root,{...input,commitHash});assert.deepEqual(history.matches,capped.matches);assert.equal(history.truncated,true);
});
test('matching-line limit is shared across file groups without consuming file-name search coverage',async t=>{
  const f=fixture(t),input={...f.input,query:'sharedLineNeedle',mode:'content' as const};
  for(const file of ['a.ts','b.ts'])fs.writeFileSync(path.join(f.root,file),'sharedLineNeedle\n'.repeat(CODE_LIMITS.matchLines/2+1));
  const result=f.app.search(f.root,input);assert.equal(result.matches.length,2);assert.equal(result.matches.reduce((total,match)=>total+match.occurrences.length,0),CODE_LIMITS.matchLines);assert.equal(result.truncated,true);
  const names=f.app.search(f.root,{...f.input,query:'.ts',mode:'name'});assert.equal(names.matches.length,3);assert.ok(names.matches.every(match=>match.occurrences.length===0));assert.equal(names.truncated,false);
});
test('historical search uses pinned blobs, skips symlink blobs and never falls back to current files',async t=>{
  const f=fixture(t);fs.writeFileSync(path.join(f.root,'src/main.ts'),'export const answer = 1;\n// ANSWER answer\n\n// answer in history\n');fs.symlinkSync('README.md',path.join(f.root,'link'));f.git('add','src/main.ts','link');f.git('commit','-m','link and historical matches');const hash=f.git('rev-parse','HEAD');
  fs.writeFileSync(path.join(f.root,'src/main.ts'),'currentNeedle');fs.writeFileSync(path.join(f.root,'new.ts'),'currentNeedle');
  const input={...f.input,commitHash:hash,mode:'content' as const};
  const history=f.app.search(f.root,{...input,query:'answer'});assert.equal(history.matches[0].path,'src/main.ts');assert.equal(history.matches[0].line,1);assert.deepEqual(history.matches[0].occurrences,[{line:1,excerpt:'export const answer = 1;'},{line:2,excerpt:'// ANSWER answer'},{line:4,excerpt:'// answer in history'}]);assert.equal(history.truncated,false);
  assert.deepEqual(f.app.search(f.root,{...input,query:'currentNeedle'}).matches,[]);assert.deepEqual(f.app.search(f.root,{...input,query:'README'}).matches,[]);
  assert.deepEqual(f.app.search(f.root,{...input,query:'wild*',mode:'name'}).matches.map(m=>m.path),['wild*.txt']);
});
test('HTTP search carries grouped occurrences and keeps old match payloads contract-compatible',async t=>{
  const f=fixture(t);fs.writeFileSync(path.join(f.root,'src/main.ts'),'answer\nANSWER answer\n');
  const response:any=await createCodeHttpContribution(f.app).handle({request:{method:'GET'},root:f.root,suffix:'/code/search',searchParams:new URLSearchParams({repositoryId:'repo-id',query:'answer',mode:'content'})});
  assert.equal(response.status,200);assert.deepEqual(response.body.matches[0].occurrences,[{line:1,excerpt:'answer'},{line:2,excerpt:'ANSWER answer'}]);
  const legacy={...response.body,matches:response.body.matches.map(({occurrences,...match}:any)=>match)};assert.equal(CODE_HTTP_VALIDATORS.validate(CODE_HTTP_SCHEMAS.search.$id,legacy).valid,true);
  const invalid={...response.body,matches:[{...response.body.matches[0],occurrences:[{line:0,excerpt:'answer'}]}]};assert.equal(CODE_HTTP_VALIDATORS.validate(CODE_HTTP_SCHEMAS.search.$id,invalid).valid,false);
  const tooMany={...response.body,matches:[{...response.body.matches[0],occurrences:Array.from({length:201},(_,index)=>({line:index+1,excerpt:'answer'}))}]};assert.equal(CODE_HTTP_VALIDATORS.validate(CODE_HTTP_SCHEMAS.search.$id,tooMany).valid,false);
});
test('application and HTTP preserve single-character search support for direct callers',async t=>{
  const f=fixture(t);fs.writeFileSync(path.join(f.root,'src/main.ts'),'x\nX x\n');
  const direct=f.app.search(f.root,{...f.input,query:'x',mode:'content'});assert.deepEqual(direct.matches[0].occurrences,[{line:1,excerpt:'x'},{line:2,excerpt:'X x'}]);
  const response:any=await createCodeHttpContribution(f.app).handle({request:{method:'GET'},root:f.root,suffix:'/code/search',searchParams:new URLSearchParams({repositoryId:'repo-id',query:'x',mode:'content'})});
  assert.equal(response.status,200);assert.deepEqual(response.body.matches,direct.matches);
});
test('HTTP validates closed query and uses bounded worker without synchronous filesystem read',async t=>{
  const f=fixture(t),http=createCodeHttpContribution(f.app);let observed:any;
  const base={request:{method:'GET'},root:f.root,suffix:'/code/directory',searchParams:new URLSearchParams({repositoryId:'repo-id',filePath:'src'}),submitTaskRead:async(operation:string,readId:string,input:any)=>{observed={operation,readId,input};return f.app.directory(f.root,JSON.parse(input.input));}};
  const response:any=await http.handle(base);assert.equal(response.status,200);assert.equal(observed.operation,'code-directory');assert.equal(observed.readId,'code-files');assert.equal(JSON.parse(observed.input.input).path,'src');
  await assert.rejects(http.handle({...base,searchParams:new URLSearchParams('repositoryId=repo-id&repositoryId=other')}),(error:any)=>error.code==='code_query_invalid');
  await assert.rejects(http.handle({...base,searchParams:new URLSearchParams('repositoryId=repo-id&unknown=value')}),(error:any)=>error.code==='code_query_invalid');
});
