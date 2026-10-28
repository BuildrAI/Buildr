import test from 'node:test';
import assert from 'node:assert/strict';
import {conversationPreferenceKeys,modelPreferenceFromChoice,preferredConversationChoice,readConversationModelPreference,readConversationModulePreference,rememberedConversationAgent,rememberedConversationPermission,rememberConversationAgent,rememberConversationPermission,writeConversationModelPreference,writeConversationModulePreference} from '../src/features/agent-conversations/conversation-preferences.ts';

function storage(initial={}){const values=new Map(Object.entries(initial));return{getItem:key=>values.get(key)??null,setItem:(key,value)=>{values.set(key,value);},removeItem:key=>{values.delete(key);},dump:()=>Object.fromEntries(values)};}
const connections=[
 {id:'qoder',provider:'qoder',label:'Qoder',enabled:true,status:'ready',models:[{id:'native-model',label:'Native',isDefault:true}]},
 {id:'dsh',provider:'dsh',label:'DSH',enabled:true,status:'ready',models:[{id:'dsh-model',label:'DSH default',isDefault:true}]},
];
const catalog=[
 {id:'native-qoder:native-model',accountId:'native-qoder',accountIdentity:'qoder-identity',accountRevision:'qoder-r1',provider:'qoder',accountLabel:'Qoder account',modelId:'native-model',label:'Native',available:true,enabled:true,tools:true,images:false},
 {id:'native-dsh:dsh-model',accountId:'native-dsh',accountIdentity:'dsh-identity',accountRevision:'dsh-r1',provider:'dsh',accountLabel:'DSH account',modelId:'dsh-model',label:'DSH default',available:true,enabled:true,tools:true,images:false},
 {id:'devin:swe-2',accountId:'devin',accountIdentity:'devin-identity',accountRevision:'devin-r1',provider:'devin',accountLabel:'Devin account',modelId:'swe-2',label:'SWE-2',available:true,enabled:true,tools:true,images:true,contextWindow:256000,reportedContextWindow:256000,defaultServiceTier:'standard',serviceTiers:[
  {id:'standard',label:'标准',contextWindow:256000,reasoningEfforts:[{id:'medium',label:'中'},{id:'high',label:'高'}],defaultReasoningEffort:'medium'},
  {id:'fast',label:'快速',contextWindow:128000,reasoningEfforts:[{id:'low',label:'低'}],defaultReasoningEffort:'low'},
 ]},
];

test('新草稿初始完全访问，旧明确默认和准确空间偏好优先',()=>{
 assert.equal(rememberedConversationPermission({version:1},'workspace-a'),'full-access');
 assert.equal(rememberedConversationPermission({version:1,permission:{mode:'default'}},'workspace-a'),'default');
 const legacy={version:1,permission:{mode:'full-access',workspaceId:'workspace-a'}};
 const next=rememberConversationPermission(legacy,'default','workspace-b');
 assert.equal(rememberedConversationPermission(next,'workspace-a'),'full-access');
 assert.equal(rememberedConversationPermission(next,'workspace-b'),'default');
 assert.equal(rememberedConversationPermission(next,'workspace-c'),'full-access');
});

test('权限按工作空间分别记忆，切回默认不清掉其他空间，存储刷新保留',()=>{
 const store=storage();
 let preference=rememberConversationAgent({version:1},'qoder');
 preference=rememberConversationPermission(preference,'full-access','workspace-a');
 preference=rememberConversationPermission(preference,'default','workspace-b');
 preference=rememberConversationPermission(preference,'default','workspace-a');
 preference=rememberConversationPermission(preference,'full-access','workspace-c');
 assert.equal(writeConversationModulePreference(preference,store,'dev'),true);
 const read=readConversationModulePreference(store,'dev');
 assert.equal(rememberedConversationPermission(read,'workspace-a'),'default');
 assert.equal(rememberedConversationPermission(read,'workspace-b'),'default');
 assert.equal(rememberedConversationPermission(read,'workspace-c'),'full-access');
 assert.equal(rememberedConversationAgent(read,connections).id,'qoder');
 assert.deepEqual(readConversationModulePreference(store,'other'),{version:1});
});

test('损坏或未知偏好按无记忆处理，不阻断默认选择',()=>{
 const keys=conversationPreferenceKeys('dev'),store=storage({[keys.module]:'{bad',[keys.model]:JSON.stringify({version:9,connectionId:'qoder'})});
 assert.deepEqual(readConversationModulePreference(store,'dev'),{version:1});
 assert.equal(readConversationModelPreference(store,'dev'),null);
 assert.equal(preferredConversationChoice({version:1},null,connections,catalog).connectionId,'qoder');
 const denied={getItem(){throw new Error('denied');},setItem(){throw new Error('denied');},removeItem(){throw new Error('denied');}};
 assert.deepEqual(readConversationModulePreference(denied,'dev'),{version:1});
 assert.equal(readConversationModelPreference(denied,'dev'),null);
 assert.equal(writeConversationModulePreference({version:1},denied,'dev'),false);
 assert.equal(writeConversationModelPreference(null,denied,'dev'),false);
});

test('模型选择器记忆恢复准确来源、档位与思考深度，并按当前目录重新观察',()=>{
 const store=storage(),modulePreference={version:1,agent:{connectionId:'dsh'}};
 const remembered=modelPreferenceFromChoice({connectionId:'dsh',model:'swe-2',modelAccountId:'devin',serviceTier:'fast',reasoningEffort:'low'});
 assert.equal(writeConversationModelPreference(remembered,store,'dev'),true);
 const selection=preferredConversationChoice(modulePreference,readConversationModelPreference(store,'dev'),connections,catalog);
 assert.deepEqual([selection.connectionId,selection.modelAccountId,selection.model,selection.serviceTier,selection.reasoningEffort,selection.modelAccountRevision,selection.modelAccountIdentity],['dsh','devin','swe-2','fast','low','devin-r1','devin-identity']);
 const missingTier=preferredConversationChoice(modulePreference,{version:1,connectionId:'dsh',model:'swe-2',modelAccountId:'devin',serviceTier:'missing',reasoningEffort:'unknown'},connections,catalog);
 assert.deepEqual([missingTier.serviceTier,missingTier.reasoningEffort],['standard',undefined]);
 const unavailable=preferredConversationChoice(modulePreference,{version:1,connectionId:'dsh',model:'swe-2',modelAccountId:'gone'},connections,catalog);
 assert.deepEqual([unavailable.modelAccountId,unavailable.model],['native-dsh','dsh-model']);
 const restored=preferredConversationChoice({version:1,agent:{connectionId:'qoder'}},{version:1,connectionId:'qoder',model:'swe-2',modelAccountId:'devin'},connections,catalog);
 assert.deepEqual([restored.modelAccountId,restored.model],['devin','swe-2']);
});

test('不同智能体不借用模型记忆，且对话模型写入不改变执行模型偏好',()=>{
 const store=storage({'buildr.execution-model':JSON.stringify(['execution-account','execution-model'])}),modulePreference={version:1,agent:{connectionId:'dsh'}};
 const memory={version:1,connectionId:'qoder',model:'swe-2',modelAccountId:'devin'};
 const selected=preferredConversationChoice(modulePreference,memory,connections,catalog);
 assert.equal(selected.connectionId,'dsh');assert.deepEqual([selected.modelAccountId,selected.model],['native-dsh','dsh-model']);
 writeConversationModulePreference(modulePreference,store,'dev');writeConversationModelPreference(memory,store,'dev');
 assert.equal(store.dump()['buildr.execution-model'],JSON.stringify(['execution-account','execution-model']));
});

test('native model draft memory restores only a currently supported reasoning effort',()=>{
  const native=[{id:'codex',provider:'codex',label:'Codex',enabled:true,status:'ready',models:[{id:'native-model',label:'Native',isDefault:true,reasoningEfforts:[{id:'high',label:'High'}]}]}];
  const module={version:1,agent:{connectionId:'codex'}};
  assert.equal(preferredConversationChoice(module,{version:1,connectionId:'codex',model:'native-model',reasoningEffort:'high'},native,[]).reasoningEffort,'high');
  assert.equal(preferredConversationChoice(module,{version:1,connectionId:'codex',model:'native-model',reasoningEffort:'unsupported'},native,[]).reasoningEffort,undefined);
});
