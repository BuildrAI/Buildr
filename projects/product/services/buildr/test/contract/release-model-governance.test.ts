import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const SERVICE_ROOT: any = path.resolve(import.meta.dirname, '../..');
const PRODUCT_ROOT: any = path.resolve(SERVICE_ROOT, '../..');
const WORKSPACE_ROOT: any = path.resolve(PRODUCT_ROOT, '../..');
const CHANGE_ROOTS: any[] = [
  path.join(PRODUCT_ROOT, 'openspec/changes/simplify-release-infrastructure'),
  path.join(PRODUCT_ROOT, 'openspec/changes/add-release-rehearsal-gate'),
  path.join(PRODUCT_ROOT, 'openspec/changes/remove-task-development-and-legacy-finish-history'),
  path.join(PRODUCT_ROOT, 'openspec/changes/streamline-release-dispatch-and-closeout'),
  path.join(PRODUCT_ROOT, 'openspec/changes/replace-main-dev-merge-with-dev-provenance-reconciliation'),
  path.join(PRODUCT_ROOT, 'openspec/changes/unify-release-task-lifecycle-and-closeout'),
  path.join(PRODUCT_ROOT, 'openspec/changes/correct-release-preparation-lifecycle'),
  path.join(PRODUCT_ROOT, 'openspec/changes/define-release-model-contract'),
];
const read: any = (file: any) => fs.readFileSync(file, 'utf8');
const capabilityContract: any = (capability: any) => {
  const active: any = CHANGE_ROOTS.map((root: any) => path.join(root, 'specs', capability, 'spec.md')).find((candidate: any) => fs.existsSync(candidate));
  const canonical: any = read(path.join(PRODUCT_ROOT, 'openspec/specs', capability, 'spec.md'));
  return active ? `${canonical}\n${read(active)}` : canonical;
};

test('release documentation entry points resolve within the checkout', () => {
  const documents = [
    path.join(PRODUCT_ROOT, 'knowledge/docs/flows/open-source-release.md'),
    path.join(PRODUCT_ROOT, 'knowledge/docs/architecture/verification-framework.md'),
    path.join(PRODUCT_ROOT, 'knowledge/docs/architecture/technical.md'),
    path.join(WORKSPACE_ROOT, 'skills/buildr-release/SKILL.md'),
  ];
  for (const file of documents) {
    for (const match of read(file).matchAll(/\]\(([^)\s]+)\)/gu)) {
      const target = match[1];
      if (/^(?:https?:|mailto:|#)/u.test(target)) continue;
      assert.ok(fs.existsSync(path.resolve(path.dirname(file), target.split('#')[0])), `${file} -> ${target}`);
    }
  }
});
