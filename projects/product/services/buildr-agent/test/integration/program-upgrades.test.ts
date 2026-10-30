import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import test, {type TestContext} from 'node:test';
import { ConnectionApplication } from '../../src/application/connection-application.ts';
import { ProgramUpdates } from '../../src/application/program-updates.ts';
import { ProgramUpgrades } from '../../src/application/program-upgrades.ts';
import { ConversationRepository } from '../../src/persistence/conversation-repository.ts';
import { consumerBinding } from '../../src/executors/model-gateway.ts';
import { opaqueReference, parseReference } from '../../src/executors/native-process.ts';
import type { AgentExecutor, AgentProgramManager, AgentRuntime } from '../../src/contracts.ts';

async function fixture(t: TestContext) {
  const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'program-upgrades-'))),original=path.join(root,'Desktop.app','codex'),installed=path.join(root,'programs','codex','new','codex');
  fs.mkdirSync(path.dirname(original),{recursive:true});fs.mkdirSync(path.dirname(installed),{recursive:true});fs.writeFileSync(original,'original');fs.writeFileSync(installed,'new');
  const capabilities={text:true,images:false,approval:false,questions:false,stop:true,resume:true,maxInputBytes:65536};
  let installs=0, sends=0, blocked=false, failure=false, latest='0.164.0', opened=0, closeFailure='', wrongIdentity=false;
  const closed:string[]=[];
  const executor:AgentExecutor={descriptor:{id:'codex',label:'Codex',capabilities},async open(options){
    if(options.executable===installed&&failure)throw new Error('fixture_new_program_failed');
    opened++;const config=path.join(options.configRoot,'codex-home');fs.mkdirSync(config,{recursive:true});
    const version=options.executable===installed?'0.164.0':'0.163.0';
    const binding=await consumerBinding('codex',options.executable!,version,config,options);
    const runtime:AgentRuntime={bindingIdentity:wrongIdentity&&options.executable===installed?'wrong':binding.identity,bindingData:binding.data,capabilities,
      async inspectAccount(){return{status:'ready',label:'saved-account'};},async models(){return[{id:'fixture',label:'Fixture'}];},async beginLogin(){assert.fail('must retain existing account');},async cancelLogin(){},
      async createContext({cwd}){return{id:'saved-context',data:{native:opaqueReference('codex','saved-context',cwd,binding.identity)}};},
      async resumeContext({contextRef,cwd}){parseReference(String(contextRef.data?.native),'codex',cwd,binding.identity);},async readHistory(){return[];},async send(){sends++;},async observe(){return{status:'idle',tools:[]};},async reply(){},async stop(){assert.fail('must never stop active work');},async close(){closed.push(options.executable!);if(options.executable===closeFailure)throw new Error('fixture_close_unconfirmed');},
    };return runtime;
  }};
  const repository=new ConversationRepository(root);
  const connections=new ConnectionApplication({root,repository,executors:[executor],environment:{},generation:'fixture',now:()=>new Date().toISOString(),changed:()=>{}});
  await connections.connect('codex',{expectedRevision:'unconfigured',executable:original});
  const programs:AgentProgramManager={isManaged:(_,file)=>file===installed,async discover(input){const file=input.boundExecutable??input.executable!;return{candidates:[{executable:file,source:'configured',label:'fixture',version:file===installed?'0.164.0':'0.163.0',compatible:true}],installation:{label:'fixture',version:'0.163.0',url:'https://fixture.invalid',canInstall:false}};},async install(input){installs++;assert.equal(input.version,'0.164.0');input.signal.throwIfAborted();return installed;}};
  const checks=new ProgramUpdates(()=>connections.list(),programs,undefined,async()=>({latestVersion:latest,source:'https://registry.npmjs.org/%40openai%2Fcodex/latest'}));
  const options={root,connections,programs,checks,release:async()=>!blocked,now:()=>new Date().toISOString()};
  const upgrades=new ProgramUpgrades(options);
  t.after(async()=>{await upgrades.close();await connections.close();fs.rmSync(root,{recursive:true,force:true});});
  return{root,original,installed,connections,repository,checks,upgrades,options,begin:()=>upgrades.begin('codex',{expectedRevision:connections.get('codex').revision,expectedVersion:'0.164.0'}),get installs(){return installs;},get sends(){return sends;},get opened(){return opened;},closed,setCloseFailure:(value:string)=>{closeFailure=value;},setWrongIdentity:()=>{wrongIdentity=true;},setBlocked:(value:boolean)=>{blocked=value;},setFailure:(value:boolean)=>{failure=value;},setLatest:(value:string)=>{latest=value;}};
}
async function settled(f:Awaited<ReturnType<typeof fixture>>,state:string){for(let n=0;n<400;n++){const value=f.upgrades.read('codex');if(value?.state===state)return value;await new Promise(resolve=>setTimeout(resolve,10));}assert.fail('upgrade did not settle: '+JSON.stringify(f.upgrades.read('codex')));}

test('explicit upgrade installs exact version and restarts while preserving account, original app and native/gateway context identity',async t=>{
  const f=await fixture(t),old=f.connections.get('codex'),runtime=await f.connections.runtime('codex'),context=await runtime.createContext({cwd:f.root});
  const gateway={identity:'saved-lease',baseUrl:'http://127.0.0.1:8123/v1',apiKey:'fixture',models:[{id:'fixture',label:'Fixture'}]};
  const gatewayRuntime=await f.connections.runtime('codex',gateway),gatewayContext=await gatewayRuntime.createContext({cwd:f.root});
  const job=f.begin();assert.equal(job.state,'downloading');assert.equal(f.begin().id,job.id);
  const complete=await settled(f,'completed');assert.equal(complete.currentVersion,'0.164.0');assert.equal(f.installs,1);assert.equal(f.sends,0);
  assert.equal(fs.readFileSync(f.original,'utf8'),'original');assert.equal(f.connections.get('codex').executable,f.installed);assert.deepEqual(f.connections.get('codex').account,old.account);
  assert.equal(f.connections.binding('codex'),runtime.bindingIdentity);await(await f.connections.runtime('codex')).resumeContext({contextRef:context,cwd:f.root});
  const nextGateway=await f.connections.runtime('codex',gateway);assert.equal(nextGateway.bindingIdentity,gatewayRuntime.bindingIdentity);await nextGateway.resumeContext({contextRef:gatewayContext,cwd:f.root});
  assert.ok(f.closed.includes(f.original));assert.equal(f.repository.readConnection('codex')!.programSource,f.original);
});

test('running/unknown work waits without closing old program; a later explicit release activates once',async t=>{
  const f=await fixture(t);f.setBlocked(true);const originalClosed=f.closed.length;
  f.begin();await settled(f,'waiting');assert.equal(f.connections.get('codex').executable,f.original);assert.equal(f.closed.length,originalClosed);
  assert.throws(()=>f.upgrades.begin('codex',{expectedRevision:f.connections.get('codex').revision,expectedVersion:'0.165.0'}),{code:'agent_program_update_busy'});
  f.setBlocked(false);await settled(f,'completed');assert.equal(f.installs,1);assert.equal(f.sends,0);
});

test('failed candidate startup restores the old binding and leaves old context resumable',async t=>{
  const f=await fixture(t),runtime=await f.connections.runtime('codex'),context=await runtime.createContext({cwd:f.root}),before=f.connections.get('codex');f.setFailure(true);
  f.begin();await settled(f,'failed');assert.equal(f.connections.get('codex').executable,f.original);assert.equal(f.connections.binding('codex'),runtime.bindingIdentity);assert.deepEqual(f.connections.get('codex').account,before.account);
  await(await f.connections.runtime('codex')).resumeContext({contextRef:context,cwd:f.root});assert.equal(f.sends,0);
});

test('target/revision drift cannot install or overwrite another binding',async t=>{
  const f=await fixture(t);assert.throws(()=>f.upgrades.begin('codex',{expectedRevision:'stale',expectedVersion:'0.164.0'}),{code:'agent_revision_conflict'});
  f.setLatest('0.165.0');f.begin();await settled(f,'failed');assert.equal(f.installs,0);assert.equal(f.connections.get('codex').executable,f.original);
});

test('restart reports unfinished work without replaying installer; read is passive',async t=>{
  const f=await fixture(t);f.setBlocked(true);f.begin();await settled(f,'waiting');const before=f.installs;
  await f.upgrades.close();const restored=new ProgramUpgrades(f.options);assert.equal(restored.read('codex')!.state,'interrupted');assert.equal(f.installs,before);assert.equal(f.connections.get('codex').executable,f.original);await restored.close();
});

test('streamed model response holds program usage until body release, and gate rejects only new program access',async t=>{
  const f=await fixture(t);let finish!:()=>void;
  const response=await f.connections.useProgram('codex',async()=>new Response(new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('data'));finish=()=>controller.close();}})));
  assert.equal(f.connections.acquireProgramChange('codex'),null);const reading=response.text();finish();assert.equal(await reading,'data');
  const release=f.connections.acquireProgramChange('codex');assert.ok(release);assert.throws(()=>f.connections.programUnavailable('codex',f.connections.get('codex').revision,'stale observation'),{code:'agent_program_updating'});await assert.rejects(f.connections.runtime('codex'),{code:'agent_program_updating'});release();assert.ok(await f.connections.runtime('codex'));
});

test('ordinary source replacement still cannot assume the old native identity',async t=>{
  const f=await fixture(t);await assert.rejects(f.connections.connect('codex',{expectedRevision:f.connections.get('codex').revision,executable:f.installed}),{code:'agent_configuration_bound'});
});

test('unconfirmed old process close never opens a second writer or claims recovery',async t=>{
  const f=await fixture(t),before=f.opened;f.setCloseFailure(f.original);
  f.begin();const result=await settled(f,'failed');assert.match(result.message,/退出未确认/);
  assert.equal(f.opened,before);assert.equal(f.connections.get('codex').executable,f.original);
  await assert.rejects(f.connections.runtime('codex'),{code:'agent_program_recovery_unconfirmed'});
});

test('unconfirmed candidate close blocks reuse instead of reopening the old writer',async t=>{
  const f=await fixture(t),before=f.opened;f.setWrongIdentity();f.setCloseFailure(f.installed);
  f.begin();const result=await settled(f,'failed');assert.match(result.message,/新版程序退出未确认/);
  assert.equal(f.opened,before+1);assert.equal(f.connections.get('codex').executable,f.original);
  await assert.rejects(f.connections.runtime('codex'),{code:'agent_program_recovery_unconfirmed'});
});
