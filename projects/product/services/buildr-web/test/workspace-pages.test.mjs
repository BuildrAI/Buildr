import assert from 'node:assert/strict';
import test from 'node:test';
import { tabForPath, defaultTabForArea, defaultTabForPath, parseTabs, paneDimensions, readRatio, moveTab, reorderPageTabs, ratioStorageKey, resourcePreview, previewOwnerPath, previewOwnerSearch, workspacePageLayout } from '../src/app/workspace-pages.ts';

test('连接查询、代码工具和工作台概览铺满功能面板，文档与跨工作空间路径保持阅读宽度', () => {
 for (const path of ['/connection-skills', '/connections', '/code/explorer', '/code/source-control', '/overview']) assert.equal(workspacePageLayout('w', '/workspaces/w' + path), 'functional');
 for (const path of ['/projects/product', '/articles', '/services', '/tasks']) assert.equal(workspacePageLayout('w', '/workspaces/w' + path), 'reading');
 assert.equal(workspacePageLayout('w', '/workspaces/other/connections'), 'reading');
 assert.equal(workspacePageLayout('w', '/workspaces/w/connections/unknown'), 'reading');
});

test('三个入口各有默认页签，关闭全部页签时按当前入口兜底', () => {
 assert.deepEqual(tabForPath('w', '/workspaces/w/overview'), { key: 'dir:overview', kind: 'dir', title: '概览', path: '/workspaces/w/overview' });
 assert.equal(defaultTabForArea('w', 'workbench').key, 'dir:overview');
 assert.equal(defaultTabForArea('w', 'workspace').key, 'dir:workspace-overview');
 assert.equal(defaultTabForArea('w', 'code').key, 'dir:code:source-control');
 assert.equal(defaultTabForPath('w', '/workspaces/w/tasks').key, 'dir:overview');
 assert.equal(defaultTabForPath('w', '/workspaces/w/projects').key, 'dir:workspace-overview');
 assert.equal(defaultTabForPath('w', '/workspaces/w/code/explorer').key, 'dir:code:source-control');
});

test('共享页签恢复到工作台概览与代码页', () => {
 assert.deepEqual(parseTabs('w', JSON.stringify([
  { path: '/workspaces/w/overview' },
  { path: '/workspaces/w/code/explorer' },
  { path: '/workspaces/w/code/source-control' },
 ])).map(tab => tab.key), ['dir:overview', 'dir:code:explorer', 'dir:code:source-control']);
});
test('恢复页签只接受当前工作空间已支持的路由并去重', () => {
 const valid={path:'/workspaces/a/skills',title:'技能'};
 const raw=JSON.stringify([valid,valid,{path:'/workspaces/b/skills'},{path:'https://example.com'},{path:'/workspaces/a/projects/%2e%2e'},{path:'/workspaces/a/services/p/s/edit'}]);
 assert.deepEqual(parseTabs('a',raw).map(t=>t.key),['dir:skills']);
 assert.deepEqual(parseTabs('a','invalid'),[]);
 assert.equal(tabForPath('a','/workspaces/a/settings'),null);
});

test('历史连接标签归一到现行目录并去重，其他工作空间和错误子路径不恢复', () => {
 const current = { key: 'dir:connection-skills', kind: 'dir', title: '连接', path: '/workspaces/w/connection-skills' };
 const legacy = { path: '/workspaces/w/connections', title: '连接' };
 const recent = { path: current.path, title: '连接（新机制）' };
 for (const saved of [[legacy, recent], [recent, legacy], [legacy], [recent]]) {
  assert.deepEqual(parseTabs('w', JSON.stringify(saved)), [current]);
 }
 assert.deepEqual(parseTabs('w', JSON.stringify([
  { path: '/workspaces/other/connections' },
  { path: '/workspaces/w/connections/unknown' },
  { path: '/workspaces/w/connection-skills/unknown' },
 ])), []);
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
test('任务详情复用资源副屏，任务列表保持主屏，旧详情深链能恢复列表筛选', () => {
 const task=resourcePreview('w','/workspaces/w/tasks/fix-save-conflict');
 assert.deepEqual(task,{kind:'task',id:'fix-save-conflict',title:'普通任务',path:'/workspaces/w/tasks/fix-save-conflict'});
 assert.equal(previewOwnerPath('w',task),'/workspaces/w/tasks');
 assert.equal(tabForPath('w',task.path),null);
 assert.equal(tabForPath('w','/workspaces/w/tasks').key,'dir:tasks');
 assert.equal(previewOwnerSearch('w',task,{from:'/workspaces/w/tasks?status=active&project=product&group=project'}),'?status=active&project=product&group=project');
 for(const from of ['/workspaces/other/tasks?status=all','/workspaces/w/overview?q=kept','//example.com/workspaces/w/tasks?q=kept','/workspaces/w/tasks/../services?q=kept','https://example.com/workspaces/w/tasks?q=kept'])assert.equal(previewOwnerSearch('w',task,{from}),'');
 assert.equal(previewOwnerSearch('w',task,null),'');
 for(const path of ['/workspaces/w/tasks/id/changes/product/change','/workspaces/w/tasks/%2e%2e','/workspaces/w/tasks/a%2fb','/workspaces/w/tasks/%00'])assert.equal(resourcePreview('w',path),null,path);
});
test('副屏拒绝跨工作空间、错误层级与不安全身份',()=>{
 for(const path of ['/workspaces/other/articles/product/a','/workspaces/w/articles/%2e%2e/a','/workspaces/w/articles/product/a%2fb','/workspaces/w/articles/product/%00','/workspaces/w/articles/product/a/edit/extra','/workspaces/w/knowledge/repository/a','/workspaces/w/services/%2e%2e','/workspaces/w/skills/a/extra','https://example.com/workspaces/w/services/a'])assert.equal(resourcePreview('w',path),null,path);
});
test('默认分屏副屏占优并为左组保留可读宽度', () => {
 for (const width of [621, 700, 1000, 1216, 1832, 2336]) {
  const d = paneDimensions(width, null);
  assert.ok(d.right >= d.min && d.right <= d.max);
  assert.ok(d.right >= width - 9 - d.right, `副屏不小于主区: width=${width}`);
  assert.ok(width - 9 - d.right >= 300, `左组保留可浏览宽度: width=${width}`);
 }
 assert.equal(paneDimensions(1500, null).right, 975);
 assert.equal(paneDimensions(1000, null).right, 631);
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

test('页面、目录和代码页签使用同一可见重排索引，代码文件仍留在页内', () => {
 const tabs=[{key:'dir:projects',kind:'dir'},{key:'a',kind:'proj'},{key:'dir:code:explorer',kind:'dir'},{key:'dir:services',kind:'dir'},{key:'b',kind:'proj'}];
 assert.deepEqual(reorderPageTabs(tabs,'a',1).map(tab=>tab.key),['dir:projects','a','dir:code:explorer','dir:services','b']);
 assert.deepEqual(reorderPageTabs(tabs,'dir:code:explorer',0).map(tab=>tab.key),['dir:code:explorer','dir:projects','a','dir:services','b']);
 assert.deepEqual(reorderPageTabs(tabs,'b',0).map(tab=>tab.key),['b','dir:projects','a','dir:code:explorer','dir:services']);
 assert.deepEqual(tabs.map(tab=>tab.key),['dir:projects','a','dir:code:explorer','dir:services','b']);
});

test('项目详情与知识共享一个项目标签，恢复旧标签去重且保留检索上下文',()=>{
 const detail=tabForPath('w','/workspaces/w/projects/product');
 const knowledge=tabForPath('w','/workspaces/w/knowledge/project/product');
 assert.equal(detail.key,knowledge.key);
 const tabs=parseTabs('w',JSON.stringify([{path:knowledge.path,title:'Buildr 产品 · 知识',search:'?view=diagrams&q=订单'},{path:detail.path,title:'Buildr 产品'}]));
 assert.equal(tabs.length,1);assert.equal(tabs[0].title,'Buildr 产品');assert.equal(tabs[0].search,'?view=diagrams&q=订单');
});

test('组合任务与普通任务副屏身份独立，文档路径限制在相对范围',()=>{
 const ordinary=resourcePreview('w','/workspaces/w/tasks/child');
 const composite=resourcePreview('w','/workspaces/w/tasks/parent?taskType=composite');
 assert.equal(ordinary.kind,'task'); assert.equal(composite.kind,'composite-task');
 assert.equal(previewOwnerPath('w',composite),'/workspaces/w/tasks');
 const doc=resourcePreview('w','/workspaces/w/tasks/parent/document?project=product&file=docs%2Fplan.md');
 assert.equal(doc.kind,'task-document'); assert.equal(doc.file,'docs/plan.md');
 for(const file of ['../secret.md','/secret.md','a/../../secret.md','a\\b.md']) assert.equal(resourcePreview('w',`/workspaces/w/tasks/parent/document?project=product&file=${encodeURIComponent(file)}`),null);
});

test('工作树文章深链接在副屏保留来源，编辑入口指向来源任务稿件', () => {
  const a = resourcePreview('w', '/workspaces/w/articles/product/same?task=first&view=source');
  const b = resourcePreview('w', '/workspaces/w/articles/product/same?task=second');
  assert.equal(a.sourceTaskId, 'first');
  assert.equal(a.view, 'source');
  assert.notEqual(a.id, b.id);
  const editing = resourcePreview('w', '/workspaces/w/articles/product/same/edit?task=first');
  assert.equal(editing.edit, true);
  assert.equal(editing.sourceTaskId, 'first');
  assert.equal(resourcePreview('w', '/workspaces/w/articles/product/same?task=../escape'), null);
});
