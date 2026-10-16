import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import YAML from 'yaml';
import { parseConnectionDefinition, validateConfig, validateAuthentication, type ConnectionBinding } from '../../src/modules/connection-skills/domain/definition.ts';
import { createConnectionCatalog } from '../../src/modules/connection-skills/application/catalog.ts';
import { readConnectionSkillFile, readConnectionSkillSources } from '../../src/modules/agent-assets/application/connection-skill-source.ts';
import { parseSkillsManifestContent } from '../../src/modules/agent-assets/persistence/skill-manifest.ts';
import { registerDomainsSkills } from '../../src/modules/agent-assets/application/skills.ts';
import { resolveSkills } from '../../src/modules/agent-assets/infrastructure/runtime/skills/sources.ts';
import { ConnectionSkillsApplication } from '../../src/modules/connection-skills/application/connection-skills-application.ts';

const sample = () => ({ schemaVersion: 'buildr.connection-definition/v1', definitionId: 'sample', name: '示例', description: '只读样例', category: 'company-any-category', systemId: 'sample', configVersion: 1,
  config: { fields: [{ key: 'website', label: '地址', type: 'url', required: true }, { key: 'enabled', label: '启用', type: 'boolean', default: false }, { key: 'count', label: '数量', type: 'integer', minimum: 1, maximum: 3 }, { key: 'space', label: '空间', type: 'select', optionsFrom: 'spaces', default: 'public' }, { key: 'tags', label: '标记', type: 'multiselect' }, { key: 'note', label: '说明', type: 'string', required: true, dependsOn: { field: 'enabled', equals: true } }] },
  authentication: { fields: [{ key: 'username', label: '账号', type: 'string', required: true, minLength: 1 }, { key: 'password', label: '密码', type: 'secret', required: true }], targetFields: ['website'] },
  programs: { cli: { kind: 'bundled', runtime: 'node', entry: 'scripts/client.mjs', contextProtocol: 'buildr.connection-context/v1' } }, hooks: { spaces: { program: 'cli', args: ['spaces'], effect: 'read' } }, presentation: { summaryFields: ['website'], websiteField: 'website' } });

test('声明保留专业差异并严格校验配置、整组认证与有限表达式', () => {
  const definition = parseConnectionDefinition(YAML.stringify(sample()));
  assert.equal(definition.category, 'company-any-category');
  assert.deepEqual(validateConfig(definition.config.fields, { website: 'https://example.invalid', count: 2, tags: ['a'] }), { website: 'https://example.invalid/', enabled: false, count: 2, space: 'public', tags: ['a'] });
  assert.throws(() => validateConfig(definition.config.fields, { website: 'https://example.invalid', enabled: true }), { code: 'connection_field_required' });
  for (const input of [{ website: 'https://alice:secret@example.invalid' }, { website: 'https://example.invalid?access_token=secret' }, { website: 'https://example.invalid?PASSWORD=secret' }, { website: 'https://example.invalid/#/login?token=secret' }, { website: 'https://example.invalid/#access_token=secret' }, { website: 'file:///private' }, { website: 'https://example.invalid', count: 4 }, { website: 'https://example.invalid', unknown: 'x' }, { website: 'https://example.invalid', tags: ['a', 'a'] }]) assert.throws(() => validateConfig(definition.config.fields, input));
  assert.equal(validateConfig(definition.config.fields, { website: 'https://example.invalid?view=config' }).website, 'https://example.invalid/?view=config');
  assert.equal(validateConfig(definition.config.fields, { website: 'https://example.invalid/nacos/#/' }).website, 'https://example.invalid/nacos/#/');
  assert.equal(validateConfig(definition.config.fields, { website: 'https://example.invalid/nacos/#/config?view=public' }).website, 'https://example.invalid/nacos/#/config?view=public');
  assert.deepEqual(validateAuthentication(definition.authentication.fields, { username: 'fake', password: '' }), { username: 'fake', password: '' });
  assert.throws(() => validateAuthentication(definition.authentication.fields, { username: 'fake' }), { code: 'connection_field_required' });
  assert.throws(() => validateAuthentication(definition.authentication.fields, { username: '', password: 'fixture-secret' }), error => !String(error).includes('fixture-secret'));
  const invalid = (edit: (value: ReturnType<typeof sample>) => void) => { const value = sample(); edit(value); assert.throws(() => parseConnectionDefinition(YAML.stringify(value)), { code: 'connection_definition_invalid' }); };
  invalid(value => { Object.assign(value, { renderer: 'arbitrary-script' }); });
  invalid(value => { Object.assign(value.authentication.fields[1]!, { default: 'secret' }); });
  invalid(value => { value.config.fields[0]!.type = 'secret'; });
  invalid(value => { value.hooks.spaces.effect = 'write'; });
  invalid(value => { value.programs.cli.entry = '../outside.mjs'; });
  invalid(value => { value.config.fields[3]!.optionsFrom = 'missing'; });
  for (const type of ['select', 'multiselect']) for (const values of [[1, 2], [true, false]]) invalid(value => { Object.assign(value.config.fields[3]!, { type, values }); });
  for (const type of ['select', 'multiselect']) {
    const value = sample(); Object.assign(value.config.fields[3]!, { type, values: ['public', 'other'], default: type === 'select' ? 'public' : ['public'] });
    const parsed = parseConnectionDefinition(YAML.stringify(value));
    assert.deepEqual(validateConfig(parsed.config.fields, { website: 'https://example.invalid', space: type === 'select' ? 'other' : ['other'] }).space, type === 'select' ? 'other' : ['other']);
  }
  const numeric = sample(); Object.assign(numeric.config.fields[3]!, { type: 'enum', values: [1, 2], default: 1 }); delete (numeric.config.fields[3] as any).optionsFrom;
  assert.equal(validateConfig(parseConnectionDefinition(YAML.stringify(numeric)).config.fields, { website: 'https://example.invalid', space: 2 }).space, 2);
  invalid(value => { value.presentation.summaryFields = ['password']; });
  invalid(value => { Object.assign(value.config.fields[0]!, { dependsOn: { field: 'absent', expression: 'eval(...)' } }); });
  for (const nonFinite of [NaN, Infinity, -Infinity]) {
    invalid(value => { Object.assign(value.config.fields[0]!, { type: 'enum', values: [nonFinite] }); });
    invalid(value => { Object.assign(value.config.fields[1]!, { dependsOn: { field: 'website', equals: nonFinite } }); });
    assert.throws(() => validateConfig([{ key: 'choice', label: '选择', type: 'enum', values: [nonFinite] }], { choice: nonFinite }), { code: 'connection_field_invalid' });
  }
});

test('有序展示分组和发现前置输入只接受有限字段引用，旧声明保持兼容', () => {
  const value = sample();
  Object.assign(value.presentation, { categoryLabel: '配置系统', methodLabel: '公司接入', groups: [{ id: 'connection', title: '连接信息', fields: ['config.website', 'authentication.username', 'authentication.password'] }, { id: 'advanced', title: '高级设置', fields: ['config.count'], collapsed: true }] });
  Object.assign(value.hooks.spaces, { inputs: ['config.website', 'authentication.username', 'authentication.password'] });
  const definition = parseConnectionDefinition(YAML.stringify(value));
  assert.deepEqual(definition.presentation?.groups?.[0]?.fields, ['config.website', 'authentication.username', 'authentication.password']);
  assert.equal(definition.presentation?.groups?.[1]?.collapsed, true);
  assert.equal(definition.presentation?.categoryLabel, '配置系统');
  assert.equal(definition.presentation?.methodLabel, '公司接入');
  assert.deepEqual(definition.hooks?.spaces?.inputs, ['config.website', 'authentication.username', 'authentication.password']);
  assert.equal(parseConnectionDefinition(YAML.stringify(sample())).presentation?.groups, undefined, 'ungrouped declarations remain valid');
  const invalid = (edit: (candidate: any) => void) => { const candidate = structuredClone(value); edit(candidate); assert.throws(() => parseConnectionDefinition(YAML.stringify(candidate)), { code: 'connection_definition_invalid' }); };
  invalid(candidate => { candidate.presentation.groups[0].fields.push('authentication.missing'); });
  invalid(candidate => { candidate.presentation.groups[1].fields.push('config.website'); });
  invalid(candidate => { candidate.presentation.groups[1].id = 'connection'; });
  invalid(candidate => { candidate.presentation.groups[0].fields = ['config.website', 'config.website']; });
  invalid(candidate => { candidate.presentation.groups[0].collapsed = 'false'; });
  invalid(candidate => { candidate.presentation.groups[0].renderer = 'remote-script'; });
  invalid(candidate => { candidate.presentation.categoryLabel = ''; });
  invalid(candidate => { candidate.presentation.methodLabel = { html: '<script>' }; });
  invalid(candidate => { candidate.hooks.spaces.inputs = ['config.missing']; });
  invalid(candidate => { candidate.hooks.spaces.inputs = ['config.website', 'config.website']; });
  invalid(candidate => { candidate.hooks.spaces.inputs = { evaluate: 'config.website' }; });
});

test('网站回落仅接受已声明的网址配置字段，旧声明不推断回落', () => {
  const value = sample();
  Object.assign(value.presentation, { websiteFallbackField: 'website' });
  assert.equal(parseConnectionDefinition(YAML.stringify(value)).presentation?.websiteFallbackField, 'website');
  assert.equal(parseConnectionDefinition(YAML.stringify(sample())).presentation?.websiteFallbackField, undefined);
  for (const websiteFallbackField of ['missing', 'count', 'note', 'password', 'authentication.password', 1, {}, null]) {
    Object.assign(value.presentation, { websiteFallbackField });
    assert.throws(() => parseConnectionDefinition(YAML.stringify(value)), { code: 'connection_definition_invalid', field: 'presentation.websiteFallbackField' });
  }
});

test('目录从当前源重建、精确绑定、来源和兼容版本变化局部诊断，不运行程序', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-definition-')); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const skills = [{ id: 'first', path: 'connections/first', assetIdentity: 'company:skill:first', sourceIdentity: 'company:first', connectionDefinitions: ['assets/connection.yml'] }, { id: 'second', path: 'connections/second', assetIdentity: 'company:skill:second', sourceIdentity: 'company:second', connectionDefinitions: ['assets/connection.yml'] }];
  for (const skill of skills) { fs.mkdirSync(path.join(root, 'skills', skill.path, 'assets'), { recursive: true }); fs.mkdirSync(path.join(root, 'skills', skill.path, 'scripts')); fs.writeFileSync(path.join(root, 'skills', skill.path, 'assets/connection.yml'), YAML.stringify(sample())); fs.writeFileSync(path.join(root, 'skills', skill.path, 'SKILL.md'), `---\nname: ${skill.id}\ndescription: fixture\n---\n\nsource`); fs.writeFileSync(path.join(root, 'skills', skill.path, 'scripts/client.mjs'), `import fs from 'node:fs'; fs.writeFileSync(${JSON.stringify(path.join(root, 'executed'))}, 'yes');`); }
  const assets = { readSkills: () => skills, readSkillFile: readConnectionSkillFile };
  const catalog = createConnectionCatalog({ assets });
  const binding: ConnectionBinding = { skillAssetIdentity: skills[0]!.assetIdentity, definitionId: 'sample', sourceIdentity: skills[0]!.sourceIdentity, configVersion: 1 };
  const original = catalog.resolve(root, binding); assert.equal(original.available, true); assert.equal(catalog.list(root).definitions.length, 2);
  skills[0]!.path = 'first';
  const nonstandard = catalog.list(root);
  assert.deepEqual(nonstandard.definitions.map(entry => entry.skill.id), ['second']);
  assert.equal(nonstandard.diagnostics[0]?.code, 'connection_skill_path_invalid');
  assert.equal(fs.existsSync(path.join(root, 'skills/connections/first/assets/connection.yml')), true, 'catalog rejects the location without moving source files');
  skills[0]!.path = 'connections/first';
  assert.equal(original.definition?.skill.entryPath, fs.realpathSync(path.join(root, 'skills/connections/first/SKILL.md')));
  assert.equal(original.definition?.declarationPath, fs.realpathSync(path.join(root, 'skills/connections/first/assets/connection.yml')));
  fs.writeFileSync(path.join(root, 'skills/connections/first/SKILL.md'), '---\nname: first\ndescription: fixture\n---\n\ndocumentation changed'); assert.equal(catalog.resolve(root, binding).definition?.revision, original.definition?.revision);
  skills[0]!.sourceIdentity = 'another-source'; assert.equal(catalog.resolve(root, binding).diagnostics[0]?.code, 'connection_source_changed'); skills[0]!.sourceIdentity = binding.sourceIdentity;
  const changed = sample(); changed.configVersion = 2; fs.writeFileSync(path.join(root, 'skills/connections/first/assets/connection.yml'), YAML.stringify(changed)); assert.equal(catalog.resolve(root, binding).diagnostics[0]?.code, 'connection_config_incompatible');
  Object.assign(skills[0]!, { enabled: false }); assert.equal(catalog.list(root).definitions[0]?.available, false); assert.equal(catalog.list(root).definitions[1]?.available, true);
  fs.rmSync(path.join(root, 'skills/connections/first/assets/connection.yml')); const missing = catalog.resolve(root, binding); assert.equal(missing.available, false); assert.equal(missing.definition, null); assert.equal(catalog.list(root).definitions[0]?.skill.id, 'second');
  assert.equal(fs.existsSync(path.join(root, 'executed')), false);
  skills[1]!.connectionDefinitions.push('assets/duplicate.yml'); fs.copyFileSync(path.join(root, 'skills/connections/second/assets/connection.yml'), path.join(root, 'skills/connections/second/assets/duplicate.yml')); assert.equal(catalog.resolve(root, { ...binding, skillAssetIdentity: skills[1]!.assetIdentity, sourceIdentity: skills[1]!.sourceIdentity }).diagnostics[0]?.code, 'connection_definition_duplicate');
  fs.symlinkSync(path.join(root, 'skills/connections/second/assets/connection.yml'), path.join(root, 'skills/connections/second/assets/link.yml')); skills[1]!.connectionDefinitions = ['assets/link.yml']; assert.equal(catalog.list(root).definitions.length, 0);
});

test('同源替换保留自定义身份和实例，来源变化不继承旧来源，普通技能不新增连接声明', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-skill-definition-')); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'skills'));
  const source = path.join(root, 'source'); fs.mkdirSync(path.join(source, 'assets'), { recursive: true }); fs.writeFileSync(path.join(source, 'SKILL.md'), '---\nname: company-unknown\ndescription: test\nconnectionDefinitions: [assets/connection.yml]\n---\n'); fs.writeFileSync(path.join(source, 'assets/connection.yml'), YAML.stringify(sample()));
  fs.mkdirSync(path.join(source, 'scripts')); fs.writeFileSync(path.join(source, 'scripts/client.mjs'), 'process.exit(0);\n');
  const skills = registerDomainsSkills({ isPlainObject: (value: unknown) => Boolean(value) && typeof value === 'object' && !Array.isArray(value), componentOwnerForMember: () => null, isValidAssetId: (value: string) => /^[A-Za-z0-9._-]+$/.test(value), assertName: () => {}, ensureDirectory: (file: string) => fs.mkdirSync(file, { recursive: true }), atomicWriteFile: (file: string, content: string) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content); }, parseYamlDocument: (text: string) => YAML.parse(text), assertSafeAssetTarget: (_root: string, target: string) => target, withWorkspaceMutation: (_root: string, _id: string, _paths: string[], action: () => unknown) => action(), toPosixRelative: (base: string, file: string) => path.relative(base, file), existsDirectory: (file: string) => fs.existsSync(file) && fs.statSync(file).isDirectory(), existsFile: (file: string) => fs.existsSync(file) && fs.statSync(file).isFile(), assertInitializedBuildrWorkspace: () => {} });
  skills.skillsAdd({ targetRoot: root, sourceInput: source });
  assert.deepEqual(skills.readSkillsManifestForWrite(root)[0].connectionDefinitions, ['assets/connection.yml']);
  assert.equal(skills.readSkillsManifestForWrite(root)[0].path, 'connections/company-unknown');
  const custom = skills.readSkillsManifestForWrite(root);
  Object.assign(custom[0], { assetIdentity: 'company:skill:unknown', sourceIdentity: 'company:approved-repository' }); skills.writeSkillsManifest(root, custom);
  const catalog = createConnectionCatalog({ assets: { readSkills: () => skills.readSkillsManifestForWrite(root), readSkillFile: readConnectionSkillFile } });
  const scope = { rootPath: root, workspaceId: crypto.randomUUID() }, application = new ConnectionSkillsApplication({ dataRoot: path.join(root, 'profile'), catalog, resolveScope: () => scope });
  const entry = catalog.list(root).definitions[0]!, binding = { skillAssetIdentity: entry.skill.assetIdentity, definitionId: entry.definition.definitionId, sourceIdentity: entry.skill.sourceIdentity, configVersion: 1 };
  const instance = application.save(root, null, { id: 'existing-company-instance', name: '既有公司实例', binding, config: { website: 'https://fixture.invalid/' }, authentication: { intent: 'replace', values: { username: 'fixture', password: 'fixture-only' } }, expected: { teamRevision: 'absent', definitionRevision: entry.revision } }).instance;
  const teamBefore = fs.readFileSync(path.join(root, instance.sourcePath));
  fs.writeFileSync(path.join(source, 'SKILL.md'), '---\nname: company-unknown\ndescription: new docs\n---\n'); skills.skillsAdd({ targetRoot: root, sourceInput: source, replace: true });
  const replaced = resolveSkills(root, null, { runtime: 'codex', resolveRemote: false }).find((entry: { id: string }) => entry.id === 'company-unknown');
  assert.deepEqual(replaced?.connectionDefinitions, ['assets/connection.yml']);
  assert.equal(replaced?.assetIdentity, binding.skillAssetIdentity); assert.equal(replaced?.sourceIdentity, binding.sourceIdentity);
  const after = application.get(root, instance.id).instance;
  assert.deepEqual(after.binding, instance.binding); assert.equal(after.authentication.team.configured, true); assert.equal(after.availability.ready, true);
  assert.deepEqual(fs.readFileSync(path.join(root, instance.sourcePath)), teamBefore);
  const external = skills.readSkillsManifestForWrite(root); Object.assign(external[0], { source: 'buildr', sourceIdentity: 'package:skills/connections/company-unknown' }); skills.writeSkillsManifest(root, external);
  skills.skillsAdd({ targetRoot: root, sourceInput: source, replace: true });
  const localReplacement = skills.readSkillsManifestForWrite(root)[0];
  assert.equal(localReplacement.assetIdentity, binding.skillAssetIdentity); assert.notEqual(localReplacement.sourceIdentity, external[0].sourceIdentity);
  assert.equal(catalog.resolve(root, { ...binding, sourceIdentity: external[0].sourceIdentity }).diagnostics[0]?.code, 'connection_source_changed');
  assert.deepEqual(fs.readFileSync(path.join(root, instance.sourcePath)), teamBefore, 'source replacement never silently rebinds an existing instance');
  skills.skillsAdd({ targetRoot: root, explicitId: 'remote-example', resolvedSourceInput: 'https://first.invalid/SKILL.md' });
  const remote = skills.readSkillsManifestForWrite(root); const remoteEntry = remote.find((item: any) => item.id === 'remote-example');
  Object.assign(remoteEntry, { assetIdentity: 'company:skill:remote-example', sourceIdentity: 'company:approved-remote' }); skills.writeSkillsManifest(root, remote);
  skills.skillsAdd({ targetRoot: root, explicitId: 'remote-example', resolvedSourceInput: 'https://first.invalid/SKILL.md', versionInput: '2', replace: true });
  assert.equal(skills.readSkillsManifestForWrite(root)[1].sourceIdentity, 'company:approved-remote');
  skills.skillsAdd({ targetRoot: root, explicitId: 'remote-example', resolvedSourceInput: 'https://second.invalid/SKILL.md', replace: true });
  const newSource = skills.readSkillsManifestForWrite(root)[1];
  assert.equal(newSource.assetIdentity, 'company:skill:remote-example'); assert.equal(newSource.sourceIdentity, 'resolved:skill-url:https://second.invalid/SKILL.md');
  assert.throws(() => skills.skillsAdd({ targetRoot: root, sourceInput: source, replace: true, connectionDefinitions: ['../outside'] }));
  const ordinary = { schemaVersion: 'buildr.skills/v3', workspaceId: crypto.randomUUID(), skills: [{ id: 'plain', assetIdentity: 'company:plain', sourceIdentity: 'company:plain', path: 'plain' }] };
  assert.equal(Object.hasOwn(parseSkillsManifestContent(YAML.stringify(ordinary), path.join(root, 'skills/manifest.yml')).skills[0], 'connectionDefinitions'), false);
});

test('技能入口缺失或身份漂移只隔离该来源，正文更新不改变声明版本与认证', t => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-skill-entry-'))); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const skills = ['first', 'second'].map(id => ({ id, path: `connections/${id}`, assetIdentity: `fixture:${id}`, sourceIdentity: `fixture:${id}`, connectionDefinitions: ['assets/connection.yml'] }));
  for (const skill of skills) {
    const directory = path.join(root, 'skills', skill.path); fs.mkdirSync(path.join(directory, 'assets'), { recursive: true }); fs.mkdirSync(path.join(directory, 'scripts'));
    fs.writeFileSync(path.join(directory, 'SKILL.md'), `---\nname: ${skill.id}\ndescription: fixture\n---\n\nfirst body\n`);
    fs.writeFileSync(path.join(directory, 'assets/connection.yml'), YAML.stringify(sample())); fs.writeFileSync(path.join(directory, 'scripts/client.mjs'), 'process.exit(0);\n');
  }
  const catalog = createConnectionCatalog({ assets: { readSkills: () => skills, readSkillFile: readConnectionSkillFile } });
  const scope = { rootPath: root, workspaceId: crypto.randomUUID() }, application = new ConnectionSkillsApplication({ dataRoot: path.join(root, 'profile'), catalog, resolveScope: () => scope });
  const entry = catalog.list(root).definitions[0]!, binding = { skillAssetIdentity: entry.skill.assetIdentity, sourceIdentity: entry.skill.sourceIdentity, definitionId: entry.definition.definitionId, configVersion: 1 };
  let instance = application.save(root, null, { id: 'kept', name: '保留实例', binding, config: { website: 'https://fixture.invalid/' }, authentication: { intent: 'replace', values: { username: 'team', password: 'fictional-team' } }, expected: { teamRevision: 'absent', definitionRevision: entry.revision } }).instance;
  instance = application.saveAuth(root, instance.id, { intent: 'replace', values: { username: 'person', password: 'fictional-person' }, expected: { teamRevision: instance.teamRevision, definitionRevision: instance.definitionRevision, localRevision: instance.localRevision } }).instance;
  const teamFile = path.join(root, instance.sourcePath), teamBefore = fs.readFileSync(teamFile), localBefore = application.files.readLocal(scope, instance.id), skillFile = path.join(root, 'skills/connections/first/SKILL.md');
  for (const content of [null, '# missing frontmatter\n', '---\nname: renamed\ndescription: fixture\n---\n']) {
    if (content === null) fs.unlinkSync(skillFile); else fs.writeFileSync(skillFile, content);
    const result = catalog.list(root); assert.deepEqual(result.definitions.map(item => item.skill.id), ['second']); assert.equal(result.diagnostics[0]?.code, 'connection_skill_entry_invalid');
    const unavailable = application.get(root, instance.id).instance; assert.equal(unavailable.availability.ready, false); assert.equal(unavailable.authentication.personal.present, true);
    assert.deepEqual(fs.readFileSync(teamFile), teamBefore); assert.deepEqual(application.files.readLocal(scope, instance.id), localBefore);
  }
  fs.writeFileSync(skillFile, '---\nname: first\ndescription: changed documentation\n---\n\nnew body only\n');
  const restored = application.get(root, instance.id).instance; assert.equal(restored.availability.ready, true); assert.equal(restored.definitionRevision, entry.revision); assert.equal(restored.revision, instance.revision); assert.equal(restored.authentication.personal.configured, true);
});

test('真实公开源读取保留合法连接，非法扩展字段只影响所属技能而保存仍严格拒绝', t => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-skill-source-isolation-'))); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'skills/connections/good/assets'), { recursive: true });
  fs.writeFileSync(path.join(root, 'skills/connections/good/assets/connection.yml'), YAML.stringify(sample()));
  fs.writeFileSync(path.join(root, 'skills/connections/good/SKILL.md'), '---\nname: good\ndescription: fixture\n---\n');
  fs.mkdirSync(path.join(root, 'skills/connections/bad'), { recursive: true }); fs.writeFileSync(path.join(root, 'skills/connections/bad/SKILL.md'), '---\nname: bad\ndescription: fixture\n---\n');
  const manifest = { schemaVersion: 'buildr.skills/v3', workspaceId: crypto.randomUUID(), skills: [{ id: 'good', assetIdentity: 'company:good', sourceIdentity: 'company:good', path: 'connections/good', connectionDefinitions: ['assets/connection.yml'] }, { id: 'bad', assetIdentity: 'company:bad', sourceIdentity: 'company:bad', path: 'connections/bad', connectionDefinitions: 'invalid' as unknown }] };
  const file = path.join(root, 'skills/manifest.yml'); fs.writeFileSync(file, YAML.stringify(manifest));
  // readConnectionSkillSources is the actual AGENT_ASSETS_SOURCE_READ.readSkills implementation.
  const catalog = createConnectionCatalog({ assets: { readSkills: readConnectionSkillSources, readSkillFile: readConnectionSkillFile } });
  let result = catalog.list(root); assert.equal(result.definitions[0]?.skill.id, 'good'); assert.equal(result.definitions[0]?.available, true); assert.equal(result.diagnostics[0]?.code, 'connection_definition_invalid');
  assert.throws(() => parseSkillsManifestContent(YAML.stringify(manifest), file), /connectionDefinitions/);
  manifest.skills[1]!.connectionDefinitions = ['../outside.yml']; fs.writeFileSync(file, YAML.stringify(manifest)); result = catalog.list(root); assert.equal(result.definitions.length, 1); assert.equal(result.diagnostics[0]?.code, 'connection_definition_invalid');
  manifest.skills[1]!.connectionDefinitions = ['assets/missing.yml']; fs.writeFileSync(file, YAML.stringify(manifest)); result = catalog.list(root); assert.equal(result.definitions.length, 1); assert.equal(result.diagnostics.length, 1);
  manifest.skills[1]!.connectionDefinitions = Array.from({ length: 33 }, (_, index) => `assets/${index}.yml`); fs.writeFileSync(file, YAML.stringify(manifest)); result = catalog.list(root); assert.equal(result.definitions.length, 1); assert.equal(result.diagnostics[0]?.code, 'connection_definition_invalid');
});
