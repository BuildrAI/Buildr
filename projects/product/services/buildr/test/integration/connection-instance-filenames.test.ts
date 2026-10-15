import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import YAML from 'yaml';
import { ConnectionSkillsApplication } from '../../src/modules/connection-skills/application/connection-skills-application.ts';
import { createConnectionCatalog } from '../../src/modules/connection-skills/application/catalog.ts';
import { digest } from '../../src/modules/connection-skills/persistence/files.ts';

function suffix(id: string) { return crypto.createHash('sha256').update(id).digest('hex').slice(0, 12); }
function fixture(t: { after(fn: () => void): void }, systemId: string | null = 'nacos') {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-connection-filenames-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const root = path.join(base, 'workspace'), directory = path.join(root, 'skills/connections/filename-fixture');
  fs.mkdirSync(path.join(directory, 'assets'), { recursive: true }); fs.mkdirSync(path.join(directory, 'scripts'));
  fs.writeFileSync(path.join(directory, 'SKILL.md'), '---\nname: filename-fixture\ndescription: 仅在本机核验所选连接上下文，不访问外部系统。\nconnectionDefinitions: [assets/connection.yml]\n---\n\n以完整实例编号及观察版本执行；不能按文件名或名称猜选。\n');
  const definition = { schemaVersion: 'buildr.connection-definition/v1', definitionId: 'nacos-provider', name: 'Nacos 模拟提供者', category: 'configuration', description: '仅本机验证', ...(systemId ? { systemId } : {}), configVersion: 1,
    config: { fields: [{ key: 'site', label: '地址', type: 'url', required: true }, { key: 'tag', label: '用途', type: 'string', required: true }] },
    authentication: { fields: [{ key: 'username', label: '账号', type: 'string', required: true }, { key: 'password', label: '密码', type: 'secret', required: true }], targetFields: ['site'] },
    programs: { cli: { kind: 'bundled', runtime: 'node', entry: 'scripts/context.mjs' } }, presentation: { summaryFields: ['site', 'tag'], websiteField: 'site' } };
  fs.writeFileSync(path.join(directory, 'assets/connection.yml'), YAML.stringify(definition));
  fs.writeFileSync(path.join(directory, 'scripts/context.mjs'), `
process.on('message', message => {
  if (message.type !== 'buildr.connection-context') return;
  const selected = message.context.connections.primary, auth = selected.authentication;
  const expectedPassword = (auth.source === 'personal' ? 'personal-secret-' : 'team-secret-') + selected.config.tag;
  const credentialMatches = auth.values.password === expectedPassword;
  console.log(JSON.stringify({ id: selected.id, revision: selected.revision, config: selected.config, account: auth.values.username, source: auth.source, credentialMatches, contexts: Object.keys(message.context.connections), externalSystems: 'not-contacted' }));
  process.disconnect();
});
`);
  const catalog = createConnectionCatalog({ assets: {
    readSkills: () => [{ id: 'filename-fixture', path: 'connections/filename-fixture', assetIdentity: 'fixture:filename', sourceIdentity: 'source:filename', connectionDefinitions: ['assets/connection.yml'] }],
    readSkillFile: (_root, _skill, relative) => { const absolutePath = path.join(directory, relative), content = fs.readFileSync(absolutePath, 'utf8'); return { directory, absolutePath, content, digest: digest(content) }; },
  } });
  const scope = { rootPath: root, workspaceId: 'filename-fixture-workspace' }, app = new ConnectionSkillsApplication({ dataRoot: path.join(base, 'local'), catalog, resolveScope: () => scope });
  const entry = app.definitions(root).definitions[0]!;
  const binding = { skillAssetIdentity: entry.skill.assetIdentity, sourceIdentity: entry.skill.sourceIdentity, definitionId: entry.definition.definitionId, configVersion: 1 };
  const expected = (id: string) => { const view = app.get(root, id).instance; return { teamRevision: view.teamRevision, definitionRevision: view.definitionRevision, localRevision: view.localRevision }; };
  const create = (id = 'connection-shared-prefix-first', environment = 'qa', tag = 'first') => app.save(root, null, { id, name: '同一个名称', environment, binding, config: { site: 'https://nacos.fixture.invalid/', tag }, authentication: { intent: 'replace', values: { username: 'team-' + tag, password: 'team-secret-' + tag } }, expected: { teamRevision: 'absent', definitionRevision: entry.revision } }).instance;
  const save = (id: string, environment?: string) => { const view = app.get(root, id).instance; return app.save(root, id, { name: view.name, environment: environment ?? view.environment, binding: view.binding, config: view.config, authentication: { intent: 'keep' }, expected: expected(id) }).instance; };
  const run = async (id: string) => { const view = app.get(root, id).instance; const result = await app.run(root, { id, expectedRevision: view.revision, args: ['inspect'] }); assert.equal(result.exitCode, 0); assert.ok(!result.stdout.includes('secret-')); return JSON.parse(result.stdout); };
  return { base, root, scope, app, create, save, run, expected };
}

test('new readable paths use the declared system and a full-identity suffix, while the body remains authoritative', t => {
  const f = fixture(t), first = f.create(), second = f.create('connection-shared-prefix-second', 'qa', 'second');
  assert.equal(first.sourcePath, `connections/instances/nacos-qa--${suffix(first.id)}.yml`);
  assert.equal(second.sourcePath, `connections/instances/nacos-qa--${suffix(second.id)}.yml`);
  assert.notEqual(first.sourcePath, second.sourcePath, 'shared id prefixes do not produce the same suffix');
  const body = YAML.parse(fs.readFileSync(path.join(f.root, first.sourcePath), 'utf8'));
  assert.equal(body.id, first.id); assert.deepEqual(body.binding, first.binding);
  assert.deepEqual(f.app.list(f.root).instances.map(value => value.sourcePath).sort(), [first.sourcePath, second.sourcePath].sort());
  assert.deepEqual(f.app.impacts(f.root, first.binding.skillAssetIdentity).instances.map(value => value.sourcePath).sort(), [first.sourcePath, second.sourcePath].sort());
});

test('filename fragments normalize Unicode safely, bound byte length, and use explicit defaults', t => {
  const f = fixture(t, null);
  const normalized = f.create('unicode-env', '../ ＱＡ 测试 \\ / : ');
  assert.equal(normalized.sourcePath, `connections/instances/nacos-provider-qa-测试--${suffix(normalized.id)}.yml`);
  const empty = f.create('empty-env', ''); assert.equal(empty.sourcePath, `connections/instances/nacos-provider-default--${suffix(empty.id)}.yml`);
  const punctuation = f.create('punctuation-env', ' /..\\ : '); assert.match(punctuation.sourcePath, /nacos-provider-default--/);
  const long = f.create('long-env', '回归环境'.repeat(45));
  const filename = path.basename(long.sourcePath);
  assert.ok(Buffer.byteLength(filename) <= 140, 'generated basenames remain within the portable byte limit');
  assert.match(filename, /^[\p{L}\p{N}-]+\.yml$/u); assert.ok(!filename.includes('\uFFFD'));
  assert.equal(path.dirname(path.join(f.root, long.sourcePath)), path.join(f.root, 'connections/instances'));
});

test('external rename preserves observations and personal authentication, and saving a legacy filename safely normalizes it', async t => {
  const f = fixture(t), created = f.create();
  f.app.saveAuth(f.root, created.id, { intent: 'replace', values: { username: 'personal-first', password: 'personal-secret-first' }, expected: f.expected(created.id) });
  const before = f.app.get(f.root, created.id).instance, original = path.join(f.root, before.sourcePath), bytes = fs.readFileSync(original);
  const legacyPath = `connections/instances/${created.id}.yml`, legacy = path.join(f.root, legacyPath);
  fs.renameSync(original, legacy);
  const reread = f.app.get(f.root, created.id).instance;
  assert.equal(reread.sourcePath, legacyPath); assert.equal(reread.teamRevision, before.teamRevision); assert.equal(reread.revision, before.revision);
  assert.equal(reread.localRevision, before.localRevision); assert.deepEqual(reread.authentication, before.authentication);
  assert.equal(fs.existsSync(original), false, 'read-only discovery does not migrate the source'); assert.deepEqual(fs.readFileSync(legacy), bytes);
  const result = await f.app.run(f.root, { id: created.id, expectedRevision: before.revision, args: ['inspect'] }); assert.equal(JSON.parse(result.stdout).credentialMatches, true);
  assert.equal(f.app.impacts(f.root, created.binding.skillAssetIdentity).instances[0]?.sourcePath, legacyPath);
  const saved = f.save(created.id);
  assert.equal(saved.sourcePath, created.sourcePath); assert.equal(saved.id, before.id); assert.equal(saved.teamRevision, before.teamRevision); assert.equal(saved.localRevision, before.localRevision);
  assert.equal(fs.existsSync(legacy), false); assert.deepEqual(fs.readFileSync(original), bytes);
  const after = YAML.parse(fs.readFileSync(original, 'utf8')); assert.deepEqual(after.authentication, YAML.parse(bytes.toString()).authentication);
  const changed = f.save(created.id, 'reg');
  assert.equal(changed.sourcePath, `connections/instances/nacos-reg--${suffix(created.id)}.yml`); assert.equal(changed.id, before.id);
  assert.notEqual(changed.teamRevision, before.teamRevision); assert.equal(changed.localRevision, before.localRevision); assert.equal(changed.authentication.source, 'personal');
  assert.equal(fs.existsSync(original), false); assert.equal((await f.run(created.id)).credentialMatches, true);
});

test('two identical visible candidates execute only the explicitly selected id, revision, configuration and authentication', async t => {
  const f = fixture(t), first = f.create(), second = f.create('connection-shared-prefix-second', 'qa', 'second');
  assert.equal(first.name, second.name); assert.equal(first.environment, second.environment); assert.equal(first.config.site, second.config.site);
  for (const [instance, tag] of [[first, 'first'], [second, 'second']] as const) {
    const observed = await f.run(instance.id);
    assert.equal(observed.id, instance.id); assert.equal(observed.revision, instance.revision); assert.equal(observed.config.tag, tag);
    assert.equal(observed.account, 'team-' + tag); assert.equal(observed.source, 'team'); assert.equal(observed.credentialMatches, true); assert.deepEqual(observed.contexts, ['primary']);
  }
  await assert.rejects(f.app.run(f.root, { id: second.id, expectedRevision: first.revision, args: ['inspect'] }), { code: 'connection_skill_revision_conflict' });
  f.app.saveAuth(f.root, first.id, { intent: 'replace', values: { username: 'personal-first', password: 'personal-secret-first' }, expected: f.expected(first.id) });
  assert.deepEqual({ ...(await f.run(first.id)), revision: undefined }, { id: first.id, revision: undefined, config: first.config, account: 'personal-first', source: 'personal', credentialMatches: true, contexts: ['primary'], externalSystems: 'not-contacted' });
  const secondAgain = await f.run(second.id); assert.equal(secondAgain.account, 'team-second'); assert.equal(secondAgain.source, 'team'); assert.equal(secondAgain.credentialMatches, true);
  f.app.saveAuth(f.root, second.id, { intent: 'replace', values: { username: 'personal-second', password: 'personal-secret-second' }, expected: f.expected(second.id) });
  assert.equal((await f.run(second.id)).account, 'personal-second'); assert.equal((await f.run(first.id)).account, 'personal-first');
  f.app.saveAuth(f.root, first.id, { intent: 'remove', expected: f.expected(first.id) });
  assert.equal((await f.run(first.id)).source, 'team'); assert.equal((await f.run(second.id)).source, 'personal');
});

test('saving a case-only external basename rename preserves the instance instead of treating its own file as occupied', t => {
  const f = fixture(t), created = f.create();
  f.app.saveAuth(f.root, created.id, { intent: 'replace', values: { username: 'personal-first', password: 'personal-secret-first' }, expected: f.expected(created.id) });
  const before = f.app.get(f.root, created.id).instance, original = path.join(f.root, before.sourcePath), bytes = fs.readFileSync(original);
  const directory = path.dirname(original), uppercaseName = path.basename(original, '.yml').toUpperCase() + '.yml';
  fs.renameSync(original, path.join(directory, uppercaseName));
  const observed = f.app.get(f.root, created.id).instance;
  assert.equal(observed.sourcePath, 'connections/instances/' + uppercaseName);
  assert.equal(observed.teamRevision, before.teamRevision); assert.equal(observed.revision, before.revision);
  assert.equal(observed.localRevision, before.localRevision); assert.deepEqual(observed.authentication, before.authentication);
  const saved = f.save(created.id);
  assert.equal(saved.id, created.id); assert.equal(saved.teamRevision, before.teamRevision); assert.equal(saved.revision, before.revision);
  assert.equal(saved.localRevision, before.localRevision); assert.deepEqual(saved.authentication, before.authentication);
  assert.deepEqual(fs.readFileSync(path.join(f.root, saved.sourcePath)), bytes);
  assert.deepEqual(fs.readdirSync(directory).filter(name => name.endsWith('.yml')), [path.basename(saved.sourcePath)], 'sourcePath reports the actual filename returned by the filesystem');
});

test('duplicate body identities block that id without choosing a file or affecting another connection', async t => {
  const f = fixture(t), first = f.create(), second = f.create('connection-shared-prefix-second', 'qa', 'second');
  const original = path.join(f.root, first.sourcePath), copied = path.join(f.root, 'connections/instances/copied-first.yml'), bytes = fs.readFileSync(original);
  fs.writeFileSync(copied, bytes); fs.writeFileSync(path.join(f.root, 'connections/instances/broken.yml'), '<<<<<<< conflict\npassword: never-disclose-this-value\n');
  const listed = f.app.list(f.root);
  assert.deepEqual(listed.instances.map(value => value.id), [second.id]); assert.ok(listed.diagnostics.some(value => value.id === first.id && /多个文件/.test(value.message)));
  assert.ok(JSON.stringify(listed.diagnostics).includes(first.sourcePath)); assert.ok(JSON.stringify(listed.diagnostics).includes('connections/instances/copied-first.yml'));
  assert.ok(!JSON.stringify(listed).includes('never-disclose-this-value')); assert.ok(!JSON.stringify(listed).includes('team-secret-first'));
  assert.throws(() => f.app.get(f.root, first.id), { code: 'connection_skill_id_duplicate' });
  assert.throws(() => f.app.save(f.root, first.id, { name: first.name, environment: first.environment, binding: first.binding, config: first.config, authentication: { intent: 'keep' }, expected: { teamRevision: first.teamRevision, definitionRevision: first.definitionRevision } }), { code: 'connection_skill_id_duplicate' });
  assert.throws(() => f.app.remove(f.root, first.id, { expected: { teamRevision: first.teamRevision } }), { code: 'connection_skill_id_duplicate' });
  await assert.rejects(f.app.run(f.root, { id: first.id, expectedRevision: first.revision, args: ['inspect'] }), { code: 'connection_skill_id_duplicate' });
  assert.deepEqual(fs.readFileSync(original), bytes); assert.deepEqual(fs.readFileSync(copied), bytes);
  assert.equal((await f.run(second.id)).credentialMatches, true);
});

test('occupied destination and stale observations preserve both files; deletion follows the current source path', t => {
  const f = fixture(t), first = f.create(), second = f.create('connection-shared-prefix-second', 'qa', 'second');
  const destination = path.join(f.root, first.sourcePath), renamedPath = 'connections/instances/team-selected-name.yml', renamed = path.join(f.root, renamedPath), before = fs.readFileSync(destination);
  fs.renameSync(destination, renamed); const secondSource = path.join(f.root, second.sourcePath), occupying = fs.readFileSync(secondSource); fs.renameSync(secondSource, destination);
  assert.throws(() => f.save(first.id), /占用|存在/); assert.deepEqual(fs.readFileSync(renamed), before); assert.deepEqual(fs.readFileSync(destination), occupying);
  assert.equal(f.app.get(f.root, second.id).instance.sourcePath, first.sourcePath);
  fs.renameSync(destination, secondSource);
  const stale = f.expected(first.id), changed = YAML.parse(fs.readFileSync(renamed, 'utf8')); changed.name = '外部更新'; fs.writeFileSync(renamed, YAML.stringify(changed));
  const externallyChanged = fs.readFileSync(renamed);
  assert.throws(() => f.app.save(f.root, first.id, { name: first.name, environment: first.environment, binding: first.binding, config: first.config, authentication: { intent: 'keep' }, expected: stale }), { code: 'connection_skill_revision_conflict' });
  assert.deepEqual(fs.readFileSync(renamed), externallyChanged); assert.equal(fs.existsSync(destination), false);
  assert.throws(() => f.app.remove(f.root, first.id, { expected: stale }), { code: 'connection_skill_revision_conflict' });
  assert.equal(fs.existsSync(renamed), true);
  f.app.remove(f.root, first.id, { expected: f.expected(first.id) });
  assert.equal(fs.existsSync(renamed), false); assert.equal(fs.existsSync(path.join(f.root, second.sourcePath)), true);
});

test('a readable-path symlink cannot become a source or overwrite its external target', { skip: process.platform === 'win32' }, t => {
  const f = fixture(t), created = f.create(), destination = path.join(f.root, created.sourcePath), renamed = path.join(f.root, 'connections/instances/safe-retained.yml');
  const outside = path.join(f.base, 'outside.yml'), outsideBytes = 'private-external: preserved\n'; fs.writeFileSync(outside, outsideBytes);
  fs.renameSync(destination, renamed); fs.symlinkSync(outside, destination);
  assert.throws(() => f.save(created.id)); assert.equal(fs.readFileSync(outside, 'utf8'), outsideBytes); assert.equal(fs.existsSync(renamed), true);
  const observed = f.app.get(f.root, created.id).instance; assert.equal(observed.sourcePath, 'connections/instances/safe-retained.yml');
  f.app.remove(f.root, created.id, { expected: f.expected(created.id) });
  assert.equal(fs.readFileSync(outside, 'utf8'), outsideBytes); assert.equal(fs.lstatSync(destination).isSymbolicLink(), true);
});

test('migration rollback preserves a destination edited in place after installation, even when its inode is unchanged', t => {
  const f = fixture(t), created = f.create(), destination = path.join(f.root, created.sourcePath), source = path.join(f.root, 'connections/instances/retained-before-save.yml');
  const before = fs.readFileSync(destination); fs.renameSync(destination, source);
  const edited = YAML.parse(before.toString()); edited.name = '外部程序在安装后写入'; const externalBytes = YAML.stringify(edited);
  const link = fs.linkSync;
  t.mock.method(fs, 'linkSync', (from: fs.PathLike, to: fs.PathLike) => {
    link(from, to);
    if (String(to) === destination) fs.writeFileSync(to, externalBytes);
  });
  assert.throws(() => f.save(created.id), { code: 'connection_skill_revision_conflict' });
  assert.deepEqual(fs.readFileSync(source), before, 'the original source remains untouched');
  assert.equal(fs.readFileSync(destination, 'utf8'), externalBytes, 'rollback must not delete another writer\'s bytes on our former inode');
});

test('a source edited after destination installation is preserved while only the still-owned destination is rolled back', t => {
  const f = fixture(t), created = f.create(), destination = path.join(f.root, created.sourcePath), source = path.join(f.root, 'connections/instances/retained-before-save.yml');
  const before = fs.readFileSync(destination); fs.renameSync(destination, source);
  const edited = YAML.parse(before.toString()); edited.name = '外部程序在迁移时更新源'; const externalBytes = YAML.stringify(edited);
  const link = fs.linkSync;
  t.mock.method(fs, 'linkSync', (from: fs.PathLike, to: fs.PathLike) => {
    link(from, to);
    if (String(to) === destination) fs.writeFileSync(source, externalBytes);
  });
  assert.throws(() => f.save(created.id), { code: 'connection_skill_revision_conflict' });
  assert.equal(fs.readFileSync(source, 'utf8'), externalBytes); assert.equal(fs.existsSync(destination), false);
  assert.equal(f.app.get(f.root, created.id).instance.name, edited.name);
});
