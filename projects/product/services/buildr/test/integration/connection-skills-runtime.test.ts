import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
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
  let sourceIdentity = 'source:example'; let enabled = true; let catalogReads = 0; let beforeCatalogRead: ((count: number) => void) | undefined;
  const catalog = createConnectionCatalog({ assets: { readSkills: () => { catalogReads++; beforeCatalogRead?.(catalogReads); return [{ id: 'example', path: 'connections/example', assetIdentity: 'asset:example', sourceIdentity, enabled, connectionDefinitions: ['assets/connection.yml'] }]; }, readSkillFile: (_root, _skill, relative) => { const content = fs.readFileSync(path.join(directory, relative), 'utf8'); return { content, digest: digest(content), directory, absolutePath: path.join(directory, relative) }; } } });
  const app = new ConnectionSkillsApplication({ dataRoot: path.join(root, 'local'), catalog, resolveScope: () => ({ rootPath: workspace, workspaceId: 'fixture-workspace' }) });
  const entry = app.definitions(workspace).definitions[0]!;
  const binding = { skillAssetIdentity: entry.skill.assetIdentity, sourceIdentity: entry.skill.sourceIdentity, definitionId: 'example', configVersion: 1 };
  const create = (id = 'example-one') => app.save(workspace, null, { id, name: id, binding, config: { site: 'https://example.invalid/' }, authentication: { intent: 'replace', values: { username: 'team-user', password: 'team-secret-123' } }, expected: { teamRevision: 'absent', definitionRevision: entry.revision } }).instance;
  const expected = (id = 'example-one') => { const v = app.get(workspace, id).instance; return { teamRevision: v.teamRevision, definitionRevision: v.definitionRevision, localRevision: v.localRevision }; };
  return { root, workspace, directory, declaration, definition, app, create, expected, binding, source: (value: string) => sourceIdentity = value, enabled: (value: boolean) => enabled = value, catalogReads: () => catalogReads, beforeCatalogRead: (callback?: (count: number) => void) => beforeCatalogRead = callback };
}
test('仅个人接入拒绝团队保存、草稿及运行，个人缺失不回退，未限制声明保持兼容', async t => {
  const f = fixture(t), created = f.create();
  const definition = structuredClone(f.definition); Object.assign(definition.authentication, { allowedSources: ['personal'] });
  fs.writeFileSync(f.declaration, YAML.stringify(definition));
  let view = f.app.get(f.workspace, created.id).instance;
  assert.equal(view.authentication.source, 'personal'); assert.equal(view.authentication.team.configured, false);
  assert.throws(() => f.app.save(f.workspace, view.id, { ...view, authentication: { intent: 'keep' }, expected: f.expected() }), { code: 'connection_skill_auth_source_denied' });
  assert.throws(() => f.app.save(f.workspace, null, { id: 'blocked', name: 'Blocked', binding: f.binding, config: created.config, authentication: { intent: 'replace', values: { username: 'team', password: 'fictional-team' } }, expected: { teamRevision: 'absent', definitionRevision: view.definitionRevision } }), { code: 'connection_skill_auth_source_denied' });
  await assert.rejects(f.app.hook(f.workspace, { id: view.id, binding: f.binding, config: created.config, expected: f.expected(), authentication: { source: 'team', intent: 'keep' } }, 'test'), { code: 'connection_skill_auth_source_denied' });
  await assert.rejects(f.app.run(f.workspace, { id: view.id, expectedRevision: view.revision, args: ['read'] }), { code: 'connection_skill_auth_missing' });
  view = f.app.save(f.workspace, view.id, { ...view, authentication: { intent: 'remove' }, expected: f.expected() }).instance;
  view = f.app.saveAuth(f.workspace, view.id, { intent: 'replace', values: { username: 'person-user', password: 'personal-secret-456' }, expected: f.expected() }).instance;
  const result = await f.app.run(f.workspace, { id: view.id, expectedRevision: view.revision, args: ['read'] });
  assert.equal(JSON.parse(result.stdout).source, 'personal');
  f.app.saveAuth(f.workspace, view.id, { intent: 'remove', expected: f.expected() });
  view = f.app.get(f.workspace, view.id).instance;
  await assert.rejects(f.app.run(f.workspace, { id: view.id, expectedRevision: view.revision, args: ['read'] }), { code: 'connection_skill_auth_missing' });
});

test('查看个人秘密只接受当前观察和单个声明秘密字段，普通读取不返回秘密', async t => {
  const f = fixture(t), created = f.create();
  assert.throws(() => f.app.revealPersonal(f.workspace, created.id, { field: 'password', expected: f.expected() }), { code: 'connection_skill_auth_missing' });
  f.app.saveAuth(f.workspace, created.id, { intent: 'replace', values: { username: 'person-user', password: 'personal-secret-456' }, expected: f.expected() });
  const expected = f.expected(), http = createConnectionSkillsHttp(f.app); let authorized = 0;
  assert.throws(() => f.app.revealPersonal(f.workspace, created.id, { field: 'username', expected }), { code: 'connection_skill_secret_field_invalid' });
  assert.throws(() => f.app.revealPersonal(f.workspace, created.id, { field: 'password', expected: { ...expected, localRevision: 'absent' } }), { code: 'connection_skill_revision_conflict' });
  const result = await http.handle({ root: f.workspace, suffix: `/connection-skills/instances/${created.id}/auth/reveal`, searchParams: new URLSearchParams(), request: { method: 'POST' }, authorizeWrite: () => { authorized++; }, readJsonBody: async () => ({ field: 'password', expected }) });
  assert.equal(authorized, 1); assert.deepEqual(result?.body, { field: 'password', value: 'personal-secret-456' });
  assert.equal(result && 'headers' in result ? result.headers['cache-control'] : undefined, 'no-store');
  assert.equal(JSON.stringify(f.app.get(f.workspace, created.id)).includes('personal-secret-456'), false);
  assert.equal(JSON.stringify(f.app.directory(f.workspace)).includes('personal-secret-456'), false);
});

test('团队认证仅在明确迁移动作内转换为个人，目标冲突保留双方', t => {
  const f = fixture(t), created = f.create();
  const definition = structuredClone(f.definition); Object.assign(definition.authentication, { allowedSources: ['personal'] }); fs.writeFileSync(f.declaration, YAML.stringify(definition));
  const expected = f.expected();
  const result = f.app.migrateAuth(f.workspace, created.id, { source: { id: created.id, authenticationSource: 'team', expected }, expected, removeSource: true });
  assert.equal(result.migrated, true); assert.equal(result.instance.authentication.source, 'personal'); assert.equal(result.instance.authentication.team.configured, false);
  assert.equal(JSON.stringify(result).includes('team-secret-123'), false);
  assert.equal(fs.readFileSync(path.join(f.workspace, result.instance.sourcePath), 'utf8').includes('team-secret-123'), false);
  assert.equal(f.app.revealPersonal(f.workspace, created.id, { field: 'password', expected: f.expected() }).value, 'team-secret-123');
  const target = f.app.save(f.workspace, null, { id: 'target', name: 'Target', binding: f.binding, config: created.config, authentication: { intent: 'remove' }, expected: { teamRevision: 'absent', definitionRevision: result.instance.definitionRevision } }).instance;
  f.app.saveAuth(f.workspace, target.id, { intent: 'replace', values: { username: 'another-user', password: 'different-private' }, expected: f.expected(target.id) });
  assert.throws(() => f.app.migrateAuth(f.workspace, target.id, { source: { id: created.id, authenticationSource: 'personal', expected: f.expected() }, expected: f.expected(target.id), removeSource: true }), { code: 'connection_skill_auth_migration_conflict' });
  assert.equal(f.app.get(f.workspace, created.id).instance.authentication.personal.present, true);
  assert.equal(f.app.revealPersonal(f.workspace, target.id, { field: 'password', expected: f.expected(target.id) }).value, 'different-private');
});

test('跨实例迁移可接续配置版本升级，认证接收方漂移仍阻止迁移', t => {
  const f = fixture(t), original = f.create();
  f.app.saveAuth(f.workspace, original.id, { intent: 'replace', values: { username: 'person-user', password: 'personal-secret-456' }, expected: f.expected() });
  const definition = structuredClone(f.definition); definition.configVersion = 2; Object.assign(definition.authentication, { allowedSources: ['personal'] }); fs.writeFileSync(f.declaration, YAML.stringify(definition));
  const entry = f.app.definitions(f.workspace).definitions[0]!, binding = { ...f.binding, configVersion: 2 };
  const create = (id: string, site: string) => f.app.save(f.workspace, null, { id, name: id, binding, config: { site }, authentication: { intent: 'remove' }, expected: { teamRevision: 'absent', definitionRevision: entry.revision } }).instance;
  const wrong = create('wrong', 'https://different.invalid/');
  assert.throws(() => f.app.migrateAuth(f.workspace, wrong.id, { source: { id: original.id, authenticationSource: 'personal', expected: f.expected() }, expected: f.expected(wrong.id), removeSource: true }), { code: 'connection_skill_auth_migration_target' });
  const target = create('merged', String(original.config.site));
  const result = f.app.migrateAuth(f.workspace, target.id, { source: { id: original.id, authenticationSource: 'personal', expected: f.expected() }, expected: f.expected(target.id), removeSource: true });
  assert.equal(result.instance.authentication.personal.configured, true); assert.equal(f.app.get(f.workspace, original.id).instance.authentication.personal.present, false);
  assert.equal(f.app.revealPersonal(f.workspace, target.id, { field: 'password', expected: f.expected(target.id) }).value, 'personal-secret-456');
});

test('个人密文在工作空间忽略目录按当前profile隔离，旧资料只在明确迁移后删除', t => {
  const f = fixture(t), created = f.create(), scope = { rootPath: f.workspace, workspaceId: 'fixture-workspace' };
  f.app.saveAuth(f.workspace, created.id, { intent: 'replace', values: { username: 'person-user', password: 'personal-secret-456' }, expected: f.expected() });
  const file = path.join(f.workspace, '.buildr/local/connection-skills', digest(f.app.files.dataRoot), `${created.id}.json`);
  const legacy = path.join(f.app.files.dataRoot, digest([scope.workspaceId, scope.rootPath]), `${created.id}.json`);
  const bytes = fs.readFileSync(file); assert.equal(bytes.includes('personal-secret-456'), false); assert.equal(bytes.includes('person-user'), false);
  assert.equal(fs.existsSync(path.join(path.dirname(file), 'key.json')), false);
  if (process.platform !== 'win32') { assert.equal(fs.statSync(file).mode & 0o777, 0o600); assert.equal(fs.statSync(path.dirname(file)).mode & 0o777, 0o700); }
  fs.mkdirSync(path.dirname(legacy), { recursive: true, mode: 0o700 }); fs.renameSync(file, legacy);
  const observed = f.app.get(f.workspace, created.id).instance; assert.equal(observed.authentication.personal.configured, true);
  assert.equal(fs.existsSync(file), false, '读取不能迁移'); assert.equal(fs.existsSync(legacy), true);
  const relocated = f.app.relocateAuth(f.workspace, created.id, { expected: f.expected() });
  assert.equal(relocated.instance.revision, observed.revision); assert.deepEqual(fs.readFileSync(file), bytes); assert.equal(fs.existsSync(legacy), false);
  fs.writeFileSync(legacy, JSON.stringify({ different: 'record' }), { mode: 0o600 });
  assert.equal(f.app.files.readLocal(scope, created.id).present, true); assert.match(f.app.files.readLocal(scope, created.id).diagnostic!, /同时存在/);
  assert.throws(() => f.app.relocateAuth(f.workspace, created.id, { expected: f.expected() }), { code: 'connection_skill_observation_unavailable' });
  assert.deepEqual(fs.readFileSync(file), bytes); assert.equal(fs.existsSync(legacy), true);
});

test('迁移保全后来源移除失败明确报告已知事实，不回滚个人组或盲目重试', t => {
  const f = fixture(t), created = f.create(), expected = f.expected();
  const write = t.mock.method(f.app.files, 'writeTeam', () => { throw new Error('simulated source write failure'); });
  assert.throws(() => f.app.migrateAuth(f.workspace, created.id, { source: { id: created.id, authenticationSource: 'team', expected }, expected, removeSource: true }), error => {
    assert.equal((error as any).code, 'connection_skill_auth_migration_partial');
    assert.deepEqual((error as any).details, { targetPreserved: true, durability: 'confirmed', targetId: created.id, sourceId: created.id, sourceRemoval: 'unresolved' });
    assert.equal(JSON.stringify(error).includes('team-secret-123'), false); return true;
  });
  write.mock.restore();
  const observed = f.app.get(f.workspace, created.id).instance;
  assert.equal(observed.authentication.personal.configured, true); assert.equal(observed.authentication.team.present, true);
  assert.equal(f.app.revealPersonal(f.workspace, created.id, { field: 'password', expected: f.expected() }).value, 'team-secret-123');
});

test('目录同步失败时旧个人文件仍保留，可读目标不能冒充持久保全', t => {
  const f = fixture(t), created = f.create(), scope = { rootPath: f.workspace, workspaceId: 'fixture-workspace' };
  f.app.saveAuth(f.workspace, created.id, { intent: 'replace', values: { username: 'person-user', password: 'personal-secret-456' }, expected: f.expected() });
  const directory = path.join(f.workspace, '.buildr/local/connection-skills', digest(f.app.files.dataRoot)), file = path.join(directory, `${created.id}.json`);
  const legacy = path.join(f.app.files.dataRoot, digest([scope.workspaceId, scope.rootPath]), `${created.id}.json`), bytes = fs.readFileSync(file);
  fs.mkdirSync(path.dirname(legacy), { recursive: true, mode: 0o700 }); fs.renameSync(file, legacy);
  const synchronize = fs.fsyncSync;
  const sync = t.mock.method(fs, 'fsyncSync', (descriptor: number) => {
    const current = fs.fstatSync(descriptor), target = fs.statSync(directory);
    if (current.isDirectory() && current.dev === target.dev && current.ino === target.ino) throw Object.assign(new Error('simulated directory sync failure'), { code: 'EIO' });
    return synchronize(descriptor);
  });
  assert.throws(() => f.app.relocateAuth(f.workspace, created.id, { expected: f.expected() }), error => {
    assert.equal((error as any).code, 'connection_skill_auth_durability_unconfirmed');
    assert.deepEqual((error as any).details, { targetReadable: true, durability: 'unconfirmed', sourceRemoval: 'not-attempted' }); return true;
  });
  sync.mock.restore(); assert.deepEqual(fs.readFileSync(legacy), bytes); assert.deepEqual(fs.readFileSync(file), bytes);
});

test('目标目录同步失败不移除团队或其他实例个人来源，重用可读目标仍须确认持久化', async t => {
  for (const authenticationSource of ['team', 'personal'] as const) await t.test(authenticationSource, t => {
    const f = fixture(t), original = f.create();
    if (authenticationSource === 'personal') f.app.saveAuth(f.workspace, original.id, { intent: 'replace', values: { username: 'person-user', password: 'personal-secret-456' }, expected: f.expected() });
    const target = authenticationSource === 'team' ? original : f.create('target');
    const directory = path.join(f.workspace, '.buildr/local/connection-skills', digest(f.app.files.dataRoot));
    const sourceFile = authenticationSource === 'team' ? path.join(f.workspace, original.sourcePath) : path.join(directory, `${original.id}.json`);
    const sourceBytes = fs.readFileSync(sourceFile), synchronize = fs.fsyncSync; let attempts = 0;
    const sync = t.mock.method(fs, 'fsyncSync', (descriptor: number) => {
      const current = fs.fstatSync(descriptor);
      if (current.isDirectory()) {
        const saved = fs.statSync(directory);
        if (current.dev === saved.dev && current.ino === saved.ino) { attempts++; throw Object.assign(new Error('directory sync unsupported'), { code: 'ENOTSUP' }); }
      }
      return synchronize(descriptor);
    });
    for (let retry = 0; retry < 2; retry++) {
      assert.throws(() => f.app.migrateAuth(f.workspace, target.id, { source: { id: original.id, authenticationSource, expected: f.expected(original.id) }, expected: f.expected(target.id), removeSource: true }), error => {
        assert.equal((error as any).code, 'connection_skill_auth_durability_unconfirmed');
        assert.equal((error as any).details.targetReadable, true); assert.equal((error as any).details.durability, 'unconfirmed'); return true;
      });
      assert.deepEqual(fs.readFileSync(sourceFile), sourceBytes);
    }
    sync.mock.restore(); assert.equal(attempts, 2);
  });
});

test('密钥同步失败也不能在密文即时可读后移除唯一团队来源', t => {
  const f = fixture(t), created = f.create(), sourceFile = path.join(f.workspace, created.sourcePath), sourceBytes = fs.readFileSync(sourceFile);
  const synchronize = fs.fsyncSync, keyFile = path.join(f.app.files.dataRoot, 'key.json');
  const sync = t.mock.method(fs, 'fsyncSync', (descriptor: number) => {
    const current = fs.fstatSync(descriptor), key = fs.statSync(keyFile);
    if (current.isFile() && current.dev === key.dev && current.ino === key.ino) throw Object.assign(new Error('simulated key sync failure'), { code: 'EIO' });
    return synchronize(descriptor);
  });
  const expected = f.expected();
  assert.throws(() => f.app.migrateAuth(f.workspace, created.id, { source: { id: created.id, authenticationSource: 'team', expected }, expected, removeSource: true }), { code: 'connection_skill_auth_durability_unconfirmed' });
  sync.mock.restore(); assert.deepEqual(fs.readFileSync(sourceFile), sourceBytes);
});

test('Git 工作空间写个人认证前必须证明目录被忽略且未跟踪', t => {
  const f = fixture(t), created = f.create();
  const git = (args: string[]) => spawnSync('git', ['-C', f.workspace, ...args], { encoding: 'utf8' });
  assert.equal(git(['init', '--quiet']).status, 0);
  const save = () => f.app.saveAuth(f.workspace, created.id, { intent: 'replace', values: { username: 'person-user', password: 'personal-secret-456' }, expected: f.expected() });
  assert.throws(save, { code: 'connection_skill_auth_not_ignored' });
  assert.equal(f.app.get(f.workspace, created.id).instance.authentication.personal.present, false);
  fs.writeFileSync(path.join(f.workspace, '.gitignore'), '/.buildr/local/\n'); save();
  const relative = `.buildr/local/connection-skills/${digest(f.app.files.dataRoot)}/${created.id}.json`;
  assert.equal(git(['add', '--force', '--', relative]).status, 0);
  assert.throws(save, { code: 'connection_skill_auth_not_ignored' });
});

test('网站投影仅在覆盖缺失或空白时显式回落，保留默认值、安全过滤与旧声明', t => {
  const f = fixture(t), created = f.create(), file = path.join(f.workspace, created.sourcePath);
  const definition: any = structuredClone(f.definition);
  definition.config.fields.push({ key: 'console', label: '网站覆盖', type: 'url' });
  definition.presentation = { summaryFields: ['site'], websiteField: 'console', websiteFallbackField: 'site' };
  fs.writeFileSync(f.declaration, YAML.stringify(definition));
  const saved = YAML.parse(fs.readFileSync(file, 'utf8'));
  const base = 'https://api.example.invalid/prefix/', override = 'https://console.example.invalid/app/#/';
  const observe = (config: Record<string, unknown>) => {
    fs.writeFileSync(file, YAML.stringify({ ...saved, config }));
    const before = fs.readFileSync(file, 'utf8'), view = f.app.get(f.workspace, created.id).instance;
    assert.equal(fs.readFileSync(file, 'utf8'), before, '网站选择不能改写配置或认证');
    return view;
  };
  assert.equal(observe({ site: base, console: override }).websiteUrl, override);
  assert.equal(observe({ site: base }).websiteUrl, base);
  for (const console of ['', ' \t ']) {
    const view = observe({ site: base, console });
    assert.equal(view.websiteUrl, base);
    assert.ok(view.availability.diagnostics.some(message => message.includes('网站覆盖')), '空白源值的整体配置诊断仍保留');
  }
  const unsafe = ['not a url', 'javascript:alert(1)', 'file:///private', 'https://reader:secret@example.invalid/', 'https://example.invalid/?access_token=secret', 'https://example.invalid/#/app?token=secret'];
  for (const console of [...unsafe, 5]) assert.equal(observe({ site: base, console }).websiteUrl, null, '非法非空覆盖不能换用合法基础地址');
  for (const site of unsafe) assert.equal(observe({ site }).websiteUrl, null, '回落目标同样经过安全校验');
  definition.config.fields[1].default = override;
  fs.writeFileSync(f.declaration, YAML.stringify(definition));
  assert.equal(observe({ site: base }).websiteUrl, override, '已声明的网站默认值优先于回落');
  delete definition.config.fields[1].default;
  definition.config.fields[0].default = base;
  fs.writeFileSync(f.declaration, YAML.stringify(definition));
  assert.equal(observe({}).websiteUrl, base, '已声明的基础地址默认值仍生效');
  delete definition.presentation.websiteFallbackField;
  fs.writeFileSync(f.declaration, YAML.stringify(definition));
  assert.equal(observe({ site: base }).websiteUrl, null, '旧声明不从其他网址字段猜测回落');
  assert.equal(observe({ site: base, console: override }).websiteUrl, override);
  delete definition.presentation.websiteField;
  fs.writeFileSync(f.declaration, YAML.stringify(definition));
  assert.equal(observe({ site: base, console: override }).websiteUrl, null, '没有网站声明时不猜字段');
});
test('one read phase observes the catalog once and saves retain a separate write observation', async t => {
  const f = fixture(t);
  let before = f.catalogReads(); const created = f.create(); assert.equal(f.catalogReads() - before, 2, 'saving observes once for validation and once immediately before writing');
  before = f.catalogReads(); const current = f.app.get(f.workspace, created.id).instance; assert.equal(f.catalogReads() - before, 1);
  before = f.catalogReads(); f.app.list(f.workspace); assert.equal(f.catalogReads() - before, 1);
  before = f.catalogReads(); const directory = f.app.directory(f.workspace); assert.equal(f.catalogReads() - before, 1); assert.equal(directory.instances[0]?.definition, directory.definitions[0], 'directory rows and choices use the same observed entry');
  before = f.catalogReads(); assert.equal(f.app.check(f.workspace, created.id).ready, true); assert.equal(f.catalogReads() - before, 1);
  before = f.catalogReads(); assert.match((await f.app.help(f.workspace, created.id)).stdout, /independently supplied help/); assert.equal(f.catalogReads() - before, 1);
  before = f.catalogReads(); assert.equal(f.app.useSelected(f.workspace, { id: created.id, expectedRevision: current.revision }, selected => selected.connection.config.site), 'https://example.invalid/'); assert.equal(f.catalogReads() - before, 1);
  before = f.catalogReads(); const saved = f.app.save(f.workspace, created.id, { ...current, name: 'Renamed', authentication: { intent: 'keep' }, expected: { teamRevision: current.teamRevision, definitionRevision: current.definitionRevision } }).instance; assert.equal(saved.name, 'Renamed'); assert.equal(f.catalogReads() - before, 2);
  before = f.catalogReads(); const personal = f.app.saveAuth(f.workspace, created.id, { intent: 'replace', values: { username: 'person-user', password: 'personal-secret-456' }, expected: { teamRevision: saved.teamRevision, definitionRevision: saved.definitionRevision, localRevision: saved.localRevision } }).instance; assert.equal(personal.authentication.source, 'personal'); assert.equal(f.catalogReads() - before, 2);
  before = f.catalogReads(); const removed = f.app.saveAuth(f.workspace, created.id, { intent: 'remove', expected: { teamRevision: personal.teamRevision, definitionRevision: personal.definitionRevision, localRevision: personal.localRevision } }).instance; assert.equal(removed.authentication.source, 'team'); assert.equal(f.catalogReads() - before, 1);
});
test('directory requests observe current sources independently and retain valid definitions beside broken instances', t => {
  const f = fixture(t), created = f.create();
  let before = f.catalogReads(); const first = f.app.directory(f.workspace); assert.equal(f.catalogReads() - before, 1); assert.equal(first.instances[0]?.availability.ready, true);
  assert.equal(JSON.stringify(first).includes('team-secret-123'), false);
  fs.writeFileSync(f.declaration, YAML.stringify({ ...f.definition, name: 'Fresh source' }));
  before = f.catalogReads(); const next = f.app.directory(f.workspace); assert.equal(f.catalogReads() - before, 1); assert.equal(next.definitions[0]?.definition.name, 'Fresh source'); assert.notEqual(next.definitions[0]?.revision, first.definitions[0]?.revision);
  const file = path.join(f.workspace, created.sourcePath); fs.writeFileSync(file, '<<<<<<< conflict\npassword: hidden-fixture-secret');
  before = f.catalogReads(); const broken = f.app.directory(f.workspace); assert.equal(f.catalogReads() - before, 1); assert.equal(broken.instances.length, 0); assert.equal(broken.definitions.length, 1); assert.equal(broken.diagnostics.length, 1); assert.equal(JSON.stringify(broken).includes('hidden-fixture-secret'), false);
  fs.unlinkSync(path.join(f.directory, 'SKILL.md'));
  before = f.catalogReads(); const unavailable = f.app.directory(f.workspace); assert.equal(f.catalogReads() - before, 1); assert.equal(unavailable.definitions.length, 0); assert.equal(unavailable.diagnostics.filter(item => 'code' in item && item.code === 'connection_skill_entry_invalid').length, 1, 'catalog diagnostics appear once');
});
test('directory resolves scope once and source failure does not hide team-file diagnostics', t => {
  const f = fixture(t), created = f.create(); let scopeReads = 0;
  const app = new ConnectionSkillsApplication({ dataRoot: path.join(f.root, 'local'), catalog: f.app.catalog, resolveScope: () => { scopeReads++; return { rootPath: f.workspace, workspaceId: 'fixture-workspace' }; } });
  f.source('changed-source');
  const result = app.directory(f.workspace); assert.equal(scopeReads, 1); assert.equal(result.instances[0]?.id, created.id); assert.equal(result.instances[0]?.availability.ready, false); assert.equal(result.definitions.length, 1);
  // A team-directory defect is independent from catalog availability.
  const list = t.mock.method(app.files, 'listTeam', () => { throw new Error('Team directory unavailable'); });
  const broken = app.directory(f.workspace); assert.equal(broken.instances.length, 0); assert.equal(broken.definitions.length, 1); assert.equal(broken.diagnostics.length, 1);
  list.mock.restore();
});
test('saving still rejects declaration and source drift at the independent write observation', t => {
  for (const drift of ['declaration', 'source'] as const) {
    const f = fixture(t), created = f.create(), file = path.join(f.workspace, created.sourcePath), original = fs.readFileSync(file, 'utf8'), before = f.catalogReads();
    f.beforeCatalogRead(count => { if (count !== before + 2) return; if (drift === 'source') f.source('changed-source'); else fs.writeFileSync(f.declaration, YAML.stringify({ ...f.definition, name: 'Changed declaration' })); });
    assert.throws(() => f.app.save(f.workspace, created.id, { ...created, name: 'Must not persist', authentication: { intent: 'keep' }, expected: { teamRevision: created.teamRevision, definitionRevision: created.definitionRevision } }), { code: drift === 'source' ? 'connection_skill_definition_unavailable' : 'connection_skill_revision_conflict' });
    assert.equal(f.catalogReads() - before, 2); assert.equal(fs.readFileSync(file, 'utf8'), original);
  }
});
test('personal authentication still rejects a source change before writing its group', t => {
  const f = fixture(t), created = f.create(), before = f.catalogReads();
  f.beforeCatalogRead(count => { if (count === before + 2) f.source('changed-source'); });
  assert.throws(() => f.app.saveAuth(f.workspace, created.id, { intent: 'replace', values: { username: 'person-user', password: 'personal-secret-456' }, expected: { teamRevision: created.teamRevision, definitionRevision: created.definitionRevision, localRevision: created.localRevision } }), { code: 'connection_skill_definition_unavailable' });
  assert.equal(f.catalogReads() - before, 2); assert.equal(f.app.files.readLocal({ rootPath: f.workspace, workspaceId: 'fixture-workspace' }, created.id).present, false);
});
test('multiple contexts share each observation phase while IPC revalidation observes the current source again', async t => {
  const f = fixture(t), first = f.create(), second = f.create('example-two');
  let before = f.catalogReads(); const compared = await f.app.run(f.workspace, { id: first.id, expectedRevision: first.revision, contexts: { compare: { id: second.id, revision: second.revision } }, args: ['read'] });
  assert.equal(JSON.parse(compared.stdout).hasCompare, true); assert.equal(f.catalogReads() - before, 2, 'selection and pre-handoff phases each observe once for all contexts');
  before = f.catalogReads(); const running = f.app.run(f.workspace, { id: first.id, expectedRevision: first.revision, args: ['wait'] }); f.source('changed-source');
  assert.equal(JSON.parse((await running).stdout).revalidated, false); assert.equal(f.catalogReads() - before, 3, 'IPC revalidation requires a fresh third observation');
});
test('dynamic field labels stay display-only, preserve old clients and protect both authentication groups', t => {
  const f = fixture(t), definition: any = structuredClone(f.definition);
  definition.config.fields.push({ key: 'view', label: '视图', type: 'select', required: true, optionsFrom: 'views' });
  definition.hooks.views = { program: 'cli', args: ['views'], effect: 'read', inputs: ['config.site', 'authentication.username', 'authentication.password'] };
  fs.writeFileSync(f.declaration, YAML.stringify(definition));
  const entry = f.app.definitions(f.workspace).definitions[0]!, label = 'Main view team-secret-123 personal-secret-456';
  const created = f.app.save(f.workspace, null, { id: 'labeled-view', name: 'Labeled', binding: f.binding, config: { site: 'https://example.invalid/', view: 'view-id' }, fieldLabels: { view: { value: 'view-id', label } }, authentication: { intent: 'replace', values: { username: 'team-user', password: 'team-secret-123' } }, expected: { teamRevision: 'absent', definitionRevision: entry.revision } }).instance;
  assert.equal(created.fieldLabels.view.value, 'view-id'); assert.equal(created.fieldLabels.view.label, 'Main view [已隐藏] personal-secret-456'); assert.equal(created.authentication.team.configured, true);
  const personal = f.app.saveAuth(f.workspace, created.id, { intent: 'replace', values: { username: 'person-user', password: 'personal-secret-456' }, expected: { teamRevision: created.teamRevision, definitionRevision: created.definitionRevision, localRevision: created.localRevision } }).instance;
  assert.equal(personal.fieldLabels.view.label, 'Main view [已隐藏] [已隐藏]');
  f.app.useSelected(f.workspace, { id: created.id, expectedRevision: personal.revision }, selected => {
    assert.deepEqual(selected.connection.config, { site: 'https://example.invalid/', view: 'view-id' }); assert.equal('fieldLabels' in selected.connection, false);
  });
  const { fieldLabels: _labels, ...oldClient } = personal;
  const preserved = f.app.save(f.workspace, created.id, { ...oldClient, name: 'Old client save', authentication: { intent: 'keep' }, expected: { teamRevision: personal.teamRevision, definitionRevision: personal.definitionRevision } }).instance;
  const file = path.join(f.workspace, preserved.sourcePath);
  assert.equal(preserved.fieldLabels.view.label, 'Main view [已隐藏] [已隐藏]'); assert.equal(YAML.parse(fs.readFileSync(file, 'utf8')).fieldLabels.view.label, 'Main view [已隐藏] [已隐藏]', 'team saves remove known private text from stored display metadata');
  const before = fs.readFileSync(file, 'utf8');
  assert.throws(() => f.app.save(f.workspace, created.id, { ...preserved, fieldLabels: { site: { value: preserved.config.site, label: 'Invalid label on a URL field' } }, authentication: { intent: 'keep' }, expected: { teamRevision: preserved.teamRevision, definitionRevision: preserved.definitionRevision } }), { code: 'connection_skill_field_labels_invalid' });
  assert.equal(fs.readFileSync(file, 'utf8'), before);
  const cleared = f.app.save(f.workspace, created.id, { ...preserved, fieldLabels: {}, authentication: { intent: 'keep' }, expected: { teamRevision: preserved.teamRevision, definitionRevision: preserved.definitionRevision } }).instance;
  assert.deepEqual(cleared.fieldLabels, {});
});
test('stored display names cannot reveal known secrets after account rotation or removal', t => {
  const f = fixture(t), definition: any = structuredClone(f.definition);
  definition.config.fields.push({ key: 'view', label: '视图', type: 'select', required: true, optionsFrom: 'views' });
  definition.hooks.views = { program: 'cli', args: ['views'], effect: 'read', inputs: ['config.site', 'authentication.username', 'authentication.password'] };
  fs.writeFileSync(f.declaration, YAML.stringify(definition)); const entry = f.app.definitions(f.workspace).definitions[0]!;
  let current = f.app.save(f.workspace, null, { id: 'safe-label', name: 'Safe label', binding: f.binding, config: { site: 'https://example.invalid/', view: 'view-id' }, fieldLabels: { view: { value: 'view-id', label: 'Main team-secret-123' } }, authentication: { intent: 'replace', values: { username: 'team-user', password: 'team-secret-123' } }, expected: { teamRevision: 'absent', definitionRevision: entry.revision } }).instance;
  const file = path.join(f.workspace, current.sourcePath); assert.equal(fs.readFileSync(file, 'utf8').includes('label: Main team-secret-123'), false);
  current = f.app.saveAuth(f.workspace, current.id, { intent: 'replace', values: { username: 'person-user', password: 'personal-secret-456' }, expected: { teamRevision: current.teamRevision, definitionRevision: current.definitionRevision, localRevision: current.localRevision } }).instance;
  current = f.app.save(f.workspace, current.id, { ...current, fieldLabels: { view: { value: 'view-id', label: 'Main team-secret-123 personal-secret-456 rotated-team-secret' } }, authentication: { intent: 'replace', values: { username: 'rotated-user', password: 'rotated-team-secret' } }, expected: { teamRevision: current.teamRevision, definitionRevision: current.definitionRevision } }).instance;
  assert.equal(current.fieldLabels.view.label, 'Main [已隐藏] [已隐藏] [已隐藏]');
  const teamBeforePersonalRemoval = fs.readFileSync(file, 'utf8');
  current = f.app.saveAuth(f.workspace, current.id, { intent: 'remove', expected: { teamRevision: current.teamRevision, definitionRevision: current.definitionRevision, localRevision: current.localRevision } }).instance;
  assert.equal(fs.readFileSync(file, 'utf8'), teamBeforePersonalRemoval, 'removing a personal group never changes shared metadata');
  current = f.app.save(f.workspace, current.id, { ...current, authentication: { intent: 'remove' }, expected: { teamRevision: current.teamRevision, definitionRevision: current.definitionRevision } }).instance;
  const observed = f.app.get(f.workspace, current.id).instance; assert.equal(observed.fieldLabels.view.label, 'Main [已隐藏] [已隐藏] [已隐藏]');
  const output = JSON.stringify(observed); for (const secret of ['team-secret-123', 'personal-secret-456', 'rotated-team-secret']) assert.equal(output.includes(secret), false);
});
test('stored invalid labels degrade locally and old labels do not follow an authentication target change', t => {
  const f = fixture(t), definition: any = structuredClone(f.definition);
  definition.config.fields.push({ key: 'view', label: '视图', type: 'select', required: true, optionsFrom: 'views' });
  definition.hooks.views = { program: 'cli', args: ['views'], effect: 'read', inputs: ['config.site', 'authentication.username', 'authentication.password'] };
  fs.writeFileSync(f.declaration, YAML.stringify(definition)); const entry = f.app.definitions(f.workspace).definitions[0]!;
  const created = f.app.save(f.workspace, null, { id: 'stored-labels', name: 'Stored labels', binding: f.binding, config: { site: 'https://example.invalid/', view: 'view-id' }, fieldLabels: { view: { value: 'view-id', label: 'Original view' } }, authentication: { intent: 'replace', values: { username: 'team-user', password: 'team-secret-123' } }, expected: { teamRevision: 'absent', definitionRevision: entry.revision } }).instance;
  const file = path.join(f.workspace, created.sourcePath), raw = YAML.parse(fs.readFileSync(file, 'utf8'));
  raw.fieldLabels = { view: { value: 'different-id', label: 'Must not be displayed' }, site: { value: created.config.site, label: 'Undeclared metadata' }, malformed: ['invalid'] };
  fs.writeFileSync(file, YAML.stringify(raw)); const current = f.app.get(f.workspace, created.id).instance;
  assert.deepEqual(current.fieldLabels, {}); assert.equal(current.availability.ready, true); assert.equal(current.authentication.team.configured, true);
  raw.fieldLabels = { view: { value: 'view-id', label: 'Original view' } }; fs.writeFileSync(file, YAML.stringify(raw)); const source = f.app.get(f.workspace, created.id).instance;
  const { fieldLabels: _labels, ...oldClient } = source;
  const moved = f.app.save(f.workspace, created.id, { ...oldClient, config: { ...source.config, site: 'https://changed.invalid/' }, authentication: { intent: 'replace', values: { username: 'team-user', password: 'team-secret-123' } }, expected: { teamRevision: source.teamRevision, definitionRevision: source.definitionRevision } }).instance;
  assert.deepEqual(moved.fieldLabels, {}); assert.equal(moved.authentication.team.configured, true);
});
test('label text cannot reveal stored authentication after source or secret classification drift', t => {
  const f = fixture(t), definition: any = structuredClone(f.definition);
  definition.config.fields.push({ key: 'view', label: '视图', type: 'select', required: true, optionsFrom: 'views' });
  definition.hooks.views = { program: 'cli', args: ['views'], effect: 'read', inputs: ['config.site', 'authentication.username', 'authentication.password'] };
  fs.writeFileSync(f.declaration, YAML.stringify(definition)); const entry = f.app.definitions(f.workspace).definitions[0]!;
  const created = f.app.save(f.workspace, null, { id: 'private-label', name: 'Private label', binding: f.binding, config: { site: 'https://example.invalid/', view: 'view-id' }, fieldLabels: { view: { value: 'view-id', label: 'team-secret-123 personal-secret-456' } }, authentication: { intent: 'replace', values: { username: 'team-user', password: 'team-secret-123' } }, expected: { teamRevision: 'absent', definitionRevision: entry.revision } }).instance;
  f.app.saveAuth(f.workspace, created.id, { intent: 'replace', values: { username: 'person-user', password: 'personal-secret-456' }, expected: { teamRevision: created.teamRevision, definitionRevision: created.definitionRevision, localRevision: created.localRevision } });
  f.source('replacement-source'); const unavailable = f.app.get(f.workspace, created.id).instance;
  assert.deepEqual(unavailable.fieldLabels, {}); assert.equal(unavailable.availability.ready, false); assert.equal(unavailable.config.view, 'view-id');
  f.source('source:example'); definition.authentication.fields.find((field: { key: string }) => field.key === 'password').type = 'string'; fs.writeFileSync(f.declaration, YAML.stringify(definition));
  const reclassified = f.app.get(f.workspace, created.id).instance;
  assert.deepEqual(reclassified.fieldLabels, {}); assert.equal(reclassified.authentication.team.configured, false); assert.equal(reclassified.authentication.personal.configured, false); assert.equal(reclassified.config.view, 'view-id');
  const output = JSON.stringify(f.app.list(f.workspace)); assert.equal(output.includes('team-secret-123'), false); assert.equal(output.includes('personal-secret-456'), false);
  const repaired = f.app.save(f.workspace, reclassified.id, { ...reclassified, fieldLabels: { view: { value: 'view-id', label: 'team-user team-secret-123 person-user personal-secret-456' } }, authentication: { intent: 'remove' }, expected: { teamRevision: reclassified.teamRevision, definitionRevision: reclassified.definitionRevision } }).instance;
  const stored = YAML.parse(fs.readFileSync(path.join(f.workspace, repaired.sourcePath), 'utf8'));
  assert.equal(stored.fieldLabels.view.label, '[已隐藏] [已隐藏] [已隐藏] [已隐藏]', 'invalid historical groups conservatively protect all former string values when resaving labels');
});
test('unknown provider: source discovery is read-only, shared files and local complete override stay independent', async t => {
  const f = fixture(t); assert.deepEqual(f.app.list(f.workspace).instances, []); assert.equal(fs.existsSync(path.join(f.root, 'local')), false);
  const created = f.create(); assert.equal(created.authentication.source, 'team'); assert.equal(JSON.stringify(created).includes('team-secret-123'), false);
  const shared = path.join(f.workspace, created.sourcePath), before = fs.readFileSync(shared, 'utf8'); assert.ok(before.includes('team-secret-123'));
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
  const before = f.catalogReads(), directory = await http.handle({ ...context, request: { method: 'GET' }, suffix: '/connection-skills/directory' }); assert.equal(directory?.status, 200); assert.equal(authorized, 0); assert.equal(f.catalogReads() - before, 1); assert.deepEqual(Object.keys(directory!.body).sort(), ['definitions', 'diagnostics', 'instances']); assert.equal(JSON.stringify(directory).includes('team-secret-123'), false);
  await assert.rejects(() => http.handle({ ...context, request: { method: 'GET' }, suffix: '/connection-skills/directory', searchParams: new URLSearchParams('unknown=1') }), { code: 'connection_skill_query_invalid' });
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

test('retirement warnings stay separate from instance availability and offline help never retires data', async t => {
  const f = fixture(t), created = f.create(); let attempts = 0;
  const app = new ConnectionSkillsApplication({ dataRoot: path.join(f.root, 'local'), catalog: f.app.catalog, resolveScope: f.app.resolveScope, retire: () => { attempts++; return ['旧连接数据清理未完成：测试残留']; } });
  const result = app.list(f.workspace);
  assert.equal(result.diagnostics.length, 1); assert.equal(result.instances[0]!.availability.ready, true);
  assert.equal(attempts, 1);
  const before = f.catalogReads(), directory = app.directory(f.workspace);
  assert.equal(attempts, 2); assert.equal(f.catalogReads() - before, 1);
  assert.equal(directory.diagnostics.length, 1); assert.equal(directory.instances[0]!.availability.ready, true); assert.equal(directory.definitions.length, 1);
  const view = app.get(f.workspace, created.id).instance;
  await app.help(f.workspace, created.id, 'cli');
  assert.equal(attempts, 2); assert.equal(view.availability.ready, true);
  const beforeTeamRead: number[] = [];
  const list = t.mock.method(app.files, 'listTeam', () => { beforeTeamRead.push(attempts); throw new Error('Team directory unavailable'); });
  try {
    const brokenList = app.list(f.workspace);
    assert.equal(attempts, 3); assert.equal(brokenList.instances.length, 0);
    assert.deepEqual(brokenList.diagnostics.map(item => item.message), ['旧连接数据清理未完成：测试残留', '连接资料不可读取或格式无效；已保留原文件。']);
    const brokenDirectory = app.directory(f.workspace);
    assert.equal(attempts, 4); assert.equal(brokenDirectory.instances.length, 0); assert.equal(brokenDirectory.definitions.length, 1);
    assert.deepEqual(brokenDirectory.diagnostics.map(item => item.message), ['旧连接数据清理未完成：测试残留', '连接资料不可读取或格式无效；已保留原文件。']);
    assert.deepEqual(beforeTeamRead, [3, 4], 'Each directory path retires once before reading team files.');
  } finally { list.mock.restore(); }
});
