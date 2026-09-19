import assert from 'node:assert/strict';
import test from 'node:test';
import {knowledgeEntries,knowledgeCategory} from '../src/features/knowledge/knowledge-catalog.ts';
const index={objects:[{id:'topic',title:'订单',summary:'提交请求和职责'}],artifacts:[{id:'doc',kind:'document',title:'订单架构',path:'knowledge/orders.md',objects:['topic']},{id:'graph',kind:'diagram',title:'请求时序',path:'knowledge/ORDER-flow.html',objects:['topic']},{id:'map',kind:'code-map',title:'实现组织',path:'knowledge/code-map/orders.md',objects:['topic']}]};
test('三类目录仅检索自己的实际成果，支持关键词交集、大小写和路径',()=>{
 assert.deepEqual(knowledgeEntries(index,'documents','订单 请求').map(a=>a.id),['doc']);
 assert.deepEqual(knowledgeEntries(index,'diagrams','order FLOW').map(a=>a.id),['graph']);
 assert.deepEqual(knowledgeEntries(index,'maps','code-map').map(a=>a.id),['map']);
 assert.equal(knowledgeEntries(index,'diagrams','不存在').length,0);
 assert.equal(knowledgeEntries(null,'documents','').length,0);
 assert.equal(knowledgeCategory('unknown'),'documents');
});
