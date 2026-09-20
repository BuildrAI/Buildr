import assert from 'node:assert/strict';
import test from 'node:test';
import YAML from 'yaml';
import { normalizeProjectVerification, parseProjectVerification, validateProjectVerification } from '../../src/modules/project-testing/domain/project-verification.ts';

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

test('v4 location binds one project or scoped registered service without changing omitted locations', () => {
  const value: any = declaration();
  assert.equal(Object.hasOwn(normalizeProjectVerification(value).testing[0], 'location'), false);
  for (const location of [{ kind: 'project' }, { kind: 'service', service: 'api' }]) {
    value.testing[0].location = location;
    assert.deepEqual(validateProjectVerification(value, { projectCode: 'demo', services: ['api'] }), []);
    assert.deepEqual(normalizeProjectVerification(value).testing[0].location, location);
  }
});

test('v4 reports malformed scopes and locations without input type failures', () => {
  for (const services of [false, 'api', {}, 4, null]) {
    const value: any = declaration(); value.testing[0].scope.services = services;
    assert.ok(validateProjectVerification(value).some((error) => error.includes('scope.services must be an array')), JSON.stringify(services));
  }
  for (const location of [null, false, [], 'api', {}, { kind: 'repository' }, { kind: 'project', service: 'api' }, { kind: 'service' }, { kind: 'service', service: 'other' }, { kind: 'service', service: 'api', root: '/local' }]) {
    const value: any = declaration(); value.testing[0].location = location;
    assert.ok(validateProjectVerification(value, { services: ['api'] }).some((error) => error.includes('location')), JSON.stringify(location));
  }
  const malformed: any = declaration(); malformed.testing[0].scope.services = [{ toString: false }];
  assert.ok(validateProjectVerification(malformed, { services: ['api'] }).some((error) => error.includes('scope.services[0]')));
  const value: any = declaration(); value.testing[0].location = { kind: 'service', service: 'api' };
  assert.ok(validateProjectVerification(value, { services: [] }).some((error) => error.includes('unknown Service api')));
});

test('v4 rejects platform-independent path escapes in all root-relative fields', () => {
  for (const unsafe of ['/outside', '../outside', 'src/../../outside', '..\\outside', 'src\\..\\outside', '\\outside', 'C:\\outside', 'C:outside', 'src/\0outside']) {
    for (const field of ['sourcePaths', 'testRoots', 'cwd']) {
      const value: any = declaration();
      if (field === 'cwd') value.testing[0].full.cwd = unsafe;
      else value.testing[0][field] = [unsafe];
      assert.ok(validateProjectVerification(value).some((error) => error.includes('safe relative')), `${field}: ${unsafe}`);
    }
  }
  const value: any = declaration();
  value.testing[0].sourcePaths = ['./src/**', 'src/{one,two}/**'];
  value.testing[0].full.cwd = './module';
  assert.deepEqual(validateProjectVerification(value), []);
});
