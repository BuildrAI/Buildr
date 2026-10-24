import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import YAML from 'yaml';
import { publishPackageResources as ensurePackageResources, sharedResourcesRoot, readPreservedArchify } from '../../src/infrastructure/product-resources/shared-resources.ts';
import { preservedArchifyRoot } from '../../src/infrastructure/product-resources/preserved-archify.ts';
import { assetIntegrity } from '../../src/modules/agent-assets/infrastructure/component-source.ts';
import { assembleRuntimeProjection } from '../../src/modules/agent-assets/infrastructure/runtime/projection.ts';
import { reconcileRuntimePlan } from '../../src/modules/agent-assets/infrastructure/runtime/runtime-reconciler.ts';

const service = path.resolve(import.meta.dirname, '../..');
const source = path.resolve(service, '../../../../skills/buildr/archify');
const hash = (bytes: string | Buffer) => crypto.createHash('sha256').update(bytes).digest('hex');
function files(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(path.join(directory, entry.name)) : [path.join(directory, entry.name)]);
}
async function scenario() {
  const root = process.env.BUILDR_SMOKE_ROOT!; assert.ok(root, 'Use the isolated workspace runner.');
  const cli = path.join(service, 'bin/buildr.mjs');
  const run = (args: string[]) => {
    const result = spawnSync(process.execPath, [cli, ...args], { cwd: service, env: { ...process.env, BUILDR_DEBUG_STACK: '1' }, encoding: 'utf8', timeout: 60_000, maxBuffer: 4 * 1024 * 1024 });
    assert.equal(result.status, 0, args.join(' ') + '\n' + result.stdout + result.stderr); return result.stdout;
  };
  const spaces = ['active', 'offline', 'custom', 'disabled'].map(name => path.join(root, name));
  for (const workspace of spaces) run(['init', '--agent', 'codex', '--target', workspace, '--name', path.basename(workspace), '--profile', 'personal', '--description', 'Isolated Archify migration acceptance workspace']);
  assert.equal(fs.existsSync(preservedArchifyRoot(sharedResourcesRoot())), false, 'Fresh installations must not create retained sources.');
  assert.equal(fs.existsSync(path.join(sharedResourcesRoot(), 'skills/buildr/archify')), false);
  const listed = JSON.parse(run(['component', 'list', '--target', spaces[0]!, '--json']));
  assert.equal(listed.components.some((item: any) => item.id === 'archify'), false);
  // Simulate a real old shared set and its three separately registered workspaces.
  const old = ensurePackageResources(service);
  for (const file of files(source).sort()) {
    const relative = path.relative(source, file).split(path.sep).join('/');
    const target = path.join(sharedResourcesRoot(), 'skills/buildr/archify', relative);
    fs.mkdirSync(path.dirname(target), { recursive: true }); fs.copyFileSync(file, target);
    old.files.push({ source: `workspace/skills/buildr/archify/${relative}`, path: `skills/buildr/archify/${relative}`, sha256: hash(fs.readFileSync(file)), mode: fs.statSync(file).mode & 0o777 });
  }
  old.id = `${old.version}-${hash(JSON.stringify(old.files))}`;
  fs.writeFileSync(path.join(sharedResourcesRoot(), 'resource-set.json'), JSON.stringify(old));
  for (const workspace of spaces) {
    const skillsFile = path.join(workspace, 'skills/manifest.yml'), skills = YAML.parse(fs.readFileSync(skillsFile, 'utf8'));
    skills.skills.push({ id: 'archify', assetIdentity: 'buildr:skill:archify', sourceIdentity: 'package:skills/buildr/archify', source: 'buildr', path: 'buildr/archify', runtimePath: 'archify', enabled: path.basename(workspace) !== 'disabled', required: false, state: 'installed', resource: 'resources/workspace/skills/buildr/archify' });
    fs.writeFileSync(skillsFile, YAML.stringify(skills));
    const registryFile = path.join(workspace, 'components/manifest.yml'), registry = YAML.parse(fs.readFileSync(registryFile, 'utf8'));
    registry.components.push({ id: 'archify', source: 'buildr', path: 'components/buildr/archify', enabled: true, required: false, state: 'installed' });
    fs.writeFileSync(registryFile, YAML.stringify(registry));
    const definition = { schemaVersion: 'buildr.component/v1', id: 'archify', kind: 'integration', version: '3.1.0+buildr.1', source: 'buildr', members: { rules: [], skills: ['skills/buildr/archify'], commandCollections: [], skillContributions: [] }, integrity: [`skills/buildr/archify=${assetIntegrity(source)}`] };
    fs.mkdirSync(path.join(workspace, 'components/buildr/archify'), { recursive: true });
    fs.writeFileSync(path.join(workspace, 'components/buildr/archify/component.yml'), YAML.stringify(definition));
    fs.writeFileSync(path.join(workspace, '.buildr/local/package-resources.json'), JSON.stringify({ schemaVersion: 'buildr.resource-adoption/v1', layout: 'fixed', ready: true, resourceSet: old.id }));
    const { plan } = assembleRuntimeProjection({ repoRoot: workspace, runtimeId: 'codex', selection: { productSkill: true, workspaceSkills: true } });
    reconcileRuntimePlan(plan);
    fs.mkdirSync(path.join(workspace, 'diagrams')); fs.writeFileSync(path.join(workspace, 'diagrams/keep.json'), '{"keep":true}');
  }
  const custom = path.join(spaces[2]!, 'skills/buildr/archify'); fs.mkdirSync(path.dirname(custom), { recursive: true }); fs.cpSync(source, custom, { recursive: true });
  fs.appendFileSync(path.join(custom, 'SKILL.md'), '\nWorkspace customization.\n');
  const hidden = `${spaces[1]}-hidden`; fs.renameSync(spaces[1]!, hidden);
  const current = ensurePackageResources(service); assert.notEqual(current.id, old.id);
  assert.equal(fs.existsSync(path.join(sharedResourcesRoot(), 'skills/buildr/archify')), false);
  const preserved = readPreservedArchify();
  assert.equal(preserved.set.files.length, files(source).length);
  for (const workspace of [spaces[0]!, spaces[2]!, spaces[3]!]) run(['sync', 'codex', '--target', workspace]);
  fs.renameSync(hidden, spaces[1]!); run(['sync', 'codex', '--target', spaces[1]!]);
  for (const workspace of spaces) {
    const manifest = YAML.parse(fs.readFileSync(path.join(workspace, 'skills/manifest.yml'), 'utf8'));
    const skill = manifest.skills.find((item: any) => item.id === 'archify');
    assert.equal(skill.source, 'workspace'); assert.equal(skill.resource, undefined); assert.equal(skill.enabled, path.basename(workspace) !== 'disabled');
    assert.equal(YAML.parse(fs.readFileSync(path.join(workspace, 'components/manifest.yml'), 'utf8')).components.some((item: any) => item.id === 'archify'), false);
    assert.equal(fs.readFileSync(path.join(workspace, 'diagrams/keep.json'), 'utf8'), '{"keep":true}');
    assert.equal(fs.existsSync(path.join(workspace, '.agents/skills/archify/assets/archify/bin/archify.mjs')), skill.enabled);
    const doctor = JSON.parse(run(['doctor', '--agent', 'codex', '--target', workspace, '--json']));
    assert.equal(doctor.health.ready, true, JSON.stringify({ health: doctor.health, findings: doctor.findings }));
    const before = assetIntegrity(path.join(workspace, 'skills/buildr/archify'));
    run(['sync', 'codex', '--target', workspace]);
    assert.equal(assetIntegrity(path.join(workspace, 'skills/buildr/archify')), before);
  }
  assert.match(fs.readFileSync(path.join(custom, 'SKILL.md'), 'utf8'), /Workspace customization/);
  const tool = path.join(source, 'assets/archify');
  const graph = path.join(root, 'self-use.json'); fs.copyFileSync(path.join(tool, 'examples/brand-aware-delivery.architecture.json'), graph);
  const rendered = spawnSync(process.execPath, [path.join(tool, 'bin/archify.mjs'), 'deliver', 'architecture', graph, path.join(root, 'self-use.html'), '--quality', 'showcase', '--json'], { cwd: tool, env: process.env, encoding: 'utf8', timeout: 30_000 });
  assert.equal(rendered.status, 0, rendered.stdout + rendered.stderr);
  assert.ok(fs.statSync(path.join(root, 'self-use.html')).size > 1000);
}
if (process.argv.includes('--archify-retirement-scenario')) await scenario();
else test('Archify退出随包后保留旧安装、离线空间和定制，自用绘图仍正常', { timeout: 180_000 }, () => {
  const result = spawnSync(process.execPath, [path.join(service, 'tools/development/run-isolated-workspace-smoke.ts'), '--script', fileURLToPath(import.meta.url), '--', '--archify-retirement-scenario'], { cwd: service, env: { ...process.env, BUILDR_DEBUG_STACK: '1' }, encoding: 'utf8', timeout: 175_000, maxBuffer: 4 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /"status":"passed"/); assert.match(result.stdout, /"cleanup":"cleaned"/);
});
