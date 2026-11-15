import assert from 'node:assert/strict';
import test from 'node:test';
import {participantExecutionPairs} from '../src/features/agent-conversations/conversation-state.ts';
test('参与方以实际智能体与模型组合去重，同智能体不同模型分别展示',()=>{
 const view={participants:[{id:'a',provider:'codex',model:'qmodel_38max'},{id:'b',provider:'codex',model:'swe-2'},{id:'c',provider:'codex',model:'swe-2'},{id:'d',provider:'dsh',model:'swe-2'}]};
 assert.deepEqual(participantExecutionPairs(view).map(({provider,model})=>[provider,model]),[['codex','qmodel_38max'],['codex','swe-2'],['dsh','swe-2']]);
});
test('旧记录只为准确当前参与方回填本轮模型，不借用别人的模型或下一轮选择',()=>{
 const view={participants:[{id:'old',provider:'codex'},{id:'current',provider:'codex'}],run:{participantId:'current',model:'actual'},draft:{model:'next'}};
 assert.deepEqual(participantExecutionPairs(view).map(({model})=>model),[undefined,'actual']);
 assert.deepEqual(participantExecutionPairs(null),[]);
});
