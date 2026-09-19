import assert from 'node:assert/strict';
import test from 'node:test';
import { buildKnowledgeRequest, knowledgeScope } from '../src/features/knowledge/knowledge-request.ts';
const scope = {kind:'project',id:'p1',title:'Buildr 产品',directory:'/checked/project'};
const input = {topic:'项目、服务与代码库如何协作',coverage:'项目与服务登记',questions:'改变关联会影响什么？\n如何找到实际代码？',request:''};
test('建设交接保留用户问题与当前身份，以实际文章为结果且不变更输入',()=>{
 const context={mode:'construct',scope,indexRevision:'version-1',articles:[{id:'old',path:'knowledge/docs/old.md'}]};const before=JSON.stringify(context);
 const result=buildKnowledgeRequest(context,input);
 for(const value of [input.topic,input.coverage,input.questions,'p1','version-1','knowledge/docs/old.md','当前事实与设计依据','推断或待核验','knowledge/index.yml','生成或复制本指令不代表已执行'])assert.ok(result.includes(value),value);
 assert.equal(JSON.stringify(context),before);
});
test('空白主题或未解析范围不能生成建设指令，关注范围可沿用当前服务',()=>{
 assert.throws(()=>buildKnowledgeRequest({mode:'construct',scope},{...input,topic:'  '}),/主题/);
 assert.throws(()=>buildKnowledgeRequest({mode:'construct'},input),/当前项目或服务/);
 assert.equal(knowledgeScope({scope:{...scope,kind:'workspace'}}),null);
 const text=buildKnowledgeRequest({mode:'construct',scope:{...scope,kind:'service',title:'订单服务'}},{...input,coverage:'',questions:''});
 assert.ok(text.includes('关注范围：订单服务'));assert.ok(text.includes('当前登记范围：服务'));
});
test('完善交接保留原文身份与源版本，要求复用已有正文',()=>{
 const text=buildKnowledgeRequest({mode:'improve',scope,objectId:'topic',selectedSource:'code',observations:[{id:'code',digest:'sha-1'}]},{...input,request:'这里没有说明删除服务的影响'});
 for(const part of ['这里没有说明删除服务的影响','优先修改既有唯一正文','topic','sha-1','范围外新主题'])assert.ok(text.includes(part));
 assert.throws(()=>buildKnowledgeRequest({scope},{...input,request:'  '}),/完善/);
});

test('独立技术图交接以图源和展示为结果，不强制创建文章',()=>{
 const text=buildKnowledgeRequest({mode:'diagram',scope},{...input,topic:'订单请求时序'});
 for(const phrase of ['订单请求时序','图源、可查看图示和事实依据','不强制新建架构文章','不为凑文章创建空正文'])assert.ok(text.includes(phrase));
 assert.throws(()=>buildKnowledgeRequest({mode:'diagram',scope},{...input,topic:' '}),/主题/);
});

test('完善地图保留已打开文件观察，不强制新建架构文章',()=>{
 const text=buildKnowledgeRequest({mode:'improve',artifactKind:'code-map',scope,relatedReadings:[{kind:'source',id:'code',observation:{revision:'r2',sources:[{id:'code',digest:'seen-now',status:'aligned'}]}}]},{...input,request:'补齐这份地图的规范文件'});
 for(const value of ['原位置','可折叠树','不强制新建文章','seen-now','r2'])assert.ok(text.includes(value),value);
 assert.ok(!text.includes('将实际文章及必要图'));
});
