import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import YAML from 'yaml';
import { atomicWriteFile } from '../../src/infrastructure/filesystem/index.ts';
import { createBuildrApplicationTest } from '../context/buildr-node-test.ts';

const test = createBuildrApplicationTest('integration-project-verification-map');
function fixture(t: any) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-project-verification-map-')); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, '.buildr'), { recursive: true }); fs.mkdirSync(path.join(root, 'projects', 'demo', 'services'), { recursive: true });
  fs.writeFileSync(path.join(root, 'AGENTS.md'), '# fixture\n'); fs.writeFileSync(path.join(root, '.buildr', 'workspace.yml'), 'schemaVersion: buildr.workspace/v1\nid: 11111111-1111-4111-8111-111111111111\nname: Fixture\ndescription: Fixture\n');
  fs.writeFileSync(path.join(root, 'projects', 'manifest.yml'), 'schemaVersion: buildr.projects/v2\nprojects:\n  demo:\n    id: 22222222-2222-4222-8222-222222222222\n    workspaceId: 11111111-1111-4111-8111-111111111111\n    code: demo\n    name: Demo\n    description: Demo\n    source:\n      type: workspace\n      path: projects/demo\n');
  fs.writeFileSync(path.join(root, 'projects', 'demo', 'services', 'manifest.yml'), 'schemaVersion: buildr.services/v2\nprojectId: 22222222-2222-4222-8222-222222222222\nservices: {}\n');
  return { root, runtime: t.buildrContexts.application };
}
const map = (purpose: string) => ({ schemaVersion: 'buildr.project-verification/v4', testing: [{ id: 'demo-unit', title: 'Demo unit', scope: { project: 'demo', services: [] }, purpose, sourcePaths: ['src/**'], testRoots: ['test/**'], full: { kind: 'command', argv: ['mvn', 'test'], cwd: '.' }, requirements: [] }] });

test('Project Verification validates and updates a complete testing map with CAS', (t: any) => {
  const { root, runtime } = fixture(t); const candidate = path.join(os.tmpdir(), `demo-verification-${process.pid}.yml`); t.after(() => { try { fs.unlinkSync(candidate); } catch {} }); fs.writeFileSync(candidate, YAML.stringify(map('Initial map')));
  const write = runtime.atomicWriteFile; let writeCount = 0; runtime.atomicWriteFile = (...args: any[]) => { writeCount += 1; return write(...args); };
  assert.equal(runtime.inspectProjectVerification(root, 'demo').status, 'missing'); assert.equal(runtime.validateProjectVerificationCandidate(root, 'demo', candidate).status, 'ready');
  const created = runtime.updateProjectVerification(root, 'demo', candidate, 'absent'); assert.equal(created.status, 'updated');
  fs.writeFileSync(candidate, YAML.stringify(map('Updated map'))); const writesBeforeConflict = writeCount; assert.throws(() => runtime.updateProjectVerification(root, 'demo', candidate, 'absent'), { code: 'project_verification_conflict' }); assert.equal(writeCount, writesBeforeConflict);
  assert.equal(runtime.updateProjectVerification(root, 'demo', candidate, created.identity).declaration.testing[0].purpose, 'Updated map');
});

test('Project Verification preserves the current map when its atomic writer fails', (t: any) => {
  const { root, runtime } = fixture(t); const candidate = path.join(os.tmpdir(), `demo-verification-failure-${process.pid}.yml`); t.after(() => { try { fs.unlinkSync(candidate); } catch {} }); fs.writeFileSync(candidate, YAML.stringify(map('Initial map')));
  const created = runtime.updateProjectVerification(root, 'demo', candidate, 'absent'); const verification = path.join(root, 'projects', 'demo', 'verification.yml'); const before = fs.readFileSync(verification, 'utf8');
  fs.writeFileSync(candidate, YAML.stringify(map('Rejected update'))); runtime.atomicWriteFile = () => { throw new Error('injected atomic write failure'); };
  assert.throws(() => runtime.updateProjectVerification(root, 'demo', candidate, created.identity), /injected atomic write failure/);
  assert.equal(fs.readFileSync(verification, 'utf8'), before);
});

test('atomicWriteFile removes its temporary file when replacement fails', (t: any) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-atomic-write-cleanup-')); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const target = path.join(root, 'verification.yml'); fs.mkdirSync(target);
  assert.throws(() => atomicWriteFile(target, 'content'));
  assert.deepEqual(fs.readdirSync(root).filter((entry) => entry.startsWith('.verification.yml.buildr-tmp-')), []);
});

function servicesFixture(t: any) {
  const { root, runtime } = fixture(t);
  const external = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-verification-external-'));
  t.after(() => fs.rmSync(external, { recursive: true, force: true }));
  const workspaceId = '11111111-1111-4111-8111-111111111111';
  const repositoryId = '33333333-3333-4333-8333-333333333333';
  const repository = { id: repositoryId, workspaceId, code: 'external-code', name: 'External code', description: '', source: { type: 'git', root: 'attached', path: external, git: { url: 'https://example.invalid/repository.git', remote: 'origin', integrationBranch: 'main' } } };
  const services = ['api', 'web', 'offline', 'file-root'].map((code, index) => ({ id: `44444444-4444-4444-8444-44444444444${index}`, workspaceId, code, name: code, description: '', type: 'service', repositoryId, modulePath: `modules/${code}` }));
  const projectsFile = path.join(root, 'projects/manifest.yml');
  const projects = YAML.parse(fs.readFileSync(projectsFile, 'utf8'));
  projects.schemaVersion = 'buildr.projects/v3'; projects.projects.demo.serviceIds = services.map((service) => service.id);
  fs.writeFileSync(projectsFile, YAML.stringify(projects));
  fs.mkdirSync(path.join(root, 'services')); fs.mkdirSync(path.join(root, 'repositories'));
  fs.writeFileSync(path.join(root, 'services/manifest.yml'), YAML.stringify({ schemaVersion: 'buildr.services/v3', services: Object.fromEntries(services.map((service) => [service.code, service])) }));
  fs.writeFileSync(path.join(root, 'repositories/manifest.yml'), YAML.stringify({ schemaVersion: 'buildr.repositories/v1', repositories: { 'external-code': repository } }));
  for (const code of ['api', 'web']) fs.mkdirSync(path.join(external, 'modules', code, 'checks'), { recursive: true });
  fs.writeFileSync(path.join(external, 'modules/file-root'), 'not a directory');
  return { root, runtime, external, projectRoot: fs.realpathSync(path.join(root, 'projects/demo')), candidate: path.join(root, 'candidate-verification.yml') };
}
function serviceTesting(id: string, service: string, full: any = { kind: 'command', argv: ['project-owned-wrapper', 'test'], cwd: 'checks' }) {
  return { ...map('Check service behavior').testing[0], id, scope: { project: 'demo', services: [service] }, location: { kind: 'service', service }, full };
}

test('Project Verification resolves registered external service modules and preserves the default project root', (t: any) => {
  const { root, runtime, external, projectRoot, candidate } = servicesFixture(t);
  const value = { schemaVersion: 'buildr.project-verification/v4', testing: [
    { ...map('Project aggregate').testing[0], scope: { project: 'demo', services: ['api', 'web'] } },
    serviceTesting('api-unit', 'api', { kind: 'command', argv: ['mvn', 'test'], cwd: 'checks' }),
    serviceTesting('web-unit', 'web', { kind: 'command', argv: ['npm', 'test'], cwd: '.' }),
    serviceTesting('api-guide', 'api', { kind: 'agent', instructions: ['Use the service test guide'] }),
  ] };
  fs.writeFileSync(candidate, YAML.stringify(value));
  const validated = runtime.validateProjectVerificationCandidate(root, 'demo', candidate);
  assert.equal(validated.status, 'ready', validated.errors.join('; '));
  const apiRoot = fs.realpathSync(path.join(external, 'modules/api'));
  const webRoot = fs.realpathSync(path.join(external, 'modules/web'));
  const expected = [
    { testing: 'demo-unit', kind: 'project', root: projectRoot, cwd: projectRoot, status: 'ready', diagnostics: [] },
    { testing: 'api-unit', kind: 'service', service: 'api', root: apiRoot, cwd: path.join(apiRoot, 'checks'), status: 'ready', diagnostics: [] },
    { testing: 'web-unit', kind: 'service', service: 'web', root: webRoot, cwd: webRoot, status: 'ready', diagnostics: [] },
    { testing: 'api-guide', kind: 'service', service: 'api', root: apiRoot, cwd: null, status: 'ready', diagnostics: [] },
  ];
  assert.deepEqual(validated.locations, expected);
  const updated = runtime.updateProjectVerification(root, 'demo', candidate, 'absent');
  assert.deepEqual(updated.locations, expected);
  assert.deepEqual(runtime.inspectProjectVerification(root, 'demo').locations, expected);
  assert.equal(Object.hasOwn(updated.declaration.testing[0], 'location'), false);
  assert.deepEqual(updated.declaration.testing[1].full.argv, ['mvn', 'test']);
  const persisted = fs.readFileSync(path.join(projectRoot, 'verification.yml'), 'utf8');
  assert.equal(persisted.includes(external), false);
  assert.equal(persisted.includes('locations:'), false);
});

test('Project Verification isolates unavailable roots and command directories without invalidating or blocking map maintenance', (t: any) => {
  const { root, runtime, external, projectRoot, candidate } = servicesFixture(t);
  fs.symlinkSync(projectRoot, path.join(external, 'modules/api/escape'), 'dir');
  fs.writeFileSync(path.join(external, 'modules/api/not-directory'), 'file');
  const value = { schemaVersion: 'buildr.project-verification/v4', testing: [
    serviceTesting('missing-root', 'offline'), serviceTesting('file-root', 'file-root'),
    serviceTesting('missing-cwd', 'api', { kind: 'command', argv: ['test'], cwd: 'missing' }),
    serviceTesting('file-cwd', 'api', { kind: 'command', argv: ['test'], cwd: 'not-directory' }),
    serviceTesting('escape-cwd', 'api', { kind: 'command', argv: ['test'], cwd: 'escape' }),
    serviceTesting('missing-agent-root', 'offline', { kind: 'agent', instructions: ['Use guide'] }),
    serviceTesting('ready-web', 'web'),
  ] };
  fs.writeFileSync(candidate, YAML.stringify(value));
  const validated = runtime.validateProjectVerificationCandidate(root, 'demo', candidate);
  assert.equal(validated.status, 'ready', validated.errors.join('; '));
  assert.deepEqual(validated.errors, []);
  assert.deepEqual(validated.locations.map((location: any) => location.status), ['unavailable', 'unavailable', 'unavailable', 'unavailable', 'unavailable', 'unavailable', 'ready']);
  for (const location of validated.locations.slice(0, 6)) {
    assert.equal(location.cwd, null);
    assert.ok(location.diagnostics.length, location.testing);
  }
  assert.equal(validated.locations[0].root, null);
  assert.equal(validated.locations[1].root, null);
  assert.equal(validated.locations[2].root, fs.realpathSync(path.join(external, 'modules/api')));
  assert.match(validated.locations[4].diagnostics.join(' '), /outside|范围|越出/);
  const updated = runtime.updateProjectVerification(root, 'demo', candidate, 'absent');
  assert.equal(updated.status, 'updated');
  assert.deepEqual(updated.locations, validated.locations);
  const inspected = runtime.inspectProjectVerification(root, 'demo');
  assert.equal(inspected.status, 'ready');
  assert.deepEqual(inspected.locations, validated.locations);
});

test('Project Verification rejects invalid location bindings and malformed scopes without overwriting the current map', (t: any) => {
  const { root, runtime, projectRoot, candidate } = servicesFixture(t);
  fs.writeFileSync(candidate, YAML.stringify(map('Original')));
  const created = runtime.updateProjectVerification(root, 'demo', candidate, 'absent');
  const previous = fs.readFileSync(path.join(projectRoot, 'verification.yml'), 'utf8');
  for (const invalid of [
    { ...serviceTesting('unknown', 'unknown') },
    { ...serviceTesting('not-scoped', 'api'), scope: { project: 'demo', services: ['web'] } },
    { ...serviceTesting('malformed', 'api'), scope: { project: 'demo', services: {} } },
  ]) {
    fs.writeFileSync(candidate, YAML.stringify({ schemaVersion: 'buildr.project-verification/v4', testing: [invalid] }));
    const validated = runtime.validateProjectVerificationCandidate(root, 'demo', candidate);
    assert.equal(validated.status, 'invalid');
    assert.deepEqual(validated.locations, []);
    assert.throws(() => runtime.updateProjectVerification(root, 'demo', candidate, created.identity), { code: 'project_verification_invalid' });
    assert.equal(fs.readFileSync(path.join(projectRoot, 'verification.yml'), 'utf8'), previous);
  }
});

test('Project Verification marks inaccessible directories unavailable while other service locations stay ready', { skip: process.platform === 'win32' || process.getuid?.() === 0 }, (t: any) => {
  const { root, runtime, external, candidate } = servicesFixture(t);
  const apiRoot = path.join(external, 'modules/api');
  fs.writeFileSync(candidate, YAML.stringify({ schemaVersion: 'buildr.project-verification/v4', testing: [serviceTesting('api-guide', 'api', { kind: 'agent', instructions: ['Use guide'] }), serviceTesting('web-ready', 'web')] }));
  fs.chmodSync(apiRoot, 0o000);
  try {
    const validated = runtime.validateProjectVerificationCandidate(root, 'demo', candidate);
    assert.equal(validated.status, 'ready');
    assert.deepEqual(validated.locations.map((location: any) => location.status), ['unavailable', 'ready']);
    assert.equal(validated.locations[0].root, null);
    assert.match(validated.locations[0].diagnostics.join(' '), /EACCES|EPERM/);
  } finally {
    fs.chmodSync(apiRoot, 0o755);
  }
});
