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
  SUPPORTED_AGENT_IDS,
  createRuntimeAdapterDescriptor,
  createRuntimeAdapterRegistry,
  createRuntimeContext,
  createRuntimePlan,
  getRuntimeAdapter,
  reconcileRuntimePlan,
  runtimeAdapterImplementationMatrix,
  runtimeDiscoveryPayload,
  selectPlatformEnvironmentProbe,
  selectAdapterImplementation,
  validateRuntimePlan,
} from '../../../src/infrastructure/runtime/adapter-contract.mjs';
import { validateSkillPublication } from '../../../src/infrastructure/runtime/skills/publication.mjs';
import { resolveSkillContributions } from '../../../src/infrastructure/runtime/render-claude-code.mjs';
import { assembleRuntimeProjection } from '../../../src/infrastructure/runtime/projection.mjs';
import { checkRuntimeAdapter, runEnvironmentProbe } from '../../../src/infrastructure/runtime/check-runtime.mjs';

const productRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const repositoryRoot = path.resolve(productRoot, '../../../..');
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-runtime-adapter-contract-'));
process.once('exit', () => fs.rmSync(temporaryRoot, { recursive: true, force: true }));

assert.deepEqual(SUPPORTED_AGENT_IDS, ['claude-code', 'codex', 'cursor', 'qoder', 'trae', 'trae-work', 'workbuddy']);
const implementationMatrix = runtimeAdapterImplementationMatrix();
assert.deepEqual(implementationMatrix.entries.map((entry) => entry.adapterId), SUPPORTED_AGENT_IDS);
assert.deepEqual(implementationMatrix.representatives.map((entry) => entry.family), [
  'native-recursive', 'per-source-reference', 'same-directory-vendor', 'central-vendor', 'root-index-bridge',
]);
assert.deepEqual(ADAPTER_TRAIT_CATALOG.rules, ['native-recursive', 'native-root', 'reference-bridge', 'vendor-rule-files']);
assert.equal(runtimeDiscoveryPayload().adapterTraitCatalog, ADAPTER_TRAIT_CATALOG);
assert.deepEqual(runtimeDiscoveryPayload().agents.codex.taskAdoption.modes, ['new-session', 'reentered']);
assert.equal(runtimeDiscoveryPayload().agents.codex.taskAdoption.sessionConsumption, 'unknown-until-adopted');
assert.deepEqual(RUNTIME_ADAPTERS.codex.traits.skills.publicationExtensions, [
  { path: 'agents/openai.yaml', format: 'openai-skill-metadata' },
]);
for (const adapterId of SUPPORTED_AGENT_IDS.filter((id) => id !== 'codex')) {
  assert.deepEqual(RUNTIME_ADAPTERS[adapterId].traits.skills.publicationExtensions || [], [], `${adapterId} must not consume OpenAI Skill metadata`);
}
for (const adapter of Object.values(RUNTIME_ADAPTERS)) {
  assert.ok(adapter.traits);
  assert.deepEqual(Object.keys(adapter.renderCapabilities), REQUIRED_RENDER_CAPABILITIES);
  const root = path.join(temporaryRoot, `adapter-${adapter.id}`);
  const context = createRuntimeContext({
    adapterId: adapter.id,
    targetRoot: root,
    scope: '.',
    rules: { writes: [], nativeAssets: [path.join(root, 'AGENTS.md')], removals: [], actions: [] },
    skills: { writes: [], removals: [] },
  });
  validateRuntimePlan(adapter.planRuntime(context), adapter);
}

const projectionRoot = fs.mkdtempSync(path.join(temporaryRoot, 'adapter-projection-contract-'));
fs.writeFileSync(path.join(projectionRoot, 'AGENTS.md'), '# Adapter projection contract\n');
const expectedRuleTargets = {
  'claude-code': 'CLAUDE.md',
  cursor: '.cursor/rules/buildr.mdc',
  qoder: '.qoder/rules/buildr/',
  trae: '.trae/rules/buildr.md',
  'trae-work': 'CLAUDE.local.md',
  workbuddy: 'CODEBUDDY.md',
};
for (const adapterId of SUPPORTED_AGENT_IDS) {
  const adapter = RUNTIME_ADAPTERS[adapterId];
  const assembled = assembleRuntimeProjection({
    repoRoot: projectionRoot,
    targetRoot: projectionRoot,
    adapterId,
    scope: '.',
    selection: { productSkill: true, rules: true },
  });
  const targets = assembled.plan.writes.map((item) => path.relative(projectionRoot, item.targetFile).split(path.sep).join('/'));
  assert.ok(targets.some((target) => target.startsWith(`${adapter.traits.skills.root}/skills/buildr/`)), `${adapterId} must plan its declared product Skill root`);
  if (adapterId === 'codex') {
    assert.ok(assembled.plan.nativeAssets.some((item) => item.targetFile === path.join(projectionRoot, 'AGENTS.md')));
  } else {
    assert.ok(targets.some((target) => target.includes(expectedRuleTargets[adapterId])), `${adapterId} must plan its declared Rules target`);
  }
}
const codexCheck = checkRuntimeAdapter(['--target', projectionRoot, '--scope', '.'], { repoRoot: projectionRoot, adapterId: 'codex' });
assert.equal(codexCheck.runtimeSourceEvidence.assurance, 'buildr-verified');
assert.equal(codexCheck.runtimeSourceEvidence.activation.rules, 'path-read');
assert.equal(codexCheck.runtimeSourceEvidence.activation.skills, 'session-start');
assert.match(codexCheck.runtimeSourceEvidence.projectionIdentity, /^sha256-[a-f0-9]{64}$/);
assert.equal(codexCheck.runtimeSourceEvidence.sessionConsumption, 'unknown');
fs.rmSync(projectionRoot, { recursive: true, force: true });

for (const adapterId of ['cursor', 'qoder', 'trae', 'trae-work', 'workbuddy']) {
  const adapter = RUNTIME_ADAPTERS[adapterId];
  assert.ok(adapter.evidence.rules, `${adapterId} must retain runtime-specific Rules evidence`);
  assert.ok(adapter.evidence.skills, `${adapterId} must retain runtime-specific Skills evidence`);
  assert.equal(typeof adapter.evidence.rules, 'string');
  assert.equal(typeof adapter.evidence.skills, 'string');
  assert.equal('verificationLevel' in adapter.evidence, false);
  assert.equal('smokeStatus' in adapter.evidence, false);
  assert.equal('smoke' in adapter.evidence, false);
  assert.deepEqual(adapter.planRuntime(createRuntimeContext({
    adapterId,
    targetRoot: path.join(temporaryRoot, `${adapterId}-evidence`),
    scope: '.',
    rules: { writes: [], nativeAssets: [], removals: [], actions: [] },
    skills: { writes: [], removals: [] },
  })).capabilityEvidence.map((item) => item.adapterId), REQUIRED_RENDER_CAPABILITIES.map(() => adapterId));
}

const adapterDocPath = path.join(productRoot, 'docs', 'agent-runtime-adapters.md');
const adapterDoc = fs.readFileSync(adapterDocPath, 'utf8');
for (const adapterId of SUPPORTED_AGENT_IDS) {
  assert.ok(adapterDoc.includes(`(\`${adapterId}\`)`), `${adapterId} must have an adapter documentation section`);
}
for (const token of ['Rules 接入', 'Skills 接入', '生效/刷新', 'checker', '证据', 'smoke']) assert.ok(adapterDoc.includes(token), `adapter documentation must contain ${token}`);
for (const readmeName of ['README.md', 'README.en.md']) {
  const readme = fs.readFileSync(path.join(repositoryRoot, readmeName), 'utf8');
  assert.ok(readme.includes('projects/product/services/buildr/docs/agent-runtime-adapters.md'), `${readmeName} must link the authoritative adapter documentation`);
}
assert.equal(RUNTIME_ADAPTERS.cursor.traits.rules.kind, 'vendor-rule-files');
assert.equal(RUNTIME_ADAPTERS.qoder.traits.rules.format, 'qoder-markdown');
assert.equal(RUNTIME_ADAPTERS.trae.traits.rules.format, 'trae-markdown');
assert.equal(RUNTIME_ADAPTERS.trae.traits.checker.versionProbe.kind, 'manual');
assert.equal(RUNTIME_ADAPTERS.trae.traits.skills.root, '.agents');
assert.equal(RUNTIME_ADAPTERS.cursor.traits.rules.format, 'cursor-mdc');
assert.equal(RUNTIME_ADAPTERS['trae-work'].traits.rules.placement, 'root-index');
assert.deepEqual(RUNTIME_ADAPTERS['trae-work'].traits.checker.prerequisites || [], []);
assert.equal(RUNTIME_ADAPTERS.workbuddy.traits.rules.maxChars, 8000);
assert.equal(RUNTIME_ADAPTERS.workbuddy.traits.skills.root, '.codebuddy');
assert.deepEqual(RUNTIME_ADAPTERS.workbuddy.traits.surfaces, [{ kind: 'desktop' }, { kind: 'cli', variant: 'desktop-bundled' }]);
assert.deepEqual(Object.keys(RUNTIME_ADAPTERS.workbuddy.evidence).sort(), ['rules', 'skills']);
assert.ok(adapterDoc.includes('`.codebuddy/skills`'));

const traeWorkDarwinProbe = selectPlatformEnvironmentProbe({
  platform: 'darwin',
  command: { kind: 'command', executable: 'defaults', args: ['read', 'Info', 'CFBundleIdentifier'], timeoutMs: 3000 },
  guidance: 'Confirm TRAE Work manually.',
});
assert.deepEqual(traeWorkDarwinProbe, { kind: 'command', executable: 'defaults', args: ['read', 'Info', 'CFBundleIdentifier'], timeoutMs: 3000 });
const workbuddyWindowsProbe = selectPlatformEnvironmentProbe({
  platform: 'win32',
  command: { kind: 'command', executable: 'defaults', args: ['read', 'Info', 'CFBundleIdentifier'], timeoutMs: 3000 },
  guidance: 'Confirm WorkBuddy manually.',
});
assert.deepEqual(workbuddyWindowsProbe, { kind: 'manual', guidance: 'Confirm WorkBuddy manually.' });
assert.deepEqual(runEnvironmentProbe(workbuddyWindowsProbe), { status: 'manual', probe: 'manual', guidance: 'Confirm WorkBuddy manually.' });
const spawnCalls = [];
const commandProbe = runEnvironmentProbe(
  { kind: 'command', executable: 'tool', args: ['--version'], timeoutMs: 3000 },
  { spawn: (...args) => { spawnCalls.push(args); return { status: 0, stdout: 'tool 1.2.3', stderr: '' }; } },
);
assert.equal(commandProbe.status, 'ok');
assert.deepEqual(spawnCalls[0], ['tool', ['--version'], { encoding: 'utf8', timeout: 3000, shell: false, stdio: ['ignore', 'pipe', 'pipe'] }]);

assert.throws(() => getRuntimeAdapter('fake-runtime'), /Unsupported Agent runtime/);
assert.throws(() => createRuntimeAdapterRegistry([{ id: 'fake-runtime', runtimeTargets: [], renderCapabilities: {}, recommendedCommands: {} }], { testOnly: true }), /Invalid runtime adapter registry/);

const fakeImplementations = { rules: ['fake-rules'], skills: ['fake-skills'], checker: ['fake-checker'] };
const fakeDescriptor = createRuntimeAdapterDescriptor({
  id: 'fake-runtime',
  displayName: 'Fake Runtime',
  traits: {
    rules: { kind: 'vendor-rule-files', implementation: 'fake-rules', format: 'qoder-markdown', targetPattern: '.fake/rules/<source>.md' },
    skills: { kind: 'vendor-root', implementation: 'fake-skills', root: '.fake' },
    surfaces: [{ kind: 'ide', variant: 'test' }],
    activation: { rules: 'explicit-reload', skills: 'explicit-reload', reloadGuidance: 'Reload Fake Runtime.' },
    checker: {
      kind: 'projection',
      implementation: 'fake-checker',
      installationProbe: { kind: 'manual', guidance: 'Confirm Fake Runtime is installed.' },
      versionProbe: { kind: 'command', executable: 'fake-runtime', args: ['--version'], timeoutMs: 1000 },
    },
  },
  recommendedCommands: {},
}, { implementations: fakeImplementations });
const fakeRegistry = createRuntimeAdapterRegistry([fakeDescriptor], { testOnly: true, implementations: fakeImplementations });
assert.equal(fakeRegistry['fake-runtime'].id, 'fake-runtime');
assert.equal(fakeRegistry['fake-runtime'].traits.skills.root, '.fake');
assert.equal(fakeRegistry['fake-runtime'].renderCapabilities['rules-entry'].projection.mode, 'rendered');
const fakeRulesPlanner = () => 'fake-plan';
assert.equal(selectAdapterImplementation(fakeRegistry['fake-runtime'], 'rules', { 'fake-rules': fakeRulesPlanner }), fakeRulesPlanner);
assert.throws(() => selectAdapterImplementation(fakeRegistry['fake-runtime'], 'rules', {}), /no registered rules implementation/);
assert.equal(RUNTIME_ADAPTERS['fake-runtime'], undefined);

const fakeValue = {
  id: 'invalid-runtime',
  displayName: 'Invalid Runtime',
  recommendedCommands: {},
  traits: {
    rules: { kind: 'vendor-rule-files', implementation: 'fake-rules', format: 'qoder-markdown', targetPattern: '.fake/rules/<source>.md' },
    skills: { kind: 'vendor-root', implementation: 'fake-skills', root: '.fake' },
    surfaces: [{ kind: 'ide' }],
    activation: { rules: 'session-start', skills: 'session-start' },
    checker: { kind: 'projection', implementation: 'fake-checker', installationProbe: { kind: 'none' }, versionProbe: { kind: 'none' } },
  },
};
assert.throws(() => createRuntimeAdapterDescriptor({ ...fakeValue, traits: { ...fakeValue.traits, rules: { ...fakeValue.traits.rules, kind: 'unknown' } } }, { implementations: fakeImplementations }), /rules trait is invalid/);
assert.throws(() => createRuntimeAdapterDescriptor({ ...fakeValue, traits: { ...fakeValue.traits, skills: { ...fakeValue.traits.skills, root: '../escape' } } }, { implementations: fakeImplementations }), /skills root is unsafe/);
assert.throws(() => createRuntimeAdapterDescriptor({ ...fakeValue, traits: { ...fakeValue.traits, skills: { ...fakeValue.traits.skills, publicationExtensions: [{ path: '../escape', format: 'openai-skill-metadata' }] } } }, { implementations: fakeImplementations }), /publicationExtensions\[0\] path is unsafe/);
assert.throws(() => createRuntimeAdapterDescriptor({ ...fakeValue, traits: { ...fakeValue.traits, skills: { ...fakeValue.traits.skills, publicationExtensions: [{ path: 'agents\/openai.yaml', format: 'unknown' }] } } }, { implementations: fakeImplementations }), /publicationExtensions\[0\] format is invalid/);
assert.throws(() => createRuntimeAdapterDescriptor({ ...fakeValue, traits: { ...fakeValue.traits, skills: { ...fakeValue.traits.skills, publicationExtensions: [{ path: 'agents\/openai.yaml', format: 'openai-skill-metadata' }, { path: 'agents\/openai.yaml', format: 'openai-skill-metadata' }] } } }, { implementations: fakeImplementations }), /duplicate path/);
assert.throws(() => createRuntimeAdapterDescriptor({ ...fakeValue, traits: { ...fakeValue.traits, rules: { kind: 'native-root', implementation: 'fake-rules' } } }, { implementations: fakeImplementations }), /do not cover recursive scope/);
assert.throws(() => createRuntimeAdapterDescriptor({ ...fakeValue, traits: { ...fakeValue.traits, rules: { ...fakeValue.traits.rules, implementation: 'missing' } } }, { implementations: fakeImplementations }), /no registered rules implementation/);
assert.throws(() => createRuntimeAdapterRegistry([fakeDescriptor, fakeDescriptor], { testOnly: true, implementations: fakeImplementations }), /duplicate adapter id/);

const publicationRoot = fs.mkdtempSync(path.join(temporaryRoot, 'skill-publication-'));
assert.deepEqual(validateSkillPublication(RUNTIME_ADAPTERS['claude-code'], { skillId: 'demo', skillDir: publicationRoot }), []);
assert.deepEqual(validateSkillPublication(RUNTIME_ADAPTERS.codex, { skillId: 'demo', skillDir: publicationRoot }), [], 'missing optional OpenAI metadata must not block Codex publication');
fs.mkdirSync(path.join(publicationRoot, 'agents'));
fs.writeFileSync(path.join(publicationRoot, 'agents', 'openai.yaml'), 'interface:\n  display_name: Demo\n');
assert.match(validateSkillPublication(RUNTIME_ADAPTERS.codex, { skillId: 'demo', skillDir: publicationRoot }).join('\n'), /short_description must be a non-empty string/);
fs.writeFileSync(path.join(publicationRoot, 'agents', 'openai.yaml'), 'interface:\n  display_name: Demo\n  short_description: Demo skill\n  default_prompt: Use $demo.\n');
assert.deepEqual(validateSkillPublication(RUNTIME_ADAPTERS.codex, { skillId: 'demo', skillDir: publicationRoot }), []);
fs.rmSync(publicationRoot, { recursive: true, force: true });

const codex = RUNTIME_ADAPTERS.codex;
const root = path.join(temporaryRoot, 'invalid-plan');
const context = createRuntimeContext({ adapterId: 'codex', targetRoot: root, scope: '.', rules: { writes: [], nativeAssets: [], removals: [], actions: [] }, skills: { writes: [], removals: [] } });
const valid = codex.planRuntime(context);
assert.throws(() => validateRuntimePlan({ ...valid, writes: [{ targetFile: path.join(root, '..', 'escape'), content: 'bad' }] }, codex), /outside target root/);
assert.throws(() => validateRuntimePlan({ ...valid, capabilityEvidence: [] }, codex), /missing capability evidence/);
assert.throws(() => validateRuntimePlan({ ...valid, writes: [{ targetFile: path.join(root, 'invalid-base64'), content: '***', contentEncoding: 'base64' }] }, codex), /base64 content is invalid/);
assert.throws(() => validateRuntimePlan({ ...valid, writes: [{ targetFile: path.join(root, 'invalid-mode'), content: 'bad', mode: 0o111 }] }, codex), /mode is invalid/);
assert.throws(() => validateRuntimePlan({ ...valid, writes: [{ targetFile: path.join(root, 'invalid-commit'), content: 'bad', commitLast: 'yes' }] }, codex), /commitLast must be boolean/);

const symlinkPlanRoot = fs.mkdtempSync(path.join(temporaryRoot, 'runtime-plan-symlink-'));
const symlinkPlanOutside = fs.mkdtempSync(path.join(temporaryRoot, 'runtime-plan-outside-'));
fs.mkdirSync(path.join(symlinkPlanRoot, '.agents'), { recursive: true });
fs.symlinkSync(symlinkPlanOutside, path.join(symlinkPlanRoot, '.agents', 'skills'), 'dir');
const symlinkPlanTarget = path.join(symlinkPlanRoot, '.agents', 'skills', 'demo', 'SKILL.md');
assert.throws(() => validateRuntimePlan({ ...valid, targetRoot: symlinkPlanRoot, writes: [{ targetFile: symlinkPlanTarget, content: 'bad' }] }, codex), /crosses a symbolic link/);
assert.throws(() => validateRuntimePlan({ ...valid, targetRoot: symlinkPlanRoot, removals: [{ targetFile: symlinkPlanTarget }] }, codex), /crosses a symbolic link/);

const reconcileRoot = fs.mkdtempSync(path.join(temporaryRoot, 'runtime-reconcile-'));
const targetFile = path.join(reconcileRoot, '.agents', 'skills', 'demo', 'SKILL.md');
const orphanFile = path.join(reconcileRoot, '.agents', 'buildr', 'skill-install-plans', 'orphan.md');
fs.mkdirSync(path.dirname(orphanFile), { recursive: true });
fs.writeFileSync(orphanFile, '<!-- Generated by Buildr. Agent action required. -->\n');
const evidence = REQUIRED_RENDER_CAPABILITIES.map((capability) => ({ capability, supported: true }));
const reconcilePlan = createRuntimePlan({ adapterId: 'codex', targetRoot: reconcileRoot, scope: '.', writes: [{ targetFile, content: 'managed\n', source: 'test', isManaged: (content) => content === 'managed\n' }], nativeAssets: [], removals: [{ targetFile: orphanFile, isManaged: (content) => content.includes('Generated by Buildr') }], capabilityEvidence: evidence });
assert.equal(reconcileRuntimePlan(reconcilePlan).changed.length, 1);
assert.equal(fs.existsSync(orphanFile), false);
assert.equal(reconcileRuntimePlan(reconcilePlan).changed.length, 0);
fs.writeFileSync(targetFile, 'raw source\n');
const adoptionPlan = createRuntimePlan({ adapterId: 'codex', targetRoot: reconcileRoot, scope: '.', writes: [{ targetFile, content: 'managed adoption\n', sourceContent: 'raw source\n', source: 'test', isManaged: () => false }], nativeAssets: [], removals: [], capabilityEvidence: evidence });
assert.equal(reconcileRuntimePlan(adoptionPlan).changed.length, 1);
fs.writeFileSync(targetFile, 'user content\n');
assert.throws(() => reconcileRuntimePlan(reconcilePlan), /no files were changed/);
assert.equal(fs.readFileSync(targetFile, 'utf8'), 'user content\n');

const binaryRoot = fs.mkdtempSync(path.join(temporaryRoot, 'runtime-binary-'));
const binaryFile = path.join(binaryRoot, '.agents', 'skills', 'demo', 'assets', 'sample.bin');
const staleFile = path.join(binaryRoot, '.agents', 'skills', 'demo', 'assets', 'stale.bin');
const receiptFile = path.join(binaryRoot, '.buildr', 'agent-runtime', 'workspace', 'codex', 'skill-projection-ownership-receipts', 'demo.json');
fs.mkdirSync(path.dirname(staleFile), { recursive: true });
fs.writeFileSync(staleFile, Buffer.from([9, 8, 7]));
const staleIntegrity = `sha256-${crypto.createHash('sha256').update(fs.readFileSync(staleFile)).digest('hex')}`;
const binaryPlan = createRuntimePlan({
  adapterId: 'codex',
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
const binaryResult = reconcileRuntimePlan(binaryPlan);
assert.equal(binaryPlan.writes.find((item) => item.targetFile === binaryFile)?.mode, 0o100, 'runtime plan must preserve executable intent on every platform');
assert.deepEqual(fs.readFileSync(binaryFile), Buffer.from([0, 255, 16]));
if (process.platform !== 'win32') assert.equal((fs.statSync(binaryFile).mode & 0o100) === 0o100, true);
assert.equal(fs.existsSync(staleFile), false);
assert.equal(binaryResult.changed.at(-1), receiptFile, 'commitLast receipt must be written after payload files and stale removals');

const guardedRemoval = path.join(binaryRoot, '.agents', 'skills', 'demo', 'assets', 'guarded.bin');
const untouchedWrite = path.join(binaryRoot, '.agents', 'skills', 'demo', 'assets', 'untouched.bin');
fs.writeFileSync(guardedRemoval, Buffer.from([1, 2, 3]));
const guardedPlan = createRuntimePlan({
  adapterId: 'codex',
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

const componentRoot = fs.mkdtempSync(path.join(temporaryRoot, 'runtime-component-'));
const componentDir = path.join(componentRoot, 'components', 'workspace', 'demo');
const fragmentRelative = 'components/workspace/demo/contributions/demo.md';
const ruleRelative = 'rules/demo.md';
fs.mkdirSync(path.join(componentRoot, 'components'), { recursive: true });
fs.mkdirSync(path.dirname(path.join(componentRoot, fragmentRelative)), { recursive: true });
fs.mkdirSync(path.join(componentRoot, 'rules'), { recursive: true });
fs.writeFileSync(path.join(componentRoot, 'components', 'manifest.yml'), 'schemaVersion: buildr.components/v1\ncomponents:\n  - id: demo\n    path: components/workspace/demo\n    enabled: true\n    state: installed\n');
fs.writeFileSync(path.join(componentRoot, fragmentRelative), 'Contribution\n');
fs.writeFileSync(path.join(componentRoot, ruleRelative), 'Rule\n');
const integrity = (relative) => `sha256-${crypto.createHash('sha256').update(fs.readFileSync(path.join(componentRoot, relative))).digest('hex')}`;
const definition = (extra = '') => `schemaVersion: buildr.component/v1\nid: demo\nkind: addon\nversion: 1.0.0\nsource: workspace\n${extra}members:\n  rules: [${JSON.stringify(ruleRelative)}]\n  skills: []\n  commandCollections: []\n  skillContributions: [${JSON.stringify(fragmentRelative)}]\ncontributions:\n  skillFragments: [${JSON.stringify(`buildr#slot=${fragmentRelative}`)}]\nintegrity: [${JSON.stringify(`${ruleRelative}=${integrity(ruleRelative)}`)}, ${JSON.stringify(`${fragmentRelative}=${integrity(fragmentRelative)}`)}]\n`;
fs.writeFileSync(path.join(componentDir, 'component.yml'), definition('adapter: ./adapter.mjs\n'));
assert.throws(() => resolveSkillContributions(componentRoot), /cannot extend runtime adapters/);
fs.writeFileSync(path.join(componentDir, 'component.yml'), definition());
assert.equal(resolveSkillContributions(componentRoot).length, 1);
fs.writeFileSync(path.join(componentRoot, ruleRelative), 'modified\n');
assert.throws(() => resolveSkillContributions(componentRoot), /Component member integrity mismatch/);

console.log('runtime adapter contract verification passed');
