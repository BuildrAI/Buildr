import assert from 'node:assert/strict';
import test from 'node:test';
import {executionSelectionChanged} from '../src/features/agent-conversations/conversation-options.ts';

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