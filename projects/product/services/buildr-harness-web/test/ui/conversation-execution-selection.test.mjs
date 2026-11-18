import assert from 'node:assert/strict';
import test from 'node:test';
import {conversationRunIdentity,executionSelectionChanged,executionTargetChanges,restoreModelSeriesChoice} from '../../src/features/agent-conversations/conversation-options.ts';

const run={model:'small',modelAccountId:'account',serviceTier:'standard',permissionMode:'default',reasoningEffort:'low'};
const choice={connectionId:'local',model:'small',modelAccountId:'account',serviceTier:'standard',reasoningEffort:'high'};

test('same agent and model keeps the native session when only the reasoning effort changes',()=>{
  // 思考深度是单轮参数：下一条要求可由同一原生会话按新强度接收，不构成换人交接。
  assert.equal(executionSelectionChanged(run,'local',choice),false);
  assert.equal(executionSelectionChanged({...run,reasoningEffort:undefined},'local',{...choice,reasoningEffort:'low'}),false);
  assert.equal(executionSelectionChanged(undefined,'local',choice),false,'尚未发送的对话没有执行目标可比较');
});

test('same agent and model keeps the session when only the permission mode changes',()=>{
  // 权限是单轮参数：原执行组合可以用新授权接收下一条要求，不构成换人交接。
  assert.equal(executionSelectionChanged({...run,permissionMode:'default'},'local',choice),false);
  assert.equal(executionSelectionChanged({...run,permissionMode:'full-access'},'local',choice),false);
});

test('real execution target changes still organize a handoff',()=>{
  assert.equal(executionSelectionChanged(run,'local',{...choice,connectionId:'other'}),true);
  assert.equal(executionSelectionChanged(run,'other',choice),true);
  assert.equal(executionSelectionChanged(run,'local',{...choice,model:'other-model'}),true);
  assert.equal(executionSelectionChanged(run,'local',{...choice,modelAccountId:'other-account'}),true);
  assert.equal(executionSelectionChanged(run,'local',{...choice,serviceTier:'fast'}),true);
});

test('restoreModelSeriesChoice preserves explicit reasoningEffort from legacy gateway choices while migrating model ID to series',()=>{
  const catalog=[{
    id:'gateway-subscription:gemini-4-carbon',
    accountId:'gateway-subscription',
    accountIdentity:'acc-1',
    accountRevision:'rev-1',
    accountLabel:'Gateway AI',
    provider:'gateway-subscription',
    presentation:{vendorLabel:'Gateway AI',sourceLabel:'Gateway AI'},
    modelId:'gemini-4-carbon',
    label:'Gemini 4 Carbon',
    available:true,
    images:true,
    tools:true,
    reasoningEfforts:[{id:'low',label:'Low'},{id:'medium',label:'Medium'},{id:'high',label:'High'}],
    defaultReasoningEffort:'medium',
  }];

  // Explicit `medium` selected alongside legacy `gemini-4-carbon-high` must NOT be overwritten to `high`.
  const explicitMedium=restoreModelSeriesChoice({
    connectionId:'codex',
    modelAccountId:'gateway-subscription',
    model:'gemini-4-carbon-high',
    reasoningEffort:'medium',
  },catalog);
  assert.equal(explicitMedium.model,'gemini-4-carbon');
  assert.equal(explicitMedium.reasoningEffort,'medium');

  // Omitted reasoningEffort falls back to the legacy variant suffix.
  const inferredLow=restoreModelSeriesChoice({
    connectionId:'antigravity',
    modelAccountId:'gateway-subscription',
    model:'gemini-4-carbon-low',
  },catalog);
  assert.equal(inferredLow.model,'gemini-4-carbon');
  assert.equal(inferredLow.reasoningEffort,'low');

  // Historical run status label resolves legacy variant ID against the aggregated series catalog.
  const label=conversationRunIdentity({
    id:'run-1',
    participantId:'p-1',
    provider:'codex',
    generation:'g-1',
    status:'completed',
    accepted:true,
    tools:[],
    modelAccountId:'gateway-subscription',
    model:'gemini-4-carbon-high',
    reasoningEffort:'medium',
    startedAt:'2026-11-14T00:00:00Z',
    updatedAt:'2026-11-14T00:00:00Z',
    executionState:'ended',
    canContinue:false,
  },{id:'codex',provider:'codex',label:'Codex',status:'ready',models:[],capabilities:{text:true,images:true,approval:true,questions:true,stop:true,resume:true}},catalog);
  assert.equal(label,'Codex · Gateway AI / Gemini 4 Carbon');
});

test('executionTargetChanges normalizes native account IDs, default service tiers, and legacy series IDs',()=>{
  const connections=[
    {id:'antigravity',provider:'antigravity',label:'Antigravity',models:[{id:'gemini-pro-orchestrator',label:'Orchestrator (Carbon)',isDefault:true}],modelPolicy:{account:'native',native:{sourceProviders:['native-antigravity'],defaultSourceAccountId:'native-antigravity',exclusive:true}}},
    {id:'codex',provider:'codex',label:'Codex',models:[{id:'gpt-5',label:'GPT-5',isDefault:true}],modelPolicy:{account:'native',gateway:{protocol:'responses'}}},
  ];
  const catalog=[
    {id:'native-antigravity::gemini-pro-orchestrator',accountId:'native-antigravity',accountIdentity:'agy-1',accountRevision:'r1',accountLabel:'Google',provider:'native-antigravity',modelId:'gemini-pro-orchestrator',label:'Orchestrator (Carbon)',available:true,enabled:true,images:true,tools:true},
    {id:'native-antigravity::claude-opus-5-5',accountId:'native-antigravity',accountIdentity:'agy-1',accountRevision:'r1',accountLabel:'Google',provider:'native-antigravity',modelId:'claude-opus-5-5',label:'Claude Opus 5.5',available:true,enabled:true,images:true,tools:true,reasoningEfforts:[{id:'low',label:'Low'},{id:'high',label:'High'}],defaultReasoningEffort:'medium'},
    {id:'native-codex::gpt-5',accountId:'native-codex',accountIdentity:'codex-1',accountRevision:'r2',accountLabel:'ChatGPT',provider:'native-codex',modelId:'gpt-5',label:'GPT-5',available:true,enabled:true,images:true,tools:true,defaultServiceTier:'standard',serviceTiers:[{id:'standard',label:'标准'},{id:'fast',label:'快速'}]},
  ];

  // 原生运行未写 modelAccountId 时，切走后再选回显式 native-<connectionId> 不再误判交接。
  assert.deepEqual(
    executionTargetChanges(
      {model:'gemini-pro-orchestrator'},
      'antigravity',
      {connectionId:'antigravity',model:'gemini-pro-orchestrator',modelAccountId:'native-antigravity'},
      {connections,catalog},
    ),
    {agentChanged:false,modelChanged:false,changed:false},
  );
  assert.deepEqual(
    executionTargetChanges(
      {model:'gpt-5',modelAccountId:undefined,serviceTier:undefined},
      'codex',
      {connectionId:'codex',model:'gpt-5',modelAccountId:'native-codex',serviceTier:'standard'},
      {connections,catalog},
    ),
    {agentChanged:false,modelChanged:false,changed:false},
  );
  assert.deepEqual(
    executionTargetChanges(
      {model:'gpt-5',modelAccountId:undefined,serviceTier:undefined},
      'codex',
      {connectionId:'codex',model:'gpt-5',modelAccountId:'native-codex',serviceTier:'fast'},
      {connections,catalog},
    ),
    {agentChanged:false,modelChanged:true,changed:true},
  );

  // 历史变体模型 ID（含省略 modelAccountId 的原生记录）与聚合后的系列模型一致时不视为变更。
  assert.deepEqual(
    executionTargetChanges(
      {model:'claude-opus-5-5-high'},
      'antigravity',
      {connectionId:'antigravity',model:'claude-opus-5-5',modelAccountId:'native-antigravity'},
      {connections,catalog},
    ),
    {agentChanged:false,modelChanged:false,changed:false},
  );

  // 同智能体未选定具体模型（如模型停用被清空）时不显示误导性交接；更换智能体且尚未选定模型时仅提示更换智能体。
  assert.deepEqual(
    executionTargetChanges(
      {model:'gpt-5',modelAccountId:'native-codex'},
      'codex',
      {connectionId:'codex',model:undefined,modelAccountId:undefined},
      {connections,catalog},
    ),
    {agentChanged:false,modelChanged:false,changed:false},
  );
  assert.deepEqual(
    executionTargetChanges(
      {model:'gpt-5',modelAccountId:'native-codex'},
      'codex',
      {connectionId:'antigravity',model:undefined,modelAccountId:undefined},
      {connections,catalog},
    ),
    {agentChanged:true,modelChanged:false,changed:true},
  );
});
