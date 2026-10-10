import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { createCodeApplication } from '../../src/modules/code/application/code-application.ts';
import { createCodeCommitMessageApplication } from '../../src/modules/code/application/code-commit-message-application.ts';
import { readCodeCommitGuidance, type CodeCommitGuidanceDependencies } from '../../src/modules/code/infrastructure/code-commit-guidance.ts';
import { createCodeCommitMaterialReader, type CodeCommitMaterialReaderDependencies } from '../../src/modules/code/infrastructure/code-commit-material.ts';
import type { AgentGenerationInput } from '../../src/modules/agent-operations/module.ts';

function fixture(t: test.TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-commit-guidance-')), repository = path.join(root, 'repository');
  fs.mkdirSync(repository); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const git = (directory: string, ...args: string[]) => execFileSync('git', ['-C', directory, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git(repository, 'init', '--initial-branch=main'); git(repository, 'config', 'user.name', 'Guidance Fixture'); git(repository, 'config', 'user.email', 'guidance@example.invalid'); git(repository, 'config', 'commit.gpgSign', 'false');
  const write = (file: string, content: string | Buffer, directory = repository) => { const target = path.join(directory, file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, content); };
  const catalog = { repositories: [{ id: 'repo', code: 'repo', name: 'Fixture', source: { type: 'workspace', path: 'repository' } }], projects: [{ code: 'one', serviceIds: ['service'], source: { type: 'workspace', path: 'repository/project-one' } }, { code: 'other', serviceIds: ['service'], source: { type: 'workspace', path: 'repository/project-other' } }], services: [{ id: 'service', code: 'service', repositoryId: 'repo', modulePath: 'project-one' }] };
  const tasks = new Map<string, { taskId: string; title: string; intent: string; scope: { projects: string[]; services: Array<{ project: string; service: string }> } }>();
  const evidence = new Map<string, { evidence: { repositories: Array<{ sourceRepository: string; checkoutPath: string; branch?: string }> } }>();
  const evidenceDirectory = path.join(root, 'evidence'); fs.mkdirSync(evidenceDirectory);
  const dependencies: CodeCommitGuidanceDependencies = { assetCatalog: () => catalog, resolveSourceRoot: (workspace, source) => path.resolve(workspace, source.path), taskContext: (_root, id) => { const value = tasks.get(id); if (!value) throw Error('missing task'); return value; }, gitWorktreeEvidenceDirectories: () => [evidenceDirectory], readGitWorktreeEvidence: (_root, id) => evidence.get(id) || null };
  const app = createCodeApplication({ ...dependencies, readTaskScope: (_root, id) => dependencies.taskContext(root, id).scope, readTask: dependencies.taskContext });
  const location = (directory = repository) => { const tree = app.sourceControl(root).repositories[0].worktrees.find(item => item.location === fs.realpathSync(directory))!; return { repositoryId: 'repo', worktreeId: tree.worktreeId }; };
  const commit = (message = 'base') => { git(repository, 'add', '--all'); git(repository, 'commit', '-qm', message); };
  const associate = (id: string, directory: string, branch = 'feature') => {
    tasks.set(id, { taskId: id, title: 'Reliable task title', intent: 'Describe the target behavior', scope: { projects: [], services: [{ project: 'one', service: 'service' }] } });
    evidence.set(id, { evidence: { repositories: [{ sourceRepository: repository, checkoutPath: directory, branch }] } }); fs.writeFileSync(path.join(evidenceDirectory, id + '.json'), '{}');
  };
  const selectedRules = new Map<string, ReturnType<CodeCommitMaterialReaderDependencies['readRules']>>();
  const commitMaterial = createCodeCommitMaterialReader({ readRules: target => selectedRules.get(target) || [] });
  const generation = (directory = repository) => {
    let captured: AgentGenerationInput | undefined;
    const application = createCodeCommitMessageApplication({ commitSnapshot: app.commitSnapshot, commitGuidance: (workspace, snapshot) => readCodeCommitGuidance(workspace, snapshot, dependencies), commitMaterial, startGeneration: input => { captured = input; return { id: 'run', agentId: 'codex', registrationRevision: 'v1', status: 'queued', output: null, error: null, executionConfig: null }; } });
    return { application, input: () => ({ ...location(directory), expectedRevision: app.commitContext(root, location(directory)).revision }), captured: () => captured! };
  };
  return { root, repository, git, write, catalog, tasks, evidence, dependencies, app, location, commit, associate, generation, selectedRules, commitMaterial };
}

test('mixed text, binary and type changes supply bounded real evidence without granting tools', async t => {
  const f = fixture(t); f.write('modified.bin', Buffer.from([0, 1])); f.write('deleted.bin', Buffer.from([0, 3])); f.write('becomes-text', Buffer.from([0, 6])); f.write('becomes-binary', 'previous text\n'); f.write('becomes-link', Buffer.from([0, 8])); f.write('tracked.txt', 'before\n'); f.commit();
  f.write('modified.bin', Buffer.from([0, 9])); fs.unlinkSync(path.join(f.repository, 'deleted.bin')); f.write('added.bin', Buffer.from([0, 10])); f.write('becomes-text', 'CURRENT-TEXT-SENTINEL\n'); f.write('becomes-binary', Buffer.from([0, 11])); fs.unlinkSync(path.join(f.repository, 'becomes-link')); fs.symlinkSync('tracked.txt', path.join(f.repository, 'becomes-link')); f.write('tracked.txt', 'after\n'); f.write('new.txt', 'NEW-TEXT-SENTINEL\n');
  const before = f.git(f.repository, 'status', '--porcelain'), g = f.generation(); await g.application.generateCommitMessage(f.root, g.input());
  assert.match(g.captured().prompt, /NEW-TEXT-SENTINEL|CURRENT-TEXT-SENTINEL/); assert.match(g.captured().prompt, /modified.bin/); assert.doesNotMatch(g.captured().prompt, /GIT binary patch/);
  assert.match(g.captured().prompt, /all-final-uncommitted-changes/); assert.ok(Buffer.byteLength(g.captured().prompt) < 16 * 1024);
  assert.equal(g.captured().environment, undefined); assert.match(g.captured().prompt, /after/);
  await g.captured().validateResult!({ commitMessage: 'Update resources and current text' });
  assert.equal(f.git(f.repository, 'rev-list', '--count', 'HEAD'), '1'); assert.equal(f.git(f.repository, 'status', '--porcelain'), before);
});

test('unborn and binary-only repositories supply useful bounded content or metadata', async t => {
  const f = fixture(t); f.write('staged.txt', 'STAGED-BODY-SENTINEL\n'); f.git(f.repository, 'add', '--', 'staged.txt'); f.write('new.txt', 'UNTRACKED-BODY-SENTINEL\n'); f.write('new.bin', Buffer.from([0, 1]));
  const g = f.generation(); await g.application.generateCommitMessage(f.root, g.input()); assert.match(g.captured().prompt, /STAGED-BODY-SENTINEL/); assert.match(g.captured().prompt, /UNTRACKED-BODY-SENTINEL/);
  fs.unlinkSync(path.join(f.repository, 'staged.txt')); f.git(f.repository, 'rm', '--cached', 'staged.txt'); fs.unlinkSync(path.join(f.repository, 'new.txt'));
  const binary = f.generation(); await binary.application.generateCommitMessage(f.root, binary.input()); assert.match(binary.captured().prompt, /new.bin/); assert.match(binary.captured().prompt, /"kind":"binary"/);
});

test('a complete source with a diff exceeding 8 MiB still starts generation with the shared no-diff revision', async t => {
  const f = fixture(t), original = ('a'.repeat(1024) + '\n').repeat(5500), current = ('b'.repeat(1024) + '\n').repeat(5500);
  f.write('large.txt', original); f.commit(); f.write('large.txt', current); f.write('prototype.html', 'PROTOTYPE-BODY-SENTINEL'.repeat(60_000));
  assert.throws(() => f.app.commitSnapshot(f.root, f.location()), { code: 'code_commit_observation_incomplete' });
  const g = f.generation(); await g.application.generateCommitMessage(f.root, g.input());
  assert.ok(Buffer.byteLength(g.captured().prompt) <= 16 * 1024);
  const data = JSON.parse(g.captured().prompt.split('<materials>\n')[1].split('\n</materials>')[0]);
  assert.ok(data.evidence.every((item: { text: string; partial: boolean }) => Buffer.byteLength(JSON.stringify(item)) <= 1536 && item.partial));
  await g.captured().validateResult!({ commitMessage: 'Update current content and prototype' });
});

test('existing 16 MiB and 1000-path source observation bounds remain explicit before agent start', async t => {
  const f = fixture(t); f.write('large.bin', Buffer.alloc(17 * 1024 * 1024));
  const g = f.generation(); await assert.rejects(g.application.generateCommitMessage(f.root, { ...f.location(), expectedRevision: 'unused' }), { code: 'code_commit_observation_incomplete' }); assert.equal(g.captured(), undefined);
  fs.unlinkSync(path.join(f.repository, 'large.bin')); for (let index = 0; index < 1001; index++) f.write('file-' + index, 'x');
  await assert.rejects(g.application.generateCommitMessage(f.root, { ...f.location(), expectedRevision: 'unused' }), { code: 'code_commit_observation_incomplete' }); assert.equal(g.captured(), undefined);
});

test('entry discovery uses selected checkout and explicit task scopes with exact external rule roots', async t => {
  const f = fixture(t); f.write('AGENTS.md', 'CANONICAL-RULE-BODY'); f.write('project-one/AGENTS.md', 'CANONICAL-PROJECT-BODY'); f.write('project-other/AGENTS.md', 'UNRELATED-PROJECT-BODY'); f.write('project-one/code.txt', 'before\n'); f.commit('HISTORY-SUBJECT-SENTINEL'); f.write('AGENTS.md', 'INDEPENDENT-WORKSPACE-BODY', f.root);
  const checkout = path.join(f.root, 'candidate'); f.git(f.repository, 'worktree', 'add', '-b', 'feature', checkout); f.write('AGENTS.md', 'CANDIDATE-RULE-BODY', checkout); f.write('project-one/code.txt', 'after\n', checkout); f.associate('actual-task', checkout);
  const snapshot = f.app.commitSnapshot(f.root, f.location(checkout), { includeDiff: false }), guidance = readCodeCommitGuidance(f.root, snapshot, f.dependencies);
  assert.ok(guidance.ruleEntrypoints.includes(path.join(fs.realpathSync(checkout), 'AGENTS.md'))); assert.ok(guidance.ruleEntrypoints.includes(path.join(fs.realpathSync(checkout), 'project-one/AGENTS.md')));
  assert.ok(!guidance.ruleEntrypoints.includes(path.join(fs.realpathSync(f.repository), 'AGENTS.md'))); assert.ok(!guidance.ruleEntrypoints.some(entry => entry.includes('project-other')));
  assert.ok(guidance.readableRoots.includes(path.join(fs.realpathSync(f.root), 'AGENTS.md'))); assert.ok(!guidance.readableRoots.includes(fs.realpathSync(f.root)));
  assert.ok(guidance.readableRoots.includes(fs.realpathSync(path.join(f.repository, '.git')))); assert.deepEqual(guidance.task, { taskId: 'actual-task', title: 'Reliable task title', intent: 'Describe the target behavior' });
  const g = f.generation(checkout); await g.application.generateCommitMessage(f.root, g.input()); assert.doesNotMatch(g.captured().prompt, /INDEPENDENT-WORKSPACE-BODY|HISTORY-SUBJECT-SENTINEL/);
  // The actual AGENTS change is legitimate diff evidence, not rule-body injection.
  assert.match(g.captured().prompt, /-CANONICAL-RULE-BODY/); assert.match(g.captured().prompt, /\+CANDIDATE-RULE-BODY/);
});

test('missing, ambiguous and branch-drifted task associations omit task background without blocking generation', async t => {
  const f = fixture(t); f.write('code.txt', 'before\n'); f.commit(); const checkout = path.join(f.root, 'candidate'); f.git(f.repository, 'worktree', 'add', '-b', 'feature', checkout); f.write('code.txt', 'after\n', checkout);
  const snapshot = f.app.commitSnapshot(f.root, f.location(checkout), { includeDiff: false }); assert.equal(readCodeCommitGuidance(f.root, snapshot, f.dependencies).task, null);
  f.associate('task-one', checkout); f.associate('task-two', checkout); assert.equal(readCodeCommitGuidance(f.root, snapshot, f.dependencies).task, null);
  f.evidence.delete('task-two'); f.tasks.delete('task-one'); assert.equal(readCodeCommitGuidance(f.root, snapshot, f.dependencies).task, null);
  f.associate('task-one', checkout, 'different-branch'); assert.equal(readCodeCommitGuidance(f.root, snapshot, f.dependencies).task, null);
  const g = f.generation(checkout); await g.application.generateCommitMessage(f.root, g.input()); await g.captured().validateResult!({ commitMessage: 'Update current behavior' });
});

test('oversized or unselected rules remain explicit partial material without blocking generation', async t => {
  const f = fixture(t); f.write('code.txt', 'before\n'); f.commit(); f.write('code.txt', 'after\n'); f.write('AGENTS.md', 'RULE-BODY-SENTINEL'.repeat(40_000), f.root); f.write('rules/manifest.yml', 'AGENT-DECIDES-MANIFEST-CONTENT', f.root); f.write('rules/optional.md', 'OPTIONAL-RULE-SENTINEL', f.root);
  const g = f.generation(); await g.application.generateCommitMessage(f.root, g.input());
  assert.ok(Buffer.byteLength(g.captured().prompt) < 16 * 1024); assert.doesNotMatch(g.captured().prompt, /RULE-BODY-SENTINEL|AGENT-DECIDES-MANIFEST-CONTENT|OPTIONAL-RULE-SENTINEL/);
  assert.equal(g.captured().environment, undefined); assert.match(g.captured().prompt, /"rulesPartial":true/);
});

test('independent rule entry changes invalidate results while unrelated workspace files do not', async t => {
  const f = fixture(t); f.write('code.txt', 'before\n'); f.commit(); f.write('code.txt', 'after\n'); f.write('AGENTS.md', 'Original rule entry', f.root);
  const g = f.generation(); await g.application.generateCommitMessage(f.root, g.input()); const revision = f.app.commitContext(f.root, f.location()).revision;
  f.write('unrelated.txt', 'unrelated workspace fact', f.root); await g.captured().validateResult!({ commitMessage: 'Update behavior' });
  f.write('AGENTS.md', 'Rule entry changed during generation', f.root); assert.equal(f.app.commitContext(f.root, f.location()).revision, revision);
  await assert.rejects(async () => g.captured().validateResult!({ commitMessage: 'Update behavior' }), { code: 'code_source_changed' });
});

test('newly created entry files and manifest metadata changes are observed without hashing every external rule body', async t => {
  const f = fixture(t); f.write('code.txt', 'before\n'); f.commit(); f.write('code.txt', 'after\n'); const g = f.generation(); await g.application.generateCommitMessage(f.root, g.input());
  f.write('AGENTS.md', 'Newly created entry', f.root); await assert.rejects(async () => g.captured().validateResult!({ commitMessage: 'Update behavior' }), { code: 'code_source_changed' });
  f.write('rules/manifest.yml', 'Initial manifest', f.root); f.write('rules/required.md', 'Original rule body', f.root); const fresh = f.generation(); await fresh.application.generateCommitMessage(f.root, fresh.input());
  f.write('rules/required.md', 'Changed body is outside the entry snapshot guarantee', f.root); await fresh.captured().validateResult!({ commitMessage: 'Update behavior' });
  f.write('rules/manifest.yml', 'Manifest changed while generating', f.root); await assert.rejects(async () => fresh.captured().validateResult!({ commitMessage: 'Update behavior' }), { code: 'code_source_changed' });
});

test('symlinked external entry files cannot grant access to a replacement outside the declared roots', async t => {
  const f = fixture(t); f.write('code.txt', 'before\n'); f.commit(); f.write('code.txt', 'after\n'); f.write('outside.md', 'outside rule', f.root); fs.symlinkSync(path.join(f.root, 'outside.md'), path.join(f.root, 'AGENTS.md'));
  const g = f.generation(); await assert.rejects(g.application.generateCommitMessage(f.root, g.input()), { code: 'code_commit_rules_unavailable' }); assert.equal(g.captured(), undefined);
});

test('task evidence changing after start invalidates the previous trailer without changing Git content', async t => {
  const f = fixture(t); f.write('code.txt', 'before\n'); f.commit(); const checkout = path.join(f.root, 'candidate'); f.git(f.repository, 'worktree', 'add', '-b', 'feature', checkout); f.write('code.txt', 'after\n', checkout); f.associate('task-one', checkout);
  const g = f.generation(checkout); await g.application.generateCommitMessage(f.root, g.input()); const revision = f.app.commitContext(f.root, f.location(checkout)).revision;
  f.associate('task-two', checkout); assert.equal(f.app.commitContext(f.root, f.location(checkout)).revision, revision);
  await assert.rejects(async () => g.captured().validateResult!({ commitMessage: 'Update behavior\n\nBuildr-Task: task-one' }), { code: 'code_source_changed' });
  const fresh = f.generation(checkout); await fresh.application.generateCommitMessage(f.root, fresh.input()); await fresh.captured().validateResult!({ commitMessage: 'Update behavior' });
});

test('bounded material retains late language rules, override precedence and selected installed rule defaults', async t => {
  const f = fixture(t); f.write('code.txt', 'before\n'); f.commit(); f.write('code.txt', 'after\n');
  f.write('AGENTS.md', '普通开发流程。'.repeat(1500) + '\n\n面向用户的回复和文档默认使用中文。', f.root);
  f.write('AGENTS.md', 'Use Chinese for commit messages.'); f.write('AGENTS.override.md', 'Use English for commit messages.');
  f.write('rules/manifest.yml', 'opaque fixture manifest', f.root); f.write('rules/required.md', '## Commit message\n\nUse type(scope): subject.\n', f.root); f.write('rules/modified.md', '## Commit subject\n\nKeep the subject factual.\n', f.root); f.write('rules/disabled.md', 'commit message DISABLED-SENTINEL', f.root); f.write('rules/optional.md', 'UNRELATED-OPTIONAL-SENTINEL', f.root);
  f.selectedRules.set(fs.realpathSync(f.root), [{ path: 'rules/required.md', required: true }, { path: 'rules/modified.md', required: true, state: 'modified' }, { path: 'rules/disabled.md', required: true, enabled: false }, { path: 'rules/optional.md', required: false, description: 'Unrelated development flow' }]);
  const g = f.generation(); await g.application.generateCommitMessage(f.root, g.input());
  const data = JSON.parse(g.captured().prompt.split('<materials>\n')[1].split('\n</materials>')[0]);
  assert.match(JSON.stringify(data.rules), /默认使用中文/); assert.match(JSON.stringify(data.rules), /Use English/); assert.doesNotMatch(JSON.stringify(data.rules), /Use Chinese|普通开发流程|DISABLED-SENTINEL|UNRELATED-OPTIONAL-SENTINEL/);
  assert.match(JSON.stringify(data.rules), /type\(scope\): subject/); assert.match(JSON.stringify(data.rules), /Keep the subject factual/);
  assert.ok(data.rules.some((rule: { source: string }) => rule.source === 'AGENTS.override.md'));
  assert.ok(Buffer.byteLength(g.captured().prompt) <= 16 * 1024);
});

test('an actually read external rule body is revalidated without relying only on manifest or Git versions', async t => {
  const f = fixture(t); f.write('code.txt', 'before\n'); f.commit(); f.write('code.txt', 'after\n');
  f.write('rules/manifest.yml', 'opaque fixture manifest', f.root); f.write('rules/required.md', 'Commit messages must use English.\n', f.root);
  f.selectedRules.set(fs.realpathSync(f.root), [{ path: 'rules/required.md', required: true }]);
  const g = f.generation(); await g.application.generateCommitMessage(f.root, g.input());
  const revision = f.app.commitContext(f.root, f.location()).revision; f.write('rules/required.md', 'Commit messages must use Chinese.\n', f.root);
  assert.equal(f.app.commitContext(f.root, f.location()).revision, revision);
  await assert.rejects(async () => g.captured().validateResult!({ commitMessage: 'Update behavior' }), error => (error as { code?: string }).code === 'code_source_changed' && /材料/.test((error as Error).message));
});

test('bounded evidence balances a real tracked change with large new source and skips leading imports', async t => {
  const f = fixture(t); f.write('README.md', 'Old readme.\n'); f.commit(); f.write('README.md', 'Describe the source-control commit panel.\n');
  f.write('src/large-input.ts', Array.from({ length: 40 }, (_, index) => `import value${index} from './module${index}';`).join('\n') + '\nexport const CORE_BEHAVIOR = "current intent";\n' + '// large filler\n'.repeat(30_000));
  for (let index = 0; index < 20; index++) f.write(`src/support-${index}.ts`, `export const support${index} = true;\n`);
  const g = f.generation(); await g.application.generateCommitMessage(f.root, g.input());
  assert.match(g.captured().prompt, /CORE_BEHAVIOR/); assert.match(g.captured().prompt, /Describe the source-control commit panel/);
  const data = JSON.parse(g.captured().prompt.split('<materials>\n')[1].split('\n</materials>')[0]);
  assert.ok(data.evidence.length <= 8); assert.ok(data.coverage.omittedEvidenceFiles > 0); assert.equal(data.coverage.evidencePartial, true);
  assert.ok(Buffer.byteLength(g.captured().prompt) <= 16 * 1024);
});

test('tracked patch samples prioritize changed behavior over a long import-only prefix', async t => {
  const f = fixture(t); f.write('src/feature.ts', 'export function enabled() { return false; }\n'); f.commit();
  f.write('src/feature.ts', Array.from({ length: 40 }, (_, index) => `import value${index} from "./module${index}";`).join('\n') + '\nexport function enabled() { return true; }\n');
  const g = f.generation(); await g.application.generateCommitMessage(f.root, g.input());
  const data = JSON.parse(g.captured().prompt.split('<materials>\n')[1].split('\n</materials>')[0]);
  assert.equal(data.evidence[0].format, 'diff'); assert.match(data.evidence[0].text, /return true/); assert.equal(data.evidence[0].partial, true);
});

test('material patch reads do not execute configured Git clean filters or change their settings', async t => {
  const f = fixture(t), marker = path.join(f.root, 'filter-executed');
  f.write('.gitattributes', 'src/filtered.ts filter=sample\n'); f.write('src/filtered.ts', 'export const enabled = false;\n'); f.commit();
  const filter = `printf executed >> '${marker.replace(/'/g, "'\\''")}'; cat`;
  f.git(f.repository, 'config', 'filter.sample.clean', filter); f.git(f.repository, 'config', 'filter.sample.required', 'true'); f.write('src/filtered.ts', 'export const enabled = true;\n');
  // The existing source observation is a separate reader. This regression owns
  // the new material diff boundary, after an exact snapshot has been captured.
  const snapshot = f.app.commitSnapshot(f.root, f.location(), { includeDiff: false });
  f.git(f.repository, '--no-optional-locks', 'diff', '--no-ext-diff', '--no-textconv', snapshot.head!, '--', 'src/filtered.ts');
  assert.ok(fs.existsSync(marker), 'prove that the configured clean filter is executable'); fs.unlinkSync(marker);
  const guidance = readCodeCommitGuidance(f.root, snapshot, f.dependencies), beforeIndex = fs.readFileSync(snapshot.indexPath);
  const result = await f.commitMaterial(snapshot, guidance, 14 * 1024);
  assert.equal(fs.existsSync(marker), false); assert.match(result.text, /enabled = true/);
  assert.equal(f.git(f.repository, 'config', '--get', 'filter.sample.clean'), filter); assert.equal(f.git(f.repository, 'config', '--get', 'filter.sample.required'), 'true');
  assert.deepEqual(fs.readFileSync(snapshot.indexPath), beforeIndex); assert.equal(fs.readFileSync(path.join(f.repository, 'src/filtered.ts'), 'utf8'), 'export const enabled = true;\n');
});
