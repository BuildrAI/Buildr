#!/usr/bin/env node

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ADAPTER_TRAIT_CATALOG,
  REQUIRED_RENDER_CAPABILITIES,
  RUNTIME_ADAPTERS,
  RUNTIME_HOST_PROFILES,
  SUPPORTED_AGENT_IDS,
  createRuntimeAdapterDescriptor,
  createRuntimeAdapterRegistry,
  createRuntimeContext,
  createRuntimePlan,
  getRuntimeAdapter,
  isSupportedAgent,
  resolveRuntimeSelection,
  runtimeAdapterImplementationMatrix,
  runtimeDiscoveryPayload,
  selectAdapterImplementation,
  skillDestinationRoots,
} from '../../../src/modules/agent-assets/infrastructure/runtime/adapter-contract.ts';
import { reconcileRuntimePlan, validateRuntimePlan } from '../../../src/modules/agent-assets/infrastructure/runtime/runtime-reconciler.ts';
import { validateSkillPublication } from '../../../src/modules/agent-assets/infrastructure/runtime/skills/publication.ts';
import { resolveSkillContributions } from '../../../src/modules/agent-assets/infrastructure/runtime/render-claude-code.ts';
import { assembleRuntimeProjection } from '../../../src/modules/agent-assets/infrastructure/runtime/projection.ts';
import { checkRuntimeAdapter } from '../../../src/modules/agent-assets/infrastructure/runtime/check-runtime.ts';

const productRoot: any = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const repositoryRoot: any = path.resolve(productRoot, '../../../..');
const temporaryRoot: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-runtime-adapter-contract-'));
process.once('exit', () => fs.rmSync(temporaryRoot, { recursive: true, force: true }));

assert.deepEqual(SUPPORTED_AGENT_IDS, ['claude-code', 'agents-standard']);
const implementationMatrix: any = runtimeAdapterImplementationMatrix();
assert.deepEqual(implementationMatrix.entries.map((entry: any) => entry.adapterId), SUPPORTED_AGENT_IDS);
assert.deepEqual(implementationMatrix.representatives.map((entry: any) => entry.family), [
  'native-recursive', 'per-source-reference',
]);
assert.deepEqual(ADAPTER_TRAIT_CATALOG.rules, ['native-recursive', 'native-root', 'reference-bridge']);
assert.equal(ADAPTER_TRAIT_CATALOG.rules.includes('vendor-rule-files'), false, 'vendor rule files are retired, not merely unused');
assert.equal(runtimeDiscoveryPayload().adapterTraitCatalog, ADAPTER_TRAIT_CATALOG);
assert.deepEqual(runtimeDiscoveryPayload().agents['agents-standard'].taskAdoption.modes, ['new-session', 'reentered']);
assert.equal(runtimeDiscoveryPayload().agents['agents-standard'].taskAdoption.sessionConsumption, 'unknown-until-adopted');
assert.deepEqual(RUNTIME_HOST_PROFILES.codex.publicationExtensions, [
  { path: 'agents/openai.yaml', format: 'openai-skill-metadata' },
]);
for (const adapterId of SUPPORTED_AGENT_IDS) {
  assert.deepEqual(RUNTIME_ADAPTERS[adapterId].traits.skills.publicationExtensions || [], [], `${adapterId} must not consume OpenAI Skill metadata`);
}
for (const adapter of Object.values(RUNTIME_ADAPTERS)) {
  assert.ok(adapter.traits);
  assert.deepEqual(Object.keys(adapter.renderCapabilities), REQUIRED_RENDER_CAPABILITIES);
  const root: any = path.join(temporaryRoot, `adapter-${adapter.id}`);
  const context: any = createRuntimeContext({
    adapterId: adapter.id,
    targetRoot: root,
    scope: '.',
    rules: { writes: [], nativeAssets: [path.join(root, 'AGENTS.md')], removals: [], actions: [] },
    skills: { writes: [], removals: [] },
  });
  validateRuntimePlan(adapter.planRuntime(context), adapter);
}

const projectionRoot: any = fs.mkdtempSync(path.join(temporaryRoot, 'adapter-projection-contract-'));
fs.writeFileSync(path.join(projectionRoot, 'AGENTS.md'), '# Adapter projection contract\n');
const expectedRuleTargets: any = {
  'claude-code': 'CLAUDE.md',
};
for (const adapterId of SUPPORTED_AGENT_IDS) {
  const adapter: any = RUNTIME_ADAPTERS[adapterId];
  const assembled: any = assembleRuntimeProjection({
    repoRoot: projectionRoot,
    targetRoot: projectionRoot,
    adapterId,
    scope: '.',
    selection: { productSkill: true, rules: true },
  });
  const targets: any = assembled.plan.writes.map((item: any) => path.relative(projectionRoot, item.targetFile).split(path.sep).join('/'));
  assert.ok(targets.some((target: any) => target.startsWith(`${adapter.traits.skills.root}/skills/buildr/`)), `${adapterId} must plan its declared product Skill root`);
  if (adapterId === 'agents-standard') {
    assert.ok(assembled.plan.nativeAssets.some((item: any) => item.targetFile === path.join(projectionRoot, 'AGENTS.md')));
  } else {
    assert.ok(targets.some((target: any) => target.includes(expectedRuleTargets[adapterId])), `${adapterId} must plan its declared Rules target`);
  }
}
const codexCheck: any = checkRuntimeAdapter(['--target', projectionRoot, '--scope', '.'], { repoRoot: projectionRoot, runtimeId: 'codex', adapterId: 'agents-standard' });
assert.equal(codexCheck.runtimeSourceEvidence.assurance, 'buildr-verified');
assert.equal(codexCheck.runtimeSourceEvidence.activation.rules, 'path-read');
assert.equal(codexCheck.runtimeSourceEvidence.activation.skills, 'session-start');
assert.match(codexCheck.runtimeSourceEvidence.projectionIdentity, /^sha256-[a-f0-9]{64}$/);
assert.equal(codexCheck.runtimeSourceEvidence.sessionConsumption, 'unknown');
fs.rmSync(projectionRoot, { recursive: true, force: true });

const adapterDocPath: any = path.join(productRoot, 'docs', 'agent-runtime-adapters.md');
const adapterDoc: any = fs.readFileSync(adapterDocPath, 'utf8');
for (const adapterId of SUPPORTED_AGENT_IDS) {
  assert.ok(adapterDoc.includes(`(\`${adapterId}\`)`), `${adapterId} must have an adapter documentation section`);
}
for (const token of ['Rules 接入', 'Skills 接入', '生效/刷新', 'checker', '证据', 'smoke']) assert.ok(adapterDoc.includes(token), `adapter documentation must contain ${token}`);
for (const readmeName of ['README.md', 'README.en.md']) {
  const readme: any = fs.readFileSync(path.join(repositoryRoot, readmeName), 'utf8');
  assert.ok(readme.includes('projects/product/services/buildr/docs/agent-runtime-adapters.md'), `${readmeName} must link the authoritative adapter documentation`);
}
// Retired vendor brands stay valid runtime identities, but they no longer own an adapter or a projection.
for (const runtimeId of ['cursor', 'qoder', 'trae', 'trae-work', 'workbuddy']) {
  assert.equal(Object.hasOwn(RUNTIME_ADAPTERS, runtimeId), false, `${runtimeId} must not remain a registered adapter`);
  assert.equal(isSupportedAgent(runtimeId), true, `${runtimeId} must remain a valid runtime identity`);
  const selection: any = resolveRuntimeSelection({ runtimeId });
  assert.equal(selection.runtimeId, runtimeId, `${runtimeId} must preserve its observed identity`);
  assert.equal(selection.adapterId, 'agents-standard');
  assert.equal(selection.reason, 'standard-default');
  assert.equal(selection.host.known, false);
  assert.throws(() => getRuntimeAdapter(runtimeId), /Unsupported runtime adapter/);
}
assert.equal(RUNTIME_ADAPTERS['claude-code'].traits.rules.kind, 'reference-bridge');
assert.ok(adapterDoc.includes('`@AGENTS.md`'), 'the Claude Code exception must document its reference bridge');

assert.throws(() => getRuntimeAdapter('fake-runtime'), /Unsupported runtime adapter/);
assert.throws(() => getRuntimeAdapter('fake-runtime'), /Supported adapters: claude-code, agents-standard\./);
assert.throws(() => getRuntimeAdapter('cursor'), /Unsupported runtime adapter: cursor\. Supported adapters: claude-code, agents-standard\./);
assert.throws(() => createRuntimeAdapterRegistry([{ id: 'fake-runtime', runtimeTargets: [], renderCapabilities: {}, recommendedCommands: {} }], { testOnly: true }), /Invalid runtime adapter registry/);

const fakeImplementations: any = { rules: ['fake-rules'], skills: ['fake-skills'], checker: ['fake-checker'] };
const fakeDescriptor: any = createRuntimeAdapterDescriptor({
  id: 'fake-runtime',
  displayName: 'Fake Runtime',
  traits: {
    rules: { kind: 'reference-bridge', implementation: 'fake-rules', targetPattern: '.fake/rules/<source>.md' },
    skills: { kind: 'vendor-root', implementation: 'fake-skills', root: '.fake' },
    surfaces: [{ kind: 'ide', variant: 'test' }],
    activation: { rules: 'explicit-reload', skills: 'explicit-reload', reloadGuidance: 'Reload Fake Runtime.' },
    checker: {
      kind: 'projection',
      implementation: 'fake-checker',
    },
  },
  recommendedCommands: {},
}, { implementations: fakeImplementations });
const fakeRegistry: any = createRuntimeAdapterRegistry([fakeDescriptor], { testOnly: true, implementations: fakeImplementations });
assert.equal(fakeRegistry['fake-runtime'].id, 'fake-runtime');
assert.equal(fakeRegistry['fake-runtime'].traits.skills.root, '.fake');
assert.equal(fakeRegistry['fake-runtime'].renderCapabilities['rules-entry'].projection.mode, 'rendered');
const fakeRulesPlanner: any = () => 'fake-plan';
assert.equal(selectAdapterImplementation(fakeRegistry['fake-runtime'], 'rules', { 'fake-rules': fakeRulesPlanner }), fakeRulesPlanner);
assert.throws(() => selectAdapterImplementation(fakeRegistry['fake-runtime'], 'rules', {}), /no registered rules implementation/);
assert.equal(RUNTIME_ADAPTERS['fake-runtime'], undefined);

const fakeValue: any = {
  id: 'invalid-runtime',
  displayName: 'Invalid Runtime',
  recommendedCommands: {},
  traits: {
    rules: { kind: 'reference-bridge', implementation: 'fake-rules', targetPattern: '.fake/rules/<source>.md' },
    skills: { kind: 'vendor-root', implementation: 'fake-skills', root: '.fake' },
    surfaces: [{ kind: 'ide' }],
    activation: { rules: 'session-start', skills: 'session-start' },
    checker: { kind: 'projection', implementation: 'fake-checker' },
  },
};
assert.throws(() => createRuntimeAdapterDescriptor({ ...fakeValue, traits: { ...fakeValue.traits, rules: { ...fakeValue.traits.rules, kind: 'unknown' } } }, { implementations: fakeImplementations }), /rules trait is invalid/);
assert.throws(() => createRuntimeAdapterDescriptor({ ...fakeValue, traits: { ...fakeValue.traits, rules: { kind: 'vendor-rule-files', implementation: 'fake-rules', targetPattern: '.fake/rules/<source>.md' } } }, { implementations: fakeImplementations }), /rules trait is invalid/);
assert.throws(() => createRuntimeAdapterDescriptor({ ...fakeValue, traits: { ...fakeValue.traits, rules: { kind: 'reference-bridge', implementation: 'fake-rules' } } }, { implementations: fakeImplementations }), /targetPattern is required/);
assert.throws(() => createRuntimeAdapterDescriptor({ ...fakeValue, traits: { ...fakeValue.traits, skills: { ...fakeValue.traits.skills, root: '../escape' } } }, { implementations: fakeImplementations }), /skills root is unsafe/);
const singleRootDescriptor: any = createRuntimeAdapterDescriptor(fakeValue, { implementations: fakeImplementations });
assert.deepEqual(singleRootDescriptor.traits.skills.destinations.workspace.roots, ['.fake']);
assert.deepEqual(singleRootDescriptor.traits.skills.destinations.user.roots, undefined);
assert.deepEqual(singleRootDescriptor.renderCapabilities['workspace-project-skills'].targets, ['.fake/skills/<skill>/SKILL.md']);
assert.deepEqual(singleRootDescriptor.renderCapabilities['skill-install-plans'].targets, ['.fake/buildr/skill-install-plans/<skill>.md']);
assert.deepEqual(skillDestinationRoots(singleRootDescriptor, 'workspace', '/workspace'), ['/workspace/.fake']);
assert.deepEqual(skillDestinationRoots(singleRootDescriptor, 'user', '/workspace', { userHome: '/home/user' }), ['/home/user/.fake']);
assert.throws(() => createRuntimeAdapterDescriptor({ ...fakeValue, traits: { ...fakeValue.traits, skills: { ...fakeValue.traits.skills, publicationExtensions: [{ path: '../escape', format: 'openai-skill-metadata' }] } } }, { implementations: fakeImplementations }), /publicationExtensions\[0\] path is unsafe/);
assert.throws(() => createRuntimeAdapterDescriptor({ ...fakeValue, traits: { ...fakeValue.traits, skills: { ...fakeValue.traits.skills, publicationExtensions: [{ path: 'agents\/openai.yaml', format: 'unknown' }] } } }, { implementations: fakeImplementations }), /publicationExtensions\[0\] format is invalid/);
assert.throws(() => createRuntimeAdapterDescriptor({ ...fakeValue, traits: { ...fakeValue.traits, skills: { ...fakeValue.traits.skills, publicationExtensions: [{ path: 'agents\/openai.yaml', format: 'openai-skill-metadata' }, { path: 'agents\/openai.yaml', format: 'openai-skill-metadata' }] } } }, { implementations: fakeImplementations }), /duplicate path/);
assert.throws(() => createRuntimeAdapterDescriptor({ ...fakeValue, traits: { ...fakeValue.traits, rules: { kind: 'native-root', implementation: 'fake-rules' } } }, { implementations: fakeImplementations }), /do not cover recursive scope/);
assert.throws(() => createRuntimeAdapterDescriptor({ ...fakeValue, traits: { ...fakeValue.traits, rules: { ...fakeValue.traits.rules, implementation: 'missing' } } }, { implementations: fakeImplementations }), /no registered rules implementation/);
assert.throws(() => createRuntimeAdapterRegistry([fakeDescriptor, fakeDescriptor], { testOnly: true, implementations: fakeImplementations }), /duplicate adapter id/);

const publicationRoot: any = fs.mkdtempSync(path.join(temporaryRoot, 'skill-publication-'));
assert.deepEqual(validateSkillPublication(RUNTIME_ADAPTERS['claude-code'], { skillId: 'demo', skillDir: publicationRoot }), []);
assert.deepEqual(validateSkillPublication(RUNTIME_ADAPTERS['agents-standard'], { runtimeId: 'codex', skillId: 'demo', skillDir: publicationRoot }), [], 'missing optional OpenAI metadata must not block Codex publication');
fs.mkdirSync(path.join(publicationRoot, 'agents'));
fs.writeFileSync(path.join(publicationRoot, 'agents', 'openai.yaml'), 'interface:\n  display_name: Demo\n');
assert.match(validateSkillPublication(RUNTIME_ADAPTERS['agents-standard'], { runtimeId: 'codex', skillId: 'demo', skillDir: publicationRoot }).join('\n'), /short_description must be a non-empty string/);
fs.writeFileSync(path.join(publicationRoot, 'agents', 'openai.yaml'), 'interface:\n  display_name: Demo\n  short_description: Demo skill\n  default_prompt: Use $demo.\n');
assert.deepEqual(validateSkillPublication(RUNTIME_ADAPTERS['agents-standard'], { runtimeId: 'codex', skillId: 'demo', skillDir: publicationRoot }), []);
fs.rmSync(publicationRoot, { recursive: true, force: true });

const codex: any = RUNTIME_ADAPTERS['agents-standard'];
const root: any = path.join(temporaryRoot, 'invalid-plan');
const context: any = createRuntimeContext({ adapterId: 'agents-standard', targetRoot: root, scope: '.', rules: { writes: [], nativeAssets: [], removals: [], actions: [] }, skills: { writes: [], removals: [] } });
const valid: any = codex.planRuntime(context);
assert.throws(() => validateRuntimePlan({ ...valid, writes: [{ targetFile: path.join(root, '..', 'escape'), content: 'bad' }] }, codex), /outside target root/);
assert.throws(() => validateRuntimePlan({ ...valid, capabilityEvidence: [] }, codex), /missing capability evidence/);
assert.throws(() => validateRuntimePlan({ ...valid, writes: [{ targetFile: path.join(root, 'invalid-base64'), content: '***', contentEncoding: 'base64' }] }, codex), /base64 content is invalid/);
assert.throws(() => validateRuntimePlan({ ...valid, writes: [{ targetFile: path.join(root, 'invalid-mode'), content: 'bad', mode: 0o111 }] }, codex), /mode is invalid/);
assert.throws(() => validateRuntimePlan({ ...valid, writes: [{ targetFile: path.join(root, 'invalid-commit'), content: 'bad', commitLast: 'yes' }] }, codex), /commitLast must be boolean/);

const symlinkPlanRoot: any = fs.mkdtempSync(path.join(temporaryRoot, 'runtime-plan-symlink-'));
const symlinkPlanOutside: any = fs.mkdtempSync(path.join(temporaryRoot, 'runtime-plan-outside-'));
fs.mkdirSync(path.join(symlinkPlanRoot, '.agents'), { recursive: true });
fs.symlinkSync(symlinkPlanOutside, path.join(symlinkPlanRoot, '.agents', 'skills'), 'dir');
const symlinkPlanTarget: any = path.join(symlinkPlanRoot, '.agents', 'skills', 'demo', 'SKILL.md');
assert.throws(() => validateRuntimePlan({ ...valid, targetRoot: symlinkPlanRoot, writes: [{ targetFile: symlinkPlanTarget, content: 'bad' }] }, codex), /crosses a symbolic link/);
assert.throws(() => validateRuntimePlan({ ...valid, targetRoot: symlinkPlanRoot, removals: [{ targetFile: symlinkPlanTarget }] }, codex), /crosses a symbolic link/);

const reconcileRoot: any = fs.mkdtempSync(path.join(temporaryRoot, 'runtime-reconcile-'));
const targetFile: any = path.join(reconcileRoot, '.agents', 'skills', 'demo', 'SKILL.md');
const orphanFile: any = path.join(reconcileRoot, '.agents', 'buildr', 'skill-install-plans', 'orphan.md');
fs.mkdirSync(path.dirname(orphanFile), { recursive: true });
fs.writeFileSync(orphanFile, '<!-- Generated by Buildr. Agent action required. -->\n');
const evidence: any = REQUIRED_RENDER_CAPABILITIES.map((capability: any) => ({ capability, supported: true }));
const reconcilePlan: any = createRuntimePlan({ adapterId: 'agents-standard', targetRoot: reconcileRoot, scope: '.', writes: [{ targetFile, content: 'managed\n', source: 'test', isManaged: (content: any) => content === 'managed\n' }], nativeAssets: [], removals: [{ targetFile: orphanFile, isManaged: (content: any) => content.includes('Generated by Buildr') }], capabilityEvidence: evidence });
assert.equal(reconcileRuntimePlan(reconcilePlan).changed.length, 1);
assert.equal(fs.existsSync(orphanFile), false);
assert.equal(reconcileRuntimePlan(reconcilePlan).changed.length, 0);
fs.writeFileSync(targetFile, 'raw source\n');
const adoptionPlan: any = createRuntimePlan({ adapterId: 'agents-standard', targetRoot: reconcileRoot, scope: '.', writes: [{ targetFile, content: 'managed adoption\n', sourceContent: 'raw source\n', source: 'test', isManaged: () => false }], nativeAssets: [], removals: [], capabilityEvidence: evidence });
assert.equal(reconcileRuntimePlan(adoptionPlan).changed.length, 1);
fs.writeFileSync(targetFile, 'user content\n');
assert.throws(() => reconcileRuntimePlan(reconcilePlan), /no files were changed/);
assert.equal(fs.readFileSync(targetFile, 'utf8'), 'user content\n');

const binaryRoot: any = fs.mkdtempSync(path.join(temporaryRoot, 'runtime-binary-'));
const binaryFile: any = path.join(binaryRoot, '.agents', 'skills', 'demo', 'assets', 'sample.bin');
const staleFile: any = path.join(binaryRoot, '.agents', 'skills', 'demo', 'assets', 'stale.bin');
const receiptFile: any = path.join(binaryRoot, '.buildr', 'agent-runtime', 'workspace', 'agents-standard', 'skill-projection-ownership-receipts', 'demo.json');
fs.mkdirSync(path.dirname(staleFile), { recursive: true });
fs.writeFileSync(staleFile, Buffer.from([9, 8, 7]));
const staleIntegrity: any = `sha256-${crypto.createHash('sha256').update(fs.readFileSync(staleFile)).digest('hex')}`;
const binaryPlan: any = createRuntimePlan({
  adapterId: 'agents-standard',
  targetRoot: binaryRoot,
  scope: '.',
  writes: [
    { targetFile: binaryFile, content: Buffer.from([0, 255, 16]).toString('base64'), contentEncoding: 'base64', mode: 0o100, source: 'binary fixture' },
    { targetFile: receiptFile, content: '{"committed":true}\n', source: 'receipt fixture', commitLast: true },
  ],
  nativeAssets: [],
  removals: [{ targetFile: staleFile, expectedIntegrity: staleIntegrity, expectedExecutable: false }],
  capabilityEvidence: evidence,
});
const binaryResult: any = reconcileRuntimePlan(binaryPlan);
assert.equal(binaryPlan.writes.find((item: any) => item.targetFile === binaryFile)?.mode, 0o100, 'runtime plan must preserve executable intent on every platform');
assert.deepEqual(fs.readFileSync(binaryFile), Buffer.from([0, 255, 16]));
if (process.platform !== 'win32') assert.equal((fs.statSync(binaryFile).mode & 0o100) === 0o100, true);
assert.equal(fs.existsSync(staleFile), false);
assert.equal(binaryResult.changed.at(-1), receiptFile, 'commitLast receipt must be written after payload files and stale removals');

const guardedRemoval: any = path.join(binaryRoot, '.agents', 'skills', 'demo', 'assets', 'guarded.bin');
const untouchedWrite: any = path.join(binaryRoot, '.agents', 'skills', 'demo', 'assets', 'untouched.bin');
fs.writeFileSync(guardedRemoval, Buffer.from([1, 2, 3]));
const guardedPlan: any = createRuntimePlan({
  adapterId: 'agents-standard',
  targetRoot: binaryRoot,
  scope: '.',
  writes: [{ targetFile: untouchedWrite, content: 'new\n', source: 'guarded fixture' }],
  nativeAssets: [],
  removals: [{ targetFile: guardedRemoval, expectedIntegrity: staleIntegrity, expectedExecutable: false }],
  capabilityEvidence: evidence,
});
assert.throws(() => reconcileRuntimePlan(guardedPlan), /no files were changed/);
assert.equal(fs.existsSync(untouchedWrite), false, 'removal conflicts must stop every write during preflight');
assert.deepEqual(fs.readFileSync(guardedRemoval), Buffer.from([1, 2, 3]));

const componentRoot: any = fs.mkdtempSync(path.join(temporaryRoot, 'runtime-component-'));
const componentDir: any = path.join(componentRoot, 'components', 'workspace', 'demo');
const fragmentRelative: any = 'components/workspace/demo/contributions/demo.md';
const ruleRelative: any = 'rules/demo.md';
fs.mkdirSync(path.join(componentRoot, 'components'), { recursive: true });
fs.mkdirSync(path.dirname(path.join(componentRoot, fragmentRelative)), { recursive: true });
fs.mkdirSync(path.join(componentRoot, 'rules'), { recursive: true });
fs.writeFileSync(path.join(componentRoot, 'components', 'manifest.yml'), 'schemaVersion: buildr.components/v1\ncomponents:\n  - id: demo\n    path: components/workspace/demo\n    enabled: true\n    state: installed\n');
fs.writeFileSync(path.join(componentRoot, fragmentRelative), 'Contribution\n');
fs.writeFileSync(path.join(componentRoot, ruleRelative), 'Rule\n');
const integrity: any = (relative: any) => `sha256-${crypto.createHash('sha256').update(fs.readFileSync(path.join(componentRoot, relative))).digest('hex')}`;
const definition: any = (extra: any = '') => `schemaVersion: buildr.component/v1\nid: demo\nkind: addon\nversion: 1.0.0\nsource: workspace\n${extra}members:\n  rules: [${JSON.stringify(ruleRelative)}]\n  skills: []\n  commandCollections: []\n  skillContributions: [${JSON.stringify(fragmentRelative)}]\ncontributions:\n  skillFragments: [${JSON.stringify(`buildr#slot=${fragmentRelative}`)}]\nintegrity: [${JSON.stringify(`${ruleRelative}=${integrity(ruleRelative)}`)}, ${JSON.stringify(`${fragmentRelative}=${integrity(fragmentRelative)}`)}]\n`;
fs.writeFileSync(path.join(componentDir, 'component.yml'), definition('adapter: ./adapter.mjs\n'));
assert.throws(() => resolveSkillContributions(componentRoot), /cannot extend runtime adapters/);
fs.writeFileSync(path.join(componentDir, 'component.yml'), definition());
assert.equal(resolveSkillContributions(componentRoot).length, 1);
fs.writeFileSync(path.join(componentRoot, ruleRelative), 'modified\n');
assert.throws(() => resolveSkillContributions(componentRoot), /Component member integrity mismatch/);

console.log('runtime adapter contract verification passed');
