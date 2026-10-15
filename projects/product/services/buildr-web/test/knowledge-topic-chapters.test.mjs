import assert from 'node:assert/strict';
import test from 'node:test';
import { scrollKnowledgeTopicChapter } from '../src/features/knowledge/useKnowledgeTopicChapters.ts';

const fixture = ({ ids = ['first', 'second'], scrollTop = 80, stickyHeight = 44, containerTop = 50 } = {}) => {
  const calls = [];
  const host = { scrollTop, getBoundingClientRect: () => ({ top: containerTop }), scrollTo: value => calls.push(value) };
  const chapters = ids.map((id, position) => ({ dataset: { knowledgeChapter: id }, getBoundingClientRect: () => ({ top: 100 + position * 500 }) }));
  return { calls, root: { querySelectorAll: () => chapters, querySelector: () => stickyHeight ? { offsetHeight: stickyHeight } : null, closest: () => host } };
};

test('章节定位使用当前阅读根和已有滚动容器，并避开固定导航', () => {
  const main = fixture(), side = fixture({ scrollTop: 120, stickyHeight: 0 });
  assert.equal(scrollKnowledgeTopicChapter(main.root, 'second'), true);
  assert.deepEqual(main.calls, [{ top: 574 }]);
  assert.deepEqual(side.calls, [], '主副屏同文并存时不滚动另一个阅读面');
  assert.equal(scrollKnowledgeTopicChapter(side.root, 'second'), true);
  assert.deepEqual(side.calls, [{ top: 658 }]);
});

test('不在当前主题中的章节不滚动，容器缺失也不影响其他导航', () => {
  const { root, calls } = fixture();
  assert.equal(scrollKnowledgeTopicChapter(root, 'other-topic'), false);
  assert.deepEqual(calls, []);
  assert.equal(scrollKnowledgeTopicChapter({ ...root, closest: () => null }, 'first'), false);
});

test('章节标识按原始身份比较，不作为选择器插值；靠近顶部不会产生负滚动位置', () => {
  const id = 'a" unusual ] identity';
  const { root, calls } = fixture({ ids: [id], scrollTop: 0, containerTop: 200 });
  assert.equal(scrollKnowledgeTopicChapter(root, id), true);
  assert.deepEqual(calls, [{ top: 0 }]);
});
