import assert from 'node:assert/strict';
import test from 'node:test';
import { conversations, executionOverview, isActive, matchesExecutionFilter } from '../src/prototypes/conversation-activity/fixtures.ts';
const count=rows=>rows.reduce((sum,item)=>sum+item.count,0);
test('两组统计是同一批当前执行，等待、未知和未查看不算执行',()=>{
  const rows=conversations(),stats=executionOverview(rows);
  assert.deepEqual(stats.agents,[{label:'Codex',count:3},{label:'DSH',count:2},{label:'Qoder',count:1}]);
  assert.deepEqual(stats.models,[{label:'GPT-6.1-Sol',count:4},{label:'SWE-2',count:2}]);
  assert.equal(count(stats.agents),6);assert.equal(count(stats.models),6);assert.equal(rows.filter(isActive).length,9);
  assert.equal(count(executionOverview(rows.filter(row=>row.status!=='running')).agents),0);
});
test('按当前范围统计且每个对话每个维度只计一次',()=>{
  const rows=conversations();assert.equal(count(executionOverview([...rows,rows[0],rows[0]]).agents),6);
  assert.equal(count(executionOverview(rows.filter(row=>row.workspace==='Buildr')).agents),5);
  assert.equal(count(executionOverview(rows.filter(row=>row.workspace==='业务平台')).agents),1);
});
test('点击统计只筛执行项，取消恢复全部活动；搜索结果不作为总览来源',()=>{
  const scope=conversations(),active=scope.filter(isActive),stats=executionOverview(scope);
  const codex=active.filter(row=>matchesExecutionFilter(row,{kind:'agent',value:'Codex'}));assert.equal(codex.length,3);assert.ok(codex.every(row=>row.status==='running'&&row.agent==='Codex'));
  const swe=active.filter(row=>matchesExecutionFilter(row,{kind:'model',value:'SWE-2'}));assert.equal(swe.length,2);assert.ok(swe.every(row=>row.status==='running'));
  assert.equal(active.filter(row=>matchesExecutionFilter(row,null)).length,9);
  assert.equal(active.filter(row=>row.title.includes('支付')).length,1);assert.equal(count(stats.agents),6);
});
test('历史参与者或下一轮选择不改变当前实际执行统计',()=>{
  const row={...conversations()[0],participants:[{agent:'DSH',model:'old-model'}],nextChoice:{agent:'Qoder',model:'next-model'}};
  assert.deepEqual(executionOverview([row]),{agents:[{label:'Codex',count:1}],models:[{label:'GPT-6.1-Sol',count:1}]});
});
