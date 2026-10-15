import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import YAML from 'yaml';
import { ConnectionSkillsApplication } from '../../src/modules/connection-skills/application/connection-skills-application.ts';
import { createConnectionCatalog } from '../../src/modules/connection-skills/application/catalog.ts';
import { createConnectionSkillsHttp } from '../../src/modules/connection-skills/interfaces/http/connection-skills-http.ts';
import { digest } from '../../src/modules/connection-skills/persistence/files.ts';

function fixture(t: { after(fn: () => void): void }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-connection-skill-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const workspace = path.join(root, 'workspace'), directory = path.join(workspace, 'skills', 'connections', 'example');
  fs.mkdirSync(path.join(directory, 'assets'), { recursive: true }); fs.mkdirSync(path.join(directory, 'scripts'));
  fs.mkdirSync(path.join(directory, 'references'));
  fs.writeFileSync(path.join(directory, 'SKILL.md'), '---\nname: example\ndescription: 离线验证未知系统的上下文和输入，绝不联网。\nconnectionDefinitions: [assets/connection.yml]\n---\n\n通过绑定实例的通用入口查看帮助和执行 read。结果仅证明模拟程序收到本次输入，不代表真实系统。wait 请求写前校验但不发起外部写入；失败不重试。\n');
  fs.writeFileSync(path.join(directory, 'references/commands-and-results.md'), 'read 返回输入和认证来源；echo 验证已知秘密跨块保护；wait 核对上下文是否仍有效；hang 验证超时为未知。所有操作都只在隔离本机执行。\n');
  const definition = { schemaVersion: 'buildr.connection-definition/v1', definitionId: 'example', name: 'Example', description: 'An unknown system', category: 'custom-category', configVersion: 1,
    config: { fields: [{ key: 'site', label: '网站', type: 'url', required: true }] }, authentication: { fields: [{ key: 'username', label: '账号', type: 'string', required: true }, { key: 'password', label: '密码', type: 'secret', required: true }], targetFields: ['site'] },
    programs: { cli: { kind: 'bundled', runtime: 'node', entry: 'scripts/client.mjs' } }, hooks: { test: { program: 'cli', args: ['test'], effect: 'read' } }, presentation: { summaryFields: ['site'], websiteField: 'site' } };
  const declaration = path.join(directory, 'assets', 'connection.yml'); fs.writeFileSync(declaration, YAML.stringify(definition));
  fs.writeFileSync(path.join(directory, 'scripts', 'client.mjs'), `
const action = process.argv[2];
if (action === '--help') { console.log('example independently supplied help'); process.disconnect(); }
else {
  const input = new Promise(resolve => { const chunks=[]; process.stdin.on('data',chunk=>chunks.push(chunk)); process.stdin.on('end',()=>resolve(Buffer.concat(chunks).toString())); });
  process.on('message',async message=>{
    if(message.type === 'buildr.connection-context') {
      const c=message.context, a=c.connections.primary.authentication;
      if(action==='echo') { process.stdout.write(a.values.password.slice(0,3)); setTimeout(()=>{process.stdout.write(a.values.password.slice(3)+'\\n');process.disconnect();},10); }
      else if(action==='wait') { setTimeout(()=>process.send({type:'buildr.connection-revalidate',callId:c.callId,requestId:'one'}),150); }
      else if(action==='hang') { setInterval(()=>{},1000); }
      else if(action==='descendants') {
        const {spawn}=await import('node:child_process'); const fs=await import('node:fs'); const path=await import('node:path');
        const nested=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:['ignore','inherit','inherit']});
        fs.writeFileSync(path.join(c.privateStateRoot,'nested.pid'),String(nested.pid)); process.on('SIGTERM',()=>{});
      }
      else { console.log(JSON.stringify({status:'success',checks:[action],input:await input,source:a.source,isPersonal:a.values.username==='person-user',hasCompare:!!c.connections.compare,argv:process.argv.slice(2),envSecret:Object.values(process.env).includes(a.values.password)})); process.disconnect(); }
    } else if(message.type==='buildr.connection-revalidated') { console.log(JSON.stringify({revalidated:message.ok})); process.disconnect(); }
  });
}
`);
  let sourceIdentity = 'source:example'; let enabled = true;
  const catalog = createConnectionCatalog({ assets: { readSkills: () => [{ id: 'example', path: 'connections/example', assetIdentity: 'asset:example', sourceIdentity, enabled, connectionDefinitions: ['assets/connection.yml'] }], readSkillFile: (_root, _skill, relative) => { const content = fs.readFileSync(path.join(directory, relative), 'utf8'); return { content, digest: digest(content), directory, absolutePath: path.join(directory, relative) }; } } });
  const app = new ConnectionSkillsApplication({ dataRoot: path.join(root, 'local'), catalog, resolveScope: () => ({ rootPath: workspace, workspaceId: 'fixture-workspace' }) });
  const entry = app.definitions(workspace).definitions[0]!;
  const binding = { skillAssetIdentity: entry.skill.assetIdentity, sourceIdentity: entry.skill.sourceIdentity, definitionId: 'example', configVersion: 1 };
  const create = (id = 'example-one') => app.save(workspace, null, { id, name: id, binding, config: { site: 'https://example.invalid/' }, authentication: { intent: 'replace', values: { username: 'team-user', password: 'team-secret-123' } }, expected: { teamRevision: 'absent', definitionRevision: entry.revision } }).instance;
  const expected = (id = 'example-one') => { const v = app.get(workspace, id).instance; return { teamRevision: v.teamRevision, definitionRevision: v.definitionRevision, localRevision: v.localRevision }; };
  return { root, workspace, directory, declaration, definition, app, create, expected, binding, source: (value: string) => sourceIdentity = value, enabled: (value: boolean) => enabled = value };
}
test('unknown provider: source discovery is read-only, shared files and local complete override stay independent', async t => {
  const f = fixture(t); assert.deepEqual(f.app.list(f.workspace).instances, []); assert.equal(fs.existsSync(path.join(f.root, 'local')), false);
  const created = f.create(); assert.equal(created.authentication.source, 'team'); assert.equal(JSON.stringify(created).includes('team-secret-123'), false);
  const shared = path.join(f.workspace, 'connections/instances/example-one.yml'), before = fs.readFileSync(shared, 'utf8'); assert.ok(before.includes('team-secret-123'));
  f.app.saveAuth(f.workspace, created.id, { intent: 'replace', values: { username: 'person-user', password: 'personal-secret-456' }, expected: f.expected() });
  assert.equal(fs.readFileSync(shared, 'utf8'), before);
  const view = f.app.get(f.workspace, created.id).instance;
  const result = await f.app.run(f.workspace, { id: created.id, expectedRevision: view.revision, args: ['unknown-action', '--custom-flag'], input: 'complete\ninput\uFEFF' });
  const value = JSON.parse(result.stdout); assert.equal(value.source, 'personal'); assert.equal(value.isPersonal, true); assert.equal(value.input, 'complete\ninput\uFEFF'); assert.equal(value.envSecret, false); assert.deepEqual(value.argv, ['unknown-action', '--custom-flag']);
  f.app.saveAuth(f.workspace, created.id, { intent: 'remove', expected: f.expected() });
  assert.equal(f.app.get(f.workspace, created.id).instance.authentication.source, 'team');
  const anotherMachine = new ConnectionSkillsApplication({ dataRoot: path.join(f.root, 'another-local'), catalog: f.app.catalog, resolveScope: () => ({ rootPath: f.workspace, workspaceId: 'fixture-workspace' }) });
  assert.equal(anotherMachine.get(f.workspace, created.id).instance.authentication.source, 'team');
});
test('conflicts, target drift and broken personal groups never overwrite or fall back', async t => {
  const f = fixture(t), created = f.create(), old = f.expected();
  const shared = path.join(f.workspace, created.sourcePath), raw = YAML.parse(fs.readFileSync(shared, 'utf8'));
  raw.name = 'Changed externally'; fs.writeFileSync(shared, YAML.stringify(raw));
  assert.throws(() => f.app.save(f.workspace, created.id, { ...created, authentication: { intent: 'keep' }, expected: old }), /已变化/);
  f.app.saveAuth(f.workspace, created.id, { intent: 'replace', values: { username: 'person-user', password: 'personal-secret-456' }, expected: f.expected() });
  raw.config.site = 'https://changed.invalid/'; fs.writeFileSync(shared, YAML.stringify(raw));
  const view = f.app.get(f.workspace, created.id).instance; assert.equal(view.authentication.source, 'personal'); assert.match(view.authentication.personal.diagnostic!, /目标/);
  await assert.rejects(f.app.run(f.workspace, { id: created.id, expectedRevision: view.revision, args: ['read'] }), /目标/);
  const scope = { rootPath: f.workspace, workspaceId: 'fixture-workspace' };
  f.app.files.lock(scope, created.id, () => f.app.files.writeLocal(scope, created.id, { targetBinding: 'invalid', values: { username: 'person-user' } }, view.localRevision));
  assert.equal(f.app.get(f.workspace, created.id).instance.authentication.source, 'personal');
  await assert.rejects(f.app.run(f.workspace, { id: created.id, expectedRevision: f.app.get(f.workspace, created.id).instance.revision, args: ['read'] }));
  fs.unlinkSync(shared); assert.deepEqual(f.app.list(f.workspace).instances, []); assert.equal(f.app.files.readLocal(scope, created.id).present, true);
});
test('cross-chunk output protection, private revalidation, timeout and named context preserve boundaries', async t => {
  const f = fixture(t), created = f.create(), second = f.create('example-two');
  const echo = await f.app.run(f.workspace, { id: created.id, expectedRevision: created.revision, args: ['echo'] }); assert.ok(echo.stdout.includes('[已隐藏]')); assert.ok(!echo.stdout.includes('team-secret-123'));
  const compare = await f.app.run(f.workspace, { id: created.id, expectedRevision: created.revision, contexts: { compare: { id: second.id, revision: second.revision } }, args: ['read'] }); assert.equal(JSON.parse(compare.stdout).hasCompare, true);
  const running = f.app.run(f.workspace, { id: created.id, expectedRevision: created.revision, args: ['wait'] });
  const shared = path.join(f.workspace, created.sourcePath); const raw = YAML.parse(fs.readFileSync(shared, 'utf8')); raw.name = 'concurrent edit'; fs.writeFileSync(shared, YAML.stringify(raw));
  assert.equal(JSON.parse((await running).stdout).revalidated, false);
  const timeout = await f.app.run(f.workspace, { id: created.id, expectedRevision: f.app.get(f.workspace, created.id).instance.revision, args: ['hang'], timeoutMs: 20 }); assert.equal(timeout.status, 'timeout'); assert.match(timeout.diagnostics.join(''), /未知/);
});
test('draft candidate team test bypasses neither persisted choice nor authentication target checks', async t => {
  const f = fixture(t), created = f.create();
  f.app.saveAuth(f.workspace, created.id, { intent: 'replace', values: { username: 'person-user', password: 'personal-secret-456' }, expected: f.expected() });
  const before = f.app.get(f.workspace, created.id).instance;
  const result = await f.app.hook(f.workspace, { id: created.id, binding: f.binding, config: created.config, authentication: { source: 'team', intent: 'keep' }, expected: f.expected() }, 'test');
  assert.equal(result.status, 'success'); assert.equal(result.authenticationSource, 'team'); assert.equal(f.app.get(f.workspace, created.id).instance.revision, before.revision);
  await assert.rejects(f.app.hook(f.workspace, { id: created.id, binding: f.binding, config: { site: 'https://elsewhere.invalid/' }, authentication: { source: 'team', intent: 'keep' }, expected: f.expected() }, 'test'), /目标/);
});
test('discovery can precede required selection while tests and complete authentication keep their boundaries', async t => {
  const f = fixture(t);
  const definition: any = structuredClone(f.definition);
  definition.config.fields.push({ key: 'space', label: '业务空间', type: 'select', required: true, optionsFrom: 'spaces' });
  definition.hooks.spaces = { program: 'cli', args: ['spaces'], effect: 'read', inputs: ['config.site', 'authentication.username', 'authentication.password'] };
  fs.writeFileSync(f.declaration, YAML.stringify(definition));
  const entry = f.app.definitions(f.workspace).definitions[0]!;
  const draft = { binding: f.binding, hook: 'spaces', config: { site: 'https://example.invalid/' }, authentication: { source: 'team', intent: 'replace', values: { username: 'team-user', password: 'team-secret-123' } }, expected: { teamRevision: 'absent', definitionRevision: entry.revision } };
  assert.equal((await f.app.hook(f.workspace, draft, 'discover')).status, 'success');
  assert.deepEqual(f.app.list(f.workspace).instances, [], 'discovery does not persist the draft');
  await assert.rejects(f.app.hook(f.workspace, draft, 'test'), { code: 'connection_field_required', field: 'space' });
  await assert.rejects(f.app.hook(f.workspace, { ...draft, config: {} }, 'discover'), { code: 'connection_field_required', field: 'site' });
  await assert.rejects(f.app.hook(f.workspace, { ...draft, config: { ...draft.config, space: 1 } }, 'discover'), { code: 'connection_field_invalid', field: 'space' });
  await assert.rejects(f.app.hook(f.workspace, { ...draft, authentication: { source: 'team', intent: 'replace', values: { username: 'team-user' } } }, 'discover'), { code: 'connection_field_required', field: 'password' });
  delete definition.hooks.spaces.inputs;
  fs.writeFileSync(f.declaration, YAML.stringify(definition));
  const current = f.app.definitions(f.workspace).definitions[0]!;
  await assert.rejects(f.app.hook(f.workspace, { ...draft, expected: { ...draft.expected, definitionRevision: current.revision } }, 'discover'), { code: 'connection_field_required', field: 'space' });
});
test('discovery always requires the authentication target and explicitly declared optional authentication inputs', async t => {
  const f = fixture(t);
  const definition: any = structuredClone(f.definition);
  definition.config.fields[0].required = false;
  definition.config.fields[0].dependsOn = { field: 'authEnabled', equals: true };
  definition.config.fields.push({ key: 'authEnabled', label: '启用认证', type: 'boolean', default: false });
  definition.authentication.fields.push({ key: 'tenant', label: '认证租户', type: 'string', dependsOn: { field: 'username', equals: 'another-user' } });
  definition.hooks.spaces = { program: 'cli', args: ['spaces'], effect: 'read', inputs: ['authentication.tenant'] };
  fs.writeFileSync(f.declaration, YAML.stringify(definition));
  const entry = f.app.definitions(f.workspace).definitions[0]!;
  const created = f.app.save(f.workspace, null, { name: 'Saved without optional tenant', binding: f.binding, config: { site: 'https://example.invalid/' }, authentication: { intent: 'replace', values: { username: 'team-user', password: 'team-secret-123' } }, expected: { teamRevision: 'absent', definitionRevision: entry.revision } }).instance;
  const draft = { binding: f.binding, hook: 'spaces', config: { site: 'https://example.invalid/' }, authentication: { source: 'team', intent: 'replace', values: { username: 'team-user', password: 'team-secret-123', tenant: 'one' } }, expected: { teamRevision: 'absent', definitionRevision: entry.revision } };
  await assert.rejects(f.app.hook(f.workspace, { ...draft, config: {} }, 'discover'), { code: 'connection_field_required', field: 'site' });
  await assert.rejects(f.app.hook(f.workspace, { ...draft, authentication: { ...draft.authentication, values: { username: 'team-user', password: 'team-secret-123' } } }, 'discover'), { code: 'connection_field_required', field: 'tenant' });
  await assert.rejects(f.app.hook(f.workspace, { ...draft, authentication: { ...draft.authentication, values: { username: 'team-user', tenant: 'one' } } }, 'discover'), { code: 'connection_field_required', field: 'password' });
  assert.equal((await f.app.hook(f.workspace, draft, 'discover')).status, 'success');
  const current = f.app.get(f.workspace, created.id).instance;
  await assert.rejects(f.app.hook(f.workspace, { ...draft, id: created.id, expected: { teamRevision: current.teamRevision, definitionRevision: entry.revision }, authentication: { source: 'team', intent: 'keep' } }, 'discover'), { code: 'connection_field_required', field: 'tenant' });
});
test('source changes, disabled skills, malformed files and missing programs remain local diagnostics', async t => {
  const f = fixture(t), created = f.create(); f.source('source:replaced');
  assert.equal(f.app.get(f.workspace, created.id).instance.availability.ready, false);
  await assert.rejects(f.app.run(f.workspace, { id: created.id, expectedRevision: created.revision, args: ['read'] }));
  f.source('source:example'); f.enabled(false); assert.equal(f.app.get(f.workspace, created.id).instance.availability.ready, false); f.enabled(true);
  fs.writeFileSync(path.join(f.workspace, 'connections/instances/broken.yml'), '<<<<<<< conflict\npassword: do-not-disclose');
  const list = f.app.list(f.workspace); assert.equal(list.instances.length, 1); assert.equal(list.diagnostics.length, 1); assert.equal(JSON.stringify(list).includes('do-not-disclose'), false);
  fs.unlinkSync(path.join(f.directory, 'scripts/client.mjs')); const view = f.app.get(f.workspace, created.id).instance; assert.equal(view.availability.ready, true); assert.equal(view.programAvailability.cli.ready, false);
  assert.equal(f.app.save(f.workspace, created.id, { ...view, name: 'Save without dependency', authentication: { intent: 'keep' }, expected: f.expected() }).instance.name, 'Save without dependency');
});
test('HTTP routes enforce write authorization and use the same version and secret boundaries', async t => {
  const f = fixture(t), created = f.create(), http = createConnectionSkillsHttp(f.app); let authorized = 0;
  const context = { root: f.workspace, searchParams: new URLSearchParams(), authorizeWrite: () => { authorized++; }, readJsonBody: async () => ({ intent: 'replace', values: { username: 'person-user', password: 'personal-secret-456' }, expected: f.expected() }) };
  const read = await http.handle({ ...context, request: { method: 'GET' }, suffix: '/connection-skills/instances' }); assert.equal(authorized, 0); assert.equal(JSON.stringify(read).includes('team-secret-123'), false);
  const save = await http.handle({ ...context, request: { method: 'PUT' }, suffix: '/connection-skills/instances/example-one/auth' }); assert.equal(save?.status, 200); assert.equal(authorized, 1); assert.equal(JSON.stringify(save).includes('personal-secret-456'), false);
  assert.equal(await http.handle({ ...context, request: { method: 'GET' }, suffix: '/connections' }), null);
  const help = await f.app.help(f.workspace, created.id); assert.match(help.stdout, /independently supplied help/);
});
test('shared installed recipients survive different machine paths while old local execution and hook observations are rejected', { skip: process.platform === 'win32' }, async t => {
  const f = fixture(t), previousPath = process.env.PATH;
  t.after(() => { process.env.PATH = previousPath; });
  const first = path.join(f.root, 'installed-one'), second = path.join(f.root, 'installed-two'); fs.mkdirSync(first); fs.mkdirSync(second);
  const program = '#!' + process.execPath + '\n' + fs.readFileSync(path.join(f.directory, 'scripts/client.mjs'), 'utf8');
  for (const directory of [first, second]) fs.writeFileSync(path.join(directory, 'buildr-private-fixture'), program, { mode: 0o755 });
  process.env.PATH = first + path.delimiter + previousPath;
  const definition = { ...f.definition, programs: { cli: { kind: 'installed', executable: 'buildr-private-fixture' } }, hooks: { ...f.definition.hooks, probe: { program: 'cli', args: ['test'], effect: 'read' } } }; fs.writeFileSync(f.declaration, YAML.stringify(definition));
  // Use the current declaration observation after changing the delivery mechanism.
  const entry = f.app.definitions(f.workspace).definitions[0]!;
  const created = f.app.save(f.workspace, null, { id: 'installed-example', name: 'Private executable', binding: f.binding, config: { site: 'https://example.invalid/' }, authentication: { intent: 'replace', values: { username: 'team-user', password: 'team-secret-123' } }, expected: { teamRevision: 'absent', definitionRevision: entry.revision } }).instance;
  const sharedFile = path.join(f.workspace, created.sourcePath), before = fs.readFileSync(sharedFile);
  assert.equal(created.definition!.programRecipients.cli.executable, fs.realpathSync(path.join(first, 'buildr-private-fixture')));
  const result = await f.app.run(f.workspace, { id: created.id, expectedRevision: created.revision, args: ['independent-command'] }); assert.equal(JSON.parse(result.stdout).source, 'team');
  process.env.PATH = second + path.delimiter + previousPath;
  await assert.rejects(f.app.run(f.workspace, { id: created.id, expectedRevision: created.revision, args: ['independent-command'] }), /接收方/);
  const oldHook = { id: created.id, binding: f.binding, config: created.config, expected: { teamRevision: created.teamRevision, definitionRevision: created.definitionRevision }, authentication: { source: 'team', intent: 'keep' }, hook: 'probe' };
  await assert.rejects(f.app.hook(f.workspace, oldHook, 'test'), /接收方/);
  await assert.rejects(f.app.hook(f.workspace, oldHook, 'discover'), /接收方/);
  const otherMachine = new ConnectionSkillsApplication({ dataRoot: path.join(f.root, 'different-machine-profile'), catalog: f.app.catalog, resolveScope: () => ({ rootPath: f.workspace, workspaceId: 'fixture-workspace' }) });
  const current = otherMachine.get(f.workspace, created.id).instance;
  assert.equal(current.authentication.team.configured, true); assert.equal(current.authentication.source, 'team');
  assert.equal(current.definition!.declarationRevision, entry.declarationRevision); assert.notEqual(current.definitionRevision, entry.revision);
  assert.equal(current.definition!.programRecipients.cli.executable, fs.realpathSync(path.join(second, 'buildr-private-fixture')));
  assert.equal(JSON.parse((await otherMachine.run(f.workspace, { id: current.id, expectedRevision: current.revision, args: ['independent-command'] })).stdout).source, 'team');
  assert.equal((await otherMachine.hook(f.workspace, { ...oldHook, expected: { teamRevision: current.teamRevision, definitionRevision: current.definitionRevision } }, 'test')).status, 'success');
  assert.deepEqual(fs.readFileSync(sharedFile), before, 'machine observations and execution never rewrite shared authentication');
  process.env.PATH = first + path.delimiter + previousPath;
  assert.equal(f.app.get(f.workspace, created.id).instance.authentication.team.configured, true, 'another machine cannot invalidate the original shared group');
});
test('a missing secondary program only blocks its own actions and shared authentication remains editable without installed programs', { skip: process.platform === 'win32' }, async t => {
  const f = fixture(t), previousPath = process.env.PATH;
  t.after(() => { process.env.PATH = previousPath; });
  const directory = path.join(f.root, 'installed'); fs.mkdirSync(directory);
  const executable = path.join(directory, 'buildr-private-fixture');
  fs.writeFileSync(executable, '#!' + process.execPath + '\n' + fs.readFileSync(path.join(f.directory, 'scripts/client.mjs'), 'utf8'), { mode: 0o755 });
  process.env.PATH = directory + path.delimiter + previousPath;
  const definition = { ...f.definition, programs: { cli: { kind: 'installed', executable: 'buildr-private-fixture' }, exporter: { kind: 'installed', executable: 'buildr-fixture-missing-exporter' } }, hooks: { ...f.definition.hooks, probe: { program: 'cli', args: ['test'], effect: 'read' }, exportOptions: { program: 'exporter', args: ['options'], effect: 'read' } } };
  fs.writeFileSync(f.declaration, YAML.stringify(definition));
  const entry = f.app.definitions(f.workspace).definitions[0]!;
  const created = f.app.save(f.workspace, null, { id: 'optional-program', name: 'Optional exporter', binding: f.binding, config: { site: 'https://example.invalid/' }, authentication: { intent: 'replace', values: { username: 'team-user', password: 'team-secret-123' } }, expected: { teamRevision: 'absent', definitionRevision: entry.revision } }).instance;
  assert.equal(created.availability.ready, true); assert.equal(created.programAvailability.cli.ready, true); assert.equal(created.programAvailability.exporter.ready, false);
  assert.equal(created.definition!.programRecipients.exporter.executable, null);
  const hook = { id: created.id, binding: f.binding, config: created.config, expected: f.expected(created.id), authentication: { source: 'team', intent: 'keep' }, hook: 'probe' };
  assert.equal((await f.app.hook(f.workspace, hook, 'test')).status, 'success');
  assert.equal((await f.app.hook(f.workspace, hook, 'discover')).status, 'success');
  await assert.rejects(f.app.hook(f.workspace, { ...hook, hook: 'exportOptions' }, 'discover'), /未安装/);
  fs.unlinkSync(executable);
  const missing = f.app.get(f.workspace, created.id).instance;
  assert.equal(missing.authentication.team.configured, true); assert.equal(missing.programAvailability.cli.ready, false);
  const saved = f.app.save(f.workspace, created.id, { ...missing, name: 'Safely disabled', enabled: false, authentication: { intent: 'keep' }, expected: f.expected(created.id) }).instance;
  assert.equal(saved.enabled, false); assert.equal(saved.authentication.team.configured, true);
});
test('a version probe cannot replace the receiver before a draft hook hands over authentication', { skip: process.platform === 'win32' }, async t => {
  const f = fixture(t), previousPath = process.env.PATH;
  t.after(() => { process.env.PATH = previousPath; });
  const directory = path.join(f.root, 'installed'); fs.mkdirSync(directory);
  const original = path.join(directory, 'original'), replacement = path.join(directory, 'replacement'), command = path.join(directory, 'buildr-probe-fixture'), received = path.join(f.root, 'received-auth');
  const consume = `process.on('message',m=>{if(m.type==='buildr.connection-context'){fs.writeFileSync(${JSON.stringify(received)},'received');console.log(JSON.stringify({status:'success'}));process.disconnect();}});`;
  fs.writeFileSync(replacement, '#!' + process.execPath + "\nimport fs from 'node:fs';\n" + consume, { mode: 0o755 });
  fs.writeFileSync(original, '#!' + process.execPath + "\nimport fs from 'node:fs';\n" + `if(process.argv.includes('--version')){fs.unlinkSync(${JSON.stringify(command)});fs.symlinkSync(${JSON.stringify(replacement)},${JSON.stringify(command)});console.log('1.0.0');}else{${consume}}`, { mode: 0o755 });
  fs.symlinkSync(original, command); process.env.PATH = directory + path.delimiter + previousPath;
  const definition = { ...f.definition, programs: { cli: { kind: 'installed', executable: 'buildr-probe-fixture', version: { args: ['--version'], constraint: '>=1.0.0' } } } };
  fs.writeFileSync(f.declaration, YAML.stringify(definition));
  const entry = f.app.definitions(f.workspace).definitions[0]!;
  const created = f.app.save(f.workspace, null, { id: 'probe-example', name: 'Probe receiver', binding: f.binding, config: { site: 'https://example.invalid/' }, authentication: { intent: 'replace', values: { username: 'team-user', password: 'team-secret-123' } }, expected: { teamRevision: 'absent', definitionRevision: entry.revision } }).instance;
  assert.equal(fs.existsSync(received), false, 'catalog and saving do not execute a version probe');
  await assert.rejects(f.app.hook(f.workspace, { id: created.id, binding: f.binding, config: created.config, expected: f.expected(created.id), authentication: { source: 'team', intent: 'keep' } }, 'test'), /接收方/);
  assert.equal(fs.realpathSync(command), fs.realpathSync(replacement));
  assert.equal(fs.existsSync(received), false, 'neither old nor replacement program receives a private context after the probe changes its path');
});
test('timeout terminates the owned process group even when descendants keep output pipes open', { skip: process.platform === 'win32' }, async t => {
  const f = fixture(t), created = f.create(), started = Date.now();
  const result = await f.app.run(f.workspace, { id: created.id, expectedRevision: created.revision, args: ['descendants'], timeoutMs: 200 });
  assert.equal(result.status, 'timeout'); assert.ok(Date.now() - started < 2000);
  const directory = f.app.files.privateState({ rootPath: f.workspace, workspaceId: 'fixture-workspace' }, 'asset:example');
  const pid = Number(fs.readFileSync(path.join(directory, 'nested.pid'), 'utf8'));
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
});
test('disabled or missing methods preserve safe editing and explicit personal removal without allowing execution', async t => {
  const f = fixture(t), created = f.create();
  f.app.saveAuth(f.workspace, created.id, { intent: 'replace', values: { username: 'person-user', password: 'personal-secret-456' }, expected: f.expected() });
  f.enabled(false);
  const view = f.app.get(f.workspace, created.id).instance;
  assert.equal(f.app.save(f.workspace, created.id, { ...view, name: 'Still editable', authentication: { intent: 'keep' }, expected: f.expected() }).instance.name, 'Still editable');
  await assert.rejects(f.app.run(f.workspace, { id: created.id, expectedRevision: f.app.get(f.workspace, created.id).instance.revision, args: ['read'] }), /停用/);
  fs.unlinkSync(f.declaration);
  const before = fs.readFileSync(path.join(f.workspace, created.sourcePath), 'utf8');
  assert.throws(() => f.app.saveAuth(f.workspace, created.id, { intent: 'replace', values: { username: 'other', password: 'other-secret' }, expected: f.expected() }), /不可用/);
  assert.equal(f.app.saveAuth(f.workspace, created.id, { intent: 'remove', expected: f.expected() }).instance.authentication.personal.present, false);
  assert.equal(fs.readFileSync(path.join(f.workspace, created.sourcePath), 'utf8'), before);
});
