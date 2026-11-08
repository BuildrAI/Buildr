import assert from 'node:assert/strict';
import test from 'node:test';
import {filterModelGroups} from '../src/lib/model-picker.ts';

const groups = [
  {id: 'native-codex', label: 'ChatGPT', options: [{value: 'a', label: 'GPT-6.1-Sol'}, {value: 'b', label: 'GPT-6-Astra'}, {value: 'c', label: 'GPT-固件版本'}]},
  {id: 'native-qoder', label: 'Qoder', options: [{value: 'd', label: 'DeepSeek-Flash'}, {value: 'e', label: 'Qwen3.8-Max'}]},
];
const labels = (result) => result.map(group => [group.label, group.options.map(option => option.label)]);

test('空查询保留所有来源与顺序，并返回独立副本', () => {
  const result = filterModelGroups(groups, '  ');
  assert.deepEqual(labels(result), labels(groups));
  assert.notEqual(result[0], groups[0]);
  assert.notEqual(result[0].options, groups[0].options);
});

test('按模型名称过滤，来源名匹配时保留整个来源', () => {
  assert.deepEqual(labels(filterModelGroups(groups, 'flash')), [['Qoder', ['DeepSeek-Flash']]]);
  assert.deepEqual(labels(filterModelGroups(groups, 'chatgpt')), [['ChatGPT', ['GPT-6.1-Sol', 'GPT-6-Astra', 'GPT-固件版本']]]);
  assert.deepEqual(labels(filterModelGroups(groups, 'GPT')).length, 1);
  assert.deepEqual(labels(filterModelGroups(groups, '不存在')), []);
});
