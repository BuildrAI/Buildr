import assert from 'node:assert/strict';
import test from 'node:test';
import YAML from 'yaml';
import { normalizeProjectVerification, parseProjectVerification, validateProjectVerification } from '../../src/verification/domain/project-verification.ts';

function declaration() {
  return { schemaVersion: 'buildr.project-verification/v4', testing: [{ id: 'demo-unit', title: 'Demo unit', scope: { project: 'demo', services: ['api'] }, purpose: 'Validate demo logic', sourcePaths: ['src/**'], testRoots: ['test/unit/**'], full: { kind: 'command', argv: ['mvn', 'test'], cwd: '.' }, selection: ['Select related classes while developing'], requirements: ['java'] }] };
}

test('v4 testing map describes families instead of individual test inventory', () => {
  const value = declaration();
  assert.deepEqual(validateProjectVerification(value, { projectCode: 'demo', services: ['api'] }), []);
  assert.deepEqual(parseProjectVerification(YAML.stringify(value)), value);
  const normalized = normalizeProjectVerification(value, { projectCode: 'demo', services: ['api'] });
  assert.equal(normalized.testing[0].id, 'demo-unit');
  assert.deepEqual(normalized.testing[0].testRoots, ['test/unit/**']);
});

test('v4 rejects old orchestration fields and unsafe paths', () => {
  const value: any = declaration(); value.testing[0].candidate = true; value.testing[0].sourcePaths = ['../outside'];
  const errors = validateProjectVerification(value, { projectCode: 'demo', services: ['api'] });
  assert.ok(errors.some((item) => item.includes('candidate'))); assert.ok(errors.some((item) => item.includes('safe relative')));
});
