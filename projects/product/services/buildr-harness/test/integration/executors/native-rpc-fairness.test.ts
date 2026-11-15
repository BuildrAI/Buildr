import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {NativeRpc} from '../../../build/executors/native-process.js';

test('native notification flood yields to HTTP control and preserves every ordered frame',async()=>{
 const root=await mkdtemp(join(tmpdir(),'buildr-rpc-fairness-')),file=join(root,'rpc.mjs');
 await writeFile(file,`import{createInterface}from'node:readline';createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line);let frames='';for(let i=0;i<300;i++)frames+=JSON.stringify({method:'tick',params:{i}})+'\\n';process.stdout.write(frames+JSON.stringify({id:m.id,result:'done'})+'\\n');});`);
 const rpc=new NativeRpc(process.execPath,[file],{cwd:root,env:process.env}),received:number[]=[];
 let control:Promise<Response>|undefined,controlAt=-1;
 const server=createServer((_,res)=>{controlAt=received.length;res.end('stopped');});
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const port=(server.address() as {port:number}).port;
 rpc.onMessage(message=>{
  if(message.method!=='tick')return;
  received.push(message.params.i);
  if(received.length===1)control=fetch('http://127.0.0.1:'+port);
  const until=performance.now()+1;while(performance.now()<until){/* Simulate a synchronous projection. */}
 });
 try{
  assert.equal(await rpc.call('flood',{},5000),'done');
  assert.equal(await(await control!).text(),'stopped');
  assert.ok(controlAt>0&&controlAt<300,'HTTP control must run before the notification batch finishes: '+controlAt);
  assert.deepEqual(received,Array.from({length:300},(_,i)=>i));
 }finally{await rpc.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(root,{recursive:true,force:true});}
});

test('native exit drains queued replies before reporting transport closed',async()=>{
 const root=await mkdtemp(join(tmpdir(),'buildr-rpc-exit-')),file=join(root,'rpc.mjs');
 await writeFile(file,`import{createInterface}from'node:readline';createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line);let frames='';for(let i=0;i<100;i++)frames+=JSON.stringify({method:'tick',params:{i}})+'\\n';process.stdout.write(frames+JSON.stringify({id:m.id,result:'last-reply'})+'\\n',()=>process.exit(0));});`);
 const rpc=new NativeRpc(process.execPath,[file],{cwd:root,env:process.env});let count=0;
 rpc.onMessage(message=>{if(message.method==='tick')count++;});
 try{assert.equal(await rpc.call('exit'),'last-reply');assert.equal(count,100);}
 finally{await rpc.close();await rm(root,{recursive:true,force:true});}
});
