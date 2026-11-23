import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {createModelAccess} from '../../src/model-access/application.ts';
import {createMagpieModelProvider} from '../../src/model-access/providers/magpie.ts';
import {createCustomModelProvider} from '../../src/model-access/providers/custom.ts';
import {ManagedMagpie} from '../../src/model-access/providers/magpie-installation.ts';

test('Magpie connects a verified existing gateway without launching and isolates model choices',async()=>{
  const root=await mkdtemp(join(tmpdir(),'buildr-magpie-'));
  let valid=true, empty=false, quotaFail=false, quotaReads=0, launches=0, opened='', inference=0, posted='';
  const id='codex/gpt-example';
  const server=createServer(async(req,res)=>{
    res.setHeader('Content-Type','application/json');
    if(req.url==='/api/hello')return res.end(JSON.stringify({name:valid?'magpie':'unrelated',version:'fixture'}));
    if(req.url==='/v1/models')return res.end(JSON.stringify({data:empty?[]:[{id,display_name:'GPT Example',context_window:180000,modalities:{input:['text','image']}},{id:'not-a-chat',kind:'image'}]}));
    if(req.url==='/v1/magpie/quotas?kept=1'&&req.method==='GET'){
      quotaReads++;
      if(quotaFail)return res.writeHead(503).end('{"error":"upstream sensitive body"}');
      return res.end(JSON.stringify({data:[
        {provider:'codex',name:'Codex',user:'account-1@example.com',plan:'Pro',balance:'12.35 credits',readAt:'2026-11-23T00:00:00Z',windows:[{name:'7d',remaining:0,resetsAt:'2026-11-25T00:00:00Z'}],token:'fixture-private-token'},
        {provider:'codex',name:'Codex',user:'account-2@example.com',balance:'$4.10',error:'private upstream message',windows:[{name:'5h',remaining:140}]},
      ]}));
    }
    if(req.url==='/v1/responses'&&req.method==='POST'){
      inference++;const chunks=[];for await(const c of req)chunks.push(c);posted=JSON.parse(Buffer.concat(chunks).toString()).model;
      return res.end(JSON.stringify({id:'response',object:'response',status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:'fixture reply'}]}]}));
    }
    res.writeHead(404).end();
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const address=server.address();assert.ok(address&&typeof address==='object');
  const origin='http://127.0.0.1:'+address.port;
  const provider=createMagpieModelProvider({root,configuredOrigin:async()=>origin,installation:{address:async()=>undefined,start:async()=>{launches++;return origin;},open:async v=>{opened=v;}}});
  const access=createModelAccess({root:join(root,'model-access'),providers:[provider,createCustomModelProvider()]});
  const config={label:'fixture',baseUrl:origin+'/v1',protocol:'responses',useApiKey:false};
  try {
    const custom=await access.accounts.add({provider:'custom',custom:{...config,models:[{id,label:'GPT Example'}]}});
    const source=await access.accounts.add({provider:'magpie',prepareLocalGateway:true});
    assert.equal(launches,0); assert.equal(source.provider,'magpie');assert.equal(source.label,'Magpie');assert.equal(source.status,'ready');
    assert.deepEqual(source.models.map(x=>[x.id,x.enabled,x.images,x.contextWindow]),[[id,true,true,180000]]);
    assert.notEqual(source.id,custom.id);assert.equal(source.quota,undefined);
    await assert.rejects(access.accounts.readGatewayQuota(custom.id,{expectedRevision:custom.revision}),{code:'model_gateway_quota_unavailable'});
    await assert.rejects(access.accounts.readGatewayQuota(source.id,{expectedRevision:'stale'}),{code:'model_revision_conflict'});
    assert.equal(quotaReads,0);
    const quota=await access.accounts.readGatewayQuota(source.id,{expectedRevision:source.revision});
    assert.deepEqual(quota.accounts.map(a=>a.balance),['12.35 credits','$4.10']);
    assert.equal(quota.accounts[0]?.windows[0]?.remainingPercent,0);
    assert.equal(quota.accounts[0]?.windows[0]?.resetsAt,'2026-11-25T00:00:00Z');
    assert.equal(quota.accounts[0]?.observedAt,'2026-11-23T00:00:00Z');
    assert.equal(quota.accounts[1]?.windows[0]?.remainingPercent,undefined);
    assert.equal(quota.accounts[1]?.unavailable,true);
    assert.doesNotMatch(JSON.stringify(quota),/alice|anna|private-token|private upstream/);
    quotaFail=true;
    await assert.rejects(access.accounts.readGatewayQuota(source.id,{expectedRevision:source.revision}),{code:'model_magpie_quota_unavailable'});
    assert.equal(quotaReads,2);
    assert.deepEqual(access.accounts.read(source.id),source,'quota read must not change revision, lease readiness or model account quota');

    await assert.rejects(access.accounts.add({provider:'magpie'}),{code:'model_provider_already_configured'});
    await assert.rejects(access.accounts.configureCustom(source.id,{...config,expectedRevision:source.revision,baseUrl:'https://example.com'}),{code:'model_magpie_url_invalid'});
    await assert.rejects(access.accounts.openSettings(source.id,{expectedRevision:'stale'}));assert.equal(opened,'');
    await access.accounts.openSettings(source.id,{expectedRevision:source.revision});assert.equal(opened,origin);
    const lease=await access.leases.create({accountId:source.id,modelId:id,agentId:'codex',conversationId:'fixture',runId:'fixture'});
    const call=()=>fetch(lease.baseUrl+'/responses',{method:'POST',headers:{authorization:'Bearer '+lease.apiKey,'content-type':'application/json'},body:JSON.stringify({model:lease.model,input:'fixture'})});
    assert.equal((await call()).status,200);assert.equal(posted,id);assert.equal(inference,1);
    valid=false;
    assert.equal((await call()).status,503);assert.equal(inference,1,'never send to a replacement service');
    const offline=await access.accounts.check(source.id);assert.equal(offline.status,'failed');assert.equal(offline.models[0]?.id,id);assert.equal(access.catalog.list().models.find(x=>x.accountId===source.id)?.available,false);
    valid=true;empty=true;
    const refreshed=await access.accounts.check(source.id);assert.equal(refreshed.status,'ready');assert.equal(refreshed.models.length,0);assert.match(refreshed.diagnostic??'',/添加上游/);
    await access.accounts.remove(source.id,{expectedRevision:refreshed.revision});
    assert.equal((await fetch(origin+'/api/hello')).status,200,'removing a provider never stops the external gateway');
  } finally {await access.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(root,{recursive:true,force:true});}
});

test('wrong/manual gateway does not trigger installation; an explicit prepare can use a managed instance',async()=>{
  const origin='http://127.0.0.1:49161';let ready=false,prepare=0;
  const provider=createMagpieModelProvider({root:'unused',configuredOrigin:async()=>origin,
    fetch:async(url)=>Response.json(String(url).startsWith(origin)&&ready?{name:'magpie',version:'fixture'}:{name:'wrong-service'}),
    installation:{address:async()=>undefined,start:async()=>{prepare++;ready=true;return origin;},open:async()=>{}}});
  const options={label:'Magpie',baseUrl:origin,protocol:'responses',useApiKey:false};
  const signal=new AbortController().signal;
  await assert.rejects(provider.resolveCustom!(undefined,false,signal),{code:'model_magpie_not_found'});
  await assert.rejects(provider.resolveCustom!(options,true,signal),{code:'model_magpie_not_found'});
  assert.equal(prepare,0);
  assert.equal((await provider.resolveCustom!(undefined,true,signal)).baseUrl,origin+'/v1');assert.equal(prepare,1);
  assert.equal((await provider.resolveCustom!(undefined,true,signal)).baseUrl,origin+'/v1');assert.equal(prepare,1);
});

test('managed setup refuses a mismatched installed binary without running or replacing it', {skip: !['darwin','linux','win32'].includes(process.platform)||!['arm64','x64'].includes(process.arch)}, async()=>{
  const root=await mkdtemp(join(tmpdir(),'buildr-magpie-binary-'));
  try{
    const bin=join(root,'bin');await mkdir(bin);
    await writeFile(join(bin,'magpie-0.1.4708'+(process.platform==='win32'?'.exe':'')),'invalid binary');
    const installation=new ManagedMagpie(root,async()=>undefined);
    await assert.rejects(installation.start(new AbortController().signal),{code:'model_magpie_checksum'});
    await assert.rejects(installation.start(new AbortController().signal),{code:'model_magpie_checksum'},'failed start releases the setup lock');
  }finally{await rm(root,{recursive:true,force:true});}
});
