import assert from 'node:assert/strict';
import test from 'node:test';
import { deliveryFileTree, hasDeliveryFiles, resolveDeliveryFileHref } from '../src/features/task/components/task-delivery-files.ts';

const asset = relativePath => ({ path: `openspec/changes/demo/${relativePath}`, relativePath, name: relativePath.split('/').at(-1), kind: 'text', sourceIdentity: 'source-1', sizeBytes: 12, updatedAt: '2026-10-13T00:00:00Z' });
test('额外交付目录保留自定义路径，名称相同的文件不混为一份', () => {
  const files = [asset('custom/migration/README.md'), asset('artifacts/README.md'), asset('brief.md')];
  const tree = deliveryFileTree(files, 'project/change');
  const custom = tree.find(node => node.title === 'custom');
  assert.equal(custom.children[0].children[0].asset.relativePath, 'custom/migration/README.md');
  assert.notEqual(custom.children[0].children[0].key, tree.find(node => node.title === 'artifacts').children[0].key);
  assert.equal(tree.find(node => node.title === 'brief.md').asset.relativePath, 'brief.md');
  assert.equal(hasDeliveryFiles([{ kind: 'ready', change: { assets: files } }]), true);
  assert.equal(hasDeliveryFiles([{ kind: 'ready', change: { assets: [] } }]), false);
  assert.equal(hasDeliveryFiles([{ kind: 'missing', key: 'project/change', message: 'failed' }]), true);
});
test('交付文档相对链接支持脚本和配置，但不能逃离变更根', () => {
  assert.equal(resolveDeliveryFileHref('artifacts/migration/README.md', '01-schema.sql'), 'artifacts/migration/01-schema.sql');
  assert.equal(resolveDeliveryFileHref('artifacts/migration/README.md', '../nacos.yml#config'), 'artifacts/nacos.yml');
  assert.equal(resolveDeliveryFileHref('artifacts/migration/README.md', '../../design.md'), 'design.md');
  assert.equal(resolveDeliveryFileHref('README.md', 'files/my%20script.sql'), 'files/my script.sql');
  for (const href of ['../../../outside.sql', 'https://example.test/a.sql', '//example.test/a', '%2fetc/passwd', '@project/other.md', '.git/config', '%00', '#heading']) assert.equal(resolveDeliveryFileHref('README.md', href), null, href);
});
