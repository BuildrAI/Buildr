import test from 'node:test';
import assert from 'node:assert/strict';
import {conversationPreferenceKeys,modelPreferenceFromChoice,preferredConversationChoice,readConversationModelPreference,readConversationModulePreference,rememberedConversationAgent,rememberedConversationPermission,rememberConversationAgent,rememberConversationPermission,rememberReasoningEffort,restoreReasoningChoice,reasoningMemoryKey,writeConversationModelPreference,writeConversationModulePreference} from '../src/features/agent-conversations/conversation-preferences.ts';
import {validConversationChoice} from '../src/features/agent-conversations/conversation-options.ts';

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
 const remembered=modelPreferenceFromChoice({connectionId:'dsh',model:'swe-2',modelAccountId:'devin',modelAccountIdentity:'devin-identity',serviceTier:'fast',reasoningEffort:'low'});
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

test('推理强度按执行者、模型和准确来源独立保存，其他选择器写入不会覆盖',()=>{
 const store=storage(),connection={id:'codex',models:[{id:'same',isDefault:true,reasoningEfforts:[{id:'high'},{id:'low'}]}]};
 const source={accountId:'one',accountIdentity:'identity-one',modelId:'same',reasoningEfforts:[{id:'medium'},{id:'high'}]};
 const other={...source,accountId:'two',accountIdentity:'identity-two',reasoningEfforts:[{id:'low'}]};
 const a={connectionId:'codex',model:'same',modelAccountId:'one',modelAccountIdentity:'identity-one'};
 const b={...a,modelAccountId:'two',modelAccountIdentity:'identity-two'};
 const native={connectionId:'codex',model:'same'},differentAgent={...a,connectionId:'dsh'};
 for(const [choice,effort] of [[a,'high'],[b,'low'],[native,'low'],[differentAgent,'medium']])assert.equal(rememberReasoningEffort(choice,effort,store,'isolation'),true);
 assert.equal(restoreReasoningChoice(a,connection,[source,other],store,'isolation').reasoningEffort,'high');
 assert.equal(restoreReasoningChoice(b,connection,[source,other],store,'isolation').reasoningEffort,'low');
 assert.equal(restoreReasoningChoice(native,connection,[source,other],store,'isolation').reasoningEffort,'low');
 assert.equal(restoreReasoningChoice(differentAgent,connection,[source,other],store,'isolation').reasoningEffort,'medium');
 assert.equal(restoreReasoningChoice(a,connection,[source],store,'another-profile').reasoningEffort,undefined);
 assert.equal(restoreReasoningChoice({...a,modelAccountIdentity:'replaced'},connection,[{...source,accountIdentity:'replaced'}],store,'isolation').reasoningEffort,undefined);
 assert.equal(store.dump()[reasoningMemoryKey(a,'isolation')],'high');
});

test('来源或档位不支持已选强度时回落，不借用同名原生模型，历史对象不变',()=>{
 const store=storage(),connection={id:'codex',models:[{id:'same',isDefault:true,reasoningEfforts:[{id:'high'}]}]};
 const choice={connectionId:'codex',model:'same',modelAccountId:'shared',modelAccountIdentity:'source',serviceTier:'fast',reasoningEffort:'high'};
 const source={accountId:'shared',accountIdentity:'source',modelId:'same',reasoningEfforts:[{id:'high'}],defaultServiceTier:'fast',serviceTiers:[{id:'fast',reasoningEfforts:[{id:'high'}]},{id:'standard',reasoningEfforts:[{id:'low'}]}]};
 rememberReasoningEffort(choice,'high',store,'capability');
 assert.equal(restoreReasoningChoice({...choice,serviceTier:'standard'},connection,[source],store,'capability').reasoningEffort,undefined);
 const noCapability={...source,reasoningEfforts:undefined,serviceTiers:undefined};
 assert.equal(restoreReasoningChoice(choice,connection,[noCapability],store,'capability').reasoningEffort,undefined);
 assert.equal(validConversationChoice(choice,connection,[noCapability]).reasoningEffort,undefined);
 assert.equal(choice.reasoningEffort,'high','不修改历史或调用方原始对象');
 assert.equal(restoreReasoningChoice(choice,connection,[source],store,'capability').reasoningEffort,'high','恢复支持后记忆仍在');
});

test('存储不可用仍可在当前页面记住选择；来源变更不沿用旧单槽强度',()=>{
 const denied={getItem(){throw Error('denied')},setItem(){throw Error('denied')},removeItem(){}};
 const native={connectionId:'codex',model:'native'},connection={id:'codex',models:[{id:'native',isDefault:true,reasoningEfforts:[{id:'high'}]}]};
 assert.equal(rememberReasoningEffort(native,'high',denied,'denied'),false);
 assert.equal(restoreReasoningChoice(native,connection,[],denied,'denied').reasoningEffort,'high');
 const module={version:1,agent:{connectionId:'dsh'}};
 const old={version:1,connectionId:'dsh',model:'swe-2',modelAccountId:'devin',modelAccountIdentity:'old-identity',reasoningEffort:'high'};
 assert.equal(preferredConversationChoice(module,old,connections,catalog).reasoningEffort,undefined);
 assert.equal(preferredConversationChoice(module,{...old,modelAccountIdentity:undefined},connections,catalog).reasoningEffort,undefined);
});

test('旧对话的原生模型绑定当前来源时使用同一份强度记忆',()=>{
 const store=storage(),connection={id:'codex',models:[{id:'same',isDefault:true,reasoningEfforts:[{id:'medium'},{id:'high'}]}]};
 const source={accountId:'native-codex',accountIdentity:'native-identity',modelId:'same',reasoningEfforts:[{id:'medium'},{id:'high'}]};
 const legacy={connectionId:'codex',model:'same'},bound={...legacy,modelAccountId:source.accountId,modelAccountIdentity:source.accountIdentity};
 rememberReasoningEffort(bound,'high',store,'native-binding');
 assert.equal(restoreReasoningChoice(legacy,connection,[source],store,'native-binding').reasoningEffort,'high');
 assert.equal(restoreReasoningChoice(bound,connection,[source],store,'native-binding').reasoningEffort,'high');
 assert.equal(validConversationChoice({...legacy,reasoningEffort:'high'},connection,[{...source,reasoningEfforts:[]}]).reasoningEffort,undefined);
 assert.equal(restoreReasoningChoice(legacy,connection,[{...source,accountIdentity:'replacement'}],store,'native-binding').reasoningEffort,undefined);
});
