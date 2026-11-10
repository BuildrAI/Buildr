import assert from 'node:assert/strict';
import test from 'node:test';
import {executionSelectionChanged} from '../src/features/agent-conversations/conversation-options.ts';

const run={model:'small',modelAccountId:'account',serviceTier:'standard',permissionMode:'default',reasoningEffort:'low'};
const choice={connectionId:'local',model:'small',modelAccountId:'account',serviceTier:'standard',reasoningEffort:'high'};

test('same agent and model keeps the native session when only the reasoning effort changes',()=>{
  // 思考深度是单轮参数：下一条要求可由同一原生会话按新强度接收，不构成换人交接。
  assert.equal(executionSelectionChanged(run,'local',choice,'default'),false);
  assert.equal(executionSelectionChanged({...run,reasoningEffort:undefined},'local',{...choice,reasoningEffort:'low'},'default'),false);
  assert.equal(executionSelectionChanged(undefined,'local',choice,'default'),false,'尚未发送的对话没有执行目标可比较');
});

test('real execution target changes still organize a handoff',()=>{
  assert.equal(executionSelectionChanged(run,'local',{...choice,connectionId:'other'},'default'),true);
  assert.equal(executionSelectionChanged(run,'other',choice,'default'),true);
  assert.equal(executionSelectionChanged(run,'local',{...choice,model:'other-model'},'default'),true);
  assert.equal(executionSelectionChanged(run,'local',{...choice,modelAccountId:'other-account'},'default'),true);
  assert.equal(executionSelectionChanged(run,'local',{...choice,serviceTier:'fast'},'default'),true);
  assert.equal(executionSelectionChanged(run,'local',choice,'full-access'),true);
});
