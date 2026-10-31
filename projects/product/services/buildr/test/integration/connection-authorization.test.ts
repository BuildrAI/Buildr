import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import http from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import YAML from 'yaml';
import { ConnectionSkillsApplication } from '../../src/modules/connection-skills/application/connection-skills-application.ts';
import { createConnectionCatalog } from '../../src/modules/connection-skills/application/catalog.ts';
import { createConnectionSkillsHttp } from '../../src/modules/connection-skills/interfaces/http/connection-skills-http.ts';
import { createConnectionSkillsCli } from '../../src/modules/connection-skills/interfaces/cli/connection-skills-cli.ts';
import { parseConnectionDefinition } from '../../src/modules/connection-skills/domain/definition.ts';
import { BrowserAuthorization } from '../../src/modules/browser-authorization/application/browser-authorization-application.ts';
import { digest } from '../../src/modules/connection-skills/persistence/files.ts';

function fixture(t: { after(fn: () => void): void }, mode = 'success') {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'connection-authorization-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const workspace = path.join(root, 'workspace'), directory = path.join(workspace, 'skills', 'connections', 'example');
  fs.mkdirSync(path.join(directory, 'assets'), { recursive: true }); fs.mkdirSync(path.join(directory, 'scripts'));
  const declaration = path.join(directory, 'assets', 'connection.yml'), script = path.join(directory, 'scripts', 'authorize.mjs');
  fs.writeFileSync(path.join(directory, 'SKILL.md'), '---\nname: example\ndescription: 隔离授权协议验证\nconnectionDefinitions: [assets/connection.yml]\n---\n');
  fs.writeFileSync(path.join(directory, 'scripts', 'client.mjs'), 'process.on("message",()=>{ console.log("ordinary"); process.disconnect(); });');
  fs.writeFileSync(script, `
process.on('message', async message => {
  if(message.type !== 'buildr.connection-authorization-context') return;
  const c = message.context;
  if(c.protocolVersion!=='buildr.connection-authorization-context/v1' || 'authentication' in c.connection || JSON.stringify(c).includes('old-secret')) process.exit(11);
  const fs = await import('node:fs'); const path = await import('node:path');
  fs.writeFileSync(path.join(c.workspace.root,'started'), c.privateStateRoot);
  if(c.browser) fs.writeFileSync(path.join(c.workspace.root,'browser-mode'), c.browser.mode);
  fs.writeFileSync(path.join(c.privateStateRoot,'fixture-profile'),'temporary');
  if(c.connection.config.mode==='hang') {setInterval(()=>{},1000); return;}
  await new Promise(resolve=>setTimeout(resolve, c.connection.config.mode==='slow'?150:10));
  process.stdout.write('new-secret'); process.stderr.write('new-secret');
  const result = {type:'buildr.connection-auth-result',callId:c.callId,status:'success',values:{username:'new-user',password:'new-secret'}};
  const mode = c.connection.config.mode;
  if(mode.startsWith('cleanup-retained')) {
    const external = path.join(c.workspace.root, 'unrelated'); fs.mkdirSync(external);
    fs.writeFileSync(path.join(external, 'keep'), 'unrelated');
    fs.rmSync(c.privateStateRoot, {recursive:true}); fs.symlinkSync(external,c.privateStateRoot);
  }
  if(mode==='bad-call') result.callId='other-call';
  if(mode==='incomplete') delete result.values.password;
  if(mode==='failure') {delete result.values; result.status='failure'; result.reason='dependency-unavailable';}
  if(mode==='cleanup-retained-failure') {delete result.values; result.status='failure'; result.reason='browser-closed';}
  if(mode==='duplicate') process.send(result);
  process.send(result,()=>{process.exitCode=mode==='nonzero'?3:0;process.disconnect();});
});
`);
  const definition: any = {
    schemaVersion: 'buildr.connection-definition/v1', definitionId: 'example', name: 'Example', description: 'isolated', category: 'custom', configVersion: 1,
    config: { fields: [{ key: 'site', label: '网站', type: 'url', required: true }, { key: 'mode', label: '模拟', type: 'string' }, { key: 'scope', label: '范围', type: 'string' }] },
    authentication: { allowedSources: ['personal'], targetFields: ['site'], fields: [{ key: 'username', label: '账号', type: 'string', required: true }, { key: 'password', label: '密码', type: 'secret', required: true }], authorization: { program: 'authorize', args: [], inputs: ['config.site'], label: '去授权', reauthorizeLabel: '重新授权', timeoutMs: 1000, accountLabelField: 'username' } },
    programs: { cli: { kind: 'bundled', runtime: 'node', entry: 'scripts/client.mjs', contextProtocol: 'buildr.connection-context/v1' }, authorize: { kind: 'bundled', runtime: 'node', entry: 'scripts/authorize.mjs', contextProtocol: 'buildr.connection-authorization-context/v1' } },
    presentation: { environment: 'hidden', summaryFields: ['site'] },
  };
  const writeDefinition = () => fs.writeFileSync(declaration, YAML.stringify(definition)); writeDefinition();
  let sourceIdentity = 'source:example';
  const catalog = createConnectionCatalog({ assets: { readSkills: () => [{ id: 'example', path: 'connections/example', assetIdentity: 'asset:example', sourceIdentity, enabled: true, connectionDefinitions: ['assets/connection.yml'] }], readSkillFile: (_root, _skill, relative) => { const content = fs.readFileSync(path.join(directory, relative), 'utf8'); return { content, digest: digest(content), directory, absolutePath: path.join(directory, relative) }; } } });
  const app = new ConnectionSkillsApplication({ dataRoot: path.join(root, 'data'), catalog, resolveScope: () => ({ rootPath: workspace, workspaceId: 'fixture-workspace' }) });
  const binding = { skillAssetIdentity: 'asset:example', sourceIdentity, definitionId: 'example', configVersion: 1 };
  const entry = app.definitions(workspace).definitions[0]!;
  const instance = app.save(workspace, null, { id: 'example-one', name: 'Example', binding, config: { site: 'https://example.invalid/', mode }, authentication: { intent: 'remove' }, expected: { teamRevision: 'absent', definitionRevision: entry.revision } }).instance;
  const expected = () => { const current = app.get(workspace, instance.id).instance; return { teamRevision: current.teamRevision, localRevision: current.localRevision, definitionRevision: current.definitionRevision }; };
  const read = () => app.files.readLocal({ rootPath: workspace, workspaceId: 'fixture-workspace' }, instance.id);
  const old = () => app.saveAuth(workspace, instance.id, { intent: 'replace', values: { username: 'old-user', password: 'old-secret' }, expected: expected() });
  const authorize = (signal?: AbortSignal) => app.authorize(workspace, instance.id, { expected: expected() }, { signal });
  const started = async () => { for (let count = 0; count < 100 && !fs.existsSync(path.join(workspace, 'started')); count++) await delay(5); assert.ok(fs.existsSync(path.join(workspace, 'started'))); return fs.readFileSync(path.join(workspace, 'started'), 'utf8'); };
  return { root, workspace, directory, declaration, script, definition, writeDefinition, app, instance, expected, read, old, authorize, started, changeSource: () => { sourceIdentity = 'source:changed'; } };
}

function readinessFixture(t: { after(fn: () => void): void }, mode = 'expired') {
  const f = fixture(t, mode);
  Object.assign(f.definition.authentication.authorization, {
    parameters: [{ key: 'environment', label: '环境', type: 'enum', values: ['qa', 'prod'] }],
    reuseFields: ['password'], identityFields: ['username'],
    sessionCheck: { program: 'cli', args: ['session-status'], effect: 'read', requiredParameters: ['environment'] },
  });
  f.writeDefinition();
  fs.writeFileSync(path.join(f.directory, 'scripts/client.mjs'), `
process.on('message', m => {
 if(m.type !== 'buildr.connection-context')return;
 const c=m.context, p=c.connections.primary;
 const mode=p.config.mode;
 let sessionStatus=mode==='invalid-check'?['expired']:mode==='unknown'?'unknown':mode==='mismatch'?'identity-mismatch':mode==='always-expired'?'expired':p.authentication.values.password==='new-secret'||mode==='valid'?'valid':'expired';
 if(c.authorizationParameters.environment!=='qa' && c.authorizationParameters.environment!=='prod')process.exit(19);
 console.log(JSON.stringify({sessionStatus}));process.disconnect();
});`);
  fs.writeFileSync(f.script, `
import fs from 'node:fs';
process.on('message', m => {
 if(m.type !== 'buildr.connection-authorization-context')return;
 const c=m.context;
 if(c.authorizationParameters.environment!=='qa')process.exit(12);
 if(c.reusableAuthentication && Object.keys(c.reusableAuthentication).join(',')!=='password')process.exit(13);
 if('authentication' in c.connection)process.exit(14);
 fs.appendFileSync(c.workspace.root+'/attempts','1');
 const values={username:c.connection.config.mode==='switch-user'?'another-user':'old-user',password:'new-secret'};
 process.send({type:'buildr.connection-auth-result',callId:c.callId,status:'success',values},()=>process.disconnect());
});`);
  const ensure = (parameters = { environment: 'qa' }, signal?: AbortSignal) => f.app.ensureAuthentication(f.workspace, f.instance.id, { expected: f.expected(), parameters }, { signal });
  return { ...f, ensure, attempts: () => fs.existsSync(path.join(f.workspace, 'attempts')) ? fs.readFileSync(path.join(f.workspace, 'attempts'), 'utf8').length : 0 };
}

test('按需会话：有效复用、缺失首次获取、过期单次续期，无业务动作', async t => {
  for (const mode of ['valid', 'expired', 'missing']) {
    const f = readinessFixture(t, mode);
    if (mode !== 'missing') f.old();
    const result = await f.ensure();
    assert.equal(result.renewed, mode !== 'valid');
    assert.equal(f.attempts(), mode === 'valid' ? 0 : 1);
    assert.equal(f.read().group?.values.username, 'old-user');
    assert.ok(!JSON.stringify(result).includes('new-secret'));
    assert.ok(!fs.existsSync(path.join(f.workspace, 'business-write')));
  }
});
test('未知、身份不符和参数错误不自动登录，失败只影响当前目标', async t => {
  for (const mode of ['unknown', 'invalid-check', 'mismatch']) {
    const f = readinessFixture(t, mode); f.old();
    await assert.rejects(f.ensure(), { code: mode === 'mismatch' ? 'connection_skill_authorization_identity_changed' : 'connection_skill_session_check_unknown' });
    assert.equal(f.attempts(), 0); assert.equal(f.read().group?.values.password, 'old-secret');
  }
  const f = readinessFixture(t); f.old();
  await assert.rejects(f.ensure({ environment: 'other' }), { code: 'connection_field_invalid' });
  await assert.rejects(f.app.ensureAuthentication(f.workspace, f.instance.id, { expected: f.expected() }), { code: 'connection_field_required' });
  assert.equal(f.attempts(), 0);
});
test('自动续期身份切换不保存；新组已保存但仍过期不重试', async t => {
  const f = readinessFixture(t, 'switch-user'); f.old();
  await assert.rejects(f.ensure(), { code: 'connection_skill_authorization_identity_changed' });
  assert.equal(f.read().group?.values.username, 'old-user'); assert.equal(f.read().group?.values.password, 'old-secret'); assert.equal(f.attempts(), 1);
  const other = readinessFixture(t, 'always-expired'); other.old();
  await assert.rejects(other.ensure(), { code: 'connection_skill_session_not_ready' });
  assert.equal(other.read().group?.values.password, 'new-secret'); assert.equal(other.attempts(), 1);
});
test('会话准备仍要求准确观察、取消保护和显式声明，不修复旧绑定', async t => {
  const f = readinessFixture(t); f.old();
  const stale = f.expected(); f.old();
  await assert.rejects(f.app.ensureAuthentication(f.workspace, f.instance.id, { expected: stale, parameters: { environment: 'qa' } }));
  const controller = new AbortController(); controller.abort();
  await assert.rejects(f.ensure({ environment: 'qa' }, controller.signal), { code: 'connection_skill_authorization_cancelled' });
  assert.equal(f.attempts(), 0);
  const old = fixture(t);
  await assert.rejects(old.app.ensureAuthentication(old.workspace, old.instance.id, { expected: old.expected() }), { code: 'connection_skill_session_preparation_unavailable' });
});
test('声明拒绝秘密参数、未知复用字段、秘密身份与非只读检查', t => {
  const f = readinessFixture(t);
  for (const change of [
    (a: any) => { a.parameters[0].type = 'secret'; },
    (a: any) => { a.reuseFields = ['unknown']; },
    (a: any) => { a.identityFields = ['password']; },
    (a: any) => { a.sessionCheck.effect = 'write'; },
    (a: any) => { a.sessionCheck.program = 'authorize'; },
    (a: any) => { a.sessionCheck.requiredParameters = ['unknown']; },
  ]) { const d = structuredClone(f.definition); change(d.authentication.authorization); assert.throws(() => parseConnectionDefinition(YAML.stringify(d))); }
});
test('新增旧字段接收方或扩大复用字段需要重新绑定，默认授权程序仍不接收旧组', async t => {
  const f = fixture(t); f.old();
  const before = f.read();
  f.definition.authentication.authorization.reuseFields = ['password']; f.writeDefinition();
  const current = f.app.get(f.workspace, f.instance.id).instance;
  assert.throws(() => f.app.useSelected(f.workspace, { id: current.id, expectedRevision: current.revision }, () => assert.fail('旧组不能交给新增接收方')));
  assert.deepEqual(f.read(), before);
  // Explicit authorization may start without reusing the now-incompatible old group.
  await f.authorize();
  const after = f.app.get(f.workspace, f.instance.id).instance;
  f.app.useSelected(f.workspace, { id: after.id, expectedRevision: after.revision }, ({ connection }) => assert.equal(connection.authentication.values.password, 'new-secret'));
  f.definition.authentication.authorization.reuseFields.push('username'); f.writeDefinition();
  const expanded = f.app.get(f.workspace, f.instance.id).instance;
  assert.throws(() => f.app.useSelected(f.workspace, { id: expanded.id, expectedRevision: expanded.revision }, () => assert.fail('扩大旧字段交付范围不能静默沿用旧授权')));
});
test('CLI与HTTP的ensure共用应用，返回新观察而不派发专业动作', async t => {
  const f = readinessFixture(t, 'valid'); f.old();
  const input = { expected: f.expected(), parameters: { environment: 'qa' } }, file = path.join(f.workspace, 'ensure.json');
  fs.writeFileSync(file, JSON.stringify(input));
  const cli = createConnectionSkillsCli(f.app)[0]!, before = process.stdout.write;
  let output = '';
  process.stdout.write = ((...args: Parameters<typeof process.stdout.write>) => {
    const value = args[0];
    if (typeof value === 'string' && value.startsWith('{\n  "schemaVersion": "buildr.connection-skill-result/v1"')) { output += value; return true; }
    return before.apply(process.stdout, args);
  }) as typeof process.stdout.write;
  try { await cli.run(null, { argv: ['node', 'buildr', 'connection-skill', 'auth', 'ensure', '--target', f.workspace, '--connection', f.instance.id, '--file', file] }); }
  finally { process.stdout.write = before; }
  assert.equal(JSON.parse(output).renewed, false);
  const http = await createConnectionSkillsHttp(f.app).handle({
    root: f.workspace, suffix: `/connection-skills/instances/${f.instance.id}/auth/ensure`, searchParams: new URLSearchParams(),
    request: { method: 'POST' }, authorizeWrite() {}, readJsonBody: async () => input,
  });
  assert.equal(http?.status, 200);
  assert.equal((http?.body as any).renewed, false);
  assert.equal(f.attempts(), 0);
});

test('声明拒绝不兼容授权来源、普通协议、认证输入、秘密标签和非法时限', t => {
  const f = fixture(t);
  for (const change of [
    (d: any) => { d.authentication.allowedSources = ['team','personal']; },
    (d: any) => { d.programs.authorize.contextProtocol = 'buildr.connection-context/v1'; },
    (d: any) => { d.authentication.authorization.inputs = ['authentication.password']; },
    (d: any) => { d.authentication.authorization.accountLabelField = 'password'; },
    (d: any) => { d.authentication.authorization.timeoutMs = 300001; },
    (d: any) => { d.hooks = { test: { program: 'authorize', args: [], effect: 'read' } }; },
  ]) { const candidate = structuredClone(f.definition); change(candidate); assert.throws(() => parseConnectionDefinition(YAML.stringify(candidate)), { code: 'connection_definition_invalid' }); }
  const old = structuredClone(f.definition); delete old.authentication.authorization; delete old.programs.authorize; delete old.presentation.environment;
  assert.equal(parseConnectionDefinition(YAML.stringify(old)).presentation?.environment, undefined);
});

test('首次无认证与范围的授权只用私有IPC保存完整组，输出秘密不可见且清理临时目录', async t => {
  const f = fixture(t), result = await f.authorize();
  assert.equal(result.status, 'success'); assert.equal(result.accountLabel, 'new-user');
  assert.equal(f.read().group?.values.password, 'new-secret');
  assert.equal(JSON.stringify(result).includes('new-secret'), false);
  assert.equal(JSON.stringify(f.app.directory(f.workspace)).includes('new-secret'), false);
  assert.equal(fs.existsSync(await f.started()), false);
  assert.throws(() => f.app.revealPersonal(f.workspace, f.instance.id, { field: 'password', expected: f.expected() }), { code: 'connection_skill_secret_field_invalid' });
  const view = f.app.get(f.workspace, f.instance.id).instance;
  await assert.rejects(f.app.run(f.workspace, { id: view.id, expectedRevision: view.revision, program: 'authorize', args: [] }), { code: 'connection_skill_program_protocol' });
});

test('重复、错误身份、不完整组和非零退出均保留旧认证并隐藏输出', async t => {
  for (const mode of ['duplicate','bad-call','incomplete','nonzero']) await t.test(mode, async t => {
    const f = fixture(t, mode); f.old(); const before = f.read();
    await assert.rejects(f.authorize(), error => String(error).includes('connection') === false && !String(error).includes('new-secret'));
    assert.deepEqual(f.read(), before); assert.equal(fs.existsSync(await f.started()), false);
  });
});

test('固定失败枚举给出依赖诊断，拒绝将子程序秘密作为诊断', async t => {
  const f = fixture(t, 'failure'); f.old(); const before = f.read();
  await assert.rejects(f.authorize(), { code: 'connection_skill_authorization_dependency_unavailable' });
  assert.deepEqual(f.read(), before);
});

test('命令行显式授权消费同一应用且只输出公开结果', async t => {
  const f = fixture(t), input = path.join(f.root, 'input.json'); fs.writeFileSync(input, JSON.stringify({ expected: f.expected() }));
  const write = process.stdout.write; let output = '';
  process.stdout.write = ((...args: Parameters<typeof process.stdout.write>) => {
    const chunk = args[0];
    if (typeof chunk === 'string' && chunk.startsWith('{\n  "schemaVersion": "buildr.connection-skill-result/v1"')) { output += chunk; return true; }
    return write.apply(process.stdout, args);
  }) as typeof process.stdout.write;
  try { await createConnectionSkillsCli(f.app)[0]!.run(null, { argv: ['node','buildr','connection-skill','auth','authorize','--connection',f.instance.id,'--file',input,'--target',f.workspace] }); }
  finally { process.stdout.write = write; }
  const result = JSON.parse(output);
  assert.equal(result.status, 'success'); assert.equal(result.operation, 'auth'); assert.equal(output.includes('new-secret'), false);
  assert.equal(f.read().group?.values.password, 'new-secret');
});

test('临时目录被替换时保留未知资源，成功或失败均报告而不删除替代目标', async t => {
  for (const mode of ['cleanup-retained','cleanup-retained-failure']) await t.test(mode, async t => {
    const f = fixture(t, mode);
    if (mode === 'cleanup-retained') assert.equal((await f.authorize()).warnings?.length, 1);
    else await assert.rejects(f.authorize(), error => { assert.equal((error as any).details.cleanup, 'unconfirmed'); return true; });
    assert.equal(fs.readFileSync(path.join(f.workspace, 'unrelated', 'keep'), 'utf8'), 'unrelated');
    assert.equal(fs.lstatSync(await f.started()).isSymbolicLink(), true);
  });
});

test('取消、超时和HTTP连接断开停止本次授权且不覆盖旧组', async t => {
  for (const kind of ['abort','timeout','http']) await t.test(kind, async t => {
    const f = fixture(t, 'hang'); f.old(); const before = f.read(), controller = new AbortController();
    const request = Object.assign(new EventEmitter(), { method: 'POST', socket: new EventEmitter() });
    const pending = kind === 'http' ? createConnectionSkillsHttp(f.app).handle({ root: f.workspace, suffix: `/connection-skills/instances/${f.instance.id}/auth/authorize`, searchParams: new URLSearchParams(), request, authorizeWrite() {}, readJsonBody: async () => ({ expected: f.expected() }) }) : f.authorize(controller.signal);
    const rejected = assert.rejects(pending, { code: kind === 'timeout' ? 'connection_skill_authorization_timeout' : 'connection_skill_authorization_cancelled' });
    const temporary = await f.started();
    if (kind === 'abort') controller.abort();
    if (kind === 'http') request.socket.emit('close');
    await rejected;
    assert.deepEqual(f.read(), before); assert.equal(fs.existsSync(temporary), false);
    assert.equal(request.listenerCount('aborted'), 0); assert.equal(request.socket.listenerCount('close'), 0);
  });
});

test('真实HTTP fetch取消经socket关闭终止授权进程，保留旧组并清理本次目录', async t => {
  const f = fixture(t, 'hang'); f.old(); const before = f.read(), contribution = createConnectionSkillsHttp(f.app);
  let finished!: () => void, failureCode: unknown;
  const stopped = new Promise<void>(resolve => { finished = resolve; });
  const server = http.createServer(async (request, response) => {
    try {
      const result = await contribution.handle({
        root: f.workspace, suffix: `/connection-skills/instances/${f.instance.id}/auth/authorize`, searchParams: new URLSearchParams(), request,
        authorizeWrite() {}, readJsonBody: async () => { const chunks = []; for await (const chunk of request) chunks.push(chunk); return JSON.parse(Buffer.concat(chunks).toString()); },
      });
      if (!response.destroyed) { response.writeHead(200, { 'content-type': 'application/json' }); response.end(JSON.stringify(result?.body)); }
    } catch (error) {
      failureCode = (error as any).code;
      if (!response.destroyed) { response.writeHead(409); response.end('cancelled'); }
    } finally { finished(); }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const controller = new AbortController();
    const pending = fetch(`http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}/authorize`, { method: 'POST', body: JSON.stringify({ expected: f.expected() }), signal: controller.signal, headers: { 'content-type': 'application/json' } });
    const interrupted = assert.rejects(pending, error => (error as Error).name === 'AbortError');
    const directory = await f.started();
    controller.abort(); await interrupted;
    await Promise.race([stopped, delay(5000).then(() => { throw new Error('HTTP cancellation did not reach authorization runner'); })]);
    assert.equal(failureCode, 'connection_skill_authorization_cancelled');
    assert.deepEqual(f.read(), before); assert.equal(fs.existsSync(directory), false);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('等待期间配置、程序、来源或个人组变化不被旧观察覆盖', async t => {
  for (const kind of ['configuration','program','source','authentication']) await t.test(kind, async t => {
    const f = fixture(t, 'slow'); f.old();
    const pending = f.authorize(), rejected = assert.rejects(pending);
    await f.started();
    if (kind === 'program') fs.appendFileSync(f.script, '\n// changed\n');
    if (kind === 'source') f.changeSource();
    if (kind === 'configuration') {
      const view = f.app.get(f.workspace, f.instance.id).instance;
      f.app.save(f.workspace, view.id, { ...view, config: { ...view.config, scope: 'changed' }, authentication: { intent: 'remove' }, expected: f.expected() });
    }
    if (kind === 'authentication') f.app.saveAuth(f.workspace, f.instance.id, { intent: 'replace', values: { username: 'other-user', password: 'other-secret' }, expected: f.expected() });
    await rejected;
    assert.equal(f.read().group?.values.password, kind === 'authentication' ? 'other-secret' : 'old-secret');
  });
});

test('两个并发授权只准一个按原本机观察保存', async t => {
  const f = fixture(t, 'slow'); f.old();
  const outcomes = await Promise.allSettled([f.authorize(),f.authorize()]);
  assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(outcomes.filter(result => result.status === 'rejected').length, 1);
});

test('添加专用授权程序不改变旧业务认证接收方绑定', t => {
  const f = fixture(t), authorization = f.definition.authentication.authorization, program = f.definition.programs.authorize;
  delete f.definition.authentication.authorization; delete f.definition.programs.authorize; f.writeDefinition();
  f.old();
  const oldBinding = f.read().group?.targetBinding;
  f.definition.authentication.authorization = authorization; f.definition.programs.authorize = program; f.writeDefinition();
  assert.equal(f.app.get(f.workspace, f.instance.id).instance.authentication.personal.configured, true);
  assert.equal(f.read().group?.targetBinding, oldBinding);
});

test('原子保存后持久化核验失败保留新组可读事实，不谎报旧组保留', async t => {
  const f = fixture(t); f.old();
  const write = f.app.files.writeLocal.bind(f.app.files);
  f.app.files.writeLocal = (...args) => { write(...args); throw new Error('fixture durability failure new-secret'); };
  await assert.rejects(f.authorize(), error => {
    assert.equal((error as any).code, 'connection_skill_authorization_persistence_unconfirmed');
    assert.deepEqual((error as any).details, { authenticationSaved: 'observed', durability: 'unconfirmed' });
    assert.equal(String(error).includes('new-secret'), false); return true;
  });
  assert.equal(f.read().group?.values.password, 'new-secret');
});

test('声明显式选择共享配置，真实授权子进程通过公开私有客户端取得页面能力并保存完整认证', async t => {
  const { BrowserProfiles } = await import('../../src/modules/browser-authorization/persistence/profiles.ts');
  const { serveBrowser } = await import('../../src/modules/browser-authorization/infrastructure/runtime.ts');
  const f = fixture(t);
  Object.assign(f.definition.authentication.authorization, { browserProfile: 'personal' }); f.writeDefinition();
  const profiles = new BrowserProfiles(f.workspace), created = profiles.create('personal', 'absent');
  const crypto = await import('node:crypto'), secret = crypto.randomBytes(32).toString('hex');
  const endpoint = process.platform === 'win32' ? '\\\\.\\pipe\\buildr-auth-' + crypto.randomUUID() : '/tmp/buildr-auth-' + crypto.randomUUID().slice(0, 12) + '.sock';
  fs.writeFileSync(profiles.runtimeFile('personal'), JSON.stringify({ mode: 'headless', root: profiles.root, profileId: 'personal', pid: process.pid, secret, endpoint, revision: created.revision, startedAt: Date.now() }), { mode: 0o600 });
  const pipe: any = new EventEmitter();
  pipe.request = async (method: string) => method === 'Target.createTarget' ? { targetId: 'owned' } : method === 'Target.getTargets' ? { targetInfos: [{ targetId: 'owned' }] } : {};
  const runtime = await serveBrowser(f.workspace, 'personal', (() => ({ pipe, close: async () => {} })) as any);
  t.after(() => runtime.close());
  fs.writeFileSync(f.script, `process.on('message',async message=>{
    if(message.type!=='buildr.connection-authorization-context')return;
    const c=message.context;
    const {createBrowserClient}=await import(c.browser.clientModule);
    const client=createBrowserClient(c);
    try {
      const page=await client.pipe.request('Target.createTarget',{url:'about:blank'});
      if(page.targetId!=='owned')process.exit(12);
      let forbidden=false;
      try{await client.pipe.request('Browser.close');}catch{forbidden=true;}
      if(!forbidden)process.exit(13);
      await client.close();
      process.stdout.write('bridge-secret');
      process.send({type:'buildr.connection-auth-result',callId:c.callId,status:'success',values:{username:'bridge-user',password:'bridge-secret'}},()=>process.disconnect());
    }catch{process.exit(14);}
  });`);
  const result = await f.authorize();
  assert.equal(result.status, 'success');
  assert.equal(f.read().group!.values.password, 'bridge-secret');
  assert.equal(JSON.stringify(result).includes('bridge-secret'), false);
  await runtime.close();
});

test('共享授权模式经输入传递到资源与私有上下文，非法模式不启动方法', async t => {
  const f = fixture(t);
  f.definition.authentication.authorization.browserProfile = 'personal'; f.writeDefinition();
  let observed: unknown, closed = 0;
  t.mock.method(BrowserAuthorization.prototype, 'acquire', async (_id: string, _signal?: AbortSignal, mode = 'headless') => {
    observed = mode; return { mode, request: async () => ({}), close: async () => { closed++; } };
  });
  for (const mode of ['headless', 'interactive']) {
    const result = await f.app.authorize(f.workspace, f.instance.id, { expected: f.expected(), ...(mode === 'interactive' ? { browserMode: mode } : {}) });
    assert.equal(result.status, 'success'); assert.equal(observed, mode);
    assert.equal(fs.readFileSync(path.join(f.workspace, 'browser-mode'), 'utf8'), mode);
  }
  assert.equal(closed, 2);
  await assert.rejects(f.app.authorize(f.workspace, f.instance.id, { expected: f.expected(), browserMode: 'unknown' }), { code: 'connection_skill_authorization_input_invalid' });
  assert.equal(closed, 2);
});
