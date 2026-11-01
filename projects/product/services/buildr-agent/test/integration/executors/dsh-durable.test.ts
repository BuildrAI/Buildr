import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,mkdir,writeFile,rm,symlink,open,appendFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID,createHash } from 'node:crypto';
import { zstdCompressSync } from 'node:zlib';
import { readDshPersistedExecution } from '../../../src/executors/dsh/durable-history.ts';
import { nativeBindingProvenance,opaqueReference } from '../../../src/executors/native-process.ts';

const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
async function fixture(t:test.TestContext,compressed=false){
 const configRoot=await mkdtemp(join(tmpdir(),'dsh-durable-'));t.after(()=>rm(configRoot,{recursive:true,force:true}));
 const executable=join(configRoot,'dsh.mjs');await writeFile(executable,'throw Error("must never run")');
 await mkdir(join(configRoot,'dsh-home'));
 const contextId='session-'+randomUUID(),cwd='/exact/workspace',gatewayIdentity='persisted-model-source';
 const bindingIdentity=hash(['buildr-model-gateway/v1',hash(await nativeBindingProvenance('dsh',executable,join(configRoot,'dsh-home'))),gatewayIdentity]);
 const input={configRoot,executable,gatewayIdentity,bindingIdentity,cwd,contextRef:{id:contextId,data:{native:opaqueReference('dsh',contextId,cwd,bindingIdentity)}},executionRef:{id:'exact-request',data:{resourceContext:contextId,resourceBinding:bindingIdentity}}};
 const dir=join(configRoot,'dsh-home/sessions/bucket',contextId);await mkdir(dir,{recursive:true});
 const file=join(dir,'session.v4.jsonl'+(compressed?'.zstd':''));
 const header={type:'session',version:4,id:contextId,cwd,isSeeded:false,createdAt:1,delegationDepth:0};
 const events:any[]=[{type:'turn/start',data:{turn:1}},{type:'user/message',data:{id:'user',source:{kind:'user',rpcId:'exact-request'},content:[{type:'text',text:'收尾'}]}},{type:'tool/call',data:{turn:1,callId:'call',name:'bash',arguments:{}}},{type:'tool/result',data:{turn:1,message:{toolCallId:'call',content:[{type:'text',text:'delivered'}]}}},{type:'assistant/message',data:{turn:1,step:1,message:{role:'assistant',content:[{type:'text',text:'已完成收尾。'}]}}},{type:'turn/end',data:{turn:1,reason:{kind:'completed'}}}];
 const write=async(rows:any[]=events,meta:any=header)=>{const lines=[meta,...rows.map((e,i)=>({...e,seq:i,time:i+1}))].map(r=>JSON.stringify(r)+'\n');await writeFile(file,compressed?Buffer.concat(lines.map(l=>zstdCompressSync(Buffer.from(l)))):lines.join(''));};
 await write();return{input,file,dir,events,header,write};
}
for(const compressed of [false,true])test(`durable DSH completion restores exact receipts and final answer without a process; compressed=${compressed}`,async t=>{
 const f=await fixture(t,compressed),result=await readDshPersistedExecution(f.input);
 assert.equal(result?.observation.status,'idle');assert.equal(result?.observation.executionRef?.id,'exact-request');
 assert.equal(result?.observation.tools.length,1);assert.equal(result?.observation.tools[0]?.status,'completed');
 assert.ok(result?.items.some(item=>item.role==='assistant'&&item.text==='已完成收尾。'));
 assert.ok(result?.items.some(item=>item.kind==='tool'&&item.text.includes('delivered')));
 assert.equal(await readDshPersistedExecution({...f.input,executionRef:{id:'other'}}),undefined);
});
test('durable evidence rejects another binding, directory, session header, unknown format and ambiguous logs',async t=>{
 const f=await fixture(t);await assert.rejects(readDshPersistedExecution({...f.input,bindingIdentity:'wrong'}));
 assert.equal(await readDshPersistedExecution({...f.input,gatewayIdentity:'other-model'}),undefined);
 await f.write(f.events,{...f.header,cwd:'/elsewhere'});assert.equal(await readDshPersistedExecution(f.input),undefined);
 await f.write(f.events,{...f.header,version:5});assert.equal(await readDshPersistedExecution(f.input),undefined);
 await f.write();await writeFile(join(f.dir,'session.v4.jsonl.zstd'),'duplicate');assert.equal(await readDshPersistedExecution(f.input),undefined);
});
test('durable evidence never invents ending or tool outcomes, and checks outstanding jobs',async t=>{
 const f=await fixture(t);
 await f.write(f.events.slice(0,-1));assert.equal(await readDshPersistedExecution(f.input),undefined);
 await f.write(f.events.filter(e=>e.type!=='tool/result'));assert.equal(await readDshPersistedExecution(f.input),undefined);
 await f.write([...f.events.slice(0,-1),{type:'job/registered',data:{jobId:'background',owner:f.input.contextRef.id}},f.events.at(-1)]);assert.equal(await readDshPersistedExecution(f.input),undefined);
 await f.write([...f.events.slice(0,-1),{type:'subagent/catalog',data:{childId:'child'}},f.events.at(-1)]);assert.equal(await readDshPersistedExecution(f.input),undefined);
});
test('partial compressed frames and symlinks are not completion evidence',async t=>{
 const f=await fixture(t,true);await writeFile(f.file,Buffer.from([0x28,0xb5,0x2f,0xfd]));await assert.rejects(readDshPersistedExecution(f.input));
 await rm(f.file);await writeFile(join(f.dir,'outside'),'{}');await symlink(join(f.dir,'outside'),f.file);assert.equal(await readDshPersistedExecution(f.input),undefined);
});
test('non-contiguous events and a different execution resource cannot prove completion',async t=>{
 const f=await fixture(t);
 const rows=[f.header,...f.events.map((event,index)=>({...event,seq:index+1,time:index+1}))];
 await writeFile(f.file,rows.map(row=>JSON.stringify(row)+'\n').join(''));
 assert.equal(await readDshPersistedExecution(f.input),undefined);
 await f.write();
 assert.equal(await readDshPersistedExecution({...f.input,executionRef:{...f.input.executionRef,data:{...f.input.executionRef.data,resourceContext:'another-context'}}}),undefined);
});
test('a file changed while being read is not accepted as stable terminal evidence',async t=>{
 const f=await fixture(t),sample=await open(f.file,'r'),prototype=Object.getPrototypeOf(sample),readFile=prototype.readFile;
 await sample.close();
 t.mock.method(prototype,'readFile',async function(this:any,...args:any[]){
  const result=await readFile.apply(this,args);await appendFile(f.file,'\n');return result;
 });
 assert.equal(await readDshPersistedExecution(f.input),undefined);
});
