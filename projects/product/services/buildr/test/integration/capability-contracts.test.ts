import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import YAML from 'yaml';
import {
  parseCapabilityContract,
  parseSkillsManifestDocument,
} from '../../src/modules/agent-assets/persistence/skill-manifest.ts';
import { resolveSkillCapabilityGraph } from '../../src/modules/agent-assets/persistence/capability-graph-repository.ts';

const sections: any[] = ['Purpose', 'Consumer Obligations', 'Minimum Guarantees', 'Effects and Authorization', 'Result Evidence', 'Decision Points', 'Allowed Variations'];

function workspace(): any  {
  const root: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-capabilities-'));
  fs.mkdirSync(path.join(root, 'skills'), { recursive: true });
  return root;
}

function contract(root: any, id: any, version: any = 1, relative: any = `contracts/${id}/v${version}.md`): any  {
  const file: any = path.join(root, 'skills', relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, ['---', 'schemaVersion: buildr.capability-contract/v1', `id: ${id}`, `version: ${version}`, '---', '', `# ${id}`, '', ...sections.flatMap((section: any) => [`## ${section}`, '', `${section} text.`, ''])].join('\n'));
  return relative;
}

function skill(root: any, id: any, scopeRoot: any = root): any  {
  const directory: any = path.join(scopeRoot, 'skills', id);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'SKILL.md'), `---\nname: ${id}\ndescription: ${id}\n---\n\n# ${id}\n`);
}

function manifest(scopeRoot: any, document: any): any  {
  fs.mkdirSync(path.join(scopeRoot, 'skills'), { recursive: true });
  fs.writeFileSync(path.join(scopeRoot, 'skills', 'manifest.yml'), YAML.stringify(document, { lineWidth: 0 }));
}

test('contract frontmatter、固定章节与 manifest identity 必须一致', () => {
  const root: any = workspace();
  const relative: any = contract(root, 'example.task');
  const file: any = path.join(root, 'skills', relative);
  assert.equal(parseCapabilityContract(file, { id: 'example.task', version: 1 }).id, 'example.task');
  assert.throws(() => parseCapabilityContract(file, { id: 'example.other', version: 1 }), /identity mismatch/);
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('## Allowed Variations', '## Provider Policy'));
  assert.throws(() => parseCapabilityContract(file), /missing required section "Allowed Variations"/);
});

test('v1 与无 schemaVersion workspace manifest 迁移为 v3、稳定身份并保留未知 Skill metadata', () => {
  const root: any = workspace();
  const file: any = path.join(root, 'skills', 'manifest.yml');
  const original: any = { skills: [{ id: 'remote', source: { kind: 'url', url: 'https://example.com/skill' }, install: { mode: 'agent' }, organizationMetadata: { owner: 'platform' }, state: 'uninstalled' }] };
  fs.writeFileSync(file, YAML.stringify(original));
  const migrated: any = parseSkillsManifestDocument(file);
  assert.equal(migrated.schemaVersion, 'buildr.skills/v3');
  assert.ok(migrated.workspaceId);
  assert.match(migrated.skills[0].assetIdentity, /^workspace:/);
  assert.equal(migrated.skills[0].sourceIdentity, 'remote:url:https://example.com/skill');
  assert.deepEqual(migrated.skills[0].organizationMetadata, { owner: 'platform' });
  assert.equal(migrated.skills[0].state, 'uninstalled');
  fs.writeFileSync(file, 'schemaVersion: buildr.skills/v9\nskills: []\n');
  assert.throws(() => parseSkillsManifestDocument(file), /Unsupported Skills manifest schemaVersion/);
});

test('resolver 不猜测多个 provider，显式 binding 生效且卸载后不静默 fallback', () => {
  const root: any = workspace();
  const contractPath: any = contract(root, 'example.operation');
  for (const id of ['provider-one', 'provider-two', 'consumer']) skill(root, id);
  const document: any = {
    schemaVersion: 'buildr.skills/v2',
    contracts: [{ id: 'example.operation', version: 1, path: contractPath, description: 'operation' }],
    skills: [
      { id: 'provider-one', path: 'provider-one', provides: [{ capability: 'example.operation', version: 1 }] },
      { id: 'provider-two', path: 'provider-two', provides: [{ capability: 'example.operation', version: 1 }] },
      { id: 'consumer', path: 'consumer', requires: [{ capability: 'example.operation', version: 1, mode: 'required' }] },
    ],
  };
  manifest(root, document);
  let graph: any = resolveSkillCapabilityGraph(root, { runtime: 'codex' });
  assert.equal(graph.consumers[0].readiness, 'blocked');
  assert.equal(graph.consumers[0].reason, 'ambiguous_provider');
  document.bindings = [{ capability: 'example.operation', version: 1, provider: 'provider-two' }];
  manifest(root, document);
  graph = resolveSkillCapabilityGraph(root, { runtime: 'codex' });
  assert.equal(graph.consumers[0].dependencies[0].selectedProvider.id, 'provider-two');
  document.skills[1].state = 'uninstalled';
  manifest(root, document);
  graph = resolveSkillCapabilityGraph(root, { runtime: 'codex' });
  assert.equal(graph.consumers[0].reason, 'invalid_binding');
  assert.equal(graph.consumers[0].dependencies[0].selectedProvider, null);
});

test('旧 Project capability context 不改变 workspace binding 或消费者', () => {
  const root: any = workspace();
  const contractPath: any = contract(root, 'example.operation');
  for (const id of ['workspace-provider', 'consumer']) skill(root, id);
  const projectRoot: any = path.join(root, 'projects', 'demo');
  fs.mkdirSync(projectRoot, { recursive: true });
  skill(root, 'project-provider');
  manifest(root, {
    schemaVersion: 'buildr.skills/v2',
    contracts: [{ id: 'example.operation', version: 1, path: contractPath, description: 'operation' }],
    bindings: [{ capability: 'example.operation', version: 1, provider: 'workspace-provider' }],
    skills: [
      { id: 'workspace-provider', path: 'workspace-provider', provides: [{ capability: 'example.operation', version: 1 }] },
      { id: 'consumer', path: 'consumer', requires: [{ capability: 'example.operation', version: 1, mode: 'required' }] },
      { id: 'project-provider', path: 'project-provider', provides: [{ capability: 'example.operation', version: 1 }] },
    ],
  });
  let graph: any = resolveSkillCapabilityGraph(root, { runtime: 'codex' });
  assert.equal(graph.consumers[0].dependencies[0].selectedProvider.id, 'workspace-provider');
  fs.writeFileSync(path.join(projectRoot, 'capabilities.yml'), YAML.stringify({
    schemaVersion: 'buildr.project-capabilities/v1',
    bindings: [{ capability: 'example.operation', version: 1, provider: 'project-provider' }],
    requires: [{ capability: 'example.retired-missing', version: 1, mode: 'required' }],
    skills: ['unknown-retired-skill'],
  }));
  graph = resolveSkillCapabilityGraph(root, { runtime: 'codex' });
  assert.equal(graph.consumers[0].dependencies[0].selectedProvider.id, 'workspace-provider');
  assert.equal(graph.consumers[0].dependencies[0].binding.scope, '.');
  assert.equal(graph.consumers.some((item: any) => item.consumer.startsWith('project:')), false);
});

test('required dependency 递归阻断并检测 cycle，optional 缺失只降级', () => {
  const root: any = workspace();
  const aPath: any = contract(root, 'example.a');
  const bPath: any = contract(root, 'example.b');
  const optionalPath: any = contract(root, 'example.optional');
  for (const id of ['a-provider', 'b-provider', 'consumer', 'optional-consumer']) skill(root, id);
  manifest(root, {
    schemaVersion: 'buildr.skills/v2',
    contracts: [
      { id: 'example.a', version: 1, path: aPath, description: 'a' },
      { id: 'example.b', version: 1, path: bPath, description: 'b' },
      { id: 'example.optional', version: 1, path: optionalPath, description: 'optional' },
    ],
    bindings: [
      { capability: 'example.a', version: 1, provider: 'a-provider' },
      { capability: 'example.b', version: 1, provider: 'b-provider' },
    ],
    skills: [
      { id: 'a-provider', path: 'a-provider', provides: [{ capability: 'example.a', version: 1 }], requires: [{ capability: 'example.b', version: 1, mode: 'required' }] },
      { id: 'b-provider', path: 'b-provider', provides: [{ capability: 'example.b', version: 1 }], requires: [{ capability: 'example.a', version: 1, mode: 'required' }] },
      { id: 'consumer', path: 'consumer', requires: [{ capability: 'example.a', version: 1, mode: 'required' }] },
      { id: 'optional-consumer', path: 'optional-consumer', requires: [{ capability: 'example.optional', version: 1, mode: 'optional' }] },
    ],
  });
  const graph: any = resolveSkillCapabilityGraph(root, { runtime: 'codex' });
  const consumer: any = graph.consumers.find((item: any) => item.consumer === 'consumer');
  assert.equal(consumer.readiness, 'blocked');
  assert.ok(['provider_not_ready', 'dependency_cycle'].includes(consumer.reason));
  assert.ok(JSON.stringify(consumer).includes('dependency_cycle'));
  const optional: any = graph.consumers.find((item: any) => item.consumer === 'optional-consumer');
  assert.equal(optional.readiness, 'degraded');
  assert.equal(optional.reason, 'missing_provider');
});

test('provider 声明兼容 contract 但不支持当前 runtime 时报告 runtime_unavailable', () => {
  const root: any = workspace();
  const contractPath: any = contract(root, 'example.runtime');
  for (const id of ['provider', 'consumer']) skill(root, id);
  manifest(root, {
    schemaVersion: 'buildr.skills/v2',
    contracts: [{ id: 'example.runtime', version: 1, path: contractPath, description: 'runtime fixture' }],
    bindings: [{ capability: 'example.runtime', version: 1, provider: 'provider' }],
    skills: [
      { id: 'provider', path: 'provider', runtimes: ['claude-code'], provides: [{ capability: 'example.runtime', version: 1 }] },
      { id: 'consumer', path: 'consumer', requires: [{ capability: 'example.runtime', version: 1, mode: 'required' }] },
    ],
  });
  const graph: any = resolveSkillCapabilityGraph(root, { runtime: 'codex' });
  assert.equal(graph.consumers[0].readiness, 'blocked');
  assert.equal(graph.consumers[0].reason, 'runtime_unavailable');
  assert.deepEqual(graph.consumers[0].dependencies[0].candidates, [{ id: 'provider', scope: '.', runtimePath: 'provider', runtimeAvailable: false }]);
});

test('只有不同 major version 的 provider 时报告 version_mismatch 和候选版本', () => {
  const root: any = workspace();
  const contractPath: any = contract(root, 'example.versioned');
  for (const id of ['provider', 'consumer']) skill(root, id);
  manifest(root, {
    schemaVersion: 'buildr.skills/v2',
    contracts: [{ id: 'example.versioned', version: 1, path: contractPath, description: 'version fixture' }],
    skills: [
      { id: 'provider', path: 'provider', provides: [{ capability: 'example.versioned', version: 2 }] },
      { id: 'consumer', path: 'consumer', requires: [{ capability: 'example.versioned', version: 1, mode: 'required' }] },
    ],
  });
  const dependency: any = resolveSkillCapabilityGraph(root, { runtime: 'codex' }).consumers[0].dependencies[0];
  assert.equal(dependency.reason, 'version_mismatch');
  assert.deepEqual(dependency.candidateVersions, [{ id: 'provider', versions: [2] }]);
});

test('跨 Project 旧配置不再产生 binding 冲突', () => {
  const root: any = workspace();
  const contractPath: any = contract(root, 'example.operation');
  for (const id of ['provider-a', 'provider-b']) skill(root, id);
  manifest(root, { schemaVersion: 'buildr.skills/v2', contracts: [{ id: 'example.operation', version: 1, path: contractPath, description: 'operation' }], skills: [
    { id: 'provider-a', path: 'provider-a', provides: [{ capability: 'example.operation', version: 1 }] },
    { id: 'provider-b', path: 'provider-b', provides: [{ capability: 'example.operation', version: 1 }] },
  ] });
  for (const [project, provider] of [['a', 'provider-a'], ['b', 'provider-b']]) {
    const projectRoot: any = path.join(root, 'projects', project);
    fs.mkdirSync(projectRoot, { recursive: true });
    fs.writeFileSync(path.join(projectRoot, 'capabilities.yml'), YAML.stringify({ schemaVersion: 'buildr.project-capabilities/v1', requires: [], skills: [provider], bindings: [{ capability: 'example.operation', version: 1, provider }] }));
  }
  const graph: any = resolveSkillCapabilityGraph(root, { runtime: 'codex' });
  assert.deepEqual(graph.bindings, []);
  assert.equal(graph.scope, '.');
  assert.deepEqual(graph.consumers, []);
});

test('退役配置只做分级提示，保留文件且不校验过期技能', async () => {
  const { observeRetiredProjectCapabilities } = await import('../../src/modules/workspace/application/project-capability-retirement.ts');
  const root = workspace();
  const file = path.join(root, 'capabilities.yml');
  assert.equal(observeRetiredProjectCapabilities(root), null);
  for (const [content, expected] of [
    ['schemaVersion: buildr.project-capabilities/v1\nrequires: []\nbindings: []\nskills: [no-longer-installed]\n', 'info'],
    ['schemaVersion: buildr.project-capabilities/v1\nrequires: [{capability: example.missing, version: 1, mode: required}]\n', 'warning'],
    ['schemaVersion: buildr.project-capabilities/v1\nbindings: [{capability: example.operation, version: 1, provider: old}]\n', 'warning'],
    ['schemaVersion: unknown\n', 'warning'],
    ['invalid: [\n', 'warning'],
  ]) {
    fs.writeFileSync(file, content);
    const observed = observeRetiredProjectCapabilities(root);
    assert.equal(observed?.status, expected);
    assert.equal(observed?.code, 'projects.capabilities_retired');
    assert.equal(fs.readFileSync(file, 'utf8'), content);
  }
  fs.unlinkSync(file);
  fs.symlinkSync(path.join(root, 'skills/manifest.yml'), file);
  assert.equal(observeRetiredProjectCapabilities(root)?.status, 'warning');
});

test('旧项目配置清理只选择已登记、空间内的安全文件并拒绝版本漂移', async (t) => {
  const { planProjectCapabilityCleanup, cleanupProjectCapabilities } = await import('../../src/modules/workspace/application/project-capability-retirement.ts');
  const root = workspace();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const safe = 'schemaVersion: buildr.project-capabilities/v1\nrequires: []\nbindings: []\nskills: [retired-skill]\n';
  const variants = { safe, empty: 'schemaVersion: buildr.project-capabilities/v1\n', bound: safe.replace('bindings: []', 'bindings: [{capability: example.operation, version: 1, provider: old}]'), unknown: safe + 'custom: keep\n', malformed: 'invalid: [\n', unknownSkillData: safe.replace('[retired-skill]', '[{id: retired-skill, note: keep}]'), unregistered: safe, attached: safe, link: safe };
  const projects: Record<string, any> = {};
  for (const [code, content] of Object.entries(variants)) {
    const projectRoot = path.join(root, 'projects', code);
    fs.mkdirSync(projectRoot, { recursive: true });
    fs.writeFileSync(path.join(projectRoot, 'capabilities.yml'), content);
    if (code !== 'unregistered') projects[code] = { source: { path: `projects/${code}`, ...(code === 'attached' ? { root: 'attached' } : {}) } };
  }
  const link = path.join(root, 'projects/link/capabilities.yml');
  fs.unlinkSync(link);
  fs.symlinkSync(path.join(root, 'projects/bound/capabilities.yml'), link);
  projects.ancestorLink = { source: { path: 'projects/linked-root' } };
  fs.symlinkSync(path.join(root, 'projects/safe'), path.join(root, 'projects/linked-root'));
  projects.outside = { source: { path: '..' } };
  const plan = planProjectCapabilityCleanup(root, projects);
  assert.deepEqual(plan.map((item) => item.path), ['projects/empty/capabilities.yml', 'projects/safe/capabilities.yml']);
  const safeFile = path.join(root, 'projects/safe/capabilities.yml');
  fs.writeFileSync(safeFile, safe + '# user edit\n');
  assert.throws(() => cleanupProjectCapabilities(root, plan), /changed before cleanup/);
  assert.equal(fs.readFileSync(safeFile, 'utf8'), safe + '# user edit\n');
  assert.equal(fs.existsSync(path.join(root, 'projects/empty/capabilities.yml')), true, 'version preflight must precede all deletions');
  const fresh = planProjectCapabilityCleanup(root, projects);
  assert.deepEqual(cleanupProjectCapabilities(root, fresh), fresh.map((item) => item.path));
  assert.deepEqual(planProjectCapabilityCleanup(root, projects), []);
  assert.deepEqual(cleanupProjectCapabilities(root, []), []);
  for (const [code, content] of Object.entries(variants)) {
    if (['safe', 'empty', 'link'].includes(code)) continue;
    assert.equal(fs.readFileSync(path.join(root, 'projects', code, 'capabilities.yml'), 'utf8'), content);
  }
  assert.equal(fs.lstatSync(link).isSymbolicLink(), true);
});
