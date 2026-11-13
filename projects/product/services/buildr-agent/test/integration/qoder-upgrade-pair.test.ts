import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {qoderSdkPair} from '../../src/executors/qoder/sdk-pair.ts';
import {ConnectionApplication} from '../../src/application/connection-application.ts';
import {ConversationRepository} from '../../src/persistence/conversation-repository.ts';
import {createQoderCnExecutor} from '../../src/executors/qoder-cn/index.ts';
import type {AgentExecutor} from '../../src/contracts.ts';

test('Qoder resolves only its own SDK package and rejects mismatched or unpaired new programs',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'qoder-pair-'));try{
  const pkg=path.join(root,'node_modules/@qoder-ai/qoder-agent-sdk'),exe=path.join(pkg,'dist/_bundled/qodercli');fs.mkdirSync(path.dirname(exe),{recursive:true});fs.writeFileSync(exe,'fixture');fs.writeFileSync(path.join(pkg,'dist/index.js'),'export const fixture=true;');
  fs.writeFileSync(path.join(pkg,'package.json'),JSON.stringify({name:'@qoder-ai/qoder-agent-sdk',version:'1.0.58',qoderCliVersion:'1.1.81'}));assert.match((await qoderSdkPair(exe,'1.1.81'))!,/qoder-agent-sdk\/dist\/index.js$/);
  await assert.rejects(qoderSdkPair(exe,'1.1.82'),/pair_mismatch/);
  const standalone=path.join(root,'qoder');fs.writeFileSync(standalone,'fixture');await assert.rejects(qoderSdkPair(standalone,'1.1.81'),/pair_required/);assert.equal(await qoderSdkPair(standalone,'1.1.75'),undefined);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
for(const fails of [false,true])test('Qoder binding switches only after real conversation validation; failure='+fails,async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'qoder-upgrade-'));const old=path.join(root,'old'),next=path.join(root,'next');fs.writeFileSync(old,'old');fs.writeFileSync(next,'new');let verified=0;const closed:string[]=[];
 const capabilities={text:true,images:false,approval:false,questions:false,stop:true,resume:true,maxInputBytes:65536};
 let app:ConnectionApplication;
 const executor:AgentExecutor={descriptor:{id:'qoder',label:'Qoder',capabilities},async open(options){return{bindingIdentity:'stable',bindingData:{executable:old},capabilities,inspectAccount:async()=>({status:'ready'}),models:async()=>[],beginLogin:async()=>{},cancelLogin:async()=>{},createContext:async()=>({id:'context'}),resumeContext:async()=>{},readHistory:async()=>[],send:async()=>{assert.fail('original work must never replay');},observe:async()=>({status:'idle',tools:[]}),reply:async()=>{},stop:async()=>({status:'stopped',tools:[]}),verifyUpgrade:async()=>{verified++;assert.equal(app.get('qoder').executable,old);if(fails)throw Error('conversation validation failed');},close:async()=>{closed.push(options.executable!);}};}};
 app=new ConnectionApplication({root,repository:new ConversationRepository(root),executors:[executor],environment:{PATH:'/usr/bin'},generation:'fixture-generation',changed(){},now:()=>new Date().toISOString()});
 try{
  await app.connect('qoder',{expectedRevision:'unconfigured',executable:old});const observed=app.get('qoder'),release=app.acquireProgramChange('qoder')!;
  try{if(fails)await assert.rejects(app.replaceProgram('qoder',observed,next),/validation failed/);else await app.replaceProgram('qoder',observed,next);}finally{release();}
  assert.equal(verified,1);assert.equal(app.get('qoder').executable,fails?old:next);assert.ok(closed.includes(old));if(fails)assert.ok(closed.includes(next));
 }finally{await app.close();fs.rmSync(root,{recursive:true,force:true});}
});

test('Qoder CN upgrades an existing binding and probes the separate authenticated account', async t => {
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'qoder-cn-upgrade-')));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const accountRoot=path.join(root,'account'), accountConfig=path.join(accountRoot,'qoder-cn-config');
 const program=(version:string)=>{
  const executable=path.join(root,version+'.js');
  fs.writeFileSync(executable,`#!/usr/bin/env node
if(process.argv.includes('--version')){console.log(${JSON.stringify(version)});process.exit(0);}
const readline=require('node:readline');
readline.createInterface({input:process.stdin}).on('line',line=>{
 const {id,method}=JSON.parse(line);
 if(method==='initialize')console.log(JSON.stringify({jsonrpc:'2.0',id,result:{protocolVersion:1}}));
 if(method==='session/new'){
  const response=process.env.QODERCN_CONFIG_DIR===${JSON.stringify(accountConfig)}
   ?{result:{sessionId:'verification-session'}}:{error:{code:-32000,message:'Authentication required'}};
  console.log(JSON.stringify({jsonrpc:'2.0',id,...response}));
 }
});
`,{mode:0o700});
  return executable;
 };
 const original=program('1.1.86'), next=program('1.1.88');
 const repository=new ConversationRepository(root);
 const options={root,repository,executors:[createQoderCnExecutor()],environment:{PATH:process.env.PATH??'/usr/bin'},
  nativeAccountConfigRoots:{'qoder-cn':accountRoot},generation:'fixture-generation',changed(){},now:()=>new Date().toISOString()};
 const initial=new ConnectionApplication(options);
 try {await initial.connect('qoder-cn',{expectedRevision:'unconfigured',executable:original,programOnly:true});}
 finally {await initial.close();}
 const before=repository.listConnections()[0]!;
 assert.ok(before.bindingData);
 repository.saveConnection({...before,bindingData:undefined},before.view.revision);
 const app=new ConnectionApplication(options);
 try {
  const release=app.acquireProgramChange('qoder-cn')!;
  try {await app.replaceProgram('qoder-cn',app.get('qoder-cn'),next);}
  finally {release();}
  const after=repository.listConnections()[0]!;
  assert.equal(after.view.executable,next);
  assert.equal(after.view.configPath,before.view.configPath);
  assert.equal(after.bindingIdentity,before.bindingIdentity);
  assert.equal(after.bindingData?.executable,original);
 } finally {await app.close();}
});
