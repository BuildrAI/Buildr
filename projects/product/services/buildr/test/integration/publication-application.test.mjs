import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import YAML from 'yaml';

import { registerPublicationApplication } from '../../src/system/publication/application/publication-application.ts';

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-publications-'));
  const publicationRoot = path.join(root, 'projects', 'product', 'docs', 'publications');
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
  const runtime = {
    readProjectRegistryRecord: () => ({ root, projects: { product: { source: { type: 'workspace', path: 'projects/product' } } } }),
    parseYamlDocument: (content) => YAML.parse(content),
  };
  registerPublicationApplication(runtime, { projectQuery: { readProjectRegistryRecord: runtime.readProjectRegistryRecord } });
  return { root, publicationRoot, runtime };
}

test('Publication Application 只读取固定 Product Project publication root', (t) => {
  const { root, publicationRoot, runtime } = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const list = runtime.listPublications(root);
  assert.equal(list.publications.length, 1);
  assert.equal(list.publications[0].id, 'article');
  assert.equal(list.publications[0].targets[0].platform, 'buildr-web');
  const detail = runtime.publicationDetail(root, 'article');
  assert.match(detail.content, /assets\/cover\.png/);
  assert.equal(runtime.readPublicationAsset(root, 'article', 'assets/cover.png').contentType, 'image/png');
  assert.throws(() => runtime.readPublicationAsset(root, 'article', '../article.md'), (error) => error.code === 'publication_asset_forbidden');
  assert.throws(() => runtime.readPublicationAsset(root, 'article', '/etc/passwd'), (error) => error.code === 'publication_asset_forbidden');
  fs.symlinkSync(path.join(root, 'outside.txt'), path.join(publicationRoot, 'assets', 'link.png'));
  fs.writeFileSync(path.join(root, 'outside.txt'), 'outside');
  assert.throws(() => runtime.readPublicationAsset(root, 'article', 'assets/link.png'), (error) => error.code === 'publication_asset_forbidden');
});
