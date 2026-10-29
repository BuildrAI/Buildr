import test from 'node:test';
import assert from 'node:assert/strict';
import { createCipheriv, createHash, randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createQoderExecutor } from '../../../src/executors/qoder/index.ts';
import { safeDiagnostic } from '../../../src/domain/agent-state.ts';
import type { AgentRuntime, ExecutorEvent, ModelGatewayConfiguration } from '../../../src/contracts.ts';

const fixture = await readFile(new URL('./fixtures/qoder-cli.mjs', import.meta.url), 'utf8');
const fingerprint = (user: string) => createHash('sha256').update('qoder:' + user).digest('hex');
async function login(config: string, user: string) {
  await mkdir(join(config, '.auth'), {recursive:true});
  const machine = '1234567890123456-machine', key = Buffer.from(machine.slice(0,16)), cipher = createCipheriv('aes-128-cbc',key,key);
  await writeFile(join(config,'.auth','machine_id'),machine);
  await writeFile(join(config,'.auth','user'),Buffer.concat([cipher.update(JSON.stringify({uid:user,security_oauth_token:'fixture-secret'})),cipher.final()]).toString('base64'));
}
const lease: ModelGatewayConfiguration = {
  identity:'same-qoder-account-model-conversation',baseUrl:'http://127.0.0.1:1/v1',apiKey:'unused-native-lease',
  models:[{id:'bound-route',label:'Qwen3.8-Max',contextWindow:500000,reasoningEfforts:[{id:'medium',label:'Medium'}],defaultReasoningEffort:'medium'}],
  nativeModel:{provider:'qoder',id:'qmodel_38max',accountIdentity:fingerprint('user')},
};
function source(missingAtExecution = false) {
  return fixture
    .replace("import{createInterface}", "import fs from'node:fs';import path from'node:path';const policies=[];import{createInterface}")
    .replaceAll("value:'fixture-model'", "value:'qmodel_38max'")
    .replace("if(t==='initialize'){", "if(t==='initialize'){fs.writeFileSync(path.join(process.env.QODER_CONFIG_DIR,'launch.json'),JSON.stringify({args:process.argv,key:process.env.BUILDR_MODEL_GATEWAY_KEY}));")
    .replace("if(m.type==='user'){input=m;", `if(m.type==='control_response'&&m.response.request_id.startsWith('policy-')){policies.push(m.response);fs.writeFileSync(path.join(process.env.QODER_CONFIG_DIR,'policies.json'),JSON.stringify(policies));if(policies.length===3)emit({type:'result',subtype:'${missingAtExecution?'error_during_execution':'success'}',is_error:${missingAtExecution},errors:['Sorry, something went wrong. Please try again.'],session_id:sid,uuid:'end',num_turns:1,usage:{},modelUsage:{},permission_denials:[],result:''});return;}if(m.type==='user'){sid=m.session_id;for(const purpose of ['main','compact','title'])emit({type:'control_request',request_id:'policy-'+purpose,request:{type:'get_model_policy',purpose,sessionId:sid,turnIndex:0,resolvedModel:'qmodel_38max',models:[{value:'${missingAtExecution?'other-model':'qmodel_38max'}'}]}});return;input=m;`);
}
test('Qoder uses its native Qwen model with custom providers unavailable and refuses changed accounts', {timeout:15000}, async () => {
  const root = await mkdtemp(join(tmpdir(),'buildr-qoder-native-model-')), owner = join(root,'account'), config = join(owner,'qoder-config');
  let runtime: AgentRuntime | undefined;
  try {
    await login(config,'user');
    const executable = join(root,'qoder.mjs'); await writeFile(executable,source());
    runtime = await createQoderExecutor().open({connectionId:'qoder',configRoot:join(root,'binding'),nativeAccountConfigRoot:owner,executable,environment:{PATH:process.env.PATH??''},gateway:lease});
    await assert.rejects(readFile(join(config,'launch.json'),'utf8'), {code:'ENOENT'}, 'native account binding must not launch a redundant inspection CLI');
    const contextRef = await runtime.createContext({cwd:root}), events: ExecutorEvent[] = [];
    const input = {contextRef,cwd:root,text:'native model probe',images:[],model:'bound-route',reasoningEffort:'medium',permissionMode:'full-access' as const,clientRequestId:randomUUID(),onEvent:(event:ExecutorEvent)=>events.push(event)};
    await runtime.send(input);
    assert.equal(events.find(event=>event.type==='completed')?.status,'completed');
    const launch = JSON.parse(await readFile(join(config,'launch.json'),'utf8'));
    assert.equal(launch.args[launch.args.indexOf('--model')+1],'qmodel_38max');
    assert.equal(launch.args[launch.args.indexOf('--permission-mode')+1],'bypassPermissions');
    assert.equal(JSON.parse(launch.args[launch.args.indexOf('--settings')+1]).providers,undefined);
    assert.equal(launch.key,undefined);
    const policies = JSON.parse(await readFile(join(config,'policies.json'),'utf8'));
    for (const entry of policies) assert.deepEqual(entry.response,{type:'get_model_policy',model:'qmodel_38max',parameters:{contextWindow:500000,reasoningEffort:'medium'}});
    await login(config,'other-user');
    await assert.rejects(runtime.send({...input,clientRequestId:randomUUID()}),/qoder_native_account_changed/);
    assert.equal(safeDiagnostic(new Error('qoder_native_account_changed')).includes('账号已变化'),true);
  } finally {await runtime?.close();await rm(root,{recursive:true,force:true});}
});
test('Qoder preserves the specific model policy failure when the CLI returns only a generic error', {timeout:15000}, async () => {
  const root = await mkdtemp(join(tmpdir(),'buildr-qoder-policy-error-'));
  let runtime: AgentRuntime | undefined;
  try {
    const owner = join(root,'account'); await login(join(owner,'qoder-config'),'user');
    const executable = join(root,'qoder.mjs'); await writeFile(executable,source(true));
    runtime = await createQoderExecutor().open({connectionId:'qoder',configRoot:join(root,'binding'),nativeAccountConfigRoot:owner,executable,environment:{PATH:process.env.PATH??''},gateway:lease});
    const contextRef = await runtime.createContext({cwd:root}), events: ExecutorEvent[] = [];
    await runtime.send({contextRef,cwd:root,text:'keep the exact source',images:[],model:'bound-route',clientRequestId:randomUUID(),onEvent:event=>events.push(event)});
    const completed = events.find(event=>event.type==='completed');
    assert.equal(completed?.status,'failed');
    assert.match(completed?.diagnostic??'',/所选模型不在 Qoder 当前原生模型目录/);
    assert.ok(!completed?.diagnostic?.includes('Sorry'));
    assert.match(safeDiagnostic(new Error('qoder_gateway_model_unavailable')),/未开放所选外部模型通道/);
  } finally {await runtime?.close();await rm(root,{recursive:true,force:true});}
});
