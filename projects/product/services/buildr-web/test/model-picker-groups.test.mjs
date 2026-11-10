import assert from 'node:assert/strict';
import test from 'node:test';
import {filterModelGroups} from '../src/lib/model-picker.ts';

const groups = [
  {id: 'native-qoder', label: 'Qoder', options: [{value: 'e', label: 'Qwen3.8-Max'}, {value: 'd', label: 'DeepSeek-Flash'}]},
  {id: 'native-codex', label: 'ChatGPT', options: [{value: 'a', label: 'GPT-6.1-Sol'}, {value: 'c', label: 'GPT-固件版本'}, {value: 'b', label: 'GPT-6-Astra'}]},
];
const labels = (result) => result.map(group => [group.label, group.options.map(option => option.label)]);

test('空查询按显示名称排序来源与组内模型，并返回独立副本', () => {
  const result = filterModelGroups(groups, '  ');
  assert.deepEqual(labels(result), [
    ['ChatGPT', ['GPT-6-Astra', 'GPT-6.1-Sol', 'GPT-固件版本']],
    ['Qoder', ['DeepSeek-Flash', 'Qwen3.8-Max']],
  ]);
  assert.notEqual(result[0], groups[0]);
  assert.notEqual(result[0].options, groups[0].options);
  assert.deepEqual(groups[0].options.map(option => option.label), ['Qwen3.8-Max', 'DeepSeek-Flash']);
});

test('按模型名称过滤，来源名匹配时保留整个来源', () => {
  assert.deepEqual(labels(filterModelGroups(groups, 'flash')), [['Qoder', ['DeepSeek-Flash']]]);
  assert.deepEqual(labels(filterModelGroups(groups, 'chatgpt')), [['ChatGPT', ['GPT-6-Astra', 'GPT-6.1-Sol', 'GPT-固件版本']]]);
  assert.deepEqual(labels(filterModelGroups(groups, 'GPT')).length, 1);
  assert.deepEqual(labels(filterModelGroups(groups, '不存在')), []);
});

test('同名忽略大小写保持稳定，数字按自然顺序比较', () => {
  const result = filterModelGroups([
    {id: 's', label: 'Source', options: [{value: '1', label: 'model-10'}, {value: '2', label: 'Model-2'}, {value: '3', label: 'model-2'}]},
  ], '');
  assert.deepEqual(result[0].options.map(option => option.value), ['2', '3', '1']);
});
