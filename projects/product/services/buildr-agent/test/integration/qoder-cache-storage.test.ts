import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { ConversationRepository } from '../../src/persistence/conversation-repository.ts';
import { qoderLegacyCaches } from '../../src/executors/qoder/cache-storage.ts';
import { inspectAgentStorage } from '../../src/application/storage-maintenance.ts';
import { StorageMaintenance } from '../../src/process/storage-maintenance.ts';

function fixture(t:test.TestContext) {
  const dataRoot=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'qoder-cache-retirement-'))),root=path.join(dataRoot,'agent-service'),config=path.join(root,'connections/qoder');
  const payload=path.join(config,'tmp/qodercli-natives-v1.1.81-fixture');
  fs.mkdirSync(payload,{recursive:true,mode:0o700});
  const file=(relative:string,text:string)=>{const p=path.join(payload,relative);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,text);};
  file('.ready','0cde9bde0b98a7d4');
  for(const name of ['@lydell/node-pty','@silvia-odwyer/photon-node'])file('node_modules/'+name+'/package.json',JSON.stringify({name,version:'1.0.0'}));
  file('vendor/ripgrep/arm64-darwin/rg','native payload');
  const repo=new ConversationRepository(root);
  repo.saveConversation({view:{id:'fixture',workspaceId:'ws',revision:'one',cwd:'/work',title:'test',hidden:true,updatedAt:new Date().toISOString(),entries:[],participants:[],requests:[]},participants:[],sources:{},requests:{},attempts:[],attachments:{}});
  t.after(()=>{repo.stopReadModels();fs.rmSync(dataRoot,{recursive:true,force:true});});
  return {dataRoot,root,config,payload,file};
}

test('Qoder completed native extraction is declared, arbitrary tmp outputs and incomplete roots are retained',t=>{
  const f=fixture(t);
  assert.equal(qoderLegacyCaches(f.config).length,1);
  f.file('user-result.txt','business result');assert.deepEqual(qoderLegacyCaches(f.config),[]);
  fs.unlinkSync(path.join(f.payload,'user-result.txt'));fs.writeFileSync(path.join(f.payload,'.ready'),'incomplete');
  assert.deepEqual(qoderLegacyCaches(f.config),[]);
  fs.writeFileSync(path.join(f.payload,'.ready'),'0cde9bde0b98a7d4');
  fs.symlinkSync('/tmp',path.join(f.payload,'node_modules/external'));assert.deepEqual(qoderLegacyCaches(f.config),[]);
});

test('original worker defers mapped Qoder payload then automatically retires it after holder exits', {skip:process.platform!=='darwin',timeout:30000}, async t=>{
  const f=fixture(t),held=path.join(f.payload,'vendor/ripgrep/arm64-darwin/rg');
  const child=spawn(process.execPath,['-e',"require('fs').openSync(process.argv[1],'r');process.stdout.write('ready');setInterval(()=>{},1000)",held],{stdio:['ignore','pipe','pipe']});
  t.after(async()=>{if(child.exitCode===null&&child.signalCode===null){const ended=once(child,'exit');child.kill();await ended;}});
  await once(child.stdout!,'data');
  assert.equal(inspectAgentStorage({dataRoot:f.dataRoot}).items.find(item=>item.path===f.payload)?.reason,'storage_in_use');
  const maintenance=new StorageMaintenance(f.dataRoot,{initialMs:0,intervalMs:30});t.after(()=>maintenance.close());
  await delay(250);assert.ok(fs.existsSync(f.payload));
  const ended=once(child,'exit');child.kill();await ended;
  const deadline=Date.now()+20000;while(fs.existsSync(f.payload)&&Date.now()<deadline)await delay(50);
  assert.equal(fs.existsSync(f.payload),false);
  assert.ok(fs.existsSync(f.config),'account root is retained');
});
