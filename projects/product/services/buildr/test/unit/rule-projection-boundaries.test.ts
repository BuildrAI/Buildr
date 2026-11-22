import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  applyRulesRenderPlan,
  buildRuleDiscoveryPlan,
  planRulesRender,
  resolveRuleScope,
} from '../../src/modules/agent-assets/infrastructure/runtime/rule-projection.ts';

function writeFile(file: string, content: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
}

function createPackageFixture(root: string, relativeDir: string, packageName: string) {
  const pkgRoot = path.join(root, relativeDir);
  writeFile(path.join(pkgRoot, 'package.json'), JSON.stringify({ name: packageName, version: '0.0.0' }));
  writeFile(path.join(pkgRoot, 'resources', 'manifest.yml'), 'include: []\n');
  writeFile(path.join(pkgRoot, 'resources', 'workspace', 'AGENTS.md'), '# Historical package template\n');
  return pkgRoot;
}

test('buildRuleDiscoveryPlan excludes .buildr and @buildr-ai/buildr package resources while keeping ordinary project resources', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-rule-boundaries-'));
  try {
    writeFile(path.join(root, 'AGENTS.md'), '# Workspace rules\n');
    writeFile(path.join(root, '.buildr', 'local', 'preview', 'AGENTS.md'), '# Internal local preview rules\n');
    createPackageFixture(root, 'projects/product/services/buildr', '@buildr-ai/buildr');
    createPackageFixture(root, 'projects/app/services/custom', '@acme/custom-app');

    const plan = buildRuleDiscoveryPlan(root, resolveRuleScope(root, '.'));
    const discovered = plan.files.map((file: string) => path.relative(root, file).replaceAll('\\', '/'));

    assert.deepEqual(discovered, [
      'AGENTS.md',
      'projects/app/services/custom/resources/workspace/AGENTS.md',
    ]);
    assert.ok(plan.boundaries.some((b: any) => b.path === '.buildr' && b.reason === 'excluded-directory'));
    assert.ok(plan.boundaries.some((b: any) => b.path === 'projects/product/services/buildr/resources' && b.reason === 'excluded-directory'));
    assert.throws(() => resolveRuleScope(root, '.buildr/local/preview'), /Unsupported scope/);
    assert.throws(() => resolveRuleScope(root, 'projects/app/.buildr'), /excluded directory/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('planRulesRender never creates resources/workspace/CLAUDE.md in @buildr-ai/buildr and removes stale managed bridges without touching unmanaged files', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-rule-orphan-cleanup-'));
  try {
    writeFile(path.join(root, 'AGENTS.md'), '# Workspace rules\n');
    const buildrPkg = createPackageFixture(root, 'projects/product/services/buildr', '@buildr-ai/buildr');
    const staleBridge = path.join(buildrPkg, 'resources', 'workspace', 'CLAUDE.md');

    const initialPlan = planRulesRender(root, root, resolveRuleScope(root, '.'));
    assert.equal(initialPlan.actions.some((a: any) => a.targetFile === staleBridge), false);
    applyRulesRenderPlan(initialPlan);
    assert.equal(fs.existsSync(staleBridge), false);

    // 遗留受管引用桥应被自动识别为孤儿并移除
    writeFile(
      staleBridge,
      '# CLAUDE.md\n\n<!-- BEGIN Buildr managed Claude Code rules bridge; type: reference; source: AGENTS.md -->\n@AGENTS.md\n<!-- END Buildr managed Claude Code rules bridge -->\n',
    );
    const cleanupPlan = planRulesRender(root, root, resolveRuleScope(root, '.'));
    assert.deepEqual(
      cleanupPlan.actions.filter((a: any) => a.targetFile === staleBridge),
      [{ action: 'removed', sourceFile: null, targetFile: staleBridge, content: null }],
    );
    applyRulesRenderPlan(cleanupPlan);
    assert.equal(fs.existsSync(staleBridge), false);

    // 再次规划不应再产生动作
    const settledPlan = planRulesRender(root, root, resolveRuleScope(root, '.'));
    assert.equal(settledPlan.actions.some((a: any) => a.targetFile === staleBridge), false);

    // 非 Buildr 受管文件不得误删
    writeFile(staleBridge, '# Custom CLAUDE.md\nKeep user content.\n');
    const unmanagedPlan = planRulesRender(root, root, resolveRuleScope(root, '.'));
    assert.equal(unmanagedPlan.actions.some((a: any) => a.targetFile === staleBridge), false);
    applyRulesRenderPlan(unmanagedPlan);
    assert.equal(fs.readFileSync(staleBridge, 'utf8'), '# Custom CLAUDE.md\nKeep user content.\n');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
