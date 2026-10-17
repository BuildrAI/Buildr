import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { INTEGRATION_GENERAL_EXCLUDED_FILES, INTEGRATION_PRIMARY_SLICES, verificationSteps } from '../verification/registry.ts';
import { auditNodeTestFileOwnership, resolveNodeTestFiles } from '../verification/test-files.ts';

const serviceRoot: any = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('node-test selectors resolve sorted files and fail closed when empty', () => {
  const root: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-test-files-'));
  try {
    fs.mkdirSync(path.join(root, 'test'), { recursive: true });
    fs.writeFileSync(path.join(root, 'test', 'b.test.mjs'), '');
    fs.writeFileSync(path.join(root, 'test', 'a.test.mjs'), '');
    fs.mkdirSync(path.join(root, 'test', 'directory.test.mjs'));
    assert.deepEqual(resolveNodeTestFiles(root, ['test/*.test.mjs']).map((file: any) => path.basename(file)), ['a.test.mjs', 'b.test.mjs']);
    assert.throws(() => resolveNodeTestFiles(root, ['missing/*.test.mjs'], 'fixture-step'), /fixture-step resolved no test files/);
    assert.throws(() => resolveNodeTestFiles(root, ['test/directory.test.mjs']), /resolved no test files/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('registry 中每个显式 node-test 文件都必须真实存在', () => {
  for (const step of verificationSteps.filter((candidate: any) => ['node-test', 'node-context-test'].includes(candidate.executor.type))) {
    for (const selector of step.executor.files) {
      assert.doesNotThrow(
        () => resolveNodeTestFiles(serviceRoot, [selector], step.id),
        `${step.id} 声明了不存在的测试文件 ${selector}`,
      );
    }
  }
});

test('test inventory rejects unowned, duplicated and stale members while retaining declared supporting coverage', () => {
  const inventory = ['one.test.ts', 'two.test.ts'];
  const primary = { id: 'primary', files: [...inventory] };
  assert.equal(auditNodeTestFileOwnership(inventory, [primary]).ok, true);
  assert.equal(auditNodeTestFileOwnership(inventory, [primary, { id: 'platform', files: ['one.test.ts'], supportingFiles: ['one.test.ts'] }]).ok, true);
  assert.equal(auditNodeTestFileOwnership(inventory, [{ id: 'partial', files: ['one.test.ts'] }]).findings[0]?.code, 'test_primary_owner_missing');
  assert.equal(auditNodeTestFileOwnership(inventory, [primary, { id: 'duplicate', files: ['one.test.ts'] }]).findings[0]?.code, 'test_primary_owner_duplicated');
  assert.equal(auditNodeTestFileOwnership(inventory, [primary, { id: 'stale', files: ['missing.test.ts'] }]).findings[0]?.code, 'selected_test_missing');
  assert.equal(auditNodeTestFileOwnership(inventory, [{ ...primary, supportingFiles: ['missing.test.ts'] }]).findings[0]?.code, 'supporting_file_not_selected');
});

function inventoryTests(root: string): string[] {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    const target = path.join(root, entry.name);
    return entry.isDirectory() ? inventoryTests(target) : /\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(entry.name) ? [target] : [];
  }).sort();
}

test('complete Buildr test inventory has one primary owner, including wrapped release and Browser entries', () => {
  const inventory = inventoryTests(path.join(serviceRoot, 'test'));
  const scripts = JSON.parse(fs.readFileSync(path.join(serviceRoot, 'package.json'), 'utf8')).scripts;
  const claims = verificationSteps.filter((step: any) => step.profiles.includes('candidate')).flatMap((step: any) => {
    let selectors = step.executor.files ?? step.executor.discoveredFiles ?? [];
    if (step.executor.type === 'npm') {
      const script = scripts[step.executor.args?.[1]] ?? '';
      selectors = script.match(/\btest\/[^\s"']+\.(?:test|spec)\.[cm]?[jt]sx?/gu) ?? [];
    } else if (step.executor.file === 'test/verification/run-node-tests.ts') selectors = step.executor.args;
    if (selectors.length === 0) return [];
    const files = resolveNodeTestFiles(serviceRoot, selectors, step.id);
    return [{ id: step.id, files, supportingFiles: (step.executor.supportingFiles ?? []).map((file: string) => path.resolve(serviceRoot, file)) }];
  });
  const audit = auditNodeTestFileOwnership(inventory, claims);
  assert.deepEqual(audit.findings, [], JSON.stringify(audit.findings));
  const browser = verificationSteps.find((step: any) => step.id === 'artifact-browser-core');
  const browserEntry = fs.readFileSync(path.join(serviceRoot, browser.executor.file), 'utf8');
  for (const file of browser.executor.discoveredFiles) assert.ok(browserEntry.includes(file), `Browser wrapper must actually call ${file}`);
});

test('compatibility general covers every source Integration member and Candidate executes only the disjoint primary slices', () => {
  const inventory = fs.readdirSync(path.join(serviceRoot, 'test/integration')).filter(file => file.endsWith('.test.ts'))
    .map(file => `test/integration/${file}`).filter(file => !INTEGRATION_GENERAL_EXCLUDED_FILES.includes(file));
  assert.deepEqual(auditNodeTestFileOwnership(inventory, INTEGRATION_PRIMARY_SLICES).findings, []);
  for (const slice of INTEGRATION_PRIMARY_SLICES) {
    const step = verificationSteps.find((item: any) => item.id === slice.id);
    assert.equal(step.testing.primaryEvidenceOwner, slice.id);
    assert.deepEqual(step.executor.files, slice.files);
    for (const file of slice.files) assert.ok(step.inputs.includes(file), `${slice.id} must own its actual executing file ${file}`);
  }
  assert.equal(verificationSteps.some((step: any) => step.profiles.includes('candidate') && step.executor.file === 'test/verification/integration.ts'), false);
});

test('native Windows selection keeps every declared platform test while its shared Worktree subset stays supporting', () => {
  const step = verificationSteps.find((item: any) => item.id === 'system-windows-platform');
  const selector = step.executor.args.find((arg: string) => arg.startsWith('--test-name-pattern='));
  const pattern = new RegExp(selector.slice(selector.indexOf('=') + 1), 'u');
  for (const file of step.executor.files.filter((file: string) => !step.executor.supportingFiles.includes(file))) {
    const titles = [...fs.readFileSync(path.join(serviceRoot, file), 'utf8').matchAll(/\btest\(\s*['"]([^'"\n]+)['"]/gu)].map(match => match[1]!);
    assert.ok(titles.length > 0, file);
    for (const title of titles) assert.ok(pattern.test(title), `${file}: native test would be silently filtered: ${title}`);
  }
});

test('Web and DSH complete entries discover every service-owned test file exactly once', async () => {
  const webRoot = path.resolve(serviceRoot, '../buildr-web');
  const { logicTestArguments } = await import(new URL('../../../buildr-web/tools/run-logic-tests.mjs', import.meta.url).href);
  const webFiles = logicTestArguments(webRoot, 1).filter((file: string) => /\.test\.mjs$/u.test(file));
  assert.deepEqual(auditNodeTestFileOwnership(inventoryTests(path.join(webRoot, 'test')), [{ id: 'frontend-logic', files: webFiles }]).findings, []);
  const pluginRoot = path.resolve(serviceRoot, '../dsh-plugin');
  const { pluginSourcePhaseFiles, PLUGIN_PEER_PHASE_FILES } = await import(new URL('../../../dsh-plugin/tools/verify-all.ts', import.meta.url).href);
  const uiConfig = fs.readFileSync(path.join(pluginRoot, 'test/integration/source-ui.vitest.config.ts'), 'utf8');
  const uiFiles = [...uiConfig.matchAll(/['"]([^'"\n]+\.spec\.tsx)['"]/gu)].map(match => path.join(pluginRoot, 'test/integration', match[1]!));
  const claims = [
    ...['unit', 'integration'].map(group => ({ id: `dsh-plugin:${group}`, files: pluginSourcePhaseFiles(group, pluginRoot).map((file: string) => path.join(pluginRoot, file)) })),
    { id: 'dsh-plugin:peer-gateway', files: PLUGIN_PEER_PHASE_FILES.map((file: string) => path.join(pluginRoot, file)) },
    { id: 'dsh-plugin:source-ui', files: uiFiles },
  ];
  assert.ok(uiFiles.length > 0, 'the real Vitest entry must select a UI specification');
  assert.deepEqual(auditNodeTestFileOwnership(inventoryTests(path.join(pluginRoot, 'test')), claims).findings, []);
});
