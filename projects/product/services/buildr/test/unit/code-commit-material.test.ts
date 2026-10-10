import assert from 'node:assert/strict';
import test from 'node:test';
import { CODE_COMMIT_MATERIAL_LIMITS, commitRuleExcerpt, formatCodeCommitMaterial, selectCodeCommitEvidenceFiles, type CodeCommitMaterialObservations } from '../../src/modules/code/infrastructure/code-commit-material.ts';
import type { CodeCommitSnapshot } from '../../src/modules/code/infrastructure/code-commit-snapshot.ts';
import type { CodeCommitGuidance } from '../../src/modules/code/infrastructure/code-commit-guidance.ts';

function source(count = 1): CodeCommitSnapshot {
  const files = Array.from({ length: count }, (_, index) => ({ path: `src/目录-${index}.ts`, kind: 'text' as const, bytes: 100, digest: `digest-${index}`, mode: 33188, content: 'actual();\n', untracked: index === 0 }));
  return { source: { repositoryId: 'repo', worktreeId: 'tree', taskId: null, checkoutId: null, worktreeGroupId: null, commitHash: null, location: '/not-a-real-checkout', version: 'current', kind: 'default' }, revision: 'source-1', head: 'a'.repeat(40), branch: 'dev', branchRef: 'refs/heads/dev', paths: files.map(file => file.path), files, diff: '', indexPath: '/unused', indexDigest: null, indexRevision: 'index', configDigest: 'config', hasChanges: count > 0 };
}
const guidance: CodeCommitGuidance = { scopes: [], ruleEntrypoints: [], readableRoots: [], task: null, revision: 'guidance-1' };
const observed = (): CodeCommitMaterialObservations => ({ rules: [], ruleSources: 0, ruleFacts: [], evidence: [] });

test('the UTF-8 budget includes JSON escaping and reports exact complete range versus samples', () => {
  const snapshot = source(1000), observations = observed();
  observations.rules = Array.from({ length: 4 }, (_, index) => ({ source: `AGENTS-${index}.md`, scope: 'service', text: '使用中文。\n"标题"😀'.repeat(1000), partial: false })); observations.ruleSources = 4;
  observations.evidence = snapshot.files.slice(0, 12).map(file => ({ path: file.path, format: 'diff', text: '+改变真实行为😀\n'.repeat(1000), partial: false }));
  const result = formatCodeCommitMaterial(snapshot, guidance, observations, 14 * 1024), data = JSON.parse(result.text);
  assert.ok(Buffer.byteLength(result.text) <= 14 * 1024);
  assert.ok(Buffer.byteLength(JSON.stringify(data.rules)) <= CODE_COMMIT_MATERIAL_LIMITS.rulesBytes);
  assert.ok(Buffer.byteLength(JSON.stringify(data.pathSamples)) <= CODE_COMMIT_MATERIAL_LIMITS.rangeBytes);
  assert.ok(Buffer.byteLength(JSON.stringify(data.evidence)) <= CODE_COMMIT_MATERIAL_LIMITS.evidenceBytes);
  assert.ok(data.evidence.length <= 8);
  for (const item of data.evidence) { assert.ok(Buffer.byteLength(JSON.stringify(item)) <= CODE_COMMIT_MATERIAL_LIMITS.fileBytes); assert.equal(item.partial, true); assert.ok(!item.text.includes('\ufffd')); }
  assert.equal(data.summary.totalPaths, 1000); assert.equal(data.summary.byKind.text, 1000); assert.equal(data.summary.totalBytes, 100_000);
  assert.equal(result.coverage.includedPaths, data.pathSamples.length); assert.equal(result.coverage.omittedPaths, 1000 - data.pathSamples.length);
  assert.equal(result.coverage.omittedEvidenceFiles, 1000 - data.evidence.length); assert.equal(result.coverage.rulesPartial, true); assert.equal(result.coverage.evidencePartial, true);
});

test('smaller budgets reduce material rather than reject a large range or pretend all paths were shown', () => {
  const snapshot = source(1000), observations = observed();
  observations.evidence = [{ path: snapshot.paths[0], format: 'new-content', text: 'actual();'.repeat(1000), partial: true }];
  for (const budget of [512, 768, 2048]) {
    const result = formatCodeCommitMaterial(snapshot, guidance, observations, budget), data = JSON.parse(result.text);
    assert.ok(Buffer.byteLength(result.text) <= budget); assert.equal(data.summary.totalPaths, 1000);
    assert.equal(data.coverage.omittedPaths, 1000 - data.pathSamples.length); assert.equal(data.coverage.evidencePartial, true);
  }
});

test('binary, deleted and symlink paths remain metadata without invented change or patch facts', () => {
  const snapshot = source(); snapshot.files = [
    { path: 'asset.bin', kind: 'binary', bytes: 10, mode: 33188, digest: 'binary' },
    { path: 'deleted.txt', kind: 'deleted', bytes: 0, mode: null, digest: 'deleted' },
    { path: 'link', kind: 'symlink', bytes: 8, mode: 41471, digest: 'link', content: 'relative' },
  ]; snapshot.paths = snapshot.files.map(file => file.path);
  const result = formatCodeCommitMaterial(snapshot, guidance, observed(), 2048), data = JSON.parse(result.text);
  assert.deepEqual(data.summary.byKind, { text: 0, binary: 1, symlink: 1, deleted: 1 }); assert.equal(data.pathSamples.length, 3);
  assert.equal(data.coverage.omittedEvidenceFiles, 0); assert.deepEqual(data.evidence, []);
  assert.doesNotMatch(result.text, /"change"|previousBytes|digest|GIT binary patch|relative/);
});

test('normative excerpts prioritize actual language and message rules without loading development flows', () => {
  const text = '# Governance\n\n用户授权后才执行 Git 提交。'.repeat(100) + '\n\n## Commit message\n\nUse type(scope): subject.\n\nBuildr-Task: use the verified ID.\n\n## Development\n\nRun every build and register tasks.\n\n所有面向用户的文本默认使用中文。';
  const excerpt = commitRuleExcerpt(text);
  assert.match(excerpt, /^所有面向用户的文本默认使用中文/); assert.match(excerpt, /type\(scope\): subject/); assert.match(excerpt, /Buildr-Task/);
  assert.doesNotMatch(excerpt, /用户授权后|Run every build|register tasks/);
});

test('rule scopes receive bounded shares and retain explicit partial status and verified task identity', () => {
  const observations = observed(); observations.ruleSources = 4;
  observations.rules = ['workspace', 'project', 'service-a', 'service-b'].map(scope => ({ source: 'AGENTS.md', scope, text: 'Use English for commit messages.\n' + 'Additional condition. '.repeat(100), partial: true }));
  const scoped = { ...guidance, task: { taskId: 'actual-task', title: '任务'.repeat(2000), intent: '目标'.repeat(2000) } };
  const result = formatCodeCommitMaterial(source(), scoped, observations, 4096), data = JSON.parse(result.text);
  assert.equal(data.rules.length, 4); for (const rule of data.rules) assert.match(rule.text, /^Use English/);
  assert.equal(data.task.taskId, 'actual-task'); assert.ok(Buffer.byteLength(data.task.title) <= 256); assert.ok(Buffer.byteLength(data.task.intent) <= 384);
  assert.equal(data.coverage.omittedRuleSources, 0); assert.equal(data.coverage.rulesPartial, true);
});

test('private rule evidence changes the revision without exposing hashes or unrelated body facts', () => {
  const first = observed(); first.ruleFacts = [{ file: '/private/rule', digest: 'first-body' }];
  const next = { ...first, ruleFacts: [{ file: '/private/rule', digest: 'next-body' }] };
  const a = formatCodeCommitMaterial(source(), guidance, first, 4096), b = formatCodeCommitMaterial(source(), guidance, next, 4096);
  assert.notEqual(a.revision, b.revision); assert.equal(a.text, b.text); assert.doesNotMatch(a.text, /private|digest|first-body/);
  assert.equal(formatCodeCommitMaterial(source(), guidance, { ...first, rulesPartial: true }, 4096).coverage.rulesPartial, true);
});

test('realistic frontend and backend areas share the eight evidence slots and global byte budget', () => {
  const snapshot = source();
  const paths = [
    'projects/product/services/buildr-web/src/app/AgentRuntimeContext.tsx',
    'projects/product/services/buildr-web/src/components/AgentActionControl.tsx',
    'projects/product/services/buildr-web/src/features/agents/AgentRegistryDrawer.tsx',
    'projects/product/services/buildr-web/src/features/code/SourceControlCommitPanel.tsx',
    'projects/product/services/buildr-web/src/lib/api.ts',
    'projects/product/services/buildr-web/src/styles/layout.css',
    'projects/product/services/buildr/src/bootstrap/module.ts',
    'projects/product/services/buildr/src/modules/agent-operations/domain/agent-operations.ts',
    'projects/product/services/buildr/src/modules/code/application/code-commit-message-application.ts',
    'projects/product/services/buildr/src/web/server.ts',
    'projects/product/openspec/changes/codex-source-control/prototype/main.ts',
  ];
  snapshot.files = paths.map(path => ({ ...source().files[0], path, untracked: false })); snapshot.paths = paths;
  const candidates = selectCodeCommitEvidenceFiles(snapshot);
  assert.equal(candidates.length, 8); assert.equal(candidates.filter(file => file.path.includes('/buildr-web/')).length, 4);
  assert.equal(candidates.filter(file => file.path.includes('/buildr/')).length, 4);
  assert.ok(candidates.some(file => file.path.includes('/modules/agent-operations/'))); assert.ok(candidates.some(file => file.path.includes('/modules/code/')));
  assert.ok(candidates.every(file => !file.path.endsWith('.css') && !file.path.includes('/prototype/')));
  const observations = observed(); observations.evidence = candidates.map(file => ({ path: file.path, format: 'diff', text: `diff --git a/${file.path} b/${file.path}\n@@ -1 +1 @@\n-old behavior\n+actual behavior\n` + '+additional behavior\n'.repeat(1000), partial: true }));
  const data = JSON.parse(formatCodeCommitMaterial(snapshot, guidance, observations, 14 * 1024).text);
  assert.equal(data.evidence.length, 8); assert.ok(Buffer.byteLength(JSON.stringify(data.evidence)) <= 8192);
  for (const item of data.evidence) assert.match(item.text, /\+actual behavior/);
  assert.equal(data.summary.areas.reduce((sum: number, item: { paths: number }) => sum + item.paths, 0) + data.summary.otherAreaPaths, paths.length);
});

test('actual evidence changes invalidate material even when Git and rule versions stay the same', () => {
  const snapshot = source(), first = observed(), next = observed();
  first.evidence = [{ path: snapshot.paths[0], format: 'diff', text: '@@ -1 +1 @@\n-before\n+actual text\n', partial: false }];
  next.evidence = [{ path: snapshot.paths[0], format: 'diff', text: 'Binary files a/source and b/source differ\n', partial: false }];
  const a = formatCodeCommitMaterial(snapshot, guidance, first, 4096), b = formatCodeCommitMaterial(snapshot, guidance, next, 4096);
  assert.deepEqual(a.coverage, b.coverage); assert.notEqual(a.revision, b.revision);
});
