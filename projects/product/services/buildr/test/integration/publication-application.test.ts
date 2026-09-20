import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import YAML from 'yaml';

import { registerWorkspaceInfrastructure } from '../../src/infrastructure/filesystem/index.ts';
import { registerPublicationApplication } from '../../src/modules/publication/application/publication-application.ts';

function fixture(): any  {
  const root: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-publications-'));
  const publicationRoot: any = path.join(root, 'projects', 'product', 'docs', 'publications');
  fs.mkdirSync(path.join(publicationRoot, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(publicationRoot, 'README.md'), '# index');
  fs.writeFileSync(path.join(publicationRoot, 'article.md'), [
    '---',
    'id: article',
    'title: 测试文章',
    'kind: product-article',
    'status: published',
    'targets:',
    '  - platform: local-app',
    '    status: published',
    '---',
    '',
    '# 测试文章',
    '',
    '![封面](assets/cover.png)',
  ].join('\n'));
  fs.writeFileSync(path.join(publicationRoot, 'assets', 'cover.png'), 'image');
  const runtime: any = {
    readProjectRegistryRecord: () => ({ root, projects: { product: { name: 'Buildr 产品', source: { type: 'workspace', path: 'projects/product' } }, other: { name: '另一项目', source: { type: 'git', path: 'projects/other' } }, attached: { source: { type: 'git', root: 'attached', path: path.join(root, 'external') } } } }),
    resolveSourceRoot: (workspaceRoot: string, source: { path: string }) => path.resolve(workspaceRoot, source.path),
    parseYamlDocument: (content: any) => YAML.parse(content),
  };
  registerWorkspaceInfrastructure(runtime);
  registerPublicationApplication(runtime, { projectQuery: { readProjectRegistryRecord: runtime.readProjectRegistryRecord, resolveSourceRoot: runtime.resolveSourceRoot } });
  return { root, publicationRoot, runtime };
}

test('Publication Application 从固定项目目录读取并保留 Product 旧身份', (t: any) => {
  const { root, publicationRoot, runtime }: any = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const list: any = runtime.listPublications(root);
  assert.equal(list.publications.length, 1);
  assert.equal(list.publications[0].id, 'article');
  assert.equal(list.publications[0].targets[0].platform, 'buildr-web');
  const detail: any = runtime.publicationDetail(root, 'article');
  assert.match(detail.content, /assets\/cover\.png/);
  assert.equal(runtime.readPublicationAsset(root, 'article', 'assets/cover.png').contentType, 'image/png');
  assert.throws(() => runtime.readPublicationAsset(root, 'article', '../article.md'), (error: any) => error.code === 'publication_asset_forbidden');
  assert.throws(() => runtime.readPublicationAsset(root, 'article', '/etc/passwd'), (error: any) => error.code === 'publication_asset_forbidden');
  fs.symlinkSync(path.join(root, 'outside.txt'), path.join(publicationRoot, 'assets', 'link.png'));
  fs.writeFileSync(path.join(root, 'outside.txt'), 'outside');
  assert.throws(() => runtime.readPublicationAsset(root, 'article', 'assets/link.png'), (error: any) => error.code === 'publication_asset_forbidden');
});

test('跨项目文章身份、CRUD、元数据保留与过期版本零覆盖', (t: any) => {
  const { root, publicationRoot, runtime } = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const other = runtime.createPublication(root, 'other', { id: 'article', title: '另一项目同名 ID', content: '# other' });
  assert.equal(other.publication.projectCode, 'other');
  assert.equal(runtime.publicationDetail(root, 'article').publication.title, '测试文章');
  const list = runtime.listPublications(root);
  assert.equal(list.publications.length, 2);
  assert.deepEqual(new Set(list.publications.map((item: any) => item.projectCode)), new Set(['product', 'other']));
  assert.equal(list.diagnostics[0].projectCode, 'attached');
  assert.throws(() => runtime.createPublication(root, 'attached', { title: 'outside' }), (error: any) => error.code === 'publication_project_boundary');
  assert.throws(() => runtime.createPublication(root, 'product', { id: 'article', title: '重复' }), (error: any) => error.code === 'publication_already_exists');
  fs.writeFileSync(path.join(publicationRoot, 'invalid.md'), '# keep me');
  assert.throws(() => runtime.createPublication(root, 'product', { id: 'invalid', title: '无效现有文件' }), (error: any) => error.code === 'publication_already_exists');
  assert.equal(fs.readFileSync(path.join(publicationRoot, 'invalid.md'), 'utf8'), '# keep me');

  const file = path.join(publicationRoot, 'article.md');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('kind: product-article', 'kind: product-article\n# keep comment\ncustom:\n  author: test\n  flag: true\npublished_at: 2026-07-25').replace('    status: published', '    status: published\n    url: https://example.com/article\n    receipt: keep'));
  const before = runtime.publicationDetail(root, 'article');
  const saved = runtime.updatePublication(root, 'product', 'article', { revision: before.revision, title: '改后的标题', summary: '摘要', status: 'planned', content: before.content });
  assert.notEqual(saved.revision, before.revision);
  assert.equal(saved.publication.summary, '摘要');
  assert.equal(saved.content.trim(), before.content.trim());
  const metadata = YAML.parse(saved.source.match(/^---\n([\s\S]*?)\n---/)[1]);
  assert.deepEqual(metadata.custom, { author: 'test', flag: true });
  assert.deepEqual(metadata.targets, [{ platform: 'local-app', status: 'published', url: 'https://example.com/article', receipt: 'keep' }]);
  assert.equal(metadata.published_at, '2026-07-25');
  assert.match(saved.source, /# keep comment/);

  fs.appendFileSync(file, '\n外部新增内容\n');
  const externallyEdited = fs.readFileSync(file, 'utf8');
  const stale = { revision: saved.revision, title: '旧页面', summary: '', status: 'draft', content: 'overwrite' };
  assert.throws(() => runtime.updatePublication(root, 'product', 'article', stale), (error: any) => error.code === 'publication_revision_conflict' && error.status === 409);
  assert.throws(() => runtime.deletePublication(root, 'product', 'article', stale), (error: any) => error.code === 'publication_revision_conflict');
  assert.equal(fs.readFileSync(file, 'utf8'), externallyEdited);
  runtime.deletePublication(root, 'product', 'article', { revision: runtime.publicationDetail(root, 'article').revision });
  assert.equal(fs.existsSync(file), false);
  assert.equal(fs.existsSync(path.join(publicationRoot, 'assets', 'cover.png')), true);
  assert.equal(runtime.publicationDetail(root, 'article', 'other').publication.title, '另一项目同名 ID');
});

test('图片和附件上传保留正文、同名不覆盖并拒绝无效和超限内容', (t: any) => {
  const { root, publicationRoot, runtime } = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const before = runtime.publicationDetail(root, 'article');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aW3cAAAAASUVORK5CYII=', 'base64');
  const input = { revision: before.revision, filename: '封面.png', contentBase64: png.toString('base64') };
  const first = runtime.uploadPublicationAsset(root, 'product', 'article', input);
  const second = runtime.uploadPublicationAsset(root, 'product', 'article', input);
  assert.notEqual(first.asset.relativePath, second.asset.relativePath);
  assert.equal(first.revision, before.revision);
  assert.equal(first.asset.isImage, true);
  assert.match(first.asset.relativePath, /^assets\/封面-/);
  assert.deepEqual(fs.readFileSync(path.join(publicationRoot, first.asset.relativePath)), png);
  assert.equal(runtime.publicationDetail(root, 'article').source, before.source);
  const attachment = runtime.uploadPublicationAsset(root, 'product', 'article', { ...input, filename: '资料.pdf', contentBase64: Buffer.from('%PDF-1.7\nfixture').toString('base64') });
  assert.equal(attachment.asset.isImage, false);
  assert.equal(attachment.asset.contentType, 'application/pdf');
  assert.equal(runtime.publicationAssets(root, 'product', 'article').assets.length, 4);
  const count = fs.readdirSync(path.join(publicationRoot, 'assets')).length;
  for (const filename of ['../escape.png', 'unsafe.html', 'unsafe.svg', 'unsafe.js']) {
    assert.throws(() => runtime.uploadPublicationAsset(root, 'product', 'article', { ...input, filename }), (error: any) => ['publication_asset_invalid', 'publication_asset_type_forbidden'].includes(error.code));
  }
  assert.throws(() => runtime.uploadPublicationAsset(root, 'product', 'article', { ...input, contentBase64: Buffer.from('<html>bad</html>').toString('base64') }), (error: any) => error.code === 'publication_asset_signature_invalid');
  assert.throws(() => runtime.uploadPublicationAsset(root, 'product', 'article', { ...input, contentBase64: '????' }), (error: any) => error.code === 'publication_asset_invalid');
  assert.throws(() => runtime.uploadPublicationAsset(root, 'product', 'article', { ...input, contentBase64: Buffer.alloc(5 * 1024 * 1024 + 1).toString('base64') }), (error: any) => error.status === 413);
  assert.throws(() => runtime.uploadPublicationAsset(root, 'product', 'article', { ...input, filename: 'large.txt', contentBase64: Buffer.alloc(10 * 1024 * 1024 + 1).toString('base64') }), (error: any) => error.status === 413);
  assert.equal(fs.readdirSync(path.join(publicationRoot, 'assets')).length, count);
  assert.equal(runtime.publicationDetail(root, 'article').source, before.source);
});

test('目录祖先和悬空符号链接不能穿越，资源局部错误不阻断正文', (t: any) => {
  const { root, publicationRoot, runtime } = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const before = runtime.publicationDetail(root, 'article');
  fs.renameSync(path.join(publicationRoot, 'assets'), path.join(root, 'shared-assets'));
  fs.symlinkSync(path.join(root, 'shared-assets'), path.join(publicationRoot, 'assets'));
  const detail = runtime.publicationDetail(root, 'article');
  assert.equal(detail.content, before.content);
  assert.equal(detail.assets.length, 0);
  assert.equal(detail.assetDiagnostics[0].code, 'publication_asset_forbidden');
  assert.throws(() => runtime.readPublicationAsset(root, 'article', 'assets/cover.png'), (error: any) => error.code === 'publication_asset_forbidden');
  assert.throws(() => runtime.uploadPublicationAsset(root, 'product', 'article', { revision: before.revision, filename: 'ok.txt', contentBase64: Buffer.from('ok').toString('base64') }), (error: any) => error.code === 'publication_asset_forbidden');
  fs.unlinkSync(path.join(publicationRoot, 'assets'));
  fs.symlinkSync(path.join(root, 'missing'), path.join(publicationRoot, 'assets'));
  assert.throws(() => runtime.publicationAssets(root, 'product', 'article'), (error: any) => error.code === 'publication_asset_forbidden');
  fs.unlinkSync(path.join(publicationRoot, 'assets'));
  const docs = path.dirname(publicationRoot);
  fs.renameSync(docs, path.join(root, 'moved-docs'));
  fs.symlinkSync(path.join(root, 'moved-docs'), docs);
  assert.throws(() => runtime.publicationDetail(root, 'article'), (error: any) => error.code === 'publication_asset_forbidden');
  assert.equal(runtime.listPublications(root).diagnostics.some((item: any) => item.projectCode === 'product'), true);
});

test('锁内版本复核不会用事务回滚覆盖刚发生的外部修改', (t: any) => {
  const { root, publicationRoot, runtime } = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const before = runtime.publicationDetail(root, 'article');
  const file = path.join(publicationRoot, 'article.md');
  const withMutation = runtime.withWorkspaceMutation;
  runtime.withWorkspaceMutation = (target: any, operation: any, affected: any, callback: any, options: any) => withMutation(target, operation, affected, (mutation: any) => {
    fs.appendFileSync(file, '\n写入锁后的外部编辑\n');
    return callback(mutation);
  }, options);
  assert.throws(() => runtime.updatePublication(root, 'product', 'article', { revision: before.revision, title: 'outdated', summary: '', status: 'draft', content: 'old content' }), (error: any) => error.code === 'publication_revision_conflict');
  assert.equal(fs.readFileSync(file, 'utf8'), `${before.source}\n写入锁后的外部编辑\n`);
  assert.equal(fs.existsSync(path.join(root, '.buildr', 'mutations', 'lock.json')), false);
});

test('文章写入故障使用既有事务恢复完整原文件', (t: any) => {
  const { root, publicationRoot, runtime } = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const before = runtime.publicationDetail(root, 'article');
  const oldFault = process.env.BUILDR_FAULT_AFTER_MUTATION_WRITE;
  process.env.BUILDR_FAULT_AFTER_MUTATION_WRITE = '1';
  try {
    assert.throws(() => runtime.updatePublication(root, 'product', 'article', { revision: before.revision, title: 'fails after write', summary: '', status: 'draft', content: 'replacement' }), /Injected Buildr mutation failure/);
  } finally {
    if (oldFault === undefined) delete process.env.BUILDR_FAULT_AFTER_MUTATION_WRITE;
    else process.env.BUILDR_FAULT_AFTER_MUTATION_WRITE = oldFault;
  }
  assert.equal(fs.readFileSync(path.join(publicationRoot, 'article.md'), 'utf8'), before.source);
  assert.equal(fs.existsSync(path.join(root, '.buildr', 'mutations', 'lock.json')), false);
});

test('单个不可读文章不影响同项目其他阅读，创建不会猜测不可读文件的 ID', (t: any) => {
  const { root, publicationRoot, runtime } = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const unavailable = path.join(publicationRoot, 'unreadable.md');
  fs.writeFileSync(unavailable, '---\nid: hidden-id\ntitle: 暂时不可读\n---\n');
  const readFile = fs.readFileSync;
  t.mock.method(fs, 'readFileSync', (file: any, ...args: any[]) => {
    if (file === unavailable) throw Object.assign(new Error('read denied'), { code: 'EACCES' });
    return (readFile as any)(file, ...args);
  });
  const list = runtime.listPublications(root, 'product');
  assert.deepEqual(list.publications.map((item: any) => item.id), ['article']);
  assert.equal(list.diagnostics[0].code, 'publication_source_unavailable');
  assert.match(list.diagnostics[0].message, /unreadable.md/);
  assert.equal(runtime.publicationDetail(root, 'article').publication.title, '测试文章');
  assert.throws(() => runtime.createPublication(root, 'product', { id: 'hidden-id', title: '不能覆盖未知 ID' }), (error: any) => error.code === 'publication_source_unavailable');
  assert.equal(fs.existsSync(path.join(publicationRoot, 'hidden-id.md')), false);
});
