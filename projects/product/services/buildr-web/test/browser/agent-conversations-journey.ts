import assert from 'node:assert/strict';
import {AGENT_CONVERSATION_GROUPS,type AgentConversationGroup} from './agent-conversation-groups.ts';
import {createAgentConversationFixture} from './agent-conversation-fixture.ts';
import {runSetupScenarios} from './agent-conversations-setup-scenarios.ts';
import {runHistoryScenarios} from './agent-conversations-history-scenarios.ts';
import {runHandoffScenarios} from './agent-conversations-handoff-scenarios.ts';
import {runTasksScenarios} from './agent-conversations-tasks-scenarios.ts';
import {runModelsScenarios} from './agent-conversations-models-scenarios.ts';
import {runRecoveryScenarios} from './agent-conversations-recovery-scenarios.ts';
import {runSelectionScenarios} from './agent-conversations-selection-scenarios.ts';
import {runVideoScenarios} from './agent-conversations-video-scenarios.ts';

const scenarios:Record<AgentConversationGroup,(fixture:Awaited<ReturnType<typeof createAgentConversationFixture>>)=>Promise<void>>={
  setup:runSetupScenarios,
  history:runHistoryScenarios,
  handoff:runHandoffScenarios,
  tasks:runTasksScenarios,
  models:runModelsScenarios,
  recovery:runRecoveryScenarios,
  selection:runSelectionScenarios,
  video:runVideoScenarios,
};

/** 保留完整对话入口；各场景组复用唯一夹具，独立执行时重新准备现场。 */
export async function runAgentConversationsJourney(options:any){
  const part=options.group||process.env.BUILDR_AGENT_JOURNEY_PART||'all';
  if(part!=='all'&&!AGENT_CONVERSATION_GROUPS.some(group=>group===part))throw new Error('未知对话测试分组：'+part);
  await options.t.test('对话交互：'+part,{timeout:180_000},async()=>{
    const fixture=await createAgentConversationFixture(options);
    try{
      assert.deepEqual(
        [fixture.sends,fixture.prepares,fixture.stops,fixture.attachmentUploads,fixture.conversation],
        [0,0,0,0,null],
        '每个对话场景组都从独立测试数据开始',
      );
      await fixture.initialize(part);
      for(const group of part==='all'?AGENT_CONVERSATION_GROUPS:[part as AgentConversationGroup])await scenarios[group](fixture);
    }finally{await fixture.dispose();}
  });
}
