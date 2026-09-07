import assert from 'node:assert/strict';
import test from 'node:test';
import { parseFocusArgs, resolveFocusPlan } from '../../test/verification/focus.ts';

test('focus parser 区分 step、group、plan 和 JSON', () => {
  assert.deepEqual(parseFocusArgs(['--json', 'package-skills', 'package-skills', 'group:runtime']), {
    help: false,
    list: false,
    planOnly: true,
    json: true,
    stepIds: ['package-skills'],
    groups: ['runtime'],
  });
  assert.throws(() => parseFocusArgs([]), /requires at least one/);
  assert.throws(() => parseFocusArgs(['--list', 'unit']), /cannot be combined/);
  assert.throws(() => parseFocusArgs(['--unknown']), /Unknown test:focus option/);
});

test('focus plan 覆盖旧 package、workspace、release selector 且不附加 Fast', () => {
  const packagePlan: any = resolveFocusPlan(parseFocusArgs(['package-static']));
  assert.deepEqual(packagePlan.steps.map((step: any) => step.id), ['package-static']);

  const workspacePlan: any = resolveFocusPlan(parseFocusArgs(['workspace-lifecycle']));
  assert.deepEqual(workspacePlan.steps.map((step: any) => step.id), ['workspace-lifecycle']);

  const releasePlan: any = resolveFocusPlan(parseFocusArgs(['release-tarball-smoke']));
  assert.deepEqual(releasePlan.steps.map((step: any) => step.id), ['candidate-tarball', 'release-tarball-smoke']);
  assert.equal(releasePlan.steps.some((step: any) => step.id === 'unit'), false);

  assert.throws(() => resolveFocusPlan(parseFocusArgs(['group:unknown'])), /Unknown verification group/);
});
