import assert from 'node:assert/strict';
import test from 'node:test';
import type { TestContext } from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createEventSourceCapture, mergeCapturedSources } from '../../plugin/source-capture.ts';
import { fileDigest } from '../../plugin/process.ts';
import type { EventSources, SourceQueryResult } from '../../plugin/src/source-types.ts';
const hash='a'.repeat(64), binding={nodeExecutable:'/runtime/node',cliEntry:'/product/custom-entry'};
const body='<!-- buildr:required begin -->\nowned 😀\n<!-- buildr:required end -->';
const user='PRIVATE USER SUFFIX', raw=body+'\n'+user;
const result=(providedBy='buildr', historical='matched-current'):SourceQueryResult=>({schemaVersion:'buildr.agent-asset-source-result/v1',workspace:{id:'workspace',scope:'.'},effects:[],items:[{id:'capture',status:'detected',diagnostic:null,mixed:true,objects:[{identity:'workspace:core',kind:'rule',workspaceId:'workspace',scope:'.',providedBy:providedBy as any,managedBy:'buildr',selector:{managedBlock:'buildr:required'},current:null,observed:{digest:'sha256-'+hash},historical:historical as any,evidence:[{authority:'buildr:required-template',locator:'resources/workspace/AGENTS.md',digest:'sha256-'+hash}],selection:{startOffset:0,endOffset:body.length,unit:'utf16'}}]}]});
function request(changes:any={}) {return {signal:new AbortController().signal,agent:{session:{header:{cwd:'/workspace'}}} as any,hint:{kind:'rule',action:'load',name:'AGENTS.md',locator:{path:'/workspace/AGENTS.md'},rawDigest:{algorithm:'sha256',digest:hash},content:raw,renderedContent:raw,contentRefs:[{block:0,start:0,end:raw.length,unit:'utf16'}],completeness:'complete',...changes} as any};}
test('actual raw version proof captures only owned refs and sends metadata without producer/user bodies',async()=>{
 let queries=0;
 const capture=createEventSourceCapture({channel:'npm',resolveBinding:async()=>binding,querySources:async(_binding,_channel,cwd,input)=>{queries++;assert.equal(cwd,'/workspace');assert.equal(input.mode,'metadata');assert.equal(JSON.stringify(input).includes('owned'),false);assert.equal(JSON.stringify(input).includes(user),false);assert.equal(input.observations[0].observedDigest,'sha256-'+hash);return result();}});
 const source=await capture(request());assert.equal(source.status,'confirmed');assert.equal(queries,1);assert.equal(JSON.stringify(source).includes(user),false);assert.equal(JSON.stringify(source).includes('owned'),false);assert.deepEqual(source.matches[0].contentRefs,[{block:0,start:0,end:body.length,unit:'utf16'}]);assert.equal(source.matches[0].observedVersion?.digest,hash);assert.equal(source.matches[0].completeness,'complete');
});
test('missing actual version, stale version and only-managed content do not confirm participation',async()=>{
 let queries=0;
 const capture=createEventSourceCapture({channel:'npm',resolveBinding:async()=>binding,querySources:async()=>{queries++;return result('workspace');}});
 assert.equal((await capture(request({rawDigest:undefined,completeness:'none',content:undefined,contentRefs:[]}))).status,'unknown');assert.equal(queries,0);
 assert.equal((await capture(request())).status,'not-applicable');
 const stale=createEventSourceCapture({channel:'npm',resolveBinding:async()=>binding,querySources:async()=>result('buildr','different')});
 assert.equal((await stale(request())).status,'unknown');
});
test('ambiguous rule rendering has identity but no guessed original body reference',async()=>{
 const capture=createEventSourceCapture({channel:'npm',resolveBinding:async()=>binding,querySources:async()=>result()});
 const source=await capture(request({contentRefs:[]}));assert.equal(source.status,'confirmed');assert.deepEqual(source.matches[0].contentRefs,[]);assert.equal(source.matches[0].completeness,'none');
});
test('partial numbered read intersects owned raw offsets with Unicode and excludes suffix',async()=>{
 const rendered='1: '+body.split('\n')[0]+'\n2: owned 😀\n3: '+body.split('\n')[2]+'\n4: '+user;
 const text='owned 😀', start=body.indexOf(text);
 const capture=createEventSourceCapture({channel:'npm',resolveBinding:async()=>binding,querySources:async()=>result()});
 const source=await capture(request({kind:'read',action:'read',renderedContent:rendered,readWindow:{offset:2,totalLines:4,lines:[{number:2,text,start,end:start+text.length}]},completeness:'partial'}));
 assert.equal(source.status,'confirmed');assert.equal(source.matches[0].completeness,'partial');const ref=source.matches[0].contentRefs![0];assert.equal(rendered.slice(ref.start,ref.end),text);
});
test('reading only the user part of a mixed file does not become a Buildr core-rule action',async()=>{
 const start=body.length+1;
 const capture=createEventSourceCapture({channel:'npm',resolveBinding:async()=>binding,querySources:async()=>result()});
 const source=await capture(request({kind:'read',action:'read',renderedContent:'4: '+user,readWindow:{offset:4,totalLines:4,lines:[{number:4,text:user,start,end:start+user.length}]},completeness:'partial'}));
 assert.equal(source.status,'not-applicable');assert.deepEqual(source.matches,[]);
});
test('a truncated rule that delivers only the user prefix does not record a Buildr load',async()=>{
 const shifted=result();shifted.items[0].objects[0].selection={startOffset:50,endOffset:50+body.length,unit:'utf16'};
 const capture=createEventSourceCapture({channel:'npm',resolveBinding:async()=>binding,querySources:async()=>shifted});
 const source=await capture(request({renderedContent:'USER PREFIX',contentRefs:[],ruleWindow:{start:0,end:11},completeness:'partial'}));
 assert.equal(source.status,'not-applicable');assert.deepEqual(source.matches,[]);
});
test('a removal retains previous capture without any current file lookup',async()=>{
 const prior:EventSources={schemaVersion:'dsh.event-sources/v1',status:'confirmed',matches:[{providedBy:'buildr',kind:'rule',identity:'old',name:'Old rule',action:'load',completeness:'complete',evidence:[{authority:'receipt',identity:'old-receipt'}],contentRefs:[{block:0,start:0,end:3,unit:'utf16'}]}]};
 const capture=createEventSourceCapture({channel:'npm',resolveBinding:async()=>assert.fail('no binding for removal')});
 const source=await capture(request({action:'remove',priorSources:prior}));assert.equal(source.matches[0].action,'remove');assert.equal(source.matches[0].identity,'old');assert.equal(source.matches[0].completeness,'none');assert.deepEqual(source.matches[0].contentRefs,[]);
});
test('ordinary commands avoid installation work; exact custom entry proves capability independently of stdout',async()=>{
 let installs=0;
 const capture=createEventSourceCapture({channel:'npm',resolveBinding:async()=>binding,inspectInstallation:async()=>{installs++;return {prefixes:[[binding.nodeExecutable,binding.cliEntry],[binding.cliEntry]]};},digestFile:async()=>'sha256-'+hash});
 const command=(text:string)=>request({kind:'command',action:'call',command:{text,cwd:'/workspace'},rawDigest:undefined,content:undefined,contentRefs:[],completeness:'none'});
 assert.equal((await capture(command('git status'))).status,'not-applicable');assert.equal(installs,0);
 assert.equal((await capture(command('/runtime/node /other/script.js task inspect x'))).status,'not-applicable');assert.equal(installs,0);
 const source=await capture(command('/product/custom-entry task materials inspect demo --json'));assert.equal(source.status,'confirmed');assert.equal(installs,1);assert.equal(source.matches[0].kind,'capability');assert.deepEqual(source.matches[0].targets,[{kind:'task',id:'demo'}]);assert.equal(source.matches[0].completeness,'none');assert.equal(source.execution,undefined);
 assert.equal((await capture(command('/impostor/buildr task inspect demo'))).status,'not-applicable');
});
test('a material write captures only its explicit task and exact relative Markdown target',async()=>{
 const capture=createEventSourceCapture({channel:'npm',resolveBinding:async()=>binding,inspectInstallation:async()=>({prefixes:[[binding.cliEntry]]}),digestFile:async()=>'sha256-'+hash,querySources:async()=>assert.fail('command targets do not query material files')});
 const source=await capture(request({kind:'command',action:'call',command:{text:'/product/custom-entry task materials write demo --content /private/input-body.md --expected-document absent --json --path "notes/方案 说明.md"',cwd:'/workspace'},rawDigest:undefined,renderedContent:user,contentRefs:[],completeness:'none'}));
 assert.equal(source.status,'confirmed');assert.equal(source.matches[0].operation,'task materials write');
 assert.deepEqual(source.matches[0].targets,[{kind:'task',id:'demo'},{kind:'material',id:'notes/方案 说明.md'}]);
 assert.equal(source.matches[0].completeness,'none');assert.equal(source.matches[0].contentRefs,undefined);
 assert.equal(JSON.stringify(source).includes('/private/input-body.md'),false);assert.equal(JSON.stringify(source).includes(user),false);
});
test('material inspection and manifest recording remain task references rather than inferred document targets',async()=>{
 const capture=createEventSourceCapture({channel:'npm',resolveBinding:async()=>binding,inspectInstallation:async()=>({prefixes:[[binding.cliEntry]]}),digestFile:async()=>'sha256-'+hash});
 for(const args of ['task materials inspect demo --json','task materials record demo --materials /private/documents-manifest.json --expected-current absent --json']){
  const source=await capture(request({kind:'command',action:'call',command:{text:binding.cliEntry+' '+args,cwd:'/workspace'},rawDigest:undefined,renderedContent:'{"path":"inferred-output.md","content":"'+user+'"}',contentRefs:[],completeness:'none'}));
  assert.equal(source.status,'confirmed');assert.deepEqual(source.matches[0].targets,[{kind:'task',id:'demo'}]);
  assert.equal(JSON.stringify(source).includes('documents-manifest'),false);assert.equal(JSON.stringify(source).includes('inferred-output'),false);assert.equal(JSON.stringify(source).includes(user),false);
 }
});
test('known material and task inspect flags may precede or surround the single task argument',async()=>{
 const capture=createEventSourceCapture({channel:'npm',resolveBinding:async()=>binding,inspectInstallation:async()=>({prefixes:[[binding.cliEntry]]}),digestFile:async()=>'sha256-'+hash});
 for(const args of [
  'task materials write --target "/workspace with spaces" demo --path notes/result.md --content /private/input.md --expected-document absent --json',
  'task materials write --path notes/result.md --json --content /private/input.md --expected-document absent demo --target /workspace',
  'task materials inspect --target /workspace --json demo',
  'task materials record --materials /private/manifest.json --expected-current absent --json demo --target /workspace',
  'task inspect --target /workspace demo --json',
  'task inspect --json demo --target /workspace',
 ]){
  const source=await capture(request({kind:'command',action:'call',command:{text:binding.cliEntry+' '+args,cwd:'/workspace'},rawDigest:undefined,contentRefs:[],completeness:'none'}));
  assert.equal(source.status,'confirmed',args);assert.deepEqual(source.matches[0].targets,[{kind:'task',id:'demo'},...(args.startsWith('task materials write ')?[{kind:'material',id:'notes/result.md'}]:[])],args);
  assert.equal(JSON.stringify(source).includes('/private/input.md'),false);assert.equal(JSON.stringify(source).includes('/private/manifest.json'),false);
 }
});
test('unknown flag arity and multiple task operands cannot invent a task or material reference',async()=>{
 const capture=createEventSourceCapture({channel:'npm',resolveBinding:async()=>binding,inspectInstallation:async()=>({prefixes:[[binding.cliEntry]]}),digestFile:async()=>'sha256-'+hash});
 for(const args of ['task materials write --unknown maybe-demo demo --path result.md','task materials inspect --unknown demo','task inspect --task demo','task inspect --target /workspace demo other-task','task materials write --target /workspace demo other-task --path result.md']){
  const source=await capture(request({kind:'command',action:'call',command:{text:binding.cliEntry+' '+args,cwd:'/workspace'},rawDigest:undefined,contentRefs:[],completeness:'none'}));
  assert.equal(source.status,'confirmed',args);assert.deepEqual(source.matches[0].targets,[],args);
 }
 for(const flags of ['--path result.md --path other.md','--path ../escape.md','--path=opaque.md']){
  const source=await capture(request({kind:'command',action:'call',command:{text:binding.cliEntry+' task materials write --target /workspace demo '+flags,cwd:'/workspace'},rawDigest:undefined,contentRefs:[],completeness:'none'}));
  assert.deepEqual(source.matches[0].targets,[{kind:'task',id:'demo'}],flags);
 }
});
test('ambiguous or forbidden material paths do not invent a document target or erase the bound call',async()=>{
 const capture=createEventSourceCapture({channel:'npm',resolveBinding:async()=>binding,inspectInstallation:async()=>({prefixes:[[binding.cliEntry]]}),digestFile:async()=>'sha256-'+hash});
 const invalid=['--path ../escape.md','--path /absolute.md','--path C:relative.md','--path notes//one.md','--path ./one.md','--path notes/../one.md','--path one.txt','--path one.MD','--path ""','--path '+('a'.repeat(1022)+'.md'),'--path one.md --path two.md','--path one.md --json --json','--path one.md --content --path other.md','--path=one.md'];
 for(const flags of invalid){
  const source=await capture(request({kind:'command',action:'call',command:{text:binding.cliEntry+' task materials write demo '+flags,cwd:'/workspace'},rawDigest:undefined,contentRefs:[],completeness:'none'}));
  assert.equal(source.status,'confirmed',flags);assert.deepEqual(source.matches[0].targets,[{kind:'task',id:'demo'}],flags);
 }
 const limitPath='a'.repeat(1021)+'.md';
 const accepted=await capture(request({kind:'command',action:'call',command:{text:binding.cliEntry+' task materials write demo --path '+limitPath,cwd:'/workspace'},rawDigest:undefined,contentRefs:[],completeness:'none'}));
 assert.deepEqual(accepted.matches[0].targets,[{kind:'task',id:'demo'},{kind:'material',id:limitPath}]);
});

async function commandIdentityFixture(t: TestContext) {
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'buildr-capture-command-')),root=await fs.realpath(directory);
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const node=path.join(root,'node'),retainedNode=path.join(root,'retained','node'),normalCli=path.join(root,'npm','buildr.mjs');
 const sourceRoot=path.join(root,'candidate/projects/product/services/buildr'),normalRoot=path.join(root,'retained/projects/product/services/buildr');
 const candidateCli=path.join(sourceRoot,'bin/buildr.mjs'),candidateWrapper=path.resolve(sourceRoot,'../../buildr'),normalWrapper=path.resolve(normalRoot,'../../buildr');
 const script=path.join(root,'.agents/skills/archify/assets/archify/bin/archify.mjs');
 for(const file of [node,retainedNode,normalCli,candidateCli,candidateWrapper,normalWrapper,script]){await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,file===script?'PRIVATE SCRIPT BODY':file===node?'Node 24.21 fixture':file===retainedNode?'Node 24.15 fixture':'Buildr entry fixture');}
 const candidate={nodeExecutable:node,cliEntry:candidateCli,nodeSha256:await fileDigest(node),cliSha256:await fileDigest(candidateCli)};
 const normal={nodeExecutable:node,cliEntry:normalCli,nodeSha256:await fileDigest(node),cliSha256:await fileDigest(normalCli)};
 const inspected:string[]=[];
 const exec=async(_file:string,args:string[])=>{assert.equal(args[1],'installation');inspected.push(args[0]!);const source=args[0]===candidateCli;return {stdout:JSON.stringify({schemaVersion:'buildr.installation-status/v1',channels:{development:{status:'installed',identity:{ownershipIdentity:source?'candidate':'normal',version:'1',protocolIdentity:'v1',sourceRoot:source?sourceRoot:normalRoot},runtime:{executable:source?node:retainedNode}}}})};};
 const digest=await fileDigest(script);
 const scriptResult=(providedBy='buildr',historical='matched-current',receiptDigest=digest):SourceQueryResult=>({schemaVersion:'buildr.agent-asset-source-result/v1',workspace:{id:'workspace',scope:'.'},effects:[],items:[{id:'capture',status:'detected',diagnostic:null,objects:[{identity:'buildr:skill:archify:member:assets/archify/bin/archify.mjs',kind:'skill',workspaceId:'workspace',scope:'.',providedBy:providedBy as any,managedBy:'buildr',selector:{skillId:'archify',relativePath:'assets/archify/bin/archify.mjs'},current:null,observed:{digest:digest as any},historical:historical as any,evidence:[{authority:'buildr.skill-projection/v2',locator:'receipt/archify.json',digest:receiptDigest as any}]}]}]});
 const command=(text:string)=>request({kind:'command',action:'call',command:{text,cwd:root},rawDigest:undefined,renderedContent:user,contentRefs:[],completeness:'none'});
 return {root,node,retainedNode,candidate,normal,candidateWrapper,normalWrapper,script,digest,scriptResult,command,exec,inspected};
}

test('normal channel commands are proven separately from the candidate metadata reader, including explicit same-file links',async t=>{
 const f=await commandIdentityFixture(t),alias=path.join(f.root,'wrapper-alias'),copy=path.join(f.root,'copied-buildr');await fs.symlink(f.normalWrapper,alias);await fs.copyFile(f.normalWrapper,copy);
 const capture=createEventSourceCapture({channel:'development',resolveBinding:async()=>f.candidate,resolveCommandBindings:async()=>[f.candidate,f.normal],processDependencies:{exec:f.exec},querySources:async()=>assert.fail('Buildr CLI matching does not query method bodies')});
 for(const entry of [f.normalWrapper,path.relative(f.root,f.normalWrapper),alias]){
  const source=await capture(f.command(entry+' task inspect demo'));assert.equal(source.status,'confirmed');assert.equal(source.matches[0].locator?.entry,f.normalWrapper);assert.equal(source.matches[0].observedVersion?.target,'entry');assert.deepEqual(source.matches[0].targets,[{kind:'task',id:'demo'}]);
 }
 assert.ok(f.inspected.includes(f.normal.cliEntry));assert.ok(f.inspected.includes(f.candidate.cliEntry));
 assert.equal((await capture(f.command(copy+' task inspect demo'))).status,'not-applicable');
 await fs.unlink(alias);await fs.symlink(copy,alias);assert.equal((await capture(f.command(alias+' task inspect demo'))).status,'not-applicable');
 const nodeAlias=path.join(f.root,'interpreter-alias'),scriptAlias=path.join(f.root,'candidate-script-alias');await fs.symlink(f.node,nodeAlias);await fs.symlink(f.candidate.cliEntry,scriptAlias);
 const throughNodeAliases=await capture(f.command(nodeAlias+' '+scriptAlias+' task inspect demo'));assert.equal(throughNodeAliases.status,'confirmed');assert.equal(throughNodeAliases.matches[0].locator?.entry,f.candidate.cliEntry);
 const isolated=createEventSourceCapture({channel:'development',resolveBinding:async()=>f.candidate,resolveCommandBindings:async()=>[f.candidate,f.normal],processDependencies:{exec:async(file,args,options)=>args[0]===f.candidate.cliEntry?Promise.reject(Error('candidate unavailable')):f.exec(file,args)},querySources:async()=>assert.fail('normal command cannot substitute as metadata query')});
 assert.equal((await isolated(f.command(f.normalWrapper+' task inspect demo'))).status,'confirmed');
});

test('npm identity accepts its explicit same-file link while excluding development wrappers and runtime Nodes',async t=>{
 const f=await commandIdentityFixture(t),alias=path.join(f.root,'npm-command-alias');await fs.symlink(f.normal.cliEntry,alias);
 const capture=createEventSourceCapture({channel:'npm',resolveBinding:async()=>f.normal,resolveCommandBindings:async()=>[f.normal],processDependencies:{exec:async(file,args,options)=>{const original=JSON.parse((await f.exec(file,args)).stdout);original.channels.npm={status:'installed',identity:{ownershipIdentity:'npm-normal',version:'1',protocolIdentity:'v1',package:'@buildr-ai/buildr',channel:'npm'}};return {stdout:JSON.stringify(original)};}},querySources:async()=>assert.fail('npm must not inherit the development interpreter or source reader')});
 const source=await capture(f.command(alias+' task inspect demo'));assert.equal(source.status,'confirmed');assert.equal(source.matches[0].locator?.entry,f.normal.cliEntry);assert.equal(source.matches[0].evidence[0].identity,'npm:'+f.normal.cliEntry);
 assert.equal((await capture(f.command(f.normalWrapper+' task inspect demo'))).status,'not-applicable');
 assert.equal((await capture(f.command(f.retainedNode+' '+f.script+' --help'))).status,'not-applicable');
});

test('approved candidate and normal runtime Nodes capture only their exact owned skill-script operand with no body',async t=>{
 const f=await commandIdentityFixture(t);let queries=0;
 const capture=createEventSourceCapture({channel:'development',resolveBinding:async()=>f.candidate,resolveCommandBindings:async()=>[f.candidate,f.normal],processDependencies:{exec:f.exec},querySources:async(binding,channel,cwd,input)=>{queries++;assert.deepEqual(binding,f.candidate);assert.equal(channel,'development');assert.equal(cwd,f.root);assert.deepEqual(input.observations,[{id:'capture',type:'file',locator:{path:f.script},observedDigest:f.digest}]);assert.equal(input.mode,'metadata');assert.equal(JSON.stringify(input).includes('PRIVATE SCRIPT BODY'),false);assert.equal(JSON.stringify(input).includes(user),false);return f.scriptResult();}});
 for(const interpreter of [f.node,f.retainedNode]){
  const source=await capture(f.command(interpreter+' '+path.relative(f.root,f.script)+' --help --input /private/user-document.md'));assert.equal(source.status,'confirmed');assert.equal(source.matches[0].kind,'capability');assert.equal(source.matches[0].action,'call');assert.equal(source.matches[0].operation,'archify help');assert.equal(source.matches[0].locator?.entry,f.script);assert.equal(source.matches[0].observedVersion?.digest,f.digest.slice(7));assert.equal(source.matches[0].observedVersion?.target,'entry');assert.equal(source.matches[0].completeness,'none');assert.equal(source.matches[0].contentRefs,undefined);assert.equal(JSON.stringify(source).includes('PRIVATE SCRIPT BODY'),false);assert.equal(JSON.stringify(source).includes('/private/user-document.md'),false);
 }
 assert.equal(queries,2);
 const before=f.inspected.length;
 for(const text of [f.node+' -e "ordinary" '+f.script,f.node+' /ordinary/script.mjs --input '+f.script])assert.equal((await capture(f.command(text))).status,'not-applicable');
 assert.equal(queries,2);assert.equal(f.inspected.length,before,'ordinary Node calls do not query every installation or scan other arguments');
 for(const name of ['buildr','node'])assert.equal((await capture(f.command(name+' '+f.script+' --help'))).status,'unknown');assert.equal(queries,2);assert.equal(f.inspected.length,before);
});

test('managed-only, foreign, stale and receipt-mismatched scripts never become Buildr capabilities',async t=>{
 const f=await commandIdentityFixture(t);
 for(const result of [f.scriptResult('workspace'),f.scriptResult('external'),f.scriptResult('buildr','different'),f.scriptResult('buildr','matched-current','sha256-'+hash)]){
  const capture=createEventSourceCapture({channel:'development',resolveBinding:async()=>f.candidate,resolveCommandBindings:async()=>[f.candidate,f.normal],processDependencies:{exec:f.exec},querySources:async()=>result});
  const source=await capture(f.command(f.retainedNode+' '+f.script+' --help'));assert.notEqual(source.status,'confirmed');assert.deepEqual(source.matches,[]);
 }
 const foreignNode=path.join(f.root,'foreign','node');await fs.mkdir(path.dirname(foreignNode),{recursive:true});await fs.copyFile(f.node,foreignNode);
 const rejected=createEventSourceCapture({channel:'development',resolveBinding:async()=>f.candidate,resolveCommandBindings:async()=>[f.candidate,f.normal],processDependencies:{exec:f.exec},querySources:async()=>assert.fail('unapproved same-byte interpreter must not query an asset')});
 assert.equal((await rejected(f.command(foreignNode+' '+f.script+' --help'))).status,'not-applicable');
 const changed=createEventSourceCapture({channel:'development',resolveBinding:async()=>f.candidate,resolveCommandBindings:async()=>[f.normal],processDependencies:{exec:f.exec},querySources:async()=>{await fs.appendFile(f.retainedNode,'changed');return f.scriptResult();}});
 assert.equal((await changed(f.command(f.retainedNode+' '+f.script+' --help'))).status,'unknown');
});

test('script capture is bounded and a script changing during its metadata query cannot retain a confirmed version',async t=>{
 const f=await commandIdentityFixture(t);let queries=0;
 const capture=createEventSourceCapture({channel:'development',resolveBinding:async()=>f.candidate,resolveCommandBindings:async()=>[f.candidate],processDependencies:{exec:f.exec},querySources:async()=>{queries++;await fs.appendFile(f.script,'changed after the hash');return f.scriptResult();}});
 assert.equal((await capture(f.command(f.node+' '+f.script+' --help'))).status,'unknown');assert.equal(queries,1);
 await fs.writeFile(f.script,'x'.repeat(512*1024+1));assert.equal((await capture(f.command(f.node+' '+f.script+' --help'))).status,'unknown');assert.equal(queries,1,'oversized script does not reach the source CLI');
});
test('concurrent frames do not share cancellation or raw-body cache',async()=>{
 const first=request(),second=request();const controller=new AbortController();first.signal=controller.signal;
 const capture=createEventSourceCapture({channel:'npm',resolveBinding:async()=>binding,querySources:async(_b,_c,_cwd,_input,signal)=>{await new Promise<void>((resolve,reject)=>{const timer=setTimeout(resolve,20);signal.addEventListener('abort',()=>{clearTimeout(timer);reject(Error('cancelled'));},{once:true});});return result();}});
 const a=capture(first),b=capture(second);controller.abort();assert.equal((await a).status,'unknown');assert.equal((await b).status,'confirmed');
});
test('shared source capture preserves independent providers and isolates an unavailable fallback',()=>{
 const local:EventSources={schemaVersion:'dsh.event-sources/v1',status:'confirmed',matches:[{providedBy:'buildr',kind:'rule',identity:'buildr:core',name:'Core',completeness:'none',evidence:[{authority:'receipt',identity:'buildr'}]}]};
 const other:EventSources={schemaVersion:'dsh.event-sources/v1',status:'confirmed',matches:[{providedBy:'workspace',kind:'rule',identity:'workspace:rule',name:'Workspace',completeness:'none',evidence:[{authority:'workspace',identity:'rule'}]}]};
 assert.equal(mergeCapturedSources(local,other).matches.length,2);assert.equal(mergeCapturedSources(local,other).mixed,true);
 assert.deepEqual(mergeCapturedSources(local,{schemaVersion:'dsh.event-sources/v1',status:'unknown',matches:[],diagnostics:[{code:'capture-provider-unavailable'}]}),local);
});
