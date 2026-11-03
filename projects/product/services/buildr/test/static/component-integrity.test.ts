import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { parseYamlDocument } from '../../src/infrastructure/filesystem/yaml.ts';
import { assetIntegrity } from '../../src/modules/agent-assets/infrastructure/component-source.ts';

const serviceRoot = path.resolve(import.meta.dirname, '../..');

function workspaceRoot(): string | null {
  let current = serviceRoot;
  for (;;) {
    if (fs.existsSync(path.join(current, 'components', 'manifest.yml'))) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

/**
 * Workspace Components keep their source in this repository, so their declared
 * member digests are checkable without product runtime data. Package Components
 * (`source: buildr`) need prepared resources and stay with `buildr component check`.
 */
test('workspace Component member integrity matches its declaration', () => {
  const root = workspaceRoot();
  assert.ok(root, '需要一个包含 components/manifest.yml 的工作空间根');
  const manifest = parseYamlDocument(fs.readFileSync(path.join(root, 'components', 'manifest.yml'), 'utf8')) as any;
  const workspaceComponents = (manifest.components ?? []).filter((entry: any) => entry.source === 'workspace' && entry.enabled !== false);
  assert.ok(workspaceComponents.length > 0, '至少需要一个 workspace Component');
  for (const entry of workspaceComponents) {
    const file = path.join(root, entry.path, 'component.yml');
    const definition = parseYamlDocument(fs.readFileSync(file, 'utf8')) as any;
    const declared = new Map<string, string>();
    for (const item of definition.integrity ?? []) {
      const separator = String(item).lastIndexOf('=');
      assert.ok(separator > 0, `${entry.id} 的 integrity 条目无效：${item}`);
      declared.set(String(item).slice(0, separator), String(item).slice(separator + 1));
    }
    const members = [...(definition.members?.rules ?? []), ...(definition.members?.skills ?? []), ...(definition.members?.commandCollections ?? []), ...(definition.members?.skillContributions ?? [])];
    assert.deepEqual([...declared.keys()].sort(), [...new Set<string>(members)].sort(), `${entry.id} 的成员与 integrity 条目不一致；修改成员后运行 buildr component record ${entry.id}`);
    for (const [member, digest] of declared) {
      assert.equal(assetIntegrity(path.join(root, member)), digest, `${member} 的摘要与声明不一致；运行 buildr component record ${entry.id} 重算`);
    }
  }
});
