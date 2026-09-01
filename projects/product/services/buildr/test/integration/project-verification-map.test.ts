import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import YAML from 'yaml';
import { createBuildrApplicationTest } from '../context/buildr-node-test.mjs';

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
  assert.equal(runtime.inspectProjectVerification(root, 'demo').status, 'missing'); assert.equal(runtime.validateProjectVerificationCandidate(root, 'demo', candidate).status, 'ready');
  const created = runtime.updateProjectVerification(root, 'demo', candidate, 'absent'); assert.equal(created.status, 'updated');
  fs.writeFileSync(candidate, YAML.stringify(map('Updated map'))); assert.throws(() => runtime.updateProjectVerification(root, 'demo', candidate, 'absent'), { code: 'project_verification_conflict' });
  assert.equal(runtime.updateProjectVerification(root, 'demo', candidate, created.identity).declaration.testing[0].purpose, 'Updated map');
});
