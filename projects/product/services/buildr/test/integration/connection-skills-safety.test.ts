import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import YAML from 'yaml';
import { createConnectionCatalog } from '../../src/modules/connection-skills/application/catalog.ts';
import { ConnectionSkillsApplication } from '../../src/modules/connection-skills/application/connection-skills-application.ts';
import { ConnectionFiles } from '../../src/modules/connection-skills/persistence/files.ts';
import { resolveProgram, runProgram } from '../../src/modules/connection-skills/infrastructure/program.ts';
import { assertRevision } from '../../src/modules/connection-skills/domain/instance.ts';
import { publicFieldLabels, readFieldLabels, validatedFieldLabels } from '../../src/modules/connection-skills/domain/field-labels.ts';
import type { ConnectionField } from '../../src/modules/connection-skills/domain/definition.ts';

function fixture(t: { after(action: () => void): void }) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-connection-safety-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const root = path.join(base, 'workspace'), directory = path.join(root, 'skills', 'connections', 'fixture');
  fs.mkdirSync(path.join(directory, 'scripts', 'lib'), { recursive: true });
  fs.mkdirSync(path.join(directory, 'assets'));
  fs.writeFileSync(path.join(directory, 'SKILL.md'), '---\nname: fixture\ndescription: fixture\n---\n');
  const entryFile = path.join(directory, 'scripts', 'client.mjs');
  fs.writeFileSync(entryFile, "import { value } from './lib/value.mjs';\nprocess.on('message', message => { if (message.type === 'buildr.connection-context') { process.stdout.write(JSON.stringify({status:'success',checks:[value],diagnostics:[],limitations:[]})); process.disconnect(); } });\n");
  fs.writeFileSync(path.join(directory, 'scripts', 'lib', 'value.mjs'), "export const value='observed';\n");
  const definition = {
    schemaVersion: 'buildr.connection-definition/v1', definitionId: 'fixture', name: '模拟连接', description: '本机安全验证', category: 'fixture', configVersion: 1,
    config: { fields: [{ key: 'url', label: '地址', type: 'url', required: true }] },
    authentication: { fields: [{ key: 'username', label: '用户名', type: 'string', required: true }, { key: 'password', label: '密码', type: 'secret', required: true }], targetFields: ['url'] },
    programs: { cli: { kind: 'bundled', runtime: 'node', entry: 'scripts/client.mjs', contextProtocol: 'buildr.connection-context/v1' } }, hooks: { test: { program: 'cli', args: ['test'], effect: 'read' } }, presentation: { summaryFields: ['url'], websiteField: 'url' },
  };
  fs.writeFileSync(path.join(directory, 'assets', 'connection.yml'), YAML.stringify(definition));
  let sourceIdentity = 'fixture-source';
  const catalog = createConnectionCatalog({ assets: {
    readSkills: () => [{ id: 'fixture', path: 'connections/fixture', assetIdentity: 'fixture-asset', sourceIdentity, connectionDefinitions: ['assets/connection.yml'] }],
    readSkillFile: (_root, _skillPath, relative) => { const absolutePath = path.join(directory, relative), content = fs.readFileSync(absolutePath, 'utf8'); return { directory, absolutePath, content, digest: 'sha256-' + crypto.createHash('sha256').update(content).digest('hex') }; },
  } });
  const scope = { rootPath: root, workspaceId: crypto.randomUUID() }, dataRoot = path.join(base, 'profile');
  const application = new ConnectionSkillsApplication({ dataRoot, catalog, resolveScope: () => scope });
  const available = catalog.list(root).definitions[0]!;
  const binding = { skillAssetIdentity: available.skill.assetIdentity, definitionId: available.definition.definitionId, sourceIdentity: available.skill.sourceIdentity, configVersion: available.definition.configVersion };
  function create(username = 'fixture-reader', password = 'fixture-private-password') {
    return application.save(root, null, { name: '测试', binding, config: { url: 'https://fixture.example.invalid/' }, authentication: { intent: 'replace', values: { username, password } }, expected: { teamRevision: 'absent', definitionRevision: available.revision } }).instance;
  }
  return { base, root, directory, entryFile, scope, dataRoot, application, available, binding, create, source: (value: string) => sourceIdentity = value };
}

test('display labels accept only matching dynamic selections and hide secrets without substituting identities', () => {
  const fields: ConnectionField[] = [{ key: 'view', label: '视图', type: 'select', optionsFrom: 'views' }, { key: 'url', label: '地址', type: 'url' }, { key: 'multiple', label: '多个', type: 'multiselect', optionsFrom: 'views' }];
  const config = { view: 'view-id', url: 'https://fixture.invalid/', multiple: ['view-id'] }, labels = { view: { value: 'view-id', label: '应用日志' } };
  assert.deepEqual(validatedFieldLabels(fields, config, labels), labels);
  for (const raw of [null, [], { view: { value: 'view-id', label: '' } }, { view: { value: 'other', label: '旧名称' } }, { unknown: { value: 'view-id', label: '未知' } }, { url: { value: config.url, label: '非选择' } }, { multiple: { value: 'view-id', label: '多选不接受单值名称' } }, { view: { value: 'view-id', label: 'x'.repeat(2049) } }]) assert.throws(() => validatedFieldLabels(fields, config, raw), { code: 'connection_skill_field_labels_invalid' });
  assert.deepEqual(readFieldLabels({ ...labels, malformed: 123 }), labels);
  assert.deepEqual(publicFieldLabels(fields, config, { ...labels, view: { value: 'other', label: '旧名称' } }), {});
  assert.deepEqual(publicFieldLabels(fields, config, { view: { value: 'view-id', label: 'secret-long secret' } }, ['secret', 'secret-long']), { view: { value: 'view-id', label: '[已隐藏] [已隐藏]' } });
  assert.deepEqual(publicFieldLabels(fields, config, labels, ['view-id']), {}, 'An identity colliding with a secret is omitted, never replaced by another identity.');
});

test('saved selection names round-trip without entering execution, survive older clients, and clear on changed identities', t => {
  const f = fixture(t), definitionFile = path.join(f.directory, 'assets/connection.yml'), definition = YAML.parse(fs.readFileSync(definitionFile, 'utf8'));
  definition.config.fields.push({ key: 'scope', label: '默认范围', type: 'select', optionsFrom: 'scopes' });
  definition.hooks.scopes = { program: 'cli', args: ['scopes'], effect: 'read' };
  fs.writeFileSync(definitionFile, YAML.stringify(definition));
  const entry = f.application.definitions(f.root).definitions[0]!, labels = { scope: { value: 'scope-id', label: '应用日志视图' } };
  const input = { id: 'labeled', name: '名称验收', binding: f.binding, config: { url: 'https://fixture.example.invalid/', scope: 'scope-id' }, fieldLabels: labels, authentication: { intent: 'replace', values: { username: 'reader', password: 'fixture-secret' } }, expected: { teamRevision: 'absent', definitionRevision: entry.revision } };
  let saved = f.application.save(f.root, null, input).instance;
  assert.deepEqual(saved.fieldLabels, labels); assert.deepEqual(saved.config, input.config);
  const raw = YAML.parse(fs.readFileSync(path.join(f.root, saved.sourcePath), 'utf8'));
  assert.deepEqual(raw.fieldLabels, labels); assert.equal(raw.config.scope, 'scope-id');
  f.application.useSelected(f.root, { id: saved.id, expectedRevision: saved.revision }, selected => { assert.equal(Object.hasOwn(selected.connection, 'fieldLabels'), false); assert.equal(selected.connection.config.scope, 'scope-id'); });
  const olderInput = () => ({ name: saved.name, binding: saved.binding, config: saved.config, authentication: { intent: 'keep' }, expected: { teamRevision: saved.teamRevision, definitionRevision: saved.definitionRevision } });
  saved = f.application.save(f.root, saved.id, olderInput()).instance;
  assert.deepEqual(saved.fieldLabels, labels, 'A client that predates names must preserve matching saved labels.');
  const before = fs.readFileSync(path.join(f.root, saved.sourcePath));
  assert.throws(() => f.application.save(f.root, saved.id, { ...olderInput(), fieldLabels: { scope: { value: 'other', label: 'wrong' } } }), { code: 'connection_skill_field_labels_invalid' });
  assert.deepEqual(fs.readFileSync(path.join(f.root, saved.sourcePath)), before);
  saved = f.application.save(f.root, saved.id, { ...olderInput(), config: { ...saved.config, scope: 'other' } }).instance;
  assert.deepEqual(saved.fieldLabels || {}, {}); assert.equal(saved.authentication.team.configured, true);
});

test('malformed saved display metadata is isolated from valid configuration and never reflected unfiltered', t => {
  const f = fixture(t), saved = f.create(), file = path.join(f.root, saved.sourcePath), raw = YAML.parse(fs.readFileSync(file, 'utf8'));
  for (const metadata of [false, ['not-a-record'], { url: { value: saved.config.url, label: 'not-a-select' }, unknown: { value: 'unknown', label: 'fixture-private-password' }, malformed: { label: 123 } }]) {
    raw.fieldLabels = metadata; fs.writeFileSync(file, YAML.stringify(raw)); const before = fs.readFileSync(file);
    const current = f.application.get(f.root, saved.id).instance;
    assert.equal(current.availability.ready, true); assert.equal(current.authentication.team.configured, true);
    assert.deepEqual(current.fieldLabels || {}, {}); assert.ok(!JSON.stringify(current.fieldLabels || {}).includes('fixture-private-password'));
    f.application.useSelected(f.root, { id: current.id, expectedRevision: current.revision }, selected => assert.equal(selected.connection.config.url, saved.config.url));
    assert.deepEqual(fs.readFileSync(file), before, 'Reading optional names never rewrites the source.');
  }
});

test('generic connection blocks an externally changed authentication principal before private handoff', async t => {
  const f = fixture(t), instance = f.create();
  const file = path.join(f.root, instance.sourcePath), changed = YAML.parse(fs.readFileSync(file, 'utf8'));
  changed.authentication.values.username = 'another-principal';
  fs.writeFileSync(file, YAML.stringify(changed));
  const observed = f.application.get(f.root, instance.id).instance;
  await assert.rejects(() => f.application.run(f.root, { id: instance.id, expectedRevision: observed.revision, args: ['test'] }), { code: 'connection_skill_auth_target_changed' });
});

test('generic connection does not redact public usernames as secret arguments or corrupt hook JSON keys', async t => {
  const f = fixture(t), instance = f.create('a');
  const result = await f.application.hook(f.root, { id: instance.id, binding: f.binding, config: instance.config, expected: { teamRevision: instance.teamRevision, definitionRevision: instance.definitionRevision }, authentication: { source: 'team', intent: 'keep' } }, 'test');
  assert.equal(result.status, 'success'); assert.deepEqual(result.checks, ['observed']);
});
test('short secrets cannot corrupt typed hook status or keys and echoed display text remains protected', async t => {
  const f = fixture(t);
  fs.writeFileSync(f.entryFile, "process.on('message',m=>{if(m.type==='buildr.connection-context'){const secret=m.context.connections.primary.authentication.values.password;console.log(JSON.stringify({status:'success',checks:[{status:'success',message:secret}],diagnostics:[secret],options:[{value:'alpha',label:secret}]}));process.disconnect();}});\n");
  const instance = f.create(undefined, 's');
  const result = await f.application.hook(f.root, { id: instance.id, binding: f.binding, config: instance.config, expected: { teamRevision: instance.teamRevision, definitionRevision: instance.definitionRevision }, authentication: { source: 'team', intent: 'keep' } }, 'test');
  assert.equal(result.status, 'success');
  assert.deepEqual(result.checks, [{ status: 'success', message: '[已隐藏]' }]);
  assert.deepEqual(result.options, [{ value: 'alpha', label: '[已隐藏]' }]);
  assert.deepEqual(result.diagnostics, ['[已隐藏]']);
});
test('an option identity colliding with a secret fails locally without returning a substituted identity', async t => {
  const f = fixture(t);
  fs.writeFileSync(f.entryFile, "process.on('message',m=>{if(m.type==='buildr.connection-context'){console.log(JSON.stringify({status:'success',options:[{value:'public',label:'Public namespace'}]}));process.disconnect();}});\n");
  const instance = f.create(undefined, 'public');
  const result = await f.application.hook(f.root, { id: instance.id, hook: 'test', binding: f.binding, config: instance.config, expected: { teamRevision: instance.teamRevision, definitionRevision: instance.definitionRevision }, authentication: { source: 'team', intent: 'keep' } }, 'discover');
  assert.equal(result.status, 'failure'); assert.equal(result.options, undefined);
  assert.match(JSON.stringify(result.diagnostics), /编号与认证值重合/);
  assert.ok(!JSON.stringify(result).includes('public')); assert.ok(!JSON.stringify(result).includes('[已隐藏]'), 'a masked value must never become an alternative selectable identity');
  assert.equal(f.application.get(f.root, instance.id).instance.authentication.team.configured, true, 'only this discovery is rejected');
});
test('internal output consumers never receive partial output and errors do not expose raw stdout', async t => {
  const f = fixture(t), secret = 'consumer-private-value'; let consumed = false;
  fs.writeFileSync(f.entryFile, "process.stdout.write('" + secret + "');setInterval(()=>{},1000);\n");
  const hanging = resolveProgram(f.root, f.available, 'cli');
  const timeout = await runProgram(hanging, [], { secrets: [secret], timeoutMs: 20, consumeStdout: () => { consumed = true; } });
  assert.equal(timeout.status, 'timeout'); assert.equal(consumed, false); assert.equal(timeout.stdout, '');
  const limit = await runProgram(hanging, [], { secrets: [secret], maxBytes: 4, consumeStdout: () => { consumed = true; } });
  assert.equal(limit.status, 'output-limit'); assert.equal(consumed, false); assert.equal(limit.stdout, '');
  fs.writeFileSync(f.entryFile, "console.log('" + secret + "');\n");
  const complete = resolveProgram(f.root, f.available, 'cli');
  const failed = await runProgram(complete, [], { secrets: [secret], consumeStdout: () => { throw new Error(secret); } });
  assert.equal(failed.status, 'exited'); assert.equal(failed.stdout, ''); assert.ok(!JSON.stringify(failed).includes(secret)); assert.match(failed.diagnostics.join(''), /输出处理失败/);
});

test('generic program handoff protects JSON escaped authentication values in ordinary output', async t => {
  const f = fixture(t), secret = 'private-line\nprivate-quote"private-backslash\\';
  fs.writeFileSync(f.entryFile, "process.on('message', message => { if(message.type === 'buildr.connection-context') { process.stdout.write(JSON.stringify({password:message.context.secret})); process.disconnect(); } });\n");
  const program = resolveProgram(f.root, f.available, 'cli');
  const result = await runProgram(program, [], { context: { secret }, secrets: [secret] });
  assert.equal(result.exitCode, 0);
  assert.ok(!result.stdout.includes(JSON.stringify(secret).slice(1, -1)), 'JSON escaped plaintext must not enter ordinary result');
  assert.ok(!JSON.parse(result.stdout).password.includes('private-line'));
});

test('generic program output protects known secrets embedded in escaped JSON keys and values on both channels', async t => {
  const f = fixture(t), secret = 'private-key-line\nprivate-key-quote"private-key-backslash\\';
  fs.writeFileSync(f.entryFile, "process.on('message', message => { if(message.type === 'buildr.connection-context') { const secret = message.context.secret, payload = {['prefix-' + secret + '-suffix']: {['nested-' + secret]: 'value-' + secret}}; process.stdout.write(JSON.stringify(payload)); process.stderr.write(JSON.stringify(payload)); process.disconnect(); } });\n");
  const result = await runProgram(resolveProgram(f.root, f.available, 'cli'), [], { context: { secret }, secrets: [secret] });
  assert.equal(result.exitCode, 0);
  for (const output of [result.stdout, result.stderr]) {
    assert.ok(!output.includes(secret));
    assert.ok(!output.includes(JSON.stringify(secret).slice(1, -1)), 'escaped keys cannot expose a known secret');
    assert.deepEqual(JSON.parse(output), { 'prefix-[已隐藏]-suffix': { 'nested-[已隐藏]': 'value-[已隐藏]' } });
  }
});

test('a valid management input that expands beyond the YAML limit cannot replace a readable team instance', t => {
  const f = fixture(t), instance = f.create(), file = path.join(f.root, instance.sourcePath);
  const declaration = path.join(f.directory, 'assets/connection.yml'), definition = YAML.parse(fs.readFileSync(declaration, 'utf8'));
  definition.config.fields.push({ key: 'note', label: '说明', type: 'string' }); fs.writeFileSync(declaration, YAML.stringify(definition));
  const current = f.application.get(f.root, instance.id).instance, before = fs.readFileSync(file);
  const input = { name: current.name, binding: current.binding, config: { ...current.config, note: 'x\n'.repeat(50_000) }, authentication: { intent: 'keep' }, expected: { teamRevision: current.teamRevision, definitionRevision: current.definitionRevision } };
  assert.ok(Buffer.byteLength(JSON.stringify(input)) < 256 * 1024, 'the public management request is within its input limit');
  assert.throws(() => f.application.save(f.root, instance.id, input), { code: 'connection_skill_file_invalid', status: 400 });
  assert.deepEqual(fs.readFileSync(file), before, 'the previous readable instance remains untouched');
  assert.equal(f.application.get(f.root, instance.id).instance.name, current.name);
});

test('generic program observation detects a changed imported library while entry and declaration stay fixed', t => {
  const f = fixture(t), before = resolveProgram(f.root, f.available, 'cli');
  fs.writeFileSync(path.join(f.directory, 'scripts', 'lib', 'value.mjs'), "export const value='different-code';\n");
  const after = resolveProgram(f.root, f.available, 'cli');
  assert.notEqual(after.identity, before.identity, 'imported program code is part of the observed executable');
});

test('a cloned team instance has stable observations across fresh CLI processes without changing shared facts or copying auth', t => {
  const f = fixture(t), instance = f.create(), freshData = path.join(f.base, 'fresh-profile');
  const sharedFile = path.join(f.root, instance.sourcePath), sharedBefore = fs.readFileSync(sharedFile);
  const moduleUrl = new URL('../../src/modules/connection-skills/persistence/files.ts', import.meta.url).href;
  const script = `import {ConnectionFiles} from ${JSON.stringify(moduleUrl)}; const files = new ConnectionFiles(${JSON.stringify(freshData)}); console.log(files.readTeam(${JSON.stringify(f.scope)}, ${JSON.stringify(instance.id)}).revision);`;
  const first = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' });
  const second = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' });
  assert.equal(first.status, 0, first.stderr); assert.equal(second.status, 0, second.stderr);
  assert.equal(first.stdout, second.stdout, 'the observation from get must remain consumable by another CLI invocation');
  assert.equal(new ConnectionFiles(freshData).readLocal(f.scope, instance.id).present, false);
  assert.deepEqual(fs.readFileSync(sharedFile), sharedBefore, 'observation cannot alter shared instance or migrate its auth');
  const key = path.join(freshData, 'connection-skills', 'key.json');
  if (process.platform !== 'win32') assert.equal(fs.statSync(key).mode & 0o077, 0, 'the machine observation key is restricted');
  assert.ok(!fs.readFileSync(key, 'utf8').includes('fixture-private-password'));
});

test('named connection handoff requires a separately observed version for every instance', async t => {
  const f = fixture(t), primary = f.create(), compare = f.create();
  await assert.rejects(() => f.application.run(f.root, { id: primary.id, expectedRevision: primary.revision, args: ['test'], contexts: { compare: { id: compare.id } } as any }));
});

test('connection writes cannot bypass an observed definition by omitting its revision', t => {
  const f = fixture(t);
  assert.throws(() => f.application.save(f.root, null, { name: '测试', binding: f.binding, config: { url: 'https://fixture.example.invalid/' }, authentication: { intent: 'replace', values: { username: 'fixture-reader', password: 'fixture-private-password' } }, expected: { teamRevision: 'absent' } }));
});

test('Nacos style website fragments remain viewable and do not change the HTTP authentication target', async t => {
  const f = fixture(t);
  const instance = f.application.save(f.root, null, { name: '测试', binding: f.binding, config: { url: 'https://fixture.example.invalid/nacos/#/' }, authentication: { intent: 'replace', values: { username: 'fixture-reader', password: 'fixture-private-password' } }, expected: { teamRevision: 'absent', definitionRevision: f.available.revision } }).instance;
  assert.equal(instance.websiteUrl, 'https://fixture.example.invalid/nacos/#/');
  const file = path.join(f.root, instance.sourcePath), changed = YAML.parse(fs.readFileSync(file, 'utf8'));
  changed.config.url = 'https://fixture.example.invalid/nacos/#/configuration';
  fs.writeFileSync(file, YAML.stringify(changed));
  const observed = f.application.get(f.root, instance.id).instance;
  const result = await f.application.run(f.root, { id: instance.id, expectedRevision: observed.revision, args: ['test'] });
  assert.equal(result.exitCode, 0);
});

test('invalid source website values cannot bypass field validation through a clickable URL', t => {
  const f = fixture(t), instance = f.create(), file = path.join(f.root, instance.sourcePath);
  const changed = YAML.parse(fs.readFileSync(file, 'utf8'));
  changed.config.url = 'https://fixture.example.invalid/?password=fixture-private-password';
  fs.writeFileSync(file, YAML.stringify(changed));
  const observed = f.application.get(f.root, instance.id).instance;
  assert.equal(observed.websiteUrl, null);
  assert.ok(!JSON.stringify(observed).includes('fixture-private-password'));
});

test('malformed shared environment is locally diagnosed rather than exposed as an arbitrary object', t => {
  const f = fixture(t), instance = f.create(), file = path.join(f.root, instance.sourcePath);
  const changed = YAML.parse(fs.readFileSync(file, 'utf8'));
  changed.environment = { password: 'fixture-private-password' };
  fs.writeFileSync(file, YAML.stringify(changed));
  const result = f.application.list(f.root);
  assert.equal(result.instances.length, 0); assert.equal(result.diagnostics.length, 1);
  assert.ok(!JSON.stringify(result).includes('fixture-private-password'));
});

test('equivalent YAML property reordering preserves authentication identity after refreshing the observation', async t => {
  const f = fixture(t), instance = f.create(), file = path.join(f.root, instance.sourcePath);
  const changed = YAML.parse(fs.readFileSync(file, 'utf8'));
  changed.binding = Object.fromEntries(Object.entries(changed.binding).reverse());
  changed.authentication.values = Object.fromEntries(Object.entries(changed.authentication.values).reverse());
  fs.writeFileSync(file, YAML.stringify(changed));
  const observed = f.application.get(f.root, instance.id).instance;
  assert.notEqual(observed.revision, instance.revision);
  const result = await f.application.run(f.root, { id: instance.id, expectedRevision: observed.revision, args: ['test'] });
  assert.equal(result.exitCode, 0);
});
test('invalid public authentication fields do not expose arbitrary nested credential objects', t => {
  const f = fixture(t), instance = f.create(), file = path.join(f.root, instance.sourcePath);
  const changed = YAML.parse(fs.readFileSync(file, 'utf8'));
  changed.authentication.values.username = { password: 'nested-secret-only' };
  fs.writeFileSync(file, YAML.stringify(changed));
  const observed = f.application.get(f.root, instance.id).instance;
  assert.ok(observed.authentication.team.diagnostic);
  assert.ok(!JSON.stringify(observed).includes('nested-secret-only'));
});

test('an unavailable source or reclassified secret cannot expose existing team or personal authentication', t => {
  const f = fixture(t), instance = f.create();
  f.application.saveAuth(f.root, instance.id, { intent: 'replace', values: { username: 'personal-reader', password: 'fixture-personal-private-password' }, expected: { teamRevision: instance.teamRevision, definitionRevision: instance.definitionRevision, localRevision: instance.localRevision } });
  const declaration = path.join(f.directory, 'assets/connection.yml'), definition = YAML.parse(fs.readFileSync(declaration, 'utf8'));
  definition.authentication.fields.find((field: { key: string }) => field.key === 'password').type = 'string';
  fs.writeFileSync(declaration, YAML.stringify(definition));
  for (const identity of ['replacement-source', 'fixture-source']) {
    f.source(identity);
    const observed = f.application.get(f.root, instance.id).instance;
    assert.equal(observed.authentication.source, 'personal'); assert.equal(observed.authentication.personal.present, true);
    assert.deepEqual(observed.authentication.team.values, {}); assert.deepEqual(observed.authentication.personal.values, {});
    if (identity === 'fixture-source') {
      assert.equal(observed.authentication.team.configured, false); assert.equal(observed.authentication.personal.configured, false);
      assert.match(observed.authentication.team.diagnostic || '', /目标/); assert.match(observed.authentication.personal.diagnostic || '', /目标/);
    } else assert.equal(observed.availability.ready, false);
    const publicOutput = JSON.stringify(f.application.list(f.root));
    assert.ok(!publicOutput.includes('fixture-private-password')); assert.ok(!publicOutput.includes('fixture-personal-private-password'));
  }
});

test('numeric dynamic option identifiers produce a local actionable diagnostic instead of unusable choices', async t => {
  const f = fixture(t);
  fs.writeFileSync(f.entryFile, "process.on('message', message => { if(message.type === 'buildr.connection-context') { console.log(JSON.stringify({status:'success',options:[{value:42,label:'编号42'}]})); process.disconnect(); } });\n");
  const instance = f.create();
  const result = await f.application.hook(f.root, { id: instance.id, binding: f.binding, config: instance.config, expected: { teamRevision: instance.teamRevision, definitionRevision: instance.definitionRevision }, authentication: { source: 'team', intent: 'keep' } }, 'test');
  assert.equal(result.status, 'failure'); assert.equal(result.options, undefined);
  assert.match(JSON.stringify(result.diagnostics), /编号必须是文本/);
  assert.equal(f.application.get(f.root, instance.id).instance.availability.ready, true, 'invalid hook output does not alter the connection');
});
test('nested program entry observes sibling runtime libraries in its declared attachment tree', t => {
  const f = fixture(t), bin = path.join(f.directory, 'scripts', 'bin'); fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'nested.mjs'), "import '../lib/value.mjs';\n");
  const source = { ...f.available, definition: { ...f.available.definition, programs: { cli: { kind: 'bundled' as const, runtime: 'node', entry: 'scripts/bin/nested.mjs' } } } };
  const before = resolveProgram(f.root, source, 'cli');
  fs.writeFileSync(path.join(f.directory, 'scripts', 'lib', 'value.mjs'), "export const value='updated sibling';\n");
  assert.notEqual(resolveProgram(f.root, source, 'cli').identity, before.identity);
});

test('a damaged local observation key preserves authoritative team instances while blocking version-dependent actions', async t => {
  const f = fixture(t);
  fs.writeFileSync(f.entryFile, "if (process.argv.includes('--help')) { console.log('fixture help without credentials'); process.exit(0); }\n" + fs.readFileSync(f.entryFile, 'utf8'));
  const instance = f.create(), file = path.join(f.root, instance.sourcePath);
  const before = fs.readFileSync(file), keyFile = path.join(f.application.files.dataRoot, 'key.json'), damaged = '{ damaged local key';
  fs.writeFileSync(keyFile, damaged, { mode: 0o600 });
  const team = f.application.files.readTeam(f.scope, instance.id);
  assert.equal(team.value?.id, instance.id); assert.equal(team.revision, 'unavailable'); assert.match(team.diagnostic || '', /本机观察/);
  const result = f.application.list(f.root);
  assert.equal(result.instances.length, 1); assert.equal(result.diagnostics.length, 0);
  const observed = f.application.get(f.root, instance.id).instance;
  assert.equal(observed.name, instance.name); assert.equal(observed.revision, 'unavailable'); assert.equal(observed.availability.ready, false);
  assert.match(observed.availability.diagnostics.join(' '), /本机观察/);
  assert.ok(!JSON.stringify(result).includes('fixture-private-password'));
  await assert.rejects(() => f.application.run(f.root, { id: instance.id, expectedRevision: 'unavailable', args: ['test'] }), { code: 'connection_skill_observation_unavailable' });
  assert.throws(() => f.application.files.writeTeam(f.scope, team.value!, 'unavailable'), { code: 'connection_skill_observation_unavailable' });
  assert.equal(f.application.check(f.root, instance.id).ready, true, 'safe program inspection does not require credentials or an executable connection observation');
  const help = await f.application.help(f.root, instance.id); assert.equal(help.exitCode, 0); assert.match(help.stdout, /without credentials/);
  assert.deepEqual(fs.readFileSync(file), before); assert.equal(fs.readFileSync(keyFile, 'utf8'), damaged, 'the key is neither repaired nor silently replaced');
  fs.writeFileSync(keyFile, '');
  assert.equal(f.application.get(f.root, instance.id).instance.revision, 'unavailable', 'an existing empty key is damaged rather than absent');
  assert.equal(fs.readFileSync(keyFile, 'utf8'), '', 'an empty key is neither repaired nor replaced by an ephemeral fallback');
});

test('a failed composite observation remains visible and unreadable markers cannot be accepted as matching versions', t => {
  const f = fixture(t), instance = f.create(), original = f.application.files.revision.bind(f.application.files);
  f.application.files.revision = raw => { if (Array.isArray(raw)) throw new Error('local composite observation failed'); return original(raw); };
  const observed = f.application.get(f.root, instance.id).instance;
  assert.equal(observed.id, instance.id); assert.equal(observed.revision, 'unavailable'); assert.equal(observed.availability.ready, false);
  assert.equal(f.application.list(f.root).instances.length, 1);
  for (const marker of ['unavailable', 'unreadable']) assert.throws(() => assertRevision(marker, marker), { code: 'connection_skill_observation_unavailable' });
});
