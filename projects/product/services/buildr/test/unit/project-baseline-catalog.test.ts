import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createScopeDiagnostics } from '../../src/modules/workspace/application/diagnostics/scope-diagnostics.ts';

function fixture(t: any, version: string, global: boolean, legacy: boolean, projectServicesDir: boolean = legacy) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-baseline-unit-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const project = path.join(root, 'projects', 'example');
  const dirs = ['openspec/specs', 'openspec/changes', 'knowledge', ...(projectServicesDir ? ['services'] : [])];
  for (const dir of dirs) fs.mkdirSync(path.join(project, dir), { recursive: true });
  fs.writeFileSync(path.join(project, 'commands.yml'), '');
  if (global) { fs.mkdirSync(path.join(root, 'services')); fs.writeFileSync(path.join(root, 'services/manifest.yml'), 'schemaVersion: buildr.services/v3\nservices: {}\n'); }
  if (legacy) { fs.mkdirSync(path.join(project, 'services'), { recursive: true }); fs.writeFileSync(path.join(project, 'services/manifest.yml'), 'schemaVersion: buildr.services/v2\nservices: {}\n'); }
  const exists = (p: string, directory: boolean) => { try { return directory ? fs.statSync(p).isDirectory() : fs.statSync(p).isFile(); } catch { return false; } };
  const diagnostics = createScopeDiagnostics({ fs, path, existsFile: (p: string) => exists(p, false), existsDirectory: (p: string) => exists(p, true), gitignoreLines: () => [], servicesManifestPath: (p: string) => path.join(p, 'services/manifest.yml'), resolveSourceRoot: (p: string, source: any) => path.resolve(p, source.path), toPosixRelative: (r: string, p: string) => path.relative(r, p), addDoctorFinding: (r: any, status: string, code: string, message: string, detail: any) => r.findings.push({ status, code, message, ...detail }) });
  const result: any = { findings: [] };
  diagnostics.diagnoseHierarchy(result, root, [{ org: 'test', project: 'example' }], { schemaVersion: version, projects: { example: { source: { type: 'workspace', path: 'projects/example' } } } });
  return result;
}

test('v3 项目使用根级服务清单且无旧项目 services 目录时，不误报清单或目录缺失', t => {
  const r = fixture(t, 'buildr.projects/v3', true, false, false);
  assert.deepEqual(r.findings, []);
  assert.equal(r.projects[0].servicesMetadata, 'services/manifest.yml');
  assert.equal(r.projects[0].servicesDirectory, null);
  assert.equal(r.projects[0].baseline.servicesMetadata, true);
  assert.equal(r.projects[0].baseline.servicesDirectory, false);
  assert.equal(r.projects[0].baseline.agentsFile, false);
});
test('v3 根级清单缺失仍告警，旧项目清单不能掩盖且不再要求旧 services 目录', t => {
  const r = fixture(t, 'buildr.projects/v3', false, true, true);
  assert.deepEqual(r.findings[0].missing, ['services/manifest.yml']);
  assert.equal(r.projects[0].baseline.servicesMetadata, false);
  const withoutLegacyDir = fixture(t, 'buildr.projects/v3', false, false, false);
  assert.deepEqual(withoutLegacyDir.findings[0].missing, ['services/manifest.yml']);
});
test('v2 项目继续检查自己的服务清单与 services 目录', t => {
  const missingBoth = fixture(t, 'buildr.projects/v2', true, false, false);
  assert.deepEqual(missingBoth.findings[0].missing, ['services/manifest.yml', 'services']);
  const missingManifestOnly = fixture(t, 'buildr.projects/v2', true, false, true);
  assert.deepEqual(missingManifestOnly.findings[0].missing, ['services/manifest.yml']);
  const valid = fixture(t, 'buildr.projects/v2', false, true, true);
  assert.deepEqual(valid.findings, []);
  assert.equal(valid.projects[0].servicesMetadata, 'projects/example/services/manifest.yml');
  assert.equal(valid.projects[0].servicesDirectory, 'projects/example/services');
});
