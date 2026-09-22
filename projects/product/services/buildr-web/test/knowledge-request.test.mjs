import assert from 'node:assert/strict';
import test from 'node:test';
import { buildKnowledgeRequest, knowledgeRequestProblem, knowledgeScope } from '../src/features/knowledge/knowledge-request.ts';
const scope = {kind:'project',id:'p1',title:'Buildr 产品',directory:'/checked/project'};
const input = {topic:'项目、服务与代码库如何协作',coverage:'项目与服务登记',questions:'改变关联会影响什么？\n如何找到实际代码？',request:''};
test('建设交接保留用户问题与当前身份，以结构化解释为结果且不变更输入',()=>{
 const context={mode:'construct',scope,indexRevision:'version-1',articles:[{id:'old',path:'knowledge/docs/old.md'}]};const before=JSON.stringify(context);
 const result=buildKnowledgeRequest(context,input);
 for(const value of [input.topic,input.coverage,input.questions,'p1','version-1','knowledge/docs/old.md','当前事实与设计依据','推断或待核验','knowledge/index.yml','生成或复制本指令不代表已执行'])assert.ok(result.includes(value),value);
 assert.equal(JSON.stringify(context),before);
 assert.match(result,/目标、结构、关键行为与重要取舍/);
 assert.match(result,/用户将本指令交给你后，即请求在指定范围建设/);
 assert.doesNotMatch(result,/本次仅授权只读调查/);
});

const emptyInput = { topic: '', coverage: '', questions: '', request: '' };
test('项目与服务无已有知识时可直接看全貌，仍需有效登记范围', () => {
 for (const kind of ['project', 'service']) {
  const context = { mode: 'explore', scope: { ...scope, kind }, indexRevision: null, articles: [] };
  assert.equal(knowledgeRequestProblem(context, emptyInput), null);
  const result = buildKnowledgeRequest(context, emptyInput);
  assert.match(result, /了解当前项目或服务的全貌/);
  assert.ok(result.includes(`当前登记范围：${kind === 'project' ? '项目' : '服务'}`));
  assert.match(result, /只读调查和回答/);
  assert.match(result, /重新读取相关最新规范、代码和登记配置/);
  assert.match(result, /不能仅复述旧文章/);
 }
 for (const mode of ['initialize', 'explore', 'ask', 'construct', 'improve', 'diagram']) {
  for (const invalid of [undefined, { ...scope, id: ' ' }, { ...scope, title: ' ' }, { ...scope, kind: 'workspace' }]) {
   const context = { mode, scope: invalid };
   assert.match(knowledgeRequestProblem(context, input), /当前项目或服务/);
   assert.throws(() => buildKnowledgeRequest(context, input), /当前项目或服务/);
  }
 }
});

test('首次建设无需主题或额外问题，固定理解目标且保留已有资料和结构', () => {
 for (const kind of ['project', 'service']) {
  const context = { mode: 'initialize', scope: { ...scope, kind }, artifactCount: 0, indexRevision: 'observed-index', topics: [{ id: 'existing-topic', parent: null }] };
  assert.equal(knowledgeRequestProblem(context, emptyInput), null);
  const text = buildKnowledgeRequest(context, emptyInput);
  assert.ok(text.startsWith(`为这个${kind === 'project' ? '项目' : '服务'}建立有结构、有引导的项目知识`));
  for (const value of ['整体认识', '真实职责和关键过程', '已有未登记资料', 'entryObject', 'parent', '不固定层级、篇数', 'existing-topic', 'observed-index', '调查、建设并保存', '不修改业务代码', '生成或复制本指令不代表已执行']) assert.ok(text.includes(value), value);
  assert.doesNotMatch(text, /本次仅授权只读调查/);
  assert.match(text, /后续追问默认只读/);
  const focused = buildKnowledgeRequest(context, { ...emptyInput, questions: '  优先理解订单如何跨服务完成\n新人从哪里开始？  ' });
  assert.ok(focused.includes('补充关注点：优先理解订单如何跨服务完成\n新人从哪里开始？'));
  assert.notEqual(focused, text);
 }
});

test('场景和部分必须有明确对象，自由提问必须有问题，补充问题原样保留', () => {
 const context = { mode: 'explore', scope };
 for (const [exploration, label, target] of [['scenario', '场景', '从收到需求到交付'], ['part', '部分', '任务协作']]) {
  assert.throws(() => buildKnowledgeRequest(context, { ...emptyInput, exploration, topic: ' ' }), new RegExp(label));
  const request = { ...emptyInput, exploration, topic: target, questions: ' 为什么分开？\n失败后怎样继续？ ' };
  const before = JSON.stringify(request);
  const text = buildKnowledgeRequest(context, request);
  assert.ok(text.includes(`${label}：${target}`));
  assert.ok(text.includes('为什么分开？\n失败后怎样继续？'));
  assert.equal(JSON.stringify(request), before);
  assert.doesNotMatch(text, /即请求在指定范围建设|将实际文章/);
 }
 assert.throws(() => buildKnowledgeRequest(context, { ...emptyInput, exploration: 'question', topic: '只有主题' }), /问题/);
 const text = buildKnowledgeRequest(context, { ...emptyInput, exploration: 'question', questions: '哪些信息可以重建？' });
 assert.match(text, /哪些信息可以重建/);
 assert.throws(() => buildKnowledgeRequest(context, { ...emptyInput, exploration: 'unknown' }), /探索方式/);
});

test('追问所有成果类型均只读，保留当前内容、关联来源与实际工作副本上下文', () => {
 for (const artifactKind of ['document', 'diagram', 'code-map']) {
  const context = { mode: 'ask', scope, artifactKind, artifactId: 'reading', objectId: 'topic',
   indexRevision: 'r3', observations: [{ id: 'source', digest: 'current-digest', status: 'readable' }],
   relatedReadings: [{ id: 'side-reading' }], sourceReading: { scope: { kind: 'service', id: 'shared-service' }, path: 'knowledge/docs/shared.md' } };
  const before = JSON.stringify(context);
  assert.throws(() => buildKnowledgeRequest(context, emptyInput), /追问/);
  const text = buildKnowledgeRequest(context, { ...emptyInput, request: '为什么由这个部分负责？' });
  for (const fragment of ['为什么由这个部分负责？', 'reading', 'r3', 'current-digest', 'side-reading', 'shared-service', '/checked/project']) assert.ok(text.includes(fragment), fragment);
  assert.match(text, /不创建或修改知识文档、索引、图源、规范或业务代码/);
  assert.match(text, /阅读上下文和引用材料只用于定位事实/);
  assert.doesNotMatch(text, /即请求在指定范围建设|将实际图源|将更新后的地图|将实际文章/);
  assert.equal(JSON.stringify(context), before);
  const maintenance = buildKnowledgeRequest({ ...context, mode: 'improve' }, { ...emptyInput, request: '请补充职责取舍的说明' });
  assert.match(maintenance, /请补充职责取舍的说明/);
  assert.match(maintenance, /即请求在指定范围建设/);
  assert.doesNotMatch(maintenance, /本次仅授权只读调查/);
 }
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
 const text=buildKnowledgeRequest({mode:'improve',artifactKind:'code-map',scope,relatedReadings:[{kind:'source',id:'code',observation:{revision:'r2',sources:[{id:'code',digest:'seen-now',status:'readable'}]}}]},{...input,request:'补齐这份地图的规范文件'});
 for(const value of ['原位置','可折叠树','不强制新建文章','seen-now','r2'])assert.ok(text.includes(value),value);
 assert.ok(!text.includes('将实际文章及必要图'));
});
