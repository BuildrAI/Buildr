import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import YAML from 'yaml';
import { resolvePackageAgentSkill, resolveSkills } from '../../src/modules/agent-assets/infrastructure/runtime/skills/sources.ts';
import { assembleRuntimeProjection, checkRuntimeProjection } from '../../src/modules/agent-assets/infrastructure/runtime/projection.ts';
import { reconcileRuntimePlan } from '../../src/modules/agent-assets/infrastructure/runtime/runtime-reconciler.ts';

function fixture(t: any): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-standard-projection-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'AGENTS.md'), '# Workspace rules\n');
  for (const id of ['common', 'codex-only', 'consumer', 'provider']) {
    const directory = path.join(root, 'skills', 'nested', id);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'SKILL.md'), `---\nname: ${id}\ndescription: ${id}\n---\n# ${id}\n`);
    fs.mkdirSync(path.join(directory, 'references'));
    fs.writeFileSync(path.join(directory, 'references', 'example.txt'), 'unchanged companion\n');
  }
  return root;
}

function manifest(root: string, skills: any[], extra: any = {}): void {
  fs.writeFileSync(path.join(root, 'skills', 'manifest.yml'), YAML.stringify({ schemaVersion: 'buildr.skills/v2', skills, ...extra }));
}

test('source applicability retains runtime identity while standard paths are flat', (t) => {
  const root = fixture(t);
  manifest(root, [
    { id: 'common', path: 'nested/common' },
    { id: 'codex-only', path: 'nested/codex-only', runtimes: ['codex'] },
  ]);
  const codex = resolveSkills(root, null, { runtime: 'codex' });
  assert.deepEqual(codex.map((skill: any) => skill.id), ['common', 'codex-only']);
  assert.equal(codex[0].runtimePath, 'common');
  assert.deepEqual(codex[0].legacyRuntimePaths, ['nested/common']);
  for (const runtime of [null, 'dsh', 'new-vendor']) {
    const skills = resolveSkills(root, null, { runtime });
    assert.deepEqual(skills.map((skill: any) => skill.id), ['common']);
    assert.equal(skills[0].runtime, runtime);
    assert.equal(skills[0].adapterId, 'agents-standard');
  }
  assert.equal(resolveSkills(root, null, { runtime: 'qoder' })[0].runtimePath, 'common', 'a retired brand projects through the flat standard path');
  assert.equal(resolveSkills(root, null, { runtime: 'dsh', adapterId: 'claude-code' })[0].runtimePath, 'nested/common');
});

test('generic product entry and full workspace assets share stable standard output', (t) => {
  const root = fixture(t);
  manifest(root, [{ id: 'common', path: 'nested/common' }]);
  assert.equal(resolvePackageAgentSkill('new-vendor').id, 'buildr');
  const project = (runtimeId: string | null) => assembleRuntimeProjection({ repoRoot: root, runtimeId, selection: { productSkill: true, rules: true, workspaceSkills: true } }).plan;
  const initial = project('codex');
  assert.equal(initial.adapterId, 'agents-standard');
  assert.equal(initial.runtimeId, 'codex');
  assert.ok(initial.nativeAssets.some((item: any) => item.targetFile === path.join(root, 'AGENTS.md')));
  assert.ok(initial.writes.some((item: any) => item.targetFile === path.join(root, '.agents/skills/common/references/example.txt')));
  assert.ok(initial.writes.every((item: any) => !item.targetFile.includes('.agents/skills/nested/')));
  reconcileRuntimePlan(initial);
  const stable = initial.writes.map((item: any) => [item.targetFile, item.content]);
  for (const runtimeId of ['dsh', 'new-vendor', null]) {
    const next = project(runtimeId);
    assert.deepEqual(next.writes.map((item: any) => [item.targetFile, item.content]), stable);
    const result = reconcileRuntimePlan(next);
    assert.equal(result.changed.length, 0);
    assert.equal(result.removed.length, 0);
  }
  const check = checkRuntimeProjection({ repoRoot: root, runtimeId: 'new-vendor' });
  assert.equal(check.runtimeId, 'new-vendor');
  assert.equal(check.adapterId, 'agents-standard');
  assert.equal(check.host.known, false);
  assert.equal(check.runtimeSourceEvidence.sessionConsumption, 'unknown');
});

test('runtime-specific providers cannot silently change shared consumer bindings', (t) => {
  const root = fixture(t);
  const contracts = path.join(root, 'skills', 'contracts');
  fs.mkdirSync(contracts);
  const sections = ['Purpose', 'Consumer Obligations', 'Minimum Guarantees', 'Effects and Authorization', 'Result Evidence', 'Decision Points', 'Allowed Variations'];
  fs.writeFileSync(path.join(contracts, 'method.md'), `---\nschemaVersion: buildr.capability-contract/v1\nid: example.method\nversion: 1\n---\n# Method\n\n${sections.map((section) => `## ${section}\n\nRequired boundary.\n`).join('\n')}`);
  const skills = [
    { id: 'provider', path: 'nested/provider', runtimes: ['codex'], provides: [{ capability: 'example.method', version: 1 }] },
    { id: 'consumer', path: 'nested/consumer', requires: [{ capability: 'example.method', version: 1, mode: 'required' }] },
  ];
  const extra = { contracts: [{ id: 'example.method', version: 1, path: 'contracts/method.md', description: 'Method' }], bindings: [{ capability: 'example.method', version: 1, provider: 'provider' }] };
  manifest(root, skills, extra);
  for (const runtimeId of ['codex', 'dsh']) {
    const { plan } = assembleRuntimeProjection({ repoRoot: root, runtimeId, selection: { workspaceSkills: true } });
    assert.ok(plan.findings.some((finding: any) => finding.status === 'conflict' && /Shared standard Skill consumer/.test(finding.message)));
    assert.throws(() => reconcileRuntimePlan(plan), /conflict/i);
    assert.equal(fs.existsSync(path.join(root, '.agents')), false);
  }
  // Explicit standard overrides must also participate for any runtime identity, including retired brands.
  skills[0].runtimes = ['qoder'];
  (skills[1] as any).runtimes = ['codex', 'qoder'];
  manifest(root, skills, extra);
  for (const runtimeId of ['codex', 'qoder']) {
    const { plan } = assembleRuntimeProjection({ repoRoot: root, runtimeId, adapterId: 'agents-standard', selection: { workspaceSkills: true } });
    assert.ok(plan.findings.some((finding: any) => finding.status === 'conflict' && /Shared standard Skill consumer/.test(finding.message)), `explicit standard override must participate: ${runtimeId}`);
    assert.throws(() => reconcileRuntimePlan(plan), /conflict/i);
  }
  // A deliberate current-source change to a portable provider is allowed: historical source hashes are not a gate.
  delete (skills[0] as any).runtimes;
  delete (skills[1] as any).runtimes;
  manifest(root, skills, extra);
  const { plan } = assembleRuntimeProjection({ repoRoot: root, runtimeId: 'dsh', selection: { workspaceSkills: true } });
  assert.equal(plan.findings.some((finding: any) => finding.status === 'conflict'), false);
  reconcileRuntimePlan(plan);
  assert.match(fs.readFileSync(path.join(root, '.agents/skills/consumer/SKILL.md'), 'utf8'), /\.agents\/skills\/provider\/SKILL.md/);
});
