import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createScopeDiagnostics } from '../../src/modules/workspace/application/diagnostics/scope-diagnostics.ts';

function fixture(t: any, version: string, global: boolean, legacy: boolean) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-baseline-unit-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const project = path.join(root, 'projects', 'example');
  for (const dir of ['openspec/specs', 'openspec/changes', 'knowledge', 'services']) fs.mkdirSync(path.join(project, dir), { recursive: true });
  for (const file of ['AGENTS.md', 'capabilities.yml', 'commands.yml']) fs.writeFileSync(path.join(project, file), '');
  if (global) { fs.mkdirSync(path.join(root, 'services')); fs.writeFileSync(path.join(root, 'services/manifest.yml'), 'schemaVersion: buildr.services/v3\nservices: {}\n'); }
  if (legacy) fs.writeFileSync(path.join(project, 'services/manifest.yml'), 'schemaVersion: buildr.services/v2\nservices: {}\n');
  const exists = (p: string, directory: boolean) => { try { return directory ? fs.statSync(p).isDirectory() : fs.statSync(p).isFile(); } catch { return false; } };
  const diagnostics = createScopeDiagnostics({ fs, path, existsFile: (p: string) => exists(p, false), existsDirectory: (p: string) => exists(p, true), gitignoreLines: () => [], servicesManifestPath: (p: string) => path.join(p, 'services/manifest.yml'), resolveSourceRoot: (p: string, source: any) => path.resolve(p, source.path), toPosixRelative: (r: string, p: string) => path.relative(r, p), addDoctorFinding: (r: any, status: string, code: string, message: string, detail: any) => r.findings.push({ status, code, message, ...detail }) });
  const result: any = { findings: [] };
  diagnostics.diagnoseHierarchy(result, root, [{ org: 'test', project: 'example' }], { schemaVersion: version, projects: { example: { source: { type: 'workspace', path: 'projects/example' } } } });
  return result;
}

test('v3 项目使用根级服务清单，不误报旧项目清单缺失', t => {
  const r = fixture(t, 'buildr.projects/v3', true, false);
  assert.deepEqual(r.findings, []);
  assert.equal(r.projects[0].servicesMetadata, 'services/manifest.yml');
  assert.equal(r.projects[0].baseline.servicesMetadata, true);
});
test('v3 根级清单缺失仍告警，旧项目清单不能掩盖', t => {
  const r = fixture(t, 'buildr.projects/v3', false, true);
  assert.deepEqual(r.findings[0].missing, ['services/manifest.yml']);
  assert.equal(r.projects[0].baseline.servicesMetadata, false);
});
test('v2 项目继续检查自己的服务清单', t => {
  const missing = fixture(t, 'buildr.projects/v2', true, false);
  assert.deepEqual(missing.findings[0].missing, ['services/manifest.yml']);
  const valid = fixture(t, 'buildr.projects/v2', false, true);
  assert.deepEqual(valid.findings, []);
  assert.equal(valid.projects[0].servicesMetadata, 'projects/example/services/manifest.yml');
});
