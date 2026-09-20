import assert from 'node:assert/strict';
import test from 'node:test';
import { tabForPath, parseTabs, paneDimensions, readRatio, moveTab, ratioStorageKey, resourcePreview, previewOwnerPath, workspacePageSearch } from '../src/app/workspace-pages.ts';
test('恢复页签只接受当前工作空间已支持的路由并去重', () => {
 const valid={path:'/workspaces/a/skills',title:'技能'};
 const raw=JSON.stringify([valid,valid,{path:'/workspaces/b/skills'},{path:'https://example.com'},{path:'/workspaces/a/projects/%2e%2e'},{path:'/workspaces/a/services/p/s/edit'}]);
 assert.deepEqual(parseTabs('a',raw).map(t=>t.key),['dir:skills']);
 assert.deepEqual(parseTabs('a','invalid'),[]);
 assert.equal(tabForPath('a','/workspaces/a/settings'),null);
});

test('文章阅读编辑复用副屏身份，跨项目不混用，旧主标签恢复被清理', () => {
 const paths=['/workspaces/w/articles/shared','/workspaces/w/articles/product/shared','/workspaces/w/articles/other/shared','/workspaces/w/articles/product/shared/edit'];
 const [legacy,product,other,edit]=paths.map(path=>resourcePreview('w',path));
 assert.equal(legacy.id,product.id);
 assert.notEqual(product.id,other.id);
 assert.equal(product.id,edit.id);
 assert.equal(edit.edit,true);
 assert.equal(previewOwnerPath('w',edit),'/workspaces/w/articles');
 assert.equal(resourcePreview('w','/workspaces/w/articles/product/shared?view=source').view,'source');
 assert.equal(resourcePreview('w','/workspaces/w/articles/product/shared/unknown'),null);
 for(const path of paths)assert.equal(tabForPath('w',path),null);
 const restored=parseTabs('w',JSON.stringify([...paths.map(path=>({path})),{path:'/workspaces/w/projects/product',title:'产品'},{path:'/workspaces/w/knowledge/service/api'},{path:'/workspaces/w/services/product/api'}]));
 assert.deepEqual(restored.map(t=>t.key),['proj:product']);
});
test('服务知识保持同一服务副屏身份，直接地址回到服务目录',()=>{
 const service=resourcePreview('w','/workspaces/w/services/api');
 const knowledge=resourcePreview('w','/workspaces/w/knowledge/service/api?artifact=architecture&object=runtime');
 assert.equal(knowledge.kind,service.kind);assert.equal(knowledge.id,service.id);
 assert.deepEqual(knowledge.knowledge,{artifactId:'architecture',objectId:'runtime'});
 assert.equal(previewOwnerPath('w',knowledge),'/workspaces/w/services');
 assert.equal(resourcePreview('w','/workspaces/w/services/api?edit=1').edit,true);
 assert.equal(resourcePreview('w','/workspaces/w/services/product/api'),null);
});
test('副屏拒绝跨工作空间、错误层级与不安全身份',()=>{
 for(const path of ['/workspaces/other/articles/product/a','/workspaces/w/articles/%2e%2e/a','/workspaces/w/articles/product/a%2fb','/workspaces/w/articles/product/%00','/workspaces/w/articles/product/a/edit/extra','/workspaces/w/knowledge/repository/a','/workspaces/w/services/%2e%2e','/workspaces/w/skills/a/extra','https://example.com/workspaces/w/services/a'])assert.equal(resourcePreview('w',path),null,path);
});
test('默认分屏均分信息区并保留主内容限宽', () => {
 for (const width of [621, 700, 1000, 1216, 1832, 2336]) {
  const d = paneDimensions(width, null);
  assert.equal(d.right, width - 9 - d.right);
  assert.ok(d.right >= d.min && d.right <= d.max);
 }
 assert.equal(paneDimensions(2336, null).content, 1440);
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

test('项目详情与知识共享一个项目标签，恢复旧标签去重且保留检索上下文',()=>{
 const detail=tabForPath('w','/workspaces/w/projects/product');
 const knowledge=tabForPath('w','/workspaces/w/knowledge/project/product');
 assert.equal(detail.key,knowledge.key);
 const tabs=parseTabs('w',JSON.stringify([{path:knowledge.path,title:'Buildr 产品 · 知识',search:'?view=diagrams&q=订单'},{path:detail.path,title:'Buildr 产品'}]));
 assert.equal(tabs.length,1);assert.equal(tabs[0].title,'Buildr 产品');assert.equal(tabs[0].search,'?view=diagrams&q=订单');
});

test('旧每日演进跳转不会成为工作空间或项目标签的恢复目标', () => {
 const path='/workspaces/w/projects/product';
 const search='?document=daily&date=2026-09-19&group=person';
 assert.equal(workspacePageSearch('w',path,search),'');
 assert.equal(workspacePageSearch('w',path,search+'&q=kept'),'?q=kept');
 const restored=parseTabs('w',JSON.stringify([{path,title:'Buildr 产品',search}]));
 assert.equal(restored.length,1);
 assert.equal(restored[0].path,path);
 assert.equal(restored[0].search,'');
 for(const other of ['/workspaces/other/projects/product','/workspaces/w/knowledge/project/product','/workspaces/w/projects/product/edit']) {
  assert.equal(workspacePageSearch('w',other,search),search);
 }
 assert.equal(workspacePageSearch('w',path,'?document=readme&date=2026-09-19'),'?document=readme&date=2026-09-19');
});
