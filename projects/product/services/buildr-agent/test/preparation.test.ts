import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { createAgentService } from '../src/index.ts';
import type { AgentExecutor, AgentProgramManager, AgentRuntime, LoginObservation, ProgramCatalog } from '../src/contracts.ts';
import { NativeProgramManager } from '../src/executors/program-manager.ts';
import { isCompatibleProgram, nativeProgramPolicy } from '../src/executors/program-policy.ts';
import { safeDiagnostic } from '../src/domain/agent-state.ts';

function fixture(t: TestContext) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'buildr-preparation-test-'));
  const executable=path.join(root,'codex.js');fs.writeFileSync(executable,'');
  let authenticated=false,opens=0,installs=0,cancelled=0,accountChecks=0,modelChecks=0;
  let loginUpdate:((value:LoginObservation)=>void)|undefined;
  let models=[{id:'actual-model',label:'Actual model'}];
  const capabilities={text:true,images:false,approval:true,questions:true,stop:true,resume:true,maxInputBytes:65536};
  const executor:AgentExecutor={descriptor:{id:'codex',label:'Codex',capabilities},async open(options){opens++;return {
    bindingIdentity:options.executable??'existing-binding',capabilities,
    inspectAccount:async()=>{accountChecks++;return {status:authenticated?'ready':'not-authenticated'};},models:async()=>{modelChecks++;return models;},
    beginLogin:async(update)=>{loginUpdate=update;update({state:'waiting-browser',url:'https://auth.openai.com/test?secret=never-persist'});},
    cancelLogin:async()=>{cancelled++;loginUpdate?.({state:'cancelled'});},close:async()=>{},
  } as AgentRuntime;}};
  const catalog:ProgramCatalog={candidates:[],installation:{label:'Official program',version:'0.163.0',url:'https://learn.chatgpt.com/docs/cli',canInstall:true}};
  const manager:AgentProgramManager={discover:async()=>structuredClone(catalog),install:async()=>{installs++;return executable;}};
  const service=createAgentService({dataRoot:path.join(root,'profile'),executors:[executor],programManager:manager,resolveWorkspace:()=>({rootPath:root}),assertTask:()=>{}});
  const candidate=(program=executable)=>({executable:program,source:'path' as const,label:'Existing CLI',version:'0.163.0',compatible:true});
  const begin=(input:{executable?:string;install?:boolean}={})=>service.connections.prepare('codex',{expectedRevision:service.connections.read('codex').revision,...input});
  t.after(async()=>{await service.close();fs.rmSync(root,{recursive:true,force:true});});
  return {root,executable,service,catalog,manager,candidate,begin,get accountChecks(){return accountChecks;},get modelChecks(){return modelChecks;},get opens(){return opens;},get installs(){return installs;},get cancelled(){return cancelled;},authenticate(){authenticated=true;loginUpdate?.({state:'completed'});},setAuthenticated(){authenticated=true;},noModels(){models=[];}};
}
async function settled(service:ReturnType<typeof createAgentService>,id:string,state:string){
  for(let i=0;i<500;i++){const view=service.connections.preparation('codex',id);if(view.state===state)return view;await new Promise(resolve=>setTimeout(resolve,5));}
  assert.fail(`preparation did not reach ${state}`);
}

test('missing programs guide installation without enabling or creating credentials',async t=>{
  const f=fixture(t),attempt=f.begin();const view=await settled(f.service,attempt.id,'installation-required');
  assert.equal(view.connection.enabled,false);assert.equal(f.opens,0);assert.equal(f.installs,0);
  assert.equal(fs.existsSync(path.join(f.root,'profile/agent-service/connections')),false);
});
test('program preparation completes without initiating account login',async t=>{
  const f=fixture(t),second=path.join(f.root,'other.js');fs.writeFileSync(second,'');
  f.catalog.candidates=[f.candidate(),f.candidate(second)];
  const first=f.begin();await settled(f.service,first.id,'selection-required');assert.equal(f.opens,0);
  f.manager.discover=async input=>({...f.catalog,candidates:[f.candidate(input.executable)]});
  const attempt=f.begin({executable:second});const waiting=await settled(f.service,attempt.id,'ready');
  assert.equal(waiting.connection.status,'not-authenticated');assert.equal(f.opens,1);assert.equal(f.accountChecks,0);assert.equal(f.modelChecks,0);
  assert.equal(waiting.connection.loginAttempt,undefined);
  f.setAuthenticated();const ready=await f.service.connections.check('codex',waiting.connection.revision);assert.equal(ready.models[0]?.id,'actual-model');
  assert.equal(fs.readFileSync(path.join(f.root,'profile/agent-service/conversations.sqlite')).includes(Buffer.from('never-persist')),false);
  assert.throws(()=>f.begin({executable:f.executable}),{code:'agent_configuration_bound'});
});
test('cancel discovery prevents late observation from connecting, and a retry waits for resource release',async t=>{
  const f=fixture(t);let release!:()=>void;f.catalog.candidates=[f.candidate()];
  f.manager.discover=async()=>{await new Promise<void>(resolve=>{release=resolve;});return f.catalog;};
  const attempt=f.begin();const cancelled=await f.service.connections.cancelPreparation('codex',attempt.id);
  assert.equal(cancelled.state,'cancelled');assert.throws(()=>f.begin(),{code:'agent_preparation_busy'});
  release();await new Promise(resolve=>setTimeout(resolve,10));assert.equal(f.opens,0);assert.equal(f.service.connections.read('codex').enabled,false);
});
test('a stale connection revision cannot be installed or rebound by a late discovery',async t=>{
  const f=fixture(t);let release!:()=>void;
  f.manager.discover=async()=>{await new Promise<void>(resolve=>{release=resolve;});return {...f.catalog,candidates:[f.candidate()]};};
  const attempt=f.begin();await f.service.connections.connect('codex',{expectedRevision:'unconfigured',executable:f.executable});
  const observed=f.service.connections.read('codex');release();const failed=await settled(f.service,attempt.id,'failed');
  assert.match(failed.message,/变化/);assert.equal(failed.connection.revision,observed.revision);assert.equal(f.opens,1);
});
test('failed installation can retry, successful preparation is reverified and repeated work is merged',async t=>{
  const f=fixture(t);let failed=true;
  f.manager.install=async()=>{if(failed)throw new Error('secret=https://registry.example/token');f.catalog.candidates=[f.candidate()];return f.executable;};
  let attempt=f.begin({install:true});let view=await settled(f.service,attempt.id,'failed');assert.doesNotMatch(view.message,/secret|token|registry\.example/);
  failed=false;attempt=f.begin({install:true});const duplicate=f.begin({install:true});assert.equal(duplicate.id,attempt.id);
  view=await settled(f.service,attempt.id,'ready');assert.equal(f.opens,1);assert.equal(view.connection.executable,f.executable);
  await f.service.connections.cancelPreparation('codex',attempt.id);assert.equal(f.cancelled,0);assert.ok(fs.existsSync(f.executable));
});
test('program readiness is independent from an empty model catalog',async t=>{
  const f=fixture(t);f.setAuthenticated();f.noModels();f.catalog.candidates=[f.candidate()];
  const attempt=f.begin();const view=await settled(f.service,attempt.id,'ready');assert.equal(view.connection.loginAttempt,undefined);const checked=await f.service.connections.check('codex',view.connection.revision);assert.equal(checked.status,'failed');assert.match(checked.diagnostic??'',/模型/);
});
test('restarting preparation preserves the exact established program and an invalid explicit path never installs a fallback',async t=>{
  const f=fixture(t);f.setAuthenticated();f.catalog.candidates=[f.candidate()];
  const attempt=f.begin();await settled(f.service,attempt.id,'ready');
  let observed:any;f.manager.discover=async input=>{observed=input;return {...f.catalog,candidates:[]};};
  const next=f.begin({install:true});await settled(f.service,next.id,'installation-required');
  assert.equal(observed.boundExecutable,f.executable);assert.equal(f.installs,0);assert.equal(f.service.connections.read('codex').executable,f.executable);
});
test('service close cancels installation without starting a native runtime',async t=>{
  const f=fixture(t);let interrupted=false;
  f.manager.install=async({signal})=>{await new Promise<void>(resolve=>signal.addEventListener('abort',()=>{interrupted=true;resolve();},{once:true}));signal.throwIfAborted();return f.executable;};
  const attempt=f.begin({install:true});await settled(f.service,attempt.id,'installing');await f.service.close();assert.equal(interrupted,true);assert.equal(f.opens,0);
});
test('native discovery deduplicates real paths, rejects unsupported versions and honors explicit missing paths',async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'buildr-program-discovery-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const bin=path.join(root,'bin');fs.mkdirSync(bin);const program=path.join(bin,'codex.js');fs.writeFileSync(program,"console.log('codex-cli 0.163.0-alpha.11.2');\n");fs.symlinkSync(program,path.join(bin,'codex'));
  const manager=new NativeProgramManager(path.join(root,'private'),{PATH:[bin,bin].join(path.delimiter),HOME:root});
  const signal=new AbortController().signal;
  const actual=fs.realpathSync(program);
  const found=await manager.discover({provider:'codex',signal});assert.equal(found.candidates.filter(item=>item.executable===actual).length,1);assert.equal(found.candidates.find(item=>item.executable===actual)?.compatible,true);
  const missing=await manager.discover({provider:'codex',executable:path.join(bin,'missing'),signal});assert.equal(missing.candidates.length,1);assert.equal(missing.candidates[0]?.compatible,false);
  for (const [provider,version] of [['codex','0.164.0-alpha.11.1'],['dsh','0.3.0-rc.1'],['qoder','1.2.0']]) {
    fs.writeFileSync(program,`console.log('${provider} ${version}');\n`);
    const updated=await manager.discover({provider,executable:program,signal});
    assert.equal(updated.candidates[0]?.compatible,true);assert.equal(updated.candidates[0]?.version,version);
    assert.equal(updated.candidates[0]?.diagnostic,undefined);
  }
  fs.writeFileSync(program,"console.log('codex-cli 9.9.9');\n");const unsupported=await manager.discover({provider:'codex',executable:program,signal});assert.equal(unsupported.candidates[0]?.compatible,false);
  assert.equal(isCompatibleProgram('codex','0.163.0-alpha.11.3'),true);
});
test('admission follows each major including minor upgrades and prereleases, independently of download pins',()=>{
  for(const [provider,versions] of Object.entries({codex:['0.0.0','0.162.99','0.163.0','0.164.0-alpha.11.1','0.200.2+build.9'],dsh:['0.1.99','0.2.0','0.2.1-rc.3','0.3.0-beta.1','0.99.99'],qoder:['1.0.0','1.1.75','1.2.0','1.99.99-beta.1+build.9']})){
    for(const version of versions)assert.equal(isCompatibleProgram(provider,version),true,`${provider} ${version}`);
  }
  for(const [provider,versions] of Object.entries({codex:['1.0.0','2.163.0'],dsh:['1.0.0','2.2.0'],qoder:['0.99.99','2.0.0']})){
    const major=nativeProgramPolicy(provider).major;
    for(const version of [...versions,'garbage',`${major}.2`,`${major}.2.01`,`${major}.02.1`,`${major}.2.1-rc..3`,`${major}.2.1-01`])assert.equal(isCompatibleProgram(provider,version),false,`${provider} ${version}`);
    assert.ok(safeDiagnostic(new Error(`${provider}_version_unsupported`)).includes(nativeProgramPolicy(provider).compatibility),'safe runtime diagnostics use the current range');
    assert.equal(isCompatibleProgram(provider,nativeProgramPolicy(provider).version),true,'pinned downloads remain admitted');
  }
});
test('fixed package installer uses an isolated prefix, verifies its result and reuses it',async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'buildr-program-install-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const bin=path.join(root,'bin');fs.mkdirSync(bin);const script=path.join(bin,'npm-cli.js');
  fs.writeFileSync(script,`const fs=require('node:fs'),path=require('node:path');const args=process.argv.slice(2);if(!args.includes('@openai/codex@0.163.0')||!args.includes('--registry=https://registry.npmjs.org/'))process.exit(2);const prefix=args[args.indexOf('--prefix')+1];if(process.env.CODEX_HOME||process.env.OPENAI_API_KEY||!process.env.HOME.startsWith(prefix))process.exit(3);const file=path.join(prefix,'node_modules/@openai/codex/bin/codex.js');fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,"console.log('codex-cli 0.163.0');");`);
  fs.symlinkSync(script,path.join(bin,'npm'));
  const manager=new NativeProgramManager(path.join(root,'profile'),{PATH:bin,HOME:root,OPENAI_API_KEY:'not-inherited'}),signal=new AbortController().signal;
  const progress:string[]=[];const executable=await manager.install({provider:'codex',signal,progress:message=>progress.push(message)});
  assert.ok(fs.existsSync(executable));assert.equal(progress.length,2);assert.equal(await manager.install({provider:'codex',signal,progress:()=>assert.fail('must reuse')}),executable);
  assert.deepEqual(fs.readdirSync(path.dirname(path.dirname(path.dirname(path.dirname(path.dirname(executable)))))).filter(name=>name.startsWith('.prepare-')),[]);
});

test('cancelling a real installer reaps its owned process group and removes only staging', {timeout:10000}, async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'buildr-program-cancel-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const bin=path.join(root,'bin');fs.mkdirSync(bin);const script=path.join(bin,'npm-cli.js'),marker=path.join(root,'child.pid'),outside=path.join(root,'keep');fs.writeFileSync(outside,'preserve');
  fs.writeFileSync(script,`const fs=require('node:fs'),{spawn}=require('node:child_process');process.on('SIGTERM',()=>{});const child=spawn(process.execPath,['-e','process.on("SIGTERM",()=>{});setInterval(()=>{},1000)'],{stdio:'ignore'});fs.writeFileSync(${JSON.stringify(marker)},String(child.pid));setInterval(()=>{},1000);`);
  fs.symlinkSync(script,path.join(bin,'npm'));
  const profile=path.join(root,'profile'),manager=new NativeProgramManager(profile,{PATH:bin,HOME:root}),controller=new AbortController();
  const work=manager.install({provider:'codex',signal:controller.signal,progress:()=>{}});const rejected=assert.rejects(work,{name:'AbortError'});
  for(let i=0;i<100&&!fs.existsSync(marker);i++)await new Promise(resolve=>setTimeout(resolve,10));
  assert.ok(fs.existsSync(marker));const pid=Number(fs.readFileSync(marker,'utf8'));controller.abort();await rejected;
  for(let i=0;i<100;i++){try{process.kill(pid,0);}catch{break;}await new Promise(resolve=>setTimeout(resolve,10));}
  assert.throws(()=>process.kill(pid,0));assert.equal(fs.readFileSync(outside,'utf8'),'preserve');
  assert.equal(fs.readdirSync(path.join(profile,'programs/codex')).some(name=>name.startsWith('.prepare-')),false);
});
