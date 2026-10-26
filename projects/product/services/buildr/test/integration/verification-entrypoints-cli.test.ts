import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { PACKAGE_VERIFIERS } from '../../tools/verification/package-check/verification-registry.ts';
import { validateProductSourceReferences } from '../verification/cli/product-source-layout.ts';

const productRoot: any = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const projectRoot: any = path.resolve(productRoot, '../..');

function defaultPlanningEnvironment(): any  {
  const environment: any = { ...process.env };
  delete environment.BUILDR_VERIFICATION_PROFILE;
  return environment;
}

test('architecture scan includes the release Skill and root callers while preserving retired-path detection', t => {
  const repository = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-architecture-release-paths-'));
  t.after(() => fs.rmSync(repository, { recursive: true, force: true }));
  const product = 'projects/product/services/buildr/';
  const write = (relative: string, source: string) => {
    const file = path.join(repository, relative); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, source);
  };
  const current = '../../../../skills/buildr-release/scripts/release-orchestration-runner.ts';
  const retired = ['scripts', 'release.ts'].join('/');
  const unrelatedSkill = ['skills', 'other', 'scripts', 'release.ts'].join('/');
  write(product + 'test/release.test.ts', `import '${current}';\n`);
  write(product + 'test/skill-template.test.ts', "const releaseSkill = '../../../../skills/buildr-release';\nread(`${releaseSkill}/scripts/release-orchestration-runner.ts`);\n");
  write(product + 'test/skill-prefix.test.ts', "const skillPrefix = 'skills/buildr-release/';\nread(`${skillPrefix}scripts/release-readiness.ts`);\n");
  write(product + 'docs/cli-architecture.md', `Release owner: ${current}\n`);
  write('skills/buildr-release/SKILL.md', `node ${current}\n`);
  write('skills/buildr-release/scripts/release-orchestration-runner.ts', "export const ready = true;\n");
  write('.github/workflows/verify.yml', `run: node ${current}\n`);
  assert.deepEqual(validateProductSourceReferences(repository), [], 'current release references are accepted at each real source boundary');

  const rejected = [
    product + 'test/mixed-release.test.ts', 'skills/buildr-release/scripts/release-recovery.ts',
    'skills/buildr-release/SKILL.md', '.github/workflows/publish-dsh-plugin.yml', '.github/pull_request_template.md',
  ];
  for (const file of rejected) write(file, `current: ${current}\nretired: ${retired}\n`);
  const relativeLegacyFile = product + 'tools/relative-legacy.ts';
  write(relativeLegacyFile, `import '${['..', '..', 'scripts', 'release.ts'].join('/')}';\n`);
  write(product + 'tools/other-skill.ts', `import '${unrelatedSkill}';\n`);
  write(product + 'test/fixtures/historical.ts', retired);
  write(product + 'docs/archive/historical.md', retired);
  assert.deepEqual(validateProductSourceReferences(repository), [...rejected, relativeLegacyFile, product + 'tools/other-skill.ts'].sort()
    .map(file => `current Product file references migrated root path: ${file}`),
  'the exact current Skill prefix cannot hide another retired reference or another Skill owner');
});

test('documentation quality ignores trailing whitespace', () => {
  const temporaryRoot: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-docs-whitespace-'));
  const isolatedProject: any = path.join(temporaryRoot, 'projects/product');
  const isolatedService: any = path.join(isolatedProject, 'services/buildr');
  const document: any = path.join(isolatedProject, 'openspec/trailing-whitespace.md');
  const relativeDocument: any = 'openspec/trailing-whitespace.md';
  fs.mkdirSync(path.dirname(document), { recursive: true });
  for (const relative of ['test/verification/docs/quality.ts', 'src/modules/task/domain/task.ts', 'src/infrastructure/filesystem/filesystem-path-identity.ts']) {
    const target = path.join(isolatedService, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true }); fs.copyFileSync(path.join(productRoot, relative), target);
  }
  fs.writeFileSync(document, '# Example  \n\nbody  \n', 'utf8');
  try {
    const runner: any = path.join(isolatedService, 'test', 'verification', 'docs', 'quality.ts');
    const result: any = spawnSync(process.execPath, [runner], {
      cwd: productRoot,
      encoding: 'utf8',
      env: { ...process.env, BUILDR_CHANGED_PATHS_JSON: JSON.stringify([relativeDocument]) },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Documentation quality passed: 1 file\(s\)\./);
    assert.equal(result.stderr, '');
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test('public verification lists concrete checks and rejects invalid options before execution', () => {
  const runner = path.join(productRoot, 'test/verification/cli.ts');
  const help = spawnSync(process.execPath, [runner, 'related', '--help'], { cwd: productRoot, encoding: 'utf8' });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /--check <id>/);
  const listed = spawnSync(process.execPath, [runner, 'related', '--list'], { cwd: productRoot, encoding: 'utf8' });
  assert.equal(listed.status, 0, listed.stderr);
  const catalogue = JSON.parse(listed.stdout);
  assert.ok(catalogue.some((check: any) => check.id === 'workspace-lifecycle'));
  assert.ok(catalogue.every((check: any) => ['Static', 'Unit', 'Integration', 'E2E'].includes(check.type)));
  assert.equal(new Set(catalogue.map((check: any) => check.id)).size, catalogue.length);
  const unknown = spawnSync(process.execPath, [runner, 'related', '--unknown'], { cwd: productRoot, encoding: 'utf8' });
  assert.equal(unknown.status, 2);
  assert.match(unknown.stderr, /Unknown verification option/);
  assert.doesNotMatch(`${unknown.stdout}${unknown.stderr}`, /Verification (?:passed|not-passed|incomplete)/);
});

test('candidate rejects invalid scheduling and execution profiles before verification', () => {
  const runner: any = path.join(productRoot, 'test', 'verification', 'candidate.ts');
  const invalidScheduling: any = spawnSync(process.execPath, [runner], {
    cwd: productRoot, encoding: 'utf8', env: { ...process.env, BUILDR_VERIFICATION_SCHEDULING: 'unknown' },
  });
  assert.equal(invalidScheduling.status, 1);
  assert.match(invalidScheduling.stderr, /Invalid verification scheduling mode/);
  assert.doesNotMatch(`${invalidScheduling.stdout}${invalidScheduling.stderr}`, /\[verify-product\]/);
  const invalidProfile: any = spawnSync(process.execPath, [runner], {
    cwd: productRoot, encoding: 'utf8', env: { ...process.env, BUILDR_VERIFICATION_PROFILE: 'unknown' },
  });
  assert.equal(invalidProfile.status, 1);
  assert.match(invalidProfile.stderr, /Unknown verification execution profile/);
  assert.doesNotMatch(`${invalidProfile.stdout}${invalidProfile.stderr}`, /\[verify-product\]/);
});

test('candidate full plan only uses Candidate profile and rejects changed-path options', () => {
  const runner: any = path.join(productRoot, 'test', 'verification', 'candidate.ts');
  const environment: any = defaultPlanningEnvironment();
  const planned: any = spawnSync(process.execPath, [runner, '--json'], { cwd: productRoot, encoding: 'utf8', maxBuffer: 1024 * 1024, env: environment });
  assert.equal(planned.status, 0, planned.stderr);
  const payload: any = JSON.parse(planned.stdout);
  assert.equal(payload.schemaVersion, 'buildr.verification-full-plan/v1');
  assert.equal(payload.base, null);
  assert.equal(payload.source, 'candidate');
  assert.deepEqual(payload.paths, []);
  assert.deepEqual(payload.preflightSteps, []);
  assert.equal('admissionStepIds' in payload, false);
  assert.equal(new Set(payload.steps.map((step: any) => step.id)).size, payload.steps.length);
  assert.equal(payload.steps.some((step: any) => step.id === 'repository-onboarding'), false);
  for (const id of [
    'integration-changed-paths', 'integration-verification-runtime', 'integration-public-json', 'integration-openspec-audit',
    'e2e-workspace', 'e2e-task', 'e2e-worktree', 'e2e-runtime-recovery',
    'integration-web-http', 'e2e-app-process',
  ]) {
    assert.equal(payload.steps.filter((step: any) => step.id === id).length, 1);
  }
  assert.equal(payload.steps.some((step: any) => step.id === 'system'), false);
  const changed: any = spawnSync(process.execPath, [runner, '--base', 'HEAD^', '--json'], { cwd: productRoot, encoding: 'utf8', env: environment });
  assert.equal(changed.status, 1);
  assert.match(changed.stderr, /Unknown Candidate verification option: --base/);
  const unknown: any = spawnSync(process.execPath, [runner, '--unknown'], { cwd: productRoot, encoding: 'utf8', env: environment });
  assert.equal(unknown.status, 1);
  assert.match(unknown.stderr, /Unknown Candidate verification option/);
  assert.doesNotMatch(`${unknown.stdout}${unknown.stderr}`, /\[verify-product\]/);
});

test('push check includes the full Static and Unit set and exposes exact package exclusions', () => {
  const runner = path.join(productRoot, 'test/verification/cli.ts');
  const planned = spawnSync(process.execPath, [runner, 'check', '--json'], { cwd: productRoot, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, env: defaultPlanningEnvironment() });
  const payload = JSON.parse(planned.stdout);
  assert.equal(planned.status, payload.status === 'ready' ? 0 : 1, planned.stderr);
  assert.equal(payload.mode, 'check');
  assert.equal(payload.selection, 'full');
  assert.ok(payload.steps.some((step: any) => step.testing.executionBoundary === 'Unit'));
  assert.ok(payload.steps.some((step: any) => step.testing.executionBoundary === 'Static'));
  assert.ok(payload.steps.every((step: any) => ['Static', 'Unit'].includes(step.testing.executionBoundary)));
  assert.equal('admissionStepIds' in payload, false);
  assert.ok(payload.steps.every((step: any) => !('admission' in step) && !('targetDurationMs' in step.testing)));
  assert.ok(payload.targetExclusions.every((step: any) => step.target === 'artifact' && step.reason));
});

test('push check cannot be narrowed by an explicit check and Candidate rejects retired profiles', () => {
  const runner = path.join(productRoot, 'test/verification/cli.ts');
  const environment = defaultPlanningEnvironment();
  const invoke = (...args: string[]) => spawnSync(process.execPath, [runner, ...args, '--json'], { cwd: productRoot, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, env: environment });
  const full = invoke('check'), explicit = invoke('check', '--check', 'unit');
  const fullPlan = JSON.parse(full.stdout), explicitPlan = JSON.parse(explicit.stdout);
  assert.equal(full.status, fullPlan.status === 'ready' ? 0 : 1, full.stderr);
  assert.equal(explicit.status, explicitPlan.status === 'ready' ? 0 : 1, explicit.stderr);
  assert.deepEqual(explicitPlan.steps.map((step: any) => step.id), fullPlan.steps.map((step: any) => step.id));
  assert.equal('declaredBudgetMs' in (fullPlan.estimate ?? {}), false);
  assert.equal('feasible' in (fullPlan.estimate ?? {}), false);
  const retired = spawnSync(process.execPath, [path.join(productRoot, 'test/verification/candidate.ts'), '--profile', 'core', '--json'], { cwd: productRoot, encoding: 'utf8', env: environment });
  assert.equal(retired.status, 1);
  assert.match(retired.stderr, /Unknown Candidate verification option: --profile/);
});

test('OpenSpec fixture runner lists disjoint suites and rejects unknown suites', () => {
  const runner: any = path.join(productRoot, 'test', 'verification', 'openspec', 'contract.ts');
  const listed: any = spawnSync(process.execPath, [runner, '--list-suites'], { cwd: productRoot, encoding: 'utf8' });
  assert.equal(listed.status, 0, listed.stderr);
  const suites: any = JSON.parse(listed.stdout);
  assert.equal(suites.contract.filter((name: any) => suites.recovery.includes(name)).length, 0);
  assert.deepEqual([...new Set([...suites.contract, ...suites.recovery])].sort(), [...suites.all].sort());
  const unknown: any = spawnSync(process.execPath, [runner, '--suite', 'unknown'], { cwd: productRoot, encoding: 'utf8' });
  assert.equal(unknown.status, 1);
  assert.match(unknown.stderr, /Unknown OpenSpec fixture suite/);
});

test('package verifier CLI exposes stable selectors and rejects unknown selectors', () => {
  const runner: any = path.join(productRoot, 'test', 'verification', 'package', 'run.ts');
  const help: any = spawnSync(process.execPath, [runner, '--help'], { cwd: productRoot, encoding: 'utf8' });
  assert.equal(help.status, 0, help.stderr);
  for (const step of PACKAGE_VERIFIERS) assert.match(help.stdout, new RegExp(`\\b${step.id}\\b`));
  const unknown: any = spawnSync(process.execPath, [runner, 'unknown'], { cwd: productRoot, encoding: 'utf8' });
  assert.equal(unknown.status, 2);
  assert.match(unknown.stderr, /Unknown package verifier/);
});

test('related verification supports explicit selection, pins a base and retains independent checks beside a gap', () => {
  const runner = path.join(productRoot, 'test/verification/cli.ts');
  const invoke = (...args: string[]) => spawnSync(process.execPath, [runner, 'related', ...args, '--json'], { cwd: productRoot, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, env: defaultPlanningEnvironment() });
  const explicit = invoke('--check', 'docs-quality');
  assert.equal(explicit.status, 0, explicit.stderr);
  const payload = JSON.parse(explicit.stdout);
  assert.equal(payload.selection, 'explicit');
  assert.equal(payload.base, null);
  assert.deepEqual(payload.steps.map((step: any) => step.id), ['docs-quality']);
  assert.equal('admissionStepIds' in payload, false);
  const comparison = invoke('--base', 'HEAD');
  const compared = JSON.parse(comparison.stdout);
  assert.equal(comparison.status, compared.status === 'ready' ? 0 : 1, comparison.stderr);
  assert.equal(compared.reference, 'HEAD');
  assert.match(compared.base, /^[a-f0-9]{40}$/);
  assert.ok(Array.isArray(compared.paths));
  const gap = invoke('--check', 'unknown-check', '--check', 'docs-quality');
  assert.equal(gap.status, 1, gap.stderr);
  const incomplete = JSON.parse(gap.stdout);
  assert.equal(incomplete.status, 'incomplete');
  assert.ok(incomplete.gaps.some((item: any) => item.code === 'unknown-check'));
  assert.deepEqual(incomplete.steps.map((step: any) => step.id), ['docs-quality']);
  const missingBase = invoke();
  assert.equal(missingBase.status, 2);
  assert.match(missingBase.stderr, /requires --base/);
});
