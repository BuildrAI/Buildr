import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout} from 'node:timers/promises';
import {createModelAccess} from '../../src/model-access/application.ts';
import type {ModelProvider,ModelProviderObservation} from '../../src/model-access/contracts.ts';

test('successful standalone login finishes after discovery establishes the credential identity',async()=>{
 const root=await mkdtemp(join(tmpdir(),'buildr-model-login-completion-'));
 let signedIn=false,release!:()=>void;
 const gate=new Promise<void>(resolve=>{release=resolve;});
 const provider:ModelProvider={id:'native-fixture',label:'Fixture',linked:true,async open(){return{
  protocol:'chat-completions',
  async inspect():Promise<ModelProviderObservation>{return signedIn?{status:'ready',identity:'actual-credential',models:[{id:'deepseek-flash',label:'DeepSeek Flash',images:false,tools:true}]}:{status:'not-authenticated',models:[]};},
  async beginLogin(update){await gate;signedIn=true;update({state:'completed'});},async cancelLogin(){},async close(){},async infer(){return Response.json({});},
 };}};
 const access=createModelAccess({root,providers:[provider]});
 try{
  await access.ensureLinked();
  const before=access.accounts.read(provider.id);
  await access.accounts.login(provider.id,{expectedRevision:before.revision});release();
  let current=access.accounts.read(provider.id);
  for(let index=0;index<200&&current.loginAttempt?.state!=='completed';index++){await setTimeout(5);current=access.accounts.read(provider.id);}
  assert.equal(current.loginAttempt?.state,'completed');assert.equal(current.status,'ready');
  assert.notEqual(current.identity,before.identity);assert.equal(current.models[0]?.id,'deepseek-flash');
 }finally{release();await access.close();await rm(root,{recursive:true,force:true});}
});
