import test from 'node:test';
import assert from 'node:assert/strict';
import { executionModelKey, executionModelOptions, selectedExecutionModel, executionModelDetailKey, executionModelWithPreferences, executionModelReasoning, executionModelGroups } from '../src/lib/execution-model.ts';

const model = overrides => ({accountId: 'account', accountLabel: 'Qoder · Lite', modelId: 'fast', label: 'Fast', enabled: true, available: true, accountIdentity: 'identity', accountRevision: 'r1', defaultServiceTier: 'quick', ...overrides});

test('执行模型选择只提供模型配置中已启用的模型', () => {
  const options = executionModelOptions([model({}), model({modelId: 'off', label: 'Off', enabled: false}), model({modelId: 'legacy', label: 'Legacy', enabled: undefined})]);
  assert.deepEqual(options.map(option => option.modelId), ['fast', 'legacy']);
  const original = model({});
  executionModelOptions([original]);
  assert.deepEqual(original, model({}));
});

test('执行模型选项保留真实来源、观察版本和默认档位', () => {
  const [option] = executionModelOptions([model({available: false, defaultServiceTier: undefined})]);
  assert.deepEqual(option, {key: JSON.stringify(['account', 'fast']), label: 'Qoder · Lite / Fast', available: false, accountId: 'account', modelId: 'fast', accountIdentity: 'identity', accountRevision: 'r1', serviceTier: undefined, provider: undefined, accountLabel: 'Qoder · Lite', modelLabel: 'Fast', creditFactor: undefined, reasoningEfforts: undefined, defaultReasoningEffort: undefined, serviceTiers: undefined});
  assert.equal(executionModelKey('account', 'fast'), option.key);
});

test('执行偏好按账号身份隔离，档位恢复只接受该档位支持的推理强度', () => {
  const [option] = executionModelOptions([model({reasoningEfforts:[{id:'high',label:'High'},{id:'low',label:'Low'}],defaultReasoningEffort:'high',serviceTiers:[{id:'quick',label:'快速',reasoningEfforts:[{id:'medium',label:'Medium'}],defaultReasoningEffort:'medium'},{id:'standard',label:'标准',reasoningEfforts:[{id:'high',label:'High'},{id:'low',label:'Low'}],defaultReasoningEffort:'low'}]})]);
  const key=executionModelDetailKey(option,'reasoning-effort');
  assert.match(key,/^buildr\.execution-model\.reasoning-effort:/);
  assert.notEqual(key,executionModelDetailKey({...option,accountIdentity:'other-person'},'reasoning-effort'));
  assert.notEqual(key,executionModelDetailKey({...option,accountId:'other-account'},'reasoning-effort'));
  assert.notEqual(key,executionModelDetailKey(option,'service-tier'));
  assert.equal(key,executionModelDetailKey({...option,accountRevision:'r2'},'reasoning-effort'),'ordinary catalog revisions retain the same account preference');
  const selected=executionModelWithPreferences(option,'standard','high');
  assert.equal(selected.serviceTier,'standard');assert.equal(selected.reasoningEffort,'high');
  assert.equal(executionModelWithPreferences(option,'quick','high').reasoningEffort,undefined,'stale effort cannot reach another tier');
  assert.equal(executionModelWithPreferences(option,'missing','medium').serviceTier,'quick');
  assert.equal(executionModelWithPreferences(null,'standard','high'),null);
  const inherited=executionModelReasoning(executionModelWithPreferences(option,'standard',null));
  assert.deepEqual(inherited.options.map(item=>item.id),['low','high']);assert.equal(inherited.label,'低');assert.equal(inherited.inherited,true);
  const explicit=executionModelReasoning(selected);assert.equal(explicit.label,'高');assert.equal(explicit.inherited,false);assert.equal(explicit.ordered,true);
  assert.equal(option.reasoningEffort,undefined,'preference application never mutates catalog input');
});

test('执行生成未设偏好显示后端最低强度而非对话默认，未知模式不伪造选中', () => {
  const [option]=executionModelOptions([model({reasoningEfforts:[{id:'high',label:'High'},{id:'low',label:'Low'}],defaultReasoningEffort:'high'})]);
  const inherited=executionModelReasoning(option);assert.equal(inherited.label,'低');assert.equal(inherited.inherited,true);assert.equal(option.reasoningEffort,undefined);
  for(const ids of [['high','auto'],['adaptive','low'],['HIGH','LOW'],['future','low'],[]]){
    const result=executionModelReasoning({...option,reasoningEfforts:ids.map(id=>({id,label:id}))});
    assert.equal(result.index,-1);assert.equal(result.label,'未设置');assert.equal(result.inherited,true);
  }
  const explicit=executionModelReasoning({...option,reasoningEfforts:[{id:'auto',label:'Auto'},{id:'high',label:'High'}],reasoningEffort:'auto'});
  assert.equal(explicit.label,'自动');assert.equal(explicit.inherited,false);assert.equal(explicit.ordered,false);
});

test('公共模型分组按准确账号区分同厂商来源，保留离线禁选和倍率', () => {
  const options=executionModelOptions([model({provider:'qoder',creditFactor:0.5}),model({provider:'qoder',accountId:'other',accountLabel:'Pro',available:false}),model({provider:'devin',accountId:'devin',accountLabel:'Devin account',modelId:'swe-2'})]);
  const groups=executionModelGroups(options);
  assert.deepEqual(groups.map(item=>[item.id,item.label]),[['account','Qoder · Qoder · Lite'],['other','Qoder · Pro'],['devin','Devin']]);
  assert.equal(groups[0].options[0].label,'Fast · 0.50x');assert.equal(groups[1].options[0].disabled,true);
  assert.notEqual(groups[0].options[0].value,groups[1].options[0].value);
});

test('记住的模型按账号和模型身份恢复，停用或已消失的选择不恢复', () => {
  const options = executionModelOptions([model({}), model({accountId: 'other', modelId: 'fast'})]);
  assert.equal(selectedExecutionModel(options, JSON.stringify(['other', 'fast']))?.accountId, 'other');
  assert.equal(selectedExecutionModel(options, JSON.stringify(['account', 'fast']))?.accountId, 'account');
  assert.equal(selectedExecutionModel(options, JSON.stringify(['account', 'gone'])), null);
  assert.equal(selectedExecutionModel(options, null), null);
  assert.equal(selectedExecutionModel(executionModelOptions([model({enabled: false})]), JSON.stringify(['account', 'fast'])), null);
});
