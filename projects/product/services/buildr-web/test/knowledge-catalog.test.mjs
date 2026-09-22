import assert from 'node:assert/strict';
import test from 'node:test';
import { appendKnowledgeCatalogPage, knowledgeCatalogPrefetchId, knowledgeCategory } from '../src/features/knowledge/knowledge-catalog.ts';

const items = (start, count) => Array.from({ length: count }, (_, index) => ({
  id: `article-${start + index}`, title: `文章 ${start + index}`, kind: 'document',
  path: `knowledge/article-${start + index}.md`, objects: ['topic'], summary: '主题说明',
}));
const page = (start, count, patch = {}) => ({
  scope: { kind: 'project', id: 'demo' }, revision: 'revision-a', view: 'documents', query: '',
  items: items(start, count), matchingCount: 65, pageSize: 20, hasMore: start + count < 65,
  nextCursor: start + count < 65 ? `cursor-${start + count}` : null, diagnostics: [], ...patch,
});

test('分类保持既有默认，预取位置为每批的第15项且最后一页不再触发', () => {
  assert.equal(knowledgeCategory('unknown'), 'documents');
  assert.equal(knowledgeCategory('diagrams'), 'diagrams');
  assert.equal(knowledgeCategory('maps'), 'maps');
  for (const count of [20, 40, 60]) {
    assert.equal(knowledgeCatalogPrefetchId(items(0, count), true), `article-${count - 6}`);
  }
  assert.equal(knowledgeCatalogPrefetchId(items(0, 14), true), undefined);
  assert.equal(knowledgeCatalogPrefetchId(items(0, 65), false), undefined);
});

test('续页保持已有顺序和对象，并按身份去重而不改写旧页', () => {
  const first = page(0, 20);
  const next = page(19, 20);
  const snapshot = structuredClone(first);
  const combined = appendKnowledgeCatalogPage(first, next);
  assert.equal(combined.items.length, 39);
  assert.deepEqual(combined.items.map(item => item.id), items(0, 39).map(item => item.id));
  assert.equal(combined.items[19], first.items[19]);
  assert.equal(combined.nextCursor, next.nextCursor);
  assert.deepEqual(first, snapshot);
  const repeated = appendKnowledgeCatalogPage(first, page(20, 2, { items: [items(20, 1)[0], items(20, 1)[0]] }));
  assert.equal(repeated.items.length, 21);
});

test('分类、查询、范围、页大小或索引变化时保留已读页，拒绝混接版本', () => {
  const current = page(0, 20);
  const snapshot = structuredClone(current);
  for (const patch of [
    { revision: 'revision-b' }, { view: 'diagrams' }, { query: 'other' },
    { scope: { kind: 'service', id: 'demo' } }, { scope: { kind: 'project', id: 'other' } }, { pageSize: 10 },
  ]) {
    assert.throws(() => appendKnowledgeCatalogPage(current, page(20, 20, patch)), { code: 'knowledge_catalog_changed' });
  }
  assert.deepEqual(current, snapshot);
});

test('完整续页保留65项，末页五项清除后续游标', () => {
  const combined = [page(20, 20), page(40, 20), page(60, 5)]
    .reduce(appendKnowledgeCatalogPage, page(0, 20));
  assert.equal(combined.items.length, 65);
  assert.equal(combined.matchingCount, 65);
  assert.equal(combined.hasMore, false);
  assert.equal(combined.nextCursor, null);
});
