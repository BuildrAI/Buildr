import assert from 'node:assert/strict';
import test from 'node:test';
import { articleResourceKey, assetMarkdown, buildWritingRequest, insertMarkdown, publicationAssetPath, publicationAssetUrl, referencedAssets, selectPublications } from '../src/features/publication/publication-model.ts';

const publication = (projectCode, id, title, summary, updatedAt, status = 'draft') => ({ projectCode, id, title, summary, updatedAt, status, projectName: projectCode, revision: 'r1', sourcePath: `${id}.md`, kind: 'article', publishedAt: null, targets: [] });

test('跨项目同名标识在收藏与筛选中隔离，旧 Product 收藏保持兼容', () => {
  const a = publication('product', 'same', '产品说明', '工作空间实践', '2026-09-18');
  const b = publication('practice', 'same', '另一个实践', '阅读经验', '2026-09-20');
  const filters = { query: '', project: '', status: '', sort: 'updated', saved: true };
  assert.equal(articleResourceKey(a), 'article:same');
  assert.equal(articleResourceKey(b), 'article:practice:same');
  assert.deepEqual(selectPublications([a, b], filters, key => key === 'article:practice:same'), [b]);
  assert.deepEqual(selectPublications([a, b], { ...filters, saved: false, query: '工作空间' }, () => false), [a]);
  assert.deepEqual(selectPublications([a, b], { ...filters, saved: false, project: 'practice', status: 'published' }, () => false), []);
  assert.deepEqual(selectPublications([a, b], { ...filters, saved: false }, () => false), [b, a]);
});

test('资源引用保留中文及空格，API 限定项目文章身份并拒绝越界', () => {
  const path = 'assets/文章 插图.webp';
  const asset = { name: '文章 插图.webp', relativePath: path, isImage: true, size: 10, contentType: 'image/webp' };
  assert.equal(publicationAssetPath('assets/%E6%96%87%E7%AB%A0%20%E6%8F%92%E5%9B%BE.webp'), path);
  assert.deepEqual(referencedAssets(`${assetMarkdown(asset)}\n${assetMarkdown(asset)}\n[附件](assets/report.pdf)`), [path, 'assets/report.pdf']);
  const url = publicationAssetUrl('w', 'p2', 'same', path);
  assert.ok(url.startsWith('/api/v1/workspaces/w/projects/p2/publications/same/assets/assets%2F'));
  for (const bad of ['../assets/a.png', 'assets/../secret', 'assets/%2e%2e/secret', 'assets/a\\b.png', '/assets/a.png', 'assets/a.png?download=1']) assert.equal(publicationAssetPath(bad), null, bad);
  assert.equal(assetMarkdown({ ...asset, isImage: false, name: '报告.pdf', relativePath: 'assets/report.pdf' }), '[报告.pdf](assets/report.pdf)');
});

test('插入资源只改所选正文片段，保留其余未保存输入', () => {
  const input = '段落一\n\n待替换\n\n段落二';
  const start = input.indexOf('待替换');
  const result = insertMarkdown(input, '![图](assets/a.png)', start, start + 3);
  assert.equal(result.content, '段落一\n\n![图](assets/a.png)\n\n段落二');
  assert.equal(input, '段落一\n\n待替换\n\n段落二');
  const end = insertMarkdown('正文', '[附件](assets/a.pdf)', 2);
  assert.equal(end.content, '正文\n\n[附件](assets/a.pdf)\n');
  assert.equal(end.cursor, end.content.length);
});

test('写作请求携带真实来源版本并明确未执行与未保存修改边界', () => {
  const article = publication('practice', 'same', '实践文章', '', '2026-09-20');
  const args = { projectCode: article.projectCode, projectName: '团队实践', article, revision: 'observed-version', method: '审校内容', goal: '核对事实', materials: '当前项目知识', hasUnsavedChanges: true };
  const request = buildWritingRequest(args);
  for (const fragment of ['practice', 'docs/publications/same.md', 'observed-version', '核对事实', '当前项目知识', '未保存修改', '不代表已执行', '已安装且适用']) assert.ok(request.includes(fragment), fragment);
  assert.throws(() => buildWritingRequest({ ...args, goal: '  ' }), /目标/);
  assert.throws(() => buildWritingRequest({ ...args, projectCode: '' }), /项目/);
});
