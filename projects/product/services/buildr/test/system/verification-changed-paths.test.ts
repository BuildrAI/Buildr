import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { collectChangedProductPaths, resolveVerificationBase } from '../verification/changed-paths.ts';
import { createVerificationPlan } from '../verification/planner.ts';

test('依赖安装前可加载 changed path collector，缺少 YAML 时保守处理声明变化', () => {
  const moduleUrl: any = pathToFileURL(path.resolve(import.meta.dirname, '../verification/changed-paths.ts')).href;
  const script: any = `
    import assert from 'node:assert/strict';
    import { registerHooks } from 'node:module';
    registerHooks({ resolve(specifier, context, nextResolve) {
      if (specifier === 'yaml') throw Object.assign(new Error('yaml is not installed'), { code: 'ERR_MODULE_NOT_FOUND' });
      return nextResolve(specifier, context);
    } });
    const collector = await import(${JSON.stringify(moduleUrl)});
    assert.deepEqual(collector.collectChangedProductPaths({ productRoot: process.cwd(), explicitPaths: ['docs/a.md'] }).paths, ['docs/a.md']);
    assert.equal(collector.isVersionOnlyPackageMetadataChange('package.json', '{"version":"1.0.0"}', '{"version":"1.0.1"}'), true);
    assert.equal(collector.isVerificationDeclarationMetadataOnlyChange('capabilities: []', 'capabilities: []'), false);
    process.stdout.write('ready');
  `;
  assert.equal(execFileSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' }), 'ready');
});

function git(root: any, args: any): any  {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

test('changed path collector 合并 base diff、staged、unstaged 与 untracked Product paths', () => {
  const root: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-changed-paths-'));
  try {
    const productRoot: any = path.join(root, 'projects', 'product');
    fs.mkdirSync(path.join(productRoot, 'docs'), { recursive: true });
    fs.mkdirSync(path.join(root, '.github', 'workflows'), { recursive: true });
    fs.mkdirSync(path.join(root, 'outside'), { recursive: true });
    fs.writeFileSync(path.join(productRoot, 'docs', 'tracked.md'), 'base\n');
    fs.writeFileSync(path.join(productRoot, 'docs', 'staged.md'), 'base\n');
    fs.writeFileSync(path.join(root, 'outside', 'ignored.md'), 'base\n');
    fs.writeFileSync(path.join(root, '.github', 'workflows', 'publish.yml'), 'base\n');
    fs.writeFileSync(path.join(root, '.github', 'workflows', 'unowned.yml'), 'base\n');
    git(root, ['init']);
    git(root, ['config', 'user.email', 'verification@example.com']);
    git(root, ['config', 'user.name', 'Verification Fixture']);
    git(root, ['add', '.']);
    git(root, ['commit', '-m', 'base']);

    fs.writeFileSync(path.join(productRoot, 'docs', 'tracked.md'), 'unstaged\n');
    fs.writeFileSync(path.join(productRoot, 'docs', 'staged.md'), 'staged\n');
    git(root, ['add', 'projects/product/docs/staged.md']);
    fs.writeFileSync(path.join(productRoot, 'docs', 'untracked.md'), 'new\n');
    fs.writeFileSync(path.join(root, 'outside', 'ignored.md'), 'outside\n');
    fs.writeFileSync(path.join(root, '.github', 'workflows', 'publish.yml'), 'governed\n');
    fs.writeFileSync(path.join(root, '.github', 'workflows', 'unowned.yml'), 'must stay outside Product ownership\n');

    const changed: any = collectChangedProductPaths({ productRoot, base: 'HEAD' });
    assert.equal(changed.base, 'HEAD');
    assert.equal(changed.source, 'git');
    assert.deepEqual(changed.paths, ['.github/workflows/publish.yml', 'docs/staged.md', 'docs/tracked.md', 'docs/untracked.md']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('显式 paths 不读取 Git 且 base 解析失败时 fail closed', () => {
  const explicit: any = collectChangedProductPaths({ productRoot: process.cwd(), explicitPaths: ['./docs/a.md', 'docs/a.md'] });
  assert.deepEqual(explicit, { base: null, paths: ['docs/a.md'], source: 'explicit', versionOnlyPackagePaths: [], selectionOnlyPaths: [], selectionReasons: [] });
  assert.throws(() => resolveVerificationBase(process.cwd(), 'missing-verification-base'), /Unknown Git base/);
});

test('独立插件发布工作流从实际 Git 变更收集到唯一插件检查，不进入主包候选', () => {
  const root: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-plugin-workflow-paths-'));
  try {
    const projectRoot: any = path.join(root, 'projects', 'product');
    const productRoot: any = path.join(projectRoot, 'services', 'buildr');
    const workflowPath: any = '.github/workflows/publish-dsh-plugin.yml';
    const workflow: any = path.join(root, workflowPath);
    fs.mkdirSync(productRoot, { recursive: true });
    fs.mkdirSync(path.dirname(workflow), { recursive: true });
    fs.writeFileSync(path.join(productRoot, 'base.txt'), 'base\n');
    git(root, ['init']);
    git(root, ['config', 'user.email', 'verification@example.com']);
    git(root, ['config', 'user.name', 'Verification Fixture']);
    git(root, ['add', '.']);
    git(root, ['commit', '-m', 'base']);
    const base: any = git(root, ['rev-parse', 'HEAD']).trim();
    fs.writeFileSync(workflow, 'new plugin workflow\n');
    fs.writeFileSync(path.join(path.dirname(workflow), 'unowned.yml'), 'outside Product ownership\n');

    const assertPluginOnly: any = (options: any, source: any) => {
      const changed: any = collectChangedProductPaths({ productRoot, projectRoot, ...options });
      assert.deepEqual(changed.paths, [workflowPath], `${source} must collect the governed repository path`);
      const plan: any = createVerificationPlan({ paths: changed.paths });
      assert.equal(plan.status, 'ready');
      assert.equal(plan.scope.mode, 'affected');
      assert.deepEqual(plan.steps.map((step: any) => step.id), ['dsh-plugin']);
      assert.equal(plan.steps[0].executor.file, '../dsh-plugin/tools/verify-all.ts');
    };
    assertPluginOnly({ base }, 'untracked');
    git(root, ['add', workflowPath]);
    assertPluginOnly({ base }, 'staged');
    git(root, ['commit', '-m', 'add plugin workflow']);
    assertPluginOnly({ base, head: 'HEAD' }, 'committed base diff');
    fs.writeFileSync(workflow, 'updated plugin workflow\n');
    assertPluginOnly({ base: 'HEAD' }, 'unstaged');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
