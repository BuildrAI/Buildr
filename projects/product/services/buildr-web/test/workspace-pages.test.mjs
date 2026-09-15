import assert from 'node:assert/strict';
import test from 'node:test';
import { tabForPath, parseTabs, paneDimensions, readRatio, moveTab, ratioStorageKey } from '../src/app/workspace-pages.ts';
test('恢复页签只接受当前工作空间已支持的路由并去重', () => {
 const valid={path:'/workspaces/a/skills',title:'技能'};
 const raw=JSON.stringify([valid,valid,{path:'/workspaces/b/skills'},{path:'https://example.com'},{path:'/workspaces/a/projects/%2e%2e'},{path:'/workspaces/a/services/p/s/edit'}]);
 assert.deepEqual(parseTabs('a',raw).map(t=>t.key),['dir:skills']);
 assert.deepEqual(parseTabs('a','invalid'),[]);
 assert.equal(tabForPath('a','/workspaces/a/settings').title,'设置');
});
test('初始主宽自适应且分屏优先使用留白', () => {
 for(const width of [1832,2336]){const d=paneDimensions(width,null);assert.ok(width-d.right-9>=d.content);}
 assert.equal(paneDimensions(2336,null).content,1440);
 const d=paneDimensions(1216,null);assert.ok(d.right>=280);assert.ok(1216-d.right-9>=360);
});
test('比例按工作空间隔离且窗口裁剪不改变保存值', () => {
 assert.notEqual(ratioStorageKey('a'),ratioStorageKey('b'));
 for(const value of [null,'NaN','Infinity','0','1','-1','2'])assert.equal(readRatio(value),null);
 const ratio=readRatio('.55');paneDimensions(1000,ratio);assert.equal(paneDimensions(2000,ratio).right,1100);
});
test('标签移动保留身份与集合，支持向前向后和边界', () => {
 const tabs=[{key:'a'},{key:'b'},{key:'c'}];
 assert.deepEqual(moveTab(tabs,'c',0).map(t=>t.key),['c','a','b']);
 assert.deepEqual(moveTab(tabs,'a',99).map(t=>t.key),['b','c','a']);
 assert.deepEqual(tabs.map(t=>t.key),['a','b','c']);
});
