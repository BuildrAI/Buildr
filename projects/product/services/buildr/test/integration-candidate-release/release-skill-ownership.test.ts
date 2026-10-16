import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { candidateCheckInputIdentity, createCandidateSourceBinding, verificationOnlyPath } from '../../../../../../skills/buildr-release/scripts/candidate-source-binding.ts';
import { collectChangedProductPaths } from '../verification/changed-paths.ts';
import { createVerificationPlan } from '../verification/planner.ts';
import { createVerificationSourceInputReader } from '../verification/verification-source-inputs.ts';
import { enumerateSkillSourceFiles } from '../../src/modules/agent-assets/infrastructure/runtime/skills/projection-files.ts';

const productPrefix = 'projects/product/services/buildr/';
const skillPrefix = 'skills/buildr-release/';

function sourceFixture(t: test.TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-release-skill-ownership-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const productRoot = path.join(root, productPrefix);
  const git = (...args: string[]) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const write = (relative: string, value: string) => {
    const target = path.join(root, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, value);
  };
  git('init', '--initial-branch=main');
  git('config', 'user.name', 'Fixture');
  git('config', 'user.email', 'fixture@example.com');
  git('config', 'commit.gpgSign', 'false');
  write(productPrefix + 'package.json', '{"name":"@buildr-ai/buildr","version":"1.0.0"}\n');
  const commit = () => {
    git('add', '--all');
    git('commit', '-m', 'fixture');
    return git('rev-parse', 'HEAD');
  };
  return { root, productRoot, git, write, commit };
}

test('the complete release Skill source is accepted by the real projection owner and rejects root package metadata', t => {
  // Runtime sync uses this same complete-source reader through render-plan.ts.
  const source = fileURLToPath(new URL('../../../../../../skills/buildr-release/', import.meta.url));
  const inventory = enumerateSkillSourceFiles(source);
  for (const relative of ['SKILL.md', 'scripts/package.json', 'scripts/' + 'release-orchestration-runner.ts',
    'scripts/candidate-package.ts', 'scripts/dsh-plugin/release.ts']) {
    const entry = inventory.find((file: any) => file.relativePath === relative);
    assert.ok(entry, `the real Skill inventory must include ${relative}`);
    assert.deepEqual(entry.content, fs.readFileSync(path.join(source, relative)));
  }
  assert.equal(inventory.some((file: any) => file.relativePath === 'package.json'), false);
  const metadata = inventory.find((file: any) => file.relativePath === 'scripts/package.json');
  assert.equal(JSON.parse(metadata.content.toString('utf8')).type, 'module');

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-release-skill-format-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const invalid = path.join(root, 'skill');
  fs.cpSync(source, invalid, { recursive: true });
  fs.writeFileSync(path.join(invalid, 'package.json'), metadata.content);
  assert.throws(() => enumerateSkillSourceFiles(invalid), /Skill source contains unsupported top-level entries: package\.json/u);
  assert.equal(fs.existsSync(path.join(source, 'package.json')), false, 'the negative fixture must never modify the actual Skill');
});

test('the relocated source release CLI exposes help without creating release or application state', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-release-help-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const entry = fileURLToPath(new URL('../../../../../../skills/buildr-release/scripts/release-orchestration-runner.ts', import.meta.url));
  const result = spawnSync(process.execPath, [entry, '--help'], {
    cwd: root,
    env: {
      ...process.env,
      BUILDR_APP_DATA_DIR: path.join(root, 'app-data'),
      BUILDR_PRODUCT_DATA_DIR: path.join(root, 'product-data'),
    },
    encoding: 'utf8',
    timeout: 15_000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Usage: release-orchestration-runner\.ts <prepare\|inspect\|publish\|resume>/u);
  assert.match(result.stdout, /--workspace/u);
  assert.match(result.stdout, /--packages/u);
  assert.match(result.stdout, /--authorized/u);
  assert.deepEqual(fs.readdirSync(root), [], 'help must not create a Workspace, release record, profile or application data');
});

test('real Git discovery retains staged, unstaged and untracked release Skill paths in the verification namespace', t => {
  const fixture = sourceFixture(t);
  const selectedModule = skillPrefix + 'scripts/plugin-hosted-release.ts';
  const method = skillPrefix + 'SKILL.md';
  const newModule = skillPrefix + 'scripts/new-release-recovery.ts';
  fixture.write(selectedModule, 'export const value = 1;\n');
  fixture.write(method, '# Release method\n');
  fixture.write(skillPrefix + 'scripts/package.json', '{"type":"module"}\n');
  const baseline = fixture.commit();
  fixture.write(selectedModule, 'export const value = 2;\n');
  fixture.write(method, '# Updated release method\n');
  fixture.git('add', '--', method);
  fixture.write(newModule, 'export const recover = true;\n');

  const changed = collectChangedProductPaths({ productRoot: fixture.productRoot, projectRoot: path.join(fixture.root, 'projects/product'), base: baseline });
  assert.deepEqual(changed.paths, [selectedModule, method, newModule].sort());
  const plan = createVerificationPlan({ paths: changed.paths });
  assert.equal(plan.status, 'ready');
  assert.deepEqual(plan.unmapped, []);
  const ids = plan.steps.map((step: any) => step.id);
  for (const id of ['typecheck', 'unit', 'contract', 'integration-release']) assert.ok(ids.includes(id), id);
  assert.equal(ids.includes('dsh-plugin'), false, 'a release script does not claim independent plugin Loader proof');
  const release = createVerificationPlan({ paths: changed.paths, groups: ['release'] });
  assert.equal(release.status, 'ready');
  assert.ok(release.steps.some((step: any) => step.id === 'integration-candidate-release'), 'the explicit release scope retains its tool regression');
});

test('relocated package producers and payload inputs require new package bytes after a real source change', t => {
  const fixture = sourceFixture(t);
  const buildInputs = [
    skillPrefix + 'scripts/package.json',
    ...['candidate-package', 'application-payload', 'application-payload-entry', 'mysql-connection-entry',
      'release-artifact', 'release-files', 'release-contract', 'release-notes'].map(name => skillPrefix + `scripts/${name}.ts`),
    skillPrefix + 'scripts/dsh-plugin/release.ts',
  ];
  for (const file of buildInputs) fixture.write(file, file.endsWith('.json') ? '{"private":true,"type":"module"}\n' : 'export const original = true;\n');
  let original = fixture.commit();
  for (const file of buildInputs) {
    assert.equal(verificationOnlyPath(file), false, file);
    fixture.write(file, file.endsWith('.json') ? '{"private":true,"type":"module","version":"1.0.1"}\n' : 'export const original = false;\n');
    const changed = fixture.commit();
    assert.throws(() => createCandidateSourceBinding(fixture.root, original, changed), (error: any) => {
      assert.equal(error.code, 'candidate-build-inputs-changed');
      assert.deepEqual(error.changedPaths, [file]);
      return true;
    }, file);
    original = changed;
  }
});

test('method and publication recovery repairs preserve the original package source binding', t => {
  const fixture = sourceFixture(t);
  const repairs = [
    skillPrefix + 'SKILL.md',
    'skills/buildr-release/scripts/release-orchestration-runner.ts',
    skillPrefix + 'scripts/candidate-repair-operation.ts',
    skillPrefix + 'scripts/dsh-plugin/release-workflow.ts',
  ];
  for (const file of repairs) fixture.write(file, '// original method or recovery\n');
  fixture.write(skillPrefix + 'scripts/candidate-package.ts', '// original producer\n');
  const original = fixture.commit();
  for (const file of repairs) {
    assert.equal(verificationOnlyPath(file), true, file);
    fixture.write(file, '// revised method or recovery\n');
  }
  const repaired = fixture.commit();
  const binding = createCandidateSourceBinding(fixture.root, original, repaired);
  assert.equal(binding.productSource, original);
  assert.equal(binding.verificationSource, repaired);
  assert.notEqual(binding.productTree, binding.verificationTree);
  assert.equal(binding.buildInputsIdentity, createCandidateSourceBinding(fixture.root, original, original).buildInputsIdentity);
});

test('local and immutable proofs track selected release Skill modules and real dependencies without binding unrelated scripts', t => {
  const fixture = sourceFixture(t);
  const selectedTest = 'test/integration-candidate-release/selected.test.ts';
  const selectedModule = 'skills/buildr-release/scripts/release-selection.ts';
  const dependency = 'skills/buildr-release/scripts/release-files.ts';
  const unrelated = 'skills/buildr-release/scripts/release-publication.ts';
  const method = skillPrefix + 'SKILL.md';
  fixture.write(productPrefix + selectedTest, "import '../../../../../../skills/buildr-release/scripts/release-selection.ts';\n");
  fixture.write(selectedModule, "import './release-files.ts';\nexport const selected = true;\n");
  fixture.write(dependency, 'export const dependency = true;\n');
  fixture.write(unrelated, 'export const unrelated = true;\n');
  fixture.write(method, '# Release method\n');
  let source = fixture.commit();
  const observe = () => Object.fromEntries((['backend', 'runtime'] as const).map(scope => {
    const step = { id: 'selected-release-proof', executor: { type: 'node-test', files: [selectedTest] }, reuse: { scope } };
    const local = createVerificationSourceInputReader(fixture.root, fixture.productRoot).inputs(step, true);
    const immutable = createVerificationSourceInputReader(fixture.root, fixture.productRoot, source).inputs(step, true);
    assert.equal(local.fallback, false, scope);
    assert.deepEqual(local, immutable, `${scope}: local and Git input selection must agree`);
    return [scope, { inputs: local, candidate: candidateCheckInputIdentity(fixture.root, source, step) }];
  }));
  const original = observe();
  fixture.write(unrelated, 'export const unrelated = false;\n');
  fixture.write(method, '# Revised release method\n');
  source = fixture.commit();
  assert.deepEqual(observe(), original, 'unexecuted Skill scripts and method text do not alter this proof');
  for (const file of [selectedModule, dependency, productPrefix + selectedTest, skillPrefix + 'scripts/package.json']) {
    const before = observe();
    fixture.write(file, file.endsWith('/package.json') ? '{"type":"commonjs"}\n'
      : fs.readFileSync(path.join(fixture.root, file), 'utf8') + '// real consumed input changed\n');
    source = fixture.commit();
    const after = observe();
    for (const scope of ['backend', 'runtime']) {
      assert.notEqual(after[scope].inputs.recipeIdentity, before[scope].inputs.recipeIdentity, `${scope}: ${file}`);
      assert.notEqual(after[scope].candidate, before[scope].candidate, `${scope}: ${file}`);
    }
  }
});
