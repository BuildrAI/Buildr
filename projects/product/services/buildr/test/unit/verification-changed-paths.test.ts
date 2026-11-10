import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isSelectionOnlyPackageMetadataChange,
  isVerificationDeclarationMetadataOnlyChange,
  isVersionOnlyPackageMetadataChange,
} from '../verification/changed-paths.ts';
import { createVerificationPlan } from '../verification/planner.ts';
import { INTEGRATION_PRIMARY_SLICES, verificationSteps } from '../verification/registry.ts';
import { verificationStepOwnership } from '../verification/ownership.ts';

const ids: any = (plan: any) => plan.steps.map((step: any) => step.id);

for (const source of [
  'src/modules/project-testing/application/project-verification-application.ts',
  'src/modules/project-testing/application/project-verification-locations.ts',
  'src/modules/project-testing/domain/project-verification.ts',
  'src/modules/project-testing/interfaces/cli/project-verification.ts',
  'src/modules/project-testing/module.ts',
]) {
  test(`testing-map changes select declaration integration checks: ${source}`, () => {
    const plan = createVerificationPlan({ paths: [source] });
    assert.equal(plan.scope.mode, 'affected');
    assert.ok(ids(plan).includes('integration-declarations'), `${source} must select the testing-map update and diagnostics regression checks`);
  });
}

test('task-report changes keep their verification owner without selecting the testing-map integration slice', () => {
  const plan = createVerificationPlan({ paths: ['src/modules/task/application/task-verification-application.ts'] });
  assert.equal(plan.scope.mode, 'affected');
  assert.equal(ids(plan).includes('integration-declarations'), false);
});

test('package metadata semantic classifier only permits the three version fields', () => {
  assert.equal(isVersionOnlyPackageMetadataChange(
    'package.json',
    JSON.stringify({ name: 'demo', version: '1.0.0', scripts: { test: 'node --test' } }),
    JSON.stringify({ name: 'demo', version: '1.0.1', scripts: { test: 'node --test' } }),
  ), true);
  assert.equal(isVersionOnlyPackageMetadataChange(
    'package-lock.json',
    JSON.stringify({ version: '1.0.0', packages: { '': { version: '1.0.0', dependencies: { a: '1' } }, 'node_modules/a': { version: '1' } } }),
    JSON.stringify({ version: '1.0.1', packages: { '': { version: '1.0.1', dependencies: { a: '1' } }, 'node_modules/a': { version: '1' } } }),
  ), true);
  assert.equal(isVersionOnlyPackageMetadataChange(
    'package.json',
    JSON.stringify({ version: '1.0.0', scripts: { test: 'old' } }),
    JSON.stringify({ version: '1.0.1', scripts: { test: 'new' } }),
  ), false);
  assert.equal(isVersionOnlyPackageMetadataChange('package.json', '{', '{}'), false);
});

test('version-only paths use affected owners while unverified package paths stay full-scope', () => {
  const affectedPlan: any = createVerificationPlan({ paths: ['package.json', 'package-lock.json'], versionOnlyPackagePaths: ['package.json', 'package-lock.json'] });
  const affected: any = ids(affectedPlan);
  const full: any = createVerificationPlan({ paths: ['package.json'] });
  assert.ok(affected.length > 0);
  assert.ok(affected.length < full.steps.length);
  assert.equal(affectedPlan.scope.mode, 'affected');
  assert.deepEqual(affectedPlan.scope.reasons.map((reason: any) => reason.code), ['version-only-package-metadata', 'version-only-package-metadata']);
  assert.equal(full.scope.mode, 'full');
  assert.ok(full.steps.some((step: any) => step.reasons.some((reason: any) => reason.includes('non-version package metadata changes'))));
});

test('version-only exception is closed to changed package metadata paths', () => {
  assert.throws(
    () => createVerificationPlan({ paths: ['test/verification/registry.ts'], versionOnlyPackagePaths: ['test/verification/registry.ts'] }),
    /Invalid version-only package path/,
  );
  assert.throws(
    () => createVerificationPlan({ paths: ['knowledge/docs/overview.md'], versionOnlyPackagePaths: ['package.json'] }),
    /not part of the changed paths/,
  );
  assert.throws(
    () => createVerificationPlan({ paths: ['test/verification/registry.ts'], selectionOnlyPaths: ['test/verification/registry.ts'] }),
    /Invalid selection-only metadata path/,
  );
  assert.throws(
    () => createVerificationPlan({ paths: ['knowledge/docs/overview.md'], selectionOnlyPaths: ['verification.yml'] }),
    /not part of the changed paths/,
  );
});

test('package presentation metadata stays affected while scripts and dependencies force Full', () => {
  const base: any = JSON.stringify({ name: 'buildr', description: 'old', scripts: { test: 'node --test' }, dependencies: { yaml: '1' } });
  assert.equal(isSelectionOnlyPackageMetadataChange('package.json', base, JSON.stringify({ name: 'buildr', description: 'new', scripts: { test: 'node --test' }, dependencies: { yaml: '1' } })), true);
  assert.equal(isSelectionOnlyPackageMetadataChange('package.json', base, JSON.stringify({ name: 'buildr', description: 'old', scripts: { test: 'node test/run.ts' }, dependencies: { yaml: '1' } })), false);
  assert.equal(isSelectionOnlyPackageMetadataChange('package.json', base, JSON.stringify({ name: 'buildr', description: 'old', scripts: { test: 'node --test' }, dependencies: { yaml: '2' } })), false);
});

test('verification presentation metadata stays affected while invocation and environment changes force Full', () => {
  const base: any = `schemaVersion: buildr.project-verification/v3\nresources:\n  - id: browser\n    title: Old\n    strategy: coordinated\n    capacity: 1\n    authorization: implicit\ncapabilities:\n  - id: product.delivery\n    title: Old\n    scope: { project: product, services: [] }\n    proves: [old]\n    evidence: [unit]\n    usableFor: [task-delivery]\n    discovery: { sources: ['**'] }\n    invocation:\n      affected: { kind: command, argv: [npm, test], cwd: . }\n      full: { kind: command, argv: [npm, test], cwd: . }\n    environment: { requires: [] }\n    effects: { writes: [], externalSystems: [], authorization: implicit }\n    resourceClaims: []\n`;
  const presentation: any = base.replaceAll('Old', 'New').replace('proves: [old]', 'proves: [new]');
  assert.equal(isVerificationDeclarationMetadataOnlyChange(base, presentation), true);
  assert.equal(isVerificationDeclarationMetadataOnlyChange(base, base.replace('argv: [npm, test]', 'argv: [npm, run, test:e2e]')), false);
  assert.equal(isVerificationDeclarationMetadataOnlyChange(base, `${base}    environment:\n      requires: [node]\n`), false);
});

test('frontend and plugin paths select their real Service test entrypoints', () => {
  for (const source of ['services/buildr-web/src/features/task/task-state.ts', 'services/buildr-web/test/task-state.test.mjs']) {
    const plan = createVerificationPlan({ paths: [source] });
    assert.equal(plan.status, 'ready');
    const frontend = plan.steps.find((step: any) => step.id === 'frontend-logic');
    assert.equal(frontend.service, 'buildr-web');
    assert.equal(frontend.executor.type, 'command');
    assert.equal(frontend.executor.file, process.execPath);
    assert.ok(frontend.executor.args[0].endsWith('/buildr-web/tools/run-logic-tests.mjs'));
    assert.ok(frontend.testFiles.includes('test/*.test.mjs'));
    assert.equal(ids(plan).includes('service-branch-contract'), false);
  }
  for (const source of ['services/dsh-plugin/plugin/client.ts', 'services/dsh-plugin/tools/verify-all.ts', '.github/workflows/publish-dsh-plugin.yml']) {
    const plan = createVerificationPlan({ paths: [source] });
    assert.equal(plan.status, 'ready');
    assert.equal(plan.scope.mode, 'affected');
    assert.deepEqual(plan.unmapped, []);
    for (const id of ['plugin-unit', 'plugin-integration', 'plugin-sdk-integration', 'plugin-native-e2e']) assert.ok(ids(plan).includes(id), `${source}: ${id}`);
    for (const id of ['plugin-typecheck', 'plugin-test-typecheck']) assert.equal(ids(plan).includes(id), false, `${source}: ${id} is release-gated and needs an explicitly prepared SDK`);
    for (const step of plan.steps.filter((item: any) => item.service === 'dsh-plugin')) assert.equal(step.executor.type, 'command');
    assert.equal(ids(plan).includes('dsh-plugin'), false, 'retired whole-plugin wrapper cannot duplicate individual owners');
  }
  const explicit = createVerificationPlan({ stepIds: ['plugin-typecheck', 'plugin-test-typecheck'] });
  for (const id of ['plugin-typecheck', 'plugin-test-typecheck']) assert.ok(ids(explicit).includes(id), `explicit selection keeps ${id} available for the release owner`);
  const candidate = createVerificationPlan({ profiles: ['candidate'] });
  assert.ok(ids(candidate).includes('frontend-logic'));
  assert.equal(ids(candidate).includes('dsh-plugin'), false, '独立插件不属于 Buildr 主包候选');
});

test('Product knowledge navigation index selects its real catalog integration and current source contract', () => {
  const plan = createVerificationPlan({ paths: ['knowledge/index.yml'] });
  assert.equal(plan.status, 'ready');
  assert.equal(plan.scope.mode, 'affected');
  assert.deepEqual(ids(plan), ['integration-knowledge', 'source-contracts']);
  assert.deepEqual(plan.steps.find((step: any) => step.id === 'integration-knowledge').executor.files, INTEGRATION_PRIMARY_SLICES.find((slice: any) => slice.id === 'integration-knowledge').files);
  assert.deepEqual(plan.unmapped, []);
});

test('package skill projection regression selects the slice that actually executes its file', () => {
  const plan = createVerificationPlan({ paths: ['test/integration/package-generic-skills.test.ts'] });
  assert.equal(plan.status, 'ready');
  assert.deepEqual(ids(plan), ['integration-runtime-projection', 'test-file-ownership', 'test-syntax', 'test-typecheck']);
});


test('independent package release helpers select pure feedback and the real lifecycle owners', () => {
  for (const source of [
    'skills/buildr-release/scripts/release-targets.ts',
    'skills/buildr-release/scripts/package-compatibility.ts',
    'skills/buildr-release/scripts/package-artifact-observation.ts',
    'skills/buildr-release/scripts/release-package-evidence.ts',
    'skills/buildr-release/scripts/plugin-hosted-release.ts',
    'skills/buildr-release/scripts/package-release-operation.ts',
  ]) {
    const plan = createVerificationPlan({ paths: [source] });
    assert.equal(plan.status, 'ready');
    assert.equal(plan.scope.mode, 'affected');
    assert.deepEqual(plan.unmapped, []);
    const selected = ids(plan);
    for (const owner of ['unit', 'typecheck']) {
      assert.ok(selected.includes(owner), `${source} must select ${owner}`);
    }
    for (const owner of ['integration-candidate-release', 'integration-candidate-release-selection', 'integration-candidate-package-selection', 'integration-candidate-release-effects', 'integration-candidate-git-convergence', 'integration-candidate-git-selection']) {
      assert.ok(verificationStepOwnership(owner).inputs.includes(source), `${source} must belong to ${owner}`);
      assert.equal(selected.includes(owner), true, 'task-related selection must retain affected release lifecycle boundaries');
      assert.ok(ids(createVerificationPlan({ paths: [source], groups: ['release'] })).includes(owner));
    }
    assert.equal(selected.includes('dsh-plugin'), false, 'main helper checks do not claim independent plugin loader evidence');
  }
});


test('each Integration test change selects only its stable primary slice and no general aggregate', () => {
  for (const slice of INTEGRATION_PRIMARY_SLICES) {
    for (const file of slice.files) {
      const plan = createVerificationPlan({ paths: [file] });
      assert.equal(plan.status, 'ready', file);
      const owners = plan.steps.filter((item: any) => INTEGRATION_PRIMARY_SLICES.some((entry: any) => entry.id === item.id)).map((item: any) => item.id);
      assert.deepEqual(owners, [slice.id], file);
      assert.equal(plan.steps.some((item: any) => item.executor.file === 'test/verification/integration.ts'), false, file);
    }
  }
});


test('installed-package user workflows have an artifact E2E owner and never enter source Integration', () => {
  const owner = verificationSteps.find((step: { id: string }) => step.id === 'application-payload-release');
  assert.equal(owner.testing.executionBoundary, 'E2E');
  assert.equal(owner.target, 'artifact');
  for (const file of ['test/e2e/builtin-connection-skills-package.test.ts', 'test/e2e/inline-core-package.test.ts']) {
    assert.ok(owner.executor.files.includes(file));
    assert.equal(INTEGRATION_PRIMARY_SLICES.some((slice: { files: string[] }) => slice.files.includes(file)), false);
  }
});

test('workspace public lifecycle requests select their E2E owner without the old asset Integration group', () => {
  const plan = createVerificationPlan({ paths: ['test/e2e/workspace-lifecycle.test.ts'] });
  assert.equal(plan.status, 'ready');
  assert.ok(ids(plan).includes('e2e-workspace-assets'));
  assert.equal(ids(plan).includes('integration-workspace-assets'), false);
});
