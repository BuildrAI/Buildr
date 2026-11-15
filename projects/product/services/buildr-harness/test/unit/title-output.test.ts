import assert from 'node:assert/strict';
import test from 'node:test';
import { parseTitleJsonObject } from '../../src/executors/title-output.ts';

test('clean JSON objects parse unchanged', () => {
  assert.deepEqual(parseTitleJsonObject('{"title":"供应商入驻审核"}'), {title: '供应商入驻审核'});
  assert.deepEqual(parseTitleJsonObject('  {"summary":"交接摘要"}\n'), {summary: '交接摘要'});
});

test('Markdown fences with or without a language tag are tolerated', () => {
  assert.deepEqual(parseTitleJsonObject('```json\n{"title":"围栏标题"}\n```'), {title: '围栏标题'});
  assert.deepEqual(parseTitleJsonObject('```\n{"title":"无标签围栏"}\n```'), {title: '无标签围栏'});
  assert.deepEqual(parseTitleJsonObject('好的，标题如下：\n```json\n{"title":"带说明的围栏"}\n```\n以上。'), {title: '带说明的围栏'});
});

test('surrounding prose yields the first balanced JSON object', () => {
  assert.deepEqual(parseTitleJsonObject('标题是 {"title":" prose 包裹 "} 请查收'), {title: ' prose 包裹 '});
  assert.deepEqual(parseTitleJsonObject('{"title":"含}花括号\\"引号"} 后缀'), {title: '含}花括号"引号'});
  assert.deepEqual(parseTitleJsonObject('前言 {"title":"外层","nested":{"a":1}} 后记'), {title: '外层', nested: {a: 1}});
});

test('non-object, malformed or missing content stays rejected', () => {
  assert.equal(parseTitleJsonObject('not JSON'), undefined);
  assert.equal(parseTitleJsonObject(''), undefined);
  assert.equal(parseTitleJsonObject('["title"]'), undefined);
  assert.equal(parseTitleJsonObject('"标题字符串"'), undefined);
  assert.equal(parseTitleJsonObject('null'), undefined);
  assert.equal(parseTitleJsonObject('{"title":"未闭合"'), undefined);
  assert.equal(parseTitleJsonObject('```json\n{\"title\":\"坏围栏\"'), undefined);
});
