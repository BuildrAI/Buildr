import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { ConnectionsApplication } from '../../src/modules/connections/application/connections-application.ts';
import { connectionFailure, type ConnectionProvider } from '../../src/modules/connections/domain/connection.ts';
import { nacosConfiguration, nacosIdentifier, nacosPage, type NacosConfigDetail, type NacosOperations, type NacosPublishInput } from '../../src/modules/connections/domain/nacos-connection.ts';
import { createMySqlProvider } from '../../src/modules/connections/infrastructure/mysql-query.ts';
import { createNacosProvider } from '../../src/modules/connections/infrastructure/nacos-provider.ts';
import { createConnectionsCliContributions } from '../../src/modules/connections/interfaces/cli/connections-cli.ts';
import { registerWorkspaceSqlite } from '../../src/infrastructure/sqlite/workspace-sqlite.ts';
import { registerSqliteTransaction } from '../../src/infrastructure/sqlite/transaction.ts';

const originalContent = '# 保留注释\r\nservice:\r\n  timeout: 30\r\n';
const candidateContent = '# 保留注释\r\nservice:\r\n  timeout: 45\r\n';
const dataId = 'saas-auth-dev.yml';
const md5 = (content: string) => crypto.createHash('md5').update(content, 'utf8').digest('hex');
const sha256 = (content: string) => 'sha256-' + crypto.createHash('sha256').update(content, 'utf8').digest('hex');

/** Real workspace persistence and credential bindings; only the external Nacos system is substituted. */
function fixture(t: TestContext) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-nacos-application-'));
  const root = path.join(base, 'workspace'), dataRoot = path.join(base, 'profile'), workspaceId = crypto.randomUUID();
  fs.mkdirSync(root); fs.mkdirSync(dataRoot); fs.mkdirSync(path.join(root, '.buildr'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const scope = { rootPath: root, workspaceId };
  const store = registerSqliteTransaction(registerWorkspaceSqlite({ assertInitializedBuildrWorkspace(target: string) { assert.equal(target, root); assert.equal(fs.existsSync(path.join(target, '.buildr')), true); } }));
  const remote = new Map<string, NacosConfigDetail>();
  const calls: Array<{ action: string; consoleUrl: string; input?: unknown }> = [];
  const publications: Array<{ consoleUrl: string; input: NacosPublishInput }> = [];
  let onGet: ((detail: NacosConfigDetail, config: Record<string, unknown>) => Promise<void> | void) | undefined;
  const key = (config: Record<string, unknown>, targetDataId: string, group: string) => JSON.stringify([config.consoleUrl, config.namespaceId, group, targetDataId]);
  const observed = (action: string, config: Record<string, unknown>, credentials: Record<string, unknown>, input?: unknown) => {
    assert.equal(credentials.password, 'fixture-password-only');
    calls.push({ action, consoleUrl: String(config.consoleUrl), ...(input === undefined ? {} : { input: structuredClone(input) }) });
  };
  const operations: NacosOperations = {
    async namespaces(config, credentials) { observed('namespaces', config, credentials); return [{ namespaceId: 'public', namespaceName: 'public' }]; },
    async configs(config, credentials, input) {
      observed('list', config, credentials, input);
      const pageNo = nacosPage(input.pageNo, 1, 1_000_000), pageSize = nacosPage(input.pageSize, 20, 500);
      const configuration = nacosConfiguration(config);
      const items = [...remote.entries()].filter(([identity]) => identity.startsWith(JSON.stringify([configuration.consoleUrl, configuration.namespaceId]).slice(0, -1))).map(([, detail]) => ({ dataId: detail.dataId, group: detail.group, type: detail.type, md5: detail.md5 }));
      return { namespaceId: configuration.namespaceId, apiVersion: 'v3', pageNo, pageSize, totalCount: items.length, pagesAvailable: Math.ceil(items.length / pageSize), items: items.slice((pageNo - 1) * pageSize, pageNo * pageSize) };
    },
    async get(config, credentials, input) {
      observed('get', config, credentials, input);
      const configuration = nacosConfiguration(config), targetDataId = nacosIdentifier(input.dataId, '配置标识'), group = input.group === undefined ? configuration.defaultGroup : nacosIdentifier(input.group, '分组');
      const detail = remote.get(key(config, targetDataId, group));
      if (!detail) throw connectionFailure('nacos_config_missing', '测试配置不存在。', 404);
      const result = structuredClone(detail);
      await onGet?.(result, config);
      return result;
    },
    async publish(config, credentials, input) {
      observed('publish', config, credentials, input);
      const configuration = nacosConfiguration(config), targetDataId = nacosIdentifier(input.dataId, '配置标识'), group = input.group === undefined ? configuration.defaultGroup : nacosIdentifier(input.group, '分组');
      const identity = key(config, targetDataId, group), previous = remote.get(identity);
      assert.ok(previous); assert.equal(previous.md5, input.expectedMd5, '发布必须带读取时的版本用于原生冲突保护');
      const content = String(input.content), next = { ...previous, content, md5: md5(content), type: input.type === undefined ? previous.type : String(input.type) };
      remote.set(identity, next); publications.push({ consoleUrl: configuration.consoleUrl, input: structuredClone(input) });
      return { published: true, verified: true, namespaceId: next.namespaceId, apiVersion: next.apiVersion, dataId: targetDataId, group, expectedMd5: previous.md5, md5: next.md5, concurrencyProtection: 'native-cas', upstreamCasLimit: '测试外部系统只保护内容版本。' };
    },
  };
  const provider: ConnectionProvider = { ...createNacosProvider(), nacos: operations };
  const providers = [provider, createMySqlProvider()];
  const application = new ConnectionsApplication({ dataRoot, store, resolveScope: () => scope, providers });
  const create = (production: boolean, name = production ? '生产 Nacos' : '测试 Nacos') => application.create(root, {
    name, category: 'configuration', type: 'nacos', environment: production ? 'prod' : 'qa',
    config: { consoleUrl: `https://${production ? 'prod' : 'qa'}.nacos.invalid/nacos/#/`, username: 'fixture-user', namespaceId: 'public', defaultGroup: 'DEFAULT_GROUP', production },
    credentials: { password: 'fixture-password-only' },
  }).connection;
  const seed = (connection: ReturnType<typeof create>, content = originalContent, targetDataId = dataId, group = 'DEFAULT_GROUP', type: string | null = 'yaml') => {
    const detail: NacosConfigDetail = { namespaceId: String(connection.config.namespaceId), apiVersion: 'v3', dataId: targetDataId, group, content, type, md5: md5(content) };
    remote.set(key(connection.config, targetDataId, group), detail); return detail;
  };
  const prod = create(true), qa = create(false); seed(prod); seed(qa);
  return { base, root, dataRoot, workspaceId, scope, store, application, providers, prod, qa, seed, calls, publications, setOnGet(hook: typeof onGet) { onGet = hook; } };
}

function authorization(scope: unknown) { return { source: '当前对话中的测试用户授权消息 fixture-message-1', statement: '允许发布所展示的这次生产配置差异。', scope }; }
async function prepare(f: ReturnType<typeof fixture>, connection = f.prod, content = candidateContent) {
  const diff = await f.application.nacos.diff(f.root, connection.id, { dataId, content });
  const input = { dataId, content, expectedRevision: diff.expectedRevision, expectedMd5: diff.expectedMd5 };
  return { diff, input };
}
async function cli(t: TestContext, f: ReturnType<typeof fixture>, action: string, args: string[] = [], connection = f.qa) {
  const contribution = createConnectionsCliContributions(f.application)[0];
  let printed = '';
  const capture = t.mock.method(process.stdout, 'write', (chunk: string | Uint8Array) => { printed += String(chunk); return true; });
  try {
    const result = await contribution.run(null, { argv: ['node', 'buildr', 'connection', 'nacos', action, '--target', f.root, '--connection', connection.id, '--json', ...args] });
    assert.deepEqual(JSON.parse(printed), result);
    assert.equal(printed.includes('fixture-password-only'), false, '认证信息不能出现在命令结果中');
    return result;
  } finally { capture.mock.restore(); }
}

test('生产差异绑定准确目标、旧摘要、新内容、格式和连接版本；缺授权及任一范围不匹配均不发布', async t => {
  const f = fixture(t), { diff, input } = await prepare(f);
  assert.deepEqual(diff.target, { connectionId: f.prod.id, consoleUrl: f.prod.config.consoleUrl, namespaceId: 'public', group: 'DEFAULT_GROUP', dataId, apiVersion: 'v3' });
  assert.deepEqual(diff.authorizationScope, { workspaceId: f.workspaceId, connectionId: f.prod.id, expectedRevision: f.prod.revision, namespaceId: 'public', group: 'DEFAULT_GROUP', dataId, expectedMd5: md5(originalContent), contentSha256: sha256(candidateContent), type: 'yaml' });
  assert.equal(diff.equal, false); assert.equal(diff.beforeSha256, sha256(originalContent)); assert.equal(diff.afterSha256, sha256(candidateContent));
  assert.ok(diff.diff.lines.some(line => line === '-  timeout: 30\r'));
  assert.ok(diff.diff.lines.some(line => line === '+  timeout: 45\r'));
  await assert.rejects(f.application.nacos.publish(f.root, f.prod.id, input), { code: 'nacos_production_authorization_required', status: 403 });
  for (const key of Object.keys(diff.authorizationScope)) {
    const scope = { ...diff.authorizationScope, [key]: 'does-not-match' };
    await assert.rejects(f.application.nacos.publish(f.root, f.prod.id, { ...input, authorization: authorization(scope) }), { code: 'nacos_production_authorization_mismatch', status: 403 }, key);
  }
  await assert.rejects(f.application.nacos.publish(f.root, f.prod.id, { ...input, authorization: { source: '', statement: '允许', scope: diff.authorizationScope } }), { code: 'nacos_production_authorization_invalid' });
  assert.equal(f.publications.length, 0);
  const result = await f.application.nacos.publish(f.root, f.prod.id, { ...input, authorization: authorization(diff.authorizationScope) });
  assert.equal(result.published, true); assert.equal(result.verified, true); assert.equal(result.serviceReloaded, false);
  assert.equal(result.authorizationKind, 'user-dialogue-evidence');
  assert.deepEqual(f.publications, [{ consoleUrl: f.prod.config.consoleUrl, input: { dataId, group: 'DEFAULT_GROUP', content: candidateContent, expectedMd5: md5(originalContent), type: 'yaml' } }]);
  assert.equal((await f.application.nacos.get(f.root, f.prod.id, { dataId })).content, candidateContent);
});

test('发布拒绝过期内容或连接，以及读取期间的连接变化；不允许用户绕过保留原格式', async t => {
  const f = fixture(t), { diff, input } = await prepare(f);
  await assert.rejects(f.application.nacos.publish(f.root, f.prod.id, { ...input, type: 'json', authorization: authorization(diff.authorizationScope) }), { code: 'connection_input_invalid' });
  f.seed(f.prod, '# 其他入口修改\n');
  await assert.rejects(f.application.nacos.publish(f.root, f.prod.id, { ...input, authorization: authorization(diff.authorizationScope) }), { code: 'nacos_content_conflict', status: 409 });
  f.seed(f.prod);
  f.application.update(f.root, f.prod.id, { expectedRevision: f.prod.revision, name: '生产 Nacos 已更名' });
  await assert.rejects(f.application.nacos.publish(f.root, f.prod.id, { ...input, authorization: authorization(diff.authorizationScope) }), { code: 'connection_revision_conflict', status: 409 });
  const fresh = await prepare(f);
  f.setOnGet(() => {
    f.setOnGet(undefined);
    const observed = f.application.list(f.root).connections.find(item => item.id === f.prod.id)!;
    f.application.update(f.root, f.prod.id, { expectedRevision: observed.revision, config: { namespaceId: 'changed-during-read' } });
  });
  await assert.rejects(f.application.nacos.publish(f.root, f.prod.id, { ...fresh.input, authorization: authorization(fresh.diff.authorizationScope) }), { code: 'connection_revision_conflict', status: 409 });
  assert.equal(f.publications.length, 0);
});

test('远端格式变化即使内容摘要相同也使原授权失效；测试连接正常发布保留当前格式', async t => {
  const f = fixture(t), { diff, input } = await prepare(f);
  f.seed(f.prod, originalContent, dataId, 'DEFAULT_GROUP', 'properties');
  await assert.rejects(f.application.nacos.publish(f.root, f.prod.id, { ...input, authorization: authorization(diff.authorizationScope) }), { code: 'nacos_production_authorization_mismatch' });
  assert.equal(f.publications.length, 0);
  f.seed(f.qa, originalContent, dataId, 'DEFAULT_GROUP', null);
  const prepared = await prepare(f, f.qa);
  assert.equal(prepared.diff.authorizationScope.type, null);
  const result = await f.application.nacos.publish(f.root, f.qa.id, prepared.input);
  assert.equal(result.published, true); assert.equal(result.verified, true); assert.equal(result.serviceReloaded, false);
  assert.equal('authorizationKind' in result, false);
  assert.deepEqual(f.publications[0].input, { dataId, group: 'DEFAULT_GROUP', content: candidateContent, expectedMd5: md5(originalContent) });
});

test('生产授权依据只消费一次发布尝试，不保存配置或授权正文，失败也不能自动重用', async t => {
  const f = fixture(t), { diff, input } = await prepare(f), evidence = authorization(diff.authorizationScope);
  await f.application.nacos.publish(f.root, f.prod.id, { ...input, authorization: evidence });
  f.seed(f.prod);
  await assert.rejects(f.application.nacos.publish(f.root, f.prod.id, { ...input, authorization: evidence }), { code: 'nacos_production_authorization_used', status: 403 });
  assert.equal(f.publications.length, 1, '恢复旧内容也不能复用前一次用户授权');
  const secondEvidence = { ...evidence, source: '新的用户授权消息 fixture-message-2', statement: '再次授权所展示的这次生产发布。' };
  await f.application.nacos.publish(f.root, f.prod.id, { ...input, authorization: secondEvidence });
  assert.equal(f.publications.length, 2);
  const directory = path.join(f.root, '.buildr', 'local', 'nacos-publish-authorizations');
  const files = fs.readdirSync(directory);
  assert.equal(files.length, 2);
  for (const file of files) {
    assert.match(file, /^[a-f0-9]{64}\.json$/);
    const record = JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8'));
    assert.deepEqual(Object.keys(record).sort(), ['schemaVersion', 'usedAt']);
    assert.equal(record.schemaVersion, 'buildr.nacos-authorization-use/v1'); assert.ok(Number.isFinite(Date.parse(record.usedAt)));
    if (process.platform !== 'win32') assert.equal(fs.statSync(path.join(directory, file)).mode & 0o777, 0o600);
  }
  const provider = f.providers[0].nacos!;
  const originalPublish = provider.publish;
  let failedAttempts = 0;
  provider.publish = async () => { failedAttempts++; throw connectionFailure('nacos_publish_outcome_unknown', '外部系统结果未知。', 502); };
  t.after(() => { provider.publish = originalPublish; });
  f.seed(f.prod);
  const failedEvidence = { ...evidence, source: '第三次用户授权消息 fixture-message-3', statement: '允许第三次展示的发布尝试。' };
  await assert.rejects(f.application.nacos.publish(f.root, f.prod.id, { ...input, authorization: failedEvidence }), { code: 'nacos_publish_outcome_unknown' });
  await assert.rejects(f.application.nacos.publish(f.root, f.prod.id, { ...input, authorization: failedEvidence }), { code: 'nacos_production_authorization_used' });
  assert.equal(failedAttempts, 1, '结果未知时不得用同一授权重试');
  assert.equal(f.publications.length, 2);
});

test('生产原文没有变化时不触发发布；只读预览在访问外部系统前拒绝实际发布', async t => {
  const f = fixture(t), { input } = await prepare(f, f.prod, originalContent);
  const result = await f.application.nacos.publish(f.root, f.prod.id, input);
  assert.equal(result.published, false); assert.equal(result.unchanged, true); assert.equal(result.serviceReloaded, false);
  const preview = new ConnectionsApplication({ dataRoot: path.join(f.base, 'preview-profile'), credentialDataRoot: f.dataRoot, readonlyScope: f.scope, store: f.store, resolveScope: () => f.scope, providers: f.providers });
  const before = f.calls.length;
  await assert.rejects(preview.nacos.publish(f.root, f.prod.id, input), { code: 'connection_preview_readonly' });
  assert.equal(f.calls.length, before); assert.equal(f.publications.length, 0);
});

test('跨连接比较明确第二目标和内容，不修改配置；候选与第二连接不能同时提供', async t => {
  const f = fixture(t); f.seed(f.qa, 'service:\n  timeout: 20\n', 'local.yml', 'LOCAL');
  const result = await f.application.nacos.diff(f.root, f.prod.id, { dataId, compareConnection: f.qa.id, compareDataId: 'local.yml', compareGroup: 'LOCAL' });
  assert.deepEqual(result.comparisonTarget, { connectionId: f.qa.id, consoleUrl: f.qa.config.consoleUrl, namespaceId: 'public', group: 'LOCAL', dataId: 'local.yml', apiVersion: 'v3' });
  assert.equal(result.target.connectionId, f.prod.id); assert.equal(result.afterSha256, sha256('service:\n  timeout: 20\n')); assert.equal(result.equal, false);
  assert.equal(f.publications.length, 0);
  assert.deepEqual(f.calls.map(call => call.action), ['get', 'get']);
  const before = f.calls.length;
  for (const value of [{ dataId, content: candidateContent, compareConnection: f.qa.id }, { dataId }, { dataId, content: candidateContent, compareGroup: 'LOCAL' }]) await assert.rejects(f.application.nacos.diff(f.root, f.prod.id, value), { code: 'nacos_comparison_invalid' });
  assert.equal(f.calls.length, before);
});

test('命令行读取完整原文到新文件并限制权限，已有文件保持原字节且输出不包含认证', async t => {
  const f = fixture(t), outputFile = path.join(f.base, 'configuration.yml');
  const result = await cli(t, f, 'get', ['--data-id', dataId, '--output-file', outputFile]);
  assert.equal(result.operation, 'nacos-get'); assert.equal(result.outputFile, outputFile); assert.equal(result.content, originalContent);
  assert.deepEqual(fs.readFileSync(outputFile), Buffer.from(originalContent, 'utf8'));
  if (process.platform !== 'win32') assert.equal(fs.statSync(outputFile).mode & 0o777, 0o600);
  fs.writeFileSync(outputFile, '用户已有内容\n');
  await assert.rejects(cli(t, f, 'get', ['--data-id', dataId, '--output-file', outputFile]), { code: 'nacos_cli_output_invalid' });
  assert.equal(fs.readFileSync(outputFile, 'utf8'), '用户已有内容\n'); assert.equal(f.publications.length, 0);
});

test('命令行候选文件保留字节顺序标记及原换行，比较摘要覆盖完整原文', async t => {
  const f = fixture(t), content = '\uFEFF' + candidateContent, file = path.join(f.base, 'candidate-with-bom.yml');
  fs.writeFileSync(file, content, 'utf8');
  const result = await cli(t, f, 'diff', ['--data-id', dataId, '--content-file', file]);
  assert.equal(result.afterSha256, sha256(content));
  assert.equal(result.authorizationScope.contentSha256, sha256(content));
  assert.ok(result.diff.lines.some(line => line === '+\uFEFF# 保留注释\r'));
});

test('命令行分页使用数值，查找与跨连接比较经过真实命令贡献入口', async t => {
  const f = fixture(t);
  const namespaces = await cli(t, f, 'namespaces');
  assert.deepEqual(namespaces.namespaces, [{ namespaceId: 'public', namespaceName: 'public' }]);
  const listed = await cli(t, f, 'list', ['--data-id', 'saas-*', '--group', 'DEFAULT_GROUP', '--page', '2', '--page-size', '25']);
  assert.equal(listed.operation, 'nacos-list'); assert.equal(listed.pageNo, 2); assert.equal(listed.pageSize, 25);
  assert.deepEqual(f.calls.find(call => call.action === 'list')?.input, { dataId: 'saas-*', group: 'DEFAULT_GROUP', pageNo: 2, pageSize: 25 });
  const compared = await cli(t, f, 'diff', ['--data-id', dataId, '--compare-connection', f.prod.id]);
  assert.equal(compared.equal, true); assert.equal(compared.comparisonTarget?.connectionId, f.prod.id); assert.equal(f.publications.length, 0);
  for (const value of ['0', '-1', '1.5', 'not-a-number']) await assert.rejects(cli(t, f, 'list', ['--page', value]), { code: 'nacos_cli_invalid' });
});

test('命令行生产发布使用本次差异授权文件，候选可从标准输入读取但双重输入必须提前拒绝', async t => {
  const f = fixture(t), contentFile = path.join(f.base, 'candidate.yml'), authFile = path.join(f.base, 'authorization.json');
  fs.writeFileSync(contentFile, candidateContent);
  const diff = await cli(t, f, 'diff', ['--data-id', dataId, '--content-file', contentFile], f.prod);
  fs.writeFileSync(authFile, JSON.stringify(authorization(diff.authorizationScope)));
  const flags = ['--data-id', dataId, '--content-file', contentFile, '--expected-revision', String(diff.expectedRevision), '--expected-md5', String(diff.expectedMd5)];
  await assert.rejects(cli(t, f, 'publish', flags, f.prod), { code: 'nacos_production_authorization_required' });
  let stdinReads = 0;
  const originalRead = fs.readFileSync.bind(fs);
  const inputCapture = t.mock.method(fs, 'readFileSync', (...args: Parameters<typeof fs.readFileSync>) => {
    if (args[0] === 0) { stdinReads++; return Buffer.from(candidateContent, 'utf8'); }
    return originalRead(...args);
  });
  try {
    await assert.rejects(cli(t, f, 'publish', ['--data-id', dataId, '--content-file', '-', '--expected-revision', String(diff.expectedRevision), '--expected-md5', String(diff.expectedMd5), '--authorization-file', '-'], f.prod), { code: 'nacos_cli_invalid' });
    assert.equal(stdinReads, 0, '双重标准输入必须在读取或等待用户输入之前拒绝');
    const result = await cli(t, f, 'publish', ['--data-id', dataId, '--content-file', '-', '--expected-revision', String(diff.expectedRevision), '--expected-md5', String(diff.expectedMd5), '--authorization-file', authFile], f.prod);
    assert.equal(stdinReads, 1); assert.equal(result.published, true); assert.equal(result.serviceReloaded, false); assert.equal(f.publications.length, 1);
  } finally { inputCapture.mock.restore(); }
});

test('命令行已知参数不完整或互斥时先拒绝，不读取标准输入', async t => {
  const f = fixture(t);
  let stdinReads = 0;
  const originalRead = fs.readFileSync.bind(fs);
  const capture = t.mock.method(fs, 'readFileSync', (...args: Parameters<typeof fs.readFileSync>) => {
    if (args[0] === 0) { stdinReads++; return Buffer.from(candidateContent, 'utf8'); }
    return originalRead(...args);
  });
  try {
    for (const [action, flags] of [
      ['publish', ['--data-id', dataId, '--content-file', '-']],
      ['diff', ['--data-id', dataId, '--content-file', '-', '--compare-connection', f.prod.id]],
      ['diff', ['--data-id', dataId, '--content-file', '-', '--compare-group', 'LOCAL']],
    ] as const) {
      await assert.rejects(cli(t, f, action, [...flags]), { code: 'nacos_cli_invalid' });
      assert.equal(stdinReads, 0, action + ' 必须在等候标准输入之前拒绝已知非法参数');
    }
    assert.equal(f.calls.length, 0);
  } finally { capture.mock.restore(); }
});

test('普通二次读取发布仍校验生产逐次授权，命令行保留保护方式和局限提示', async t => {
  const f = fixture(t), originalPublish = f.providers[0].nacos!.publish;
  const warning = '二次读取不能原子阻止最后一次读取与写入之间的并发覆盖。';
  t.mock.method(f.providers[0].nacos!, 'publish', async (...args: Parameters<typeof originalPublish>) => ({
    ...await originalPublish(...args), concurrencyProtection: 'preflight-recheck' as const, concurrencyWarning: warning,
  }));
  const contentFile = path.join(f.base, 'ordinary-candidate.yml'), authFile = path.join(f.base, 'ordinary-authorization.json');
  fs.writeFileSync(contentFile, candidateContent);
  const diff = await cli(t, f, 'diff', ['--data-id', dataId, '--content-file', contentFile], f.prod);
  const flags = ['--data-id', dataId, '--content-file', contentFile, '--expected-revision', String(diff.expectedRevision), '--expected-md5', String(diff.expectedMd5)];
  await assert.rejects(cli(t, f, 'publish', flags, f.prod), { code: 'nacos_production_authorization_required' });
  assert.equal(f.publications.length, 0);
  fs.writeFileSync(authFile, JSON.stringify(authorization(diff.authorizationScope)));
  const published = await cli(t, f, 'publish', [...flags, '--authorization-file', authFile], f.prod);
  assert.equal(published.published, true); assert.equal(published.verified, true);
  assert.equal(published.concurrencyProtection, 'preflight-recheck'); assert.equal(published.concurrencyWarning, warning);
  f.seed(f.prod);
  await assert.rejects(cli(t, f, 'publish', [...flags, '--authorization-file', authFile], f.prod), { code: 'nacos_production_authorization_used' });
  assert.equal(f.publications.length, 1);
});

test('命令行参数冲突和缺失明确拒绝，MySQL 连接不能用于 Nacos 操作', async t => {
  const f = fixture(t), cliContribution = createConnectionsCliContributions(f.application)[0];
  const run = (args: string[]) => cliContribution.run(null, { argv: ['node', 'buildr', 'connection', 'nacos', ...args, '--target', f.root] });
  for (const args of [
    ['unknown'], ['get', '--connection', f.qa.id], ['list'], ['list', '--connection', f.qa.id, '--page'],
    ['list', '--connection', f.qa.id, '--connection', f.prod.id], ['list', '--connection', f.qa.id, '--unknown', 'x'],
    ['publish', '--connection', f.prod.id, '--data-id', dataId, '--expected-md5', md5(originalContent)],
  ]) await assert.rejects(run(args), { code: 'nacos_cli_invalid' }, args.join(' '));
  assert.equal(f.calls.length, 0);
  const invalidUtf8 = path.join(f.base, 'invalid-utf8.yml'); fs.writeFileSync(invalidUtf8, Buffer.from([0xc3, 0x28]));
  await assert.rejects(cli(t, f, 'diff', ['--data-id', dataId, '--content-file', invalidUtf8]), { code: 'nacos_cli_input_invalid' });
  assert.equal(f.calls.length, 0, '无效本机输入不得调用外部系统');
  const mysql = f.application.create(f.root, { name: '只读 MySQL', category: 'data-source', type: 'mysql', environment: 'qa', config: { host: '127.0.0.1', username: 'fixture-reader' }, credentials: { password: 'fixture-password-only' } }).connection;
  for (const action of [
    () => f.application.nacos.namespaces(f.root, mysql.id),
    () => f.application.nacos.list(f.root, mysql.id, {}),
    () => f.application.nacos.get(f.root, mysql.id, { dataId }),
    () => f.application.nacos.diff(f.root, mysql.id, { dataId, content: candidateContent }),
    () => f.application.nacos.publish(f.root, mysql.id, { dataId, content: candidateContent, expectedRevision: mysql.revision, expectedMd5: md5(originalContent) }),
    () => cli(t, f, 'get', ['--data-id', dataId], mysql),
  ]) await assert.rejects(action(), { code: 'connection_operation_unsupported' });
  assert.equal(f.calls.length, 0); assert.equal(f.publications.length, 0);
});


test('生产授权目录被文件占用时报告本机存储错误，恢复目录后原授权仍可使用', async t => {
  const f = fixture(t), { diff, input } = await prepare(f), evidence = authorization(diff.authorizationScope);
  const directory = path.join(f.root, '.buildr', 'local', 'nacos-publish-authorizations');
  fs.mkdirSync(path.dirname(directory), { recursive: true }); fs.writeFileSync(directory, 'blocked directory');
  await assert.rejects(f.application.nacos.publish(f.root, f.prod.id, { ...input, authorization: evidence }), { code: 'nacos_production_authorization_store_failed' });
  assert.equal(f.publications.length, 0);
  fs.unlinkSync(directory);
  assert.equal((await f.application.nacos.publish(f.root, f.prod.id, { ...input, authorization: evidence })).published, true);
});

test('生产读取未确认实际格式时不发布也不消费用户授权', async t => {
  const f = fixture(t);
  f.seed(f.prod, originalContent, dataId, 'DEFAULT_GROUP', null);
  const { diff, input } = await prepare(f), evidence = authorization(diff.authorizationScope);
  assert.equal(diff.authorizationScope.type, null);
  await assert.rejects(f.application.nacos.publish(f.root, f.prod.id, { ...input, authorization: evidence }), { code: 'nacos_metadata_unavailable' });
  assert.equal(f.publications.length, 0);
  assert.equal(fs.existsSync(path.join(f.root, '.buildr', 'local', 'nacos-publish-authorizations')), false);
  f.seed(f.prod);
  const observed = await prepare(f);
  assert.equal((await f.application.nacos.publish(f.root, f.prod.id, { ...observed.input, authorization: { ...evidence, scope: observed.diff.authorizationScope } })).published, true);
});
