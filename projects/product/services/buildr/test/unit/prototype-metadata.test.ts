import assert from 'node:assert/strict';
import test from 'node:test';
import { readPrototypeMetadata } from '../../src/modules/openspec/application/prototype-metadata.ts';
const wrap=(value:unknown)=>`<script id="buildr-prototype" type="application/json">${JSON.stringify(value)}</script>`;
const valid={version:1,pages:[{id:'home',title:'首页',notes:[{id:'one',title:'说明',text:'<img src=x onerror=alert(1)>',position:'main'}],states:[{id:'empty',title:'空白',notes:[]}]}]};
test('旧原型缺少元信息仍可阅读；说明保留为纯文本',()=>{assert.deepEqual(readPrototypeMetadata('<html></html>'),{});assert.deepEqual(readPrototypeMetadata(wrap(valid)).metadata,valid);});
test('拒绝未知版本、重复标识、超限与可执行数据块，保持局部诊断',()=>{
 for(const value of [{...valid,version:2},{...valid,pages:[valid.pages[0],valid.pages[0]]},{...valid,pages:[{...valid.pages[0],id:'../escape'}]},{...valid,pages:[{...valid.pages[0],notes:[{id:'x',title:'x',text:'x'.repeat(4001)}]}]}, {version:1,pages:[]}])assert.ok(readPrototypeMetadata(wrap(value)).error);
 assert.ok(readPrototypeMetadata(wrap(valid).replace('application/json','text/javascript')).error);
 assert.ok(readPrototypeMetadata(wrap(valid)+wrap(valid)).error);
 assert.ok(readPrototypeMetadata('<script id="buildr-prototype" type="application/json">'+ ' '.repeat(65537)+'</script>').error);
 assert.ok(readPrototypeMetadata('<script id="buildr-prototype" type="application/json">{</script>').error);
});
