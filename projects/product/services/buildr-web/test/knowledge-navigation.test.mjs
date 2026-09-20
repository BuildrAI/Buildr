import assert from 'node:assert/strict';
import test from 'node:test';
import {resolveKnowledgePath,selectedKnowledgeObject,knowledgeArtifactTarget} from '../src/features/knowledge/knowledge-navigation.ts';
import {tabForPath} from '../src/app/workspace-pages.ts';
test('文中路径回到唯一成果位置，拒绝范围外和外部协议',()=>{
 assert.equal(resolveKnowledgePath('knowledge/docs/architecture/topic.md','../../code-map/topic.md'),'knowledge/code-map/topic.md');
 assert.equal(resolveKnowledgePath('knowledge/docs/topic.md','../code-map/topic.md#part'),'knowledge/code-map/topic.md');
 for(const href of ['../../../outside.md','https://example.com','/tmp/a.md','%2fetc/passwd','javascript:alert(1)','..\\secret']) assert.equal(resolveKnowledgePath('knowledge/a.md',href),null,href);
});
test('图示消息只接受当前隔离框架的已关联对象',()=>{
 const frame={},valid={source:frame,origin:'null',data:{type:'buildr.knowledge.select',objectId:'object'}};
 assert.equal(selectedKnowledgeObject(valid,frame,['object']),'object');
 for(const patch of [{source:{}},{origin:'https://evil.test'},{data:{type:'buildr.knowledge.select',objectId:'other'}},{data:{type:'navigate',objectId:'object'}},{data:null}])assert.equal(selectedKnowledgeObject({...valid,...patch},frame,['object']),null);
 assert.equal(selectedKnowledgeObject(valid,null,['object']),null);
});
test('知识路由仅接受当前工作空间的项目或服务范围',()=>{
 assert.equal(tabForPath('w','/workspaces/w/knowledge/project/product').key,'proj:product');
 assert.equal(tabForPath('w','/workspaces/w/knowledge/service/api'),null);
 for(const path of ['/workspaces/x/knowledge/project/product','/workspaces/w/knowledge/repository/a','/workspaces/w/knowledge/project/%2e%2e'])assert.equal(tabForPath('w',path),null);
});

test('跨文章引用进入目标主题，保留其内嵌成果，不带入原主题',()=>{
 assert.deepEqual(knowledgeArtifactTarget({id:'article',kind:'document',objects:['other']},'current'),{object:'other'});
 assert.deepEqual(knowledgeArtifactTarget({id:'map',kind:'code-map',objects:['current']},'current'),{object:'current',artifact:'map'});
 assert.deepEqual(knowledgeArtifactTarget({id:'shared',kind:'document',objects:['a','b']},null),{object:undefined,artifact:'shared'});
});
