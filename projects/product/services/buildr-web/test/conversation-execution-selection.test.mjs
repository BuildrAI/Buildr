import assert from 'node:assert/strict';
import test from 'node:test';
import {conversationRunIdentity,executionSelectionChanged,restoreModelSeriesChoice} from '../src/features/agent-conversations/conversation-options.ts';

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

test('restoreModelSeriesChoice preserves explicit reasoningEffort from legacy Google AI choices while migrating model ID to series',()=>{
  const catalog=[{
    id:'google-ai-subscription:gemini-4-carbon',
    accountId:'google-ai-subscription',
    accountIdentity:'acc-1',
    accountRevision:'rev-1',
    accountLabel:'Google AI',
    provider:'google-ai-subscription',
    presentation:{vendorLabel:'Google AI',sourceLabel:'Google AI'},
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
    modelAccountId:'google-ai-subscription',
    model:'gemini-4-carbon-high',
    reasoningEffort:'medium',
  },catalog);
  assert.equal(explicitMedium.model,'gemini-4-carbon');
  assert.equal(explicitMedium.reasoningEffort,'medium');

  // Omitted reasoningEffort falls back to the legacy variant suffix.
  const inferredLow=restoreModelSeriesChoice({
    connectionId:'antigravity',
    modelAccountId:'google-ai-subscription',
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
    modelAccountId:'google-ai-subscription',
    model:'gemini-4-carbon-high',
    reasoningEffort:'medium',
    startedAt:'2026-11-14T00:00:00Z',
    updatedAt:'2026-11-14T00:00:00Z',
    executionState:'ended',
    canContinue:false,
  },{id:'codex',provider:'codex',label:'Codex',status:'ready',models:[],capabilities:{text:true,images:true,approval:true,questions:true,stop:true,resume:true}},catalog);
  assert.equal(label,'Codex · Google AI / Gemini 4 Carbon');
});
