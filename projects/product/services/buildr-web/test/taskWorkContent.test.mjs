import assert from 'node:assert/strict';
import test from 'node:test';
import { taskDocuments, taskPathNodes, reviewRecords, verificationSummary, parentStage, taskDocumentLabel } from '../src/features/task/components/taskWorkContent.ts';
const record = { status: 'active', result: null };
const item = path => ({ path, exists: true, content: '正文' });
const source = { kind: 'ready', key: 'demo/change', provenance: 'task-worktree-candidate', change: { name: '说明', brief: item('brief.md'), artifacts: { proposal: item('proposal.md'), design: item('design.md'), tasks: item('tasks.md'), specs: [item('specs/behavior/spec.md')] } } };
test('已有材料直接归于其节点并保留工作树来源，缺文件不伪造材料', () => {
 const docs = taskDocuments([source, { kind: 'missing', key: 'broken', message: 'unavailable' }]);
 assert.deepEqual(docs.map(doc => doc.stage), ['requirements','design','design','design','implementation']);
 assert.ok(docs.every(doc => doc.provenance === 'task-worktree-candidate'));
 assert.equal(taskDocuments([{ ...source, change: { ...source.change, brief: { path: 'brief.md', exists: false } } }]).filter(doc => doc.stage === 'requirements').length, 0);
});
test('文件齐全和active状态不推断当前节点，修复可退回实现且清单不当完成率', () => {
 const documents = taskDocuments([source]);
 assert.ok(taskPathNodes(record, null, documents, null, null).every(node => !node.current));
 const repairing = taskPathNodes(record, { stage: 'implementation' }, documents, null, { slot: { report: { conclusion: { outcome: 'not-passed' } } } });
 assert.deepEqual(repairing.filter(node => node.current).map(node => node.stage), ['implementation']);
 assert.deepEqual(repairing.map(node => node.stage), ['requirements','design','implementation','closeout']);
 assert.ok(taskPathNodes({ ...record, status: 'completed' }, { stage: 'implementation' }, documents, null, null).every(node => !node.current));
});
test('四个节点不改变专业阶段，两类审查和验证及确认归到所属节点', () => {
 assert.deepEqual(taskPathNodes(record, null, [], null, null).map(node => node.stage), ['requirements','design','implementation','closeout']);
 for (const [stage, expected] of [['planning-review','design'], ['implementation-review','implementation'], ['verification','implementation'], ['acceptance','closeout']]) {
  assert.equal(parentStage(stage), expected);
  assert.equal(taskPathNodes(record, {stage}, [], null, null).find(node => node.current).stage, expected);
 }
});
test('同名需求用关联变更区分，单份材料不增加重复名称', () => {
 const docs = taskDocuments([source, {...source, key:'demo/other'}]);
 const briefs = docs.filter(item => item.stage === 'requirements');
 assert.deepEqual(briefs.map(item => taskDocumentLabel(item, briefs)), ['需求说明 · demo/change','需求说明 · demo/other']);
 assert.equal(taskDocumentLabel(briefs[0], [briefs[0]]), '需求说明');
});
test('审查历史保持追加顺序，验证只读取当前报告，不把意见当作通过', () => {
 const first={ result:{ subjectIdentity:'v1' }, resultDigest:'one', observedAt:'1' };
 const second={ result:{ subjectIdentity:'v2' }, resultDigest:'two', observedAt:'2' };
 assert.deepEqual(reviewRecords({ history:[first], ...second }), [first,second]);
 assert.equal(verificationSummary({ slot:{ report:{ conclusion:{ outcome:'passed' } },applicability:{ status:'stale' } } }), '最近通过 · 需重核');
 const nodes=taskPathNodes(record,{ attention:{kind:'acceptance',state:'resolved',response:{text:'请调整'}} },[],null,null);
 assert.equal(nodes.find(node=>node.stage==='closeout').current,false);
});
