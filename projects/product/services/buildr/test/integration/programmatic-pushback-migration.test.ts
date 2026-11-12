import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {programmaticHttpFixture} from '../helpers/programmatic-http-fixture.ts';
import {readLegacyGlobalWebhook,GROKBOT_CREDENTIAL_ID} from '../../src/modules/agent-service/persistence/legacy-webhook-migration.ts';

const URL='https://legacy.test/hook',SECRET='legacy-secret';
function tempConfig(t:any,value:unknown,mode=0o600){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'buildr-legacy-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const file=path.join(dir,'.buildr-webhook.json');fs.writeFileSync(file,typeof value==='string'?value:JSON.stringify(value));fs.chmodSync(file,mode);
 return file;
}

test('readLegacyGlobalWebhook reads a private file and falls back to the environment safely',async t=>{
 const file=tempConfig(t,{url:URL,secret:SECRET});
 assert.deepEqual(readLegacyGlobalWebhook({BUILDR_AGENT_WEBHOOK_CONFIG:file}),{url:URL,secret:SECRET});
 assert.equal(readLegacyGlobalWebhook({BUILDR_AGENT_WEBHOOK_CONFIG:tempConfig(t,{url:URL,secret:SECRET},0o644)}),undefined,'group/world readable file is rejected');
 assert.equal(readLegacyGlobalWebhook({BUILDR_AGENT_WEBHOOK_CONFIG:tempConfig(t,'{not json')}),undefined,'parse failure is skipped');
 assert.equal(readLegacyGlobalWebhook({BUILDR_AGENT_WEBHOOK_CONFIG:tempConfig(t,{url:'ftp://x.test',secret:SECRET})}),undefined,'non-http target is rejected');
 assert.deepEqual(readLegacyGlobalWebhook({HOME:path.join(os.tmpdir(),'buildr-absent-xyz'),BUILDR_AGENT_WEBHOOK_URL:URL,BUILDR_AGENT_WEBHOOK_SECRET:SECRET}),{url:URL,secret:SECRET},'missing file falls back to environment');
 assert.equal(readLegacyGlobalWebhook({HOME:path.join(os.tmpdir(),'buildr-absent-xyz')}),undefined,'absence yields nothing');
});

test('migrateGlobal seeds a disabled GrokBot config once and never overwrites an existing one',async t=>{
 const f=await programmaticHttpFixture(t);
 const pushback=f.service.pushback;
 assert.equal(pushback.read(GROKBOT_CREDENTIAL_ID).state,'unconfigured');
 assert.deepEqual(pushback.migrateGlobal(GROKBOT_CREDENTIAL_ID,{url:URL,secret:SECRET}),{migrated:true});
 const migrated=pushback.read(GROKBOT_CREDENTIAL_ID);
 assert.equal(migrated.state,'disabled','migration keeps the receiver disabled');
 assert.equal(migrated.url,URL);assert.equal(migrated.hasSecret,true);
 assert.deepEqual(pushback.migrateGlobal(GROKBOT_CREDENTIAL_ID,{url:URL,secret:SECRET}),{migrated:false},'idempotent across restarts');
 const current=pushback.read(GROKBOT_CREDENTIAL_ID);
 pushback.save(GROKBOT_CREDENTIAL_ID,{expectedRevision:current.revision,enabled:true,url:'https://chosen.test/hook',secret:'chosen-secret'});
 assert.deepEqual(pushback.migrateGlobal(GROKBOT_CREDENTIAL_ID,{url:URL,secret:SECRET}),{migrated:false});
 const after=pushback.read(GROKBOT_CREDENTIAL_ID);
 assert.equal(after.url,'https://chosen.test/hook','an explicit configuration is preserved');
 assert.equal(after.state,'enabled');
});