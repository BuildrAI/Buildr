import assert from 'node:assert/strict';
import test from 'node:test';
import { createApiClient } from '../src/api/client.ts';
import { createConnectionSkillsClient } from '../src/features/connection-skills/api/connection-skills-api.ts';
import { afterPersonalSave, afterTeamSave, authenticationDraftsAfterRead, authenticationSourceAllowed, authorizationAccountLabel, bindingFor, bindingKey, categoryLabel, connectionDraftChanged, connectionEnvironmentHidden, connectionSystems, createDraftRequestScope, draftHookInput, draftObservations, fieldDefaults, hooksAvailable, personalAuthenticationOnly, personalDraftDirty, personalDraftFor, validateFields, websiteHref, withFieldValue } from '../src/features/connection-skills/connection-skill-form.ts';
import { tabForPath } from '../src/app/workspace-pages.ts';
import { connectionFieldLabel, connectionSummaryLines, displayFieldLabels, fieldLabelsAfterRead } from '../src/features/connection-skills/connection-skill-summary.ts';
import { sortConnectionInstances } from '../src/features/connection-skills/connection-skill-list.ts';

const entry = {
  definition: { schemaVersion: 'buildr.connection-definition/v1', definitionId: 'custom', name: '自制接入', category: 'custom', configVersion: 1,
    config: { fields: [{ key: 'endpoint', label: '网站地址', type: 'url', required: true }, { key: 'scope', label: '范围', type: 'select', default: 'default', optionsFrom: 'scopes' }] },
    authentication: { fields: [{ key: 'username', label: '用户名', type: 'string', required: true }, { key: 'password', label: '密码', type: 'secret', required: true }], targetFields: ['endpoint'] },
    programs: { cli: {} }, hooks: { test: { program: 'cli', args: ['test'], effect: 'read' }, scopes: { program: 'cli', args: ['scopes'], effect: 'read' } } },
  skill: { id: 'custom-method', assetIdentity: 'workspace:custom', sourceIdentity: 'workspace:source' }, revision: 'definition-current', enabled: true, available: true,
};
const instance = { id: 'instance-a', binding: bindingFor(entry), config: { endpoint: 'https://custom.example.test/', scope: 'default' }, teamRevision: 'team-current', localRevision: 'local-current',
  authentication: { source: 'personal', team: { configured: true, values: { username: 'team' } }, personal: { present: true, configured: true, values: { username: 'person' } } } };

test('连接按类别聚集，同类保留输入顺序且未知类别同样适用', () => {
  const input = Object.freeze([
    { id: 'logs-a', category: 'logs' },
    { id: 'mysql', category: 'data-source', name: 'Z MySQL', environment: 'prod' },
    { id: 'custom-a', category: 'company-custom' },
    { id: 'nacos', category: 'configuration' },
    { id: 'yearning', category: 'data-source', name: 'A Yearning', environment: 'qa' },
    { id: 'custom-b', category: 'company-custom' },
  ].map(Object.freeze));
  const before = [...input], result = sortConnectionInstances(input);
  assert.deepEqual(result.map(row => row.id), ['custom-a', 'custom-b', 'nacos', 'mysql', 'yearning', 'logs-a']);
  assert.notEqual(result, input);
  assert.deepEqual(input, before, 'Display ordering never changes the directory snapshot.');
  assert.equal(result[3], input[1], 'Rows retain their exact object identity and execution binding.');
});

test('排序权重相同但机器键不同的类别仍分别聚集', () => {
  const input = [
    { id: 'decomposed-first', category: 'e\u0301' },
    { id: 'composed', category: '\u00e9' },
    { id: 'decomposed-second', category: 'e\u0301' },
  ];
  assert.deepEqual(sortConnectionInstances(input).map(row => row.id), ['decomposed-first', 'decomposed-second', 'composed']);
});

test('草稿明确测试团队组而不改变已保存个人来源，不展开保持的秘密', () => {
  const before = structuredClone(instance);
  const input = draftHookInput(entry, instance, instance.config, { source: 'team', intent: 'keep' });
  assert.equal(input.authentication.source, 'team');
  assert.deepEqual(input.authentication, { source: 'team', intent: 'keep' });
  assert.deepEqual(input.expected, { teamRevision: 'team-current', definitionRevision: 'definition-current', localRevision: 'local-current' });
  assert.deepEqual(instance, before);
});

test('个人模式只选择本机个人完整组，缺省声明继续兼容团队与个人', () => {
  const personal = structuredClone(entry);
  personal.definition.authentication.allowedSources = ['personal'];
  assert.equal(personalAuthenticationOnly(personal), true);
  assert.equal(personalAuthenticationOnly(entry), false);
  assert.equal(personalAuthenticationOnly(undefined), false);
  assert.throws(() => draftHookInput(personal, instance, instance.config, { source: 'team', intent: 'keep' }), /不支持所选认证来源/);
  const kept = draftHookInput(personal, instance, instance.config, { source: 'personal', intent: 'keep' }, 'scopes');
  assert.deepEqual(kept.authentication, { source: 'personal', intent: 'keep' });
  assert.equal(kept.expected.localRevision, instance.localRevision);
  assert.throws(() => draftHookInput(personal, instance, instance.config, { source: 'personal', intent: 'replace', values: { username: 'other' } }), /密码/);
  const teamOnly = structuredClone(entry); teamOnly.definition.authentication.allowedSources = ['team'];
  assert.equal(personalAuthenticationOnly(teamOnly), false);
  assert.equal(authenticationSourceAllowed(teamOnly, 'personal'), false);
  assert.equal(authenticationSourceAllowed(teamOnly, 'team'), true);
  assert.equal(authenticationSourceAllowed(entry, 'personal'), true);
  assert.throws(() => draftHookInput(teamOnly, instance, instance.config, { source: 'personal', intent: 'keep' }), /不支持所选认证来源/);
});

test('旧版共享认证通过保全迁移接口搬到本机，旧个人来源仍可单独移除', async () => {
  const requests = [], expected = { teamRevision: 'team-current', definitionRevision: 'definition-current', localRevision: 'local-current' };
  const client = createConnectionSkillsClient(async (url, init) => { requests.push({ url, init }); return { instance, migrated: true, sourceRemoved: true }; }, 'workspace');
  await client.migratePersonal(instance.id, { source: { id: instance.id, authenticationSource: 'team', expected }, expected, removeSource: true });
  assert.equal(requests.length, 1); assert.equal(requests[0].init.method, 'POST');
  assert.equal(requests[0].url, '/api/v1/workspaces/workspace/connection-skills/instances/instance-a/auth/migrate');
  assert.deepEqual(JSON.parse(requests[0].init.body), { source: { id: instance.id, authenticationSource: 'team', expected }, expected, removeSource: true });
  assert.equal(requests[0].init.body.includes('password'), false, 'The browser never round-trips the old stored secret during migration.');
  await client.savePersonal(instance.id, { intent: 'remove', expected });
  assert.equal(requests[1].init.method, 'PUT'); assert.deepEqual(JSON.parse(requests[1].init.body), { intent: 'remove', expected });
});

test('查看个人秘密是显式带版本的非缓存POST，普通读取不触发查看', async t => {
  const requests = [], expected = { teamRevision: 'team-current', definitionRevision: 'definition-current', localRevision: 'local-current' };
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    requests.push({ url, init });
    return new Response(JSON.stringify(url.endsWith('/reveal') ? { field: 'password', value: 'fictional-personal-secret' } : { instance }), { headers: { 'content-type': 'application/json' } });
  });
  const client = createConnectionSkillsClient(createApiClient({ getWorkspaceId: () => 'ignored', sessionAdapter: { writeHeaders: () => ({ 'x-buildr-session': 'fixture' }) } }), 'workspace');
  await client.get(instance.id);
  assert.equal(requests.length, 1); assert.equal(requests[0].url.endsWith('/reveal'), false);
  const controller = new AbortController();
  assert.deepEqual(await client.revealPersonal(instance.id, { field: 'password', expected }, controller.signal), { field: 'password', value: 'fictional-personal-secret' });
  const request = requests[1];
  assert.equal(request.url, '/api/v1/workspaces/workspace/connection-skills/instances/instance-a/auth/reveal');
  assert.equal(request.init.method, 'POST'); assert.equal(request.init.cache, 'no-store');
  assert.equal(request.init.headers.get('x-buildr-session'), 'fixture'); assert.equal(request.init.signal, controller.signal);
  assert.deepEqual(JSON.parse(request.init.body), { field: 'password', expected });
  assert.equal(request.init.body.includes('fictional-personal-secret'), false);
});

test('不完整个人候选不回退团队，目标变化不能保持旧认证', () => {
  assert.throws(() => draftHookInput(entry, instance, instance.config, { source: 'personal', intent: 'replace', values: { username: 'person' } }), /密码/);
  assert.throws(() => draftHookInput(entry, instance, { ...instance.config, endpoint: 'https://other.example.test/' }, { source: 'personal', intent: 'keep' }), /目标已改变/);
  const fresh = draftHookInput(entry, instance, { ...instance.config, endpoint: 'https://other.example.test/' }, { source: 'personal', intent: 'replace', values: { username: 'new', password: 'fictional' } });
  assert.equal(fresh.authentication.values.username, 'new');
  assert.equal(instance.authentication.source, 'personal');
});

test('声明默认字段与动态范围保留，字段校验不需要远端测试', () => {
  assert.deepEqual(fieldDefaults(entry.definition.config.fields), { scope: 'default' });
  assert.doesNotThrow(() => validateFields(entry.definition.config.fields, { endpoint: instance.config.endpoint, scope: 'not-in-page' }));
  assert.equal(websiteHref('javascript:alert(1)'), null);
  assert.equal(websiteHref('https://user:password@example.test/'), null);
  assert.equal(websiteHref('https://custom.example.test/'), instance.config.endpoint);
});

test('摘要使用已保存动态选择名称，编号漂移或非选择标签安全回退', () => {
  const current = { ...instance, definition: { ...entry, definition: { ...entry.definition, presentation: { summaryFields: ['endpoint', 'scope'] } } }, fieldLabels: { scope: { value: 'default', label: '应用日志视图' } } };
  assert.deepEqual(connectionSummaryLines(current), [instance.config.endpoint, '应用日志视图']);
  assert.equal(connectionFieldLabel(entry.definition.config.fields[1], 'default', current.fieldLabels), '应用日志视图');
  assert.deepEqual(connectionSummaryLines({ ...current, fieldLabels: undefined }), [instance.config.endpoint, 'default']);
  assert.deepEqual(connectionSummaryLines({ ...current, config: { ...instance.config, scope: 'another-id' } }), [instance.config.endpoint, 'another-id']);
  assert.equal(connectionFieldLabel(entry.definition.config.fields[0], instance.config.endpoint, { endpoint: { value: instance.config.endpoint, label: '错误地址名称' } }), undefined);
  assert.deepEqual(current.config, instance.config, 'A display name cannot replace the execution target.');
});

test('地址后多个范围合并为一行且不创建空白摘要', () => {
  const fields = [...entry.definition.config.fields, { key: 'group', label: '默认分组', type: 'string' }];
  const current = { ...instance, config: { endpoint: instance.config.endpoint, scope: 'public', group: 'DEFAULT_GROUP' }, definition: { ...entry, definition: { ...entry.definition, config: { fields }, presentation: { summaryFields: ['endpoint', 'scope', 'group'] } } } };
  assert.deepEqual(connectionSummaryLines(current), [instance.config.endpoint, 'public · DEFAULT_GROUP']);
  assert.deepEqual(connectionSummaryLines({ ...current, config: { ...current.config, group: '', scope: undefined } }), [instance.config.endpoint]);
  assert.deepEqual(connectionSummaryLines({ ...current, config: {} }), []);
});

test('保存个人账号或重读后未修改的名称跟随新公共结果，未保存选择与清除草稿保留', () => {
  const fields = entry.definition.config.fields, config = instance.config;
  const baseline = { scope: { value: 'default', label: '旧视图名称' } }, incoming = { scope: { value: 'default', label: '[已隐藏]' } };
  assert.deepEqual(fieldLabelsAfterRead(fields, config, baseline, baseline, incoming), incoming);
  assert.deepEqual(fieldLabelsAfterRead(fields, config, baseline, baseline, {}), {}, 'An omitted public name must not remain visible from stale editor state.');
  const pending = { scope: { value: 'draft-id', label: '尚未保存的选择' } };
  assert.deepEqual(fieldLabelsAfterRead(fields, { ...config, scope: 'draft-id' }, pending, baseline, incoming), pending);
  const discovered = { scope: { value: 'default', label: '刚发现的名称' } };
  assert.deepEqual(fieldLabelsAfterRead(fields, config, discovered, baseline, incoming), discovered);
  assert.deepEqual(fieldLabelsAfterRead(fields, config, {}, baseline, incoming), {}, 'A deliberate clearing remains a draft.');
  assert.deepEqual(fieldLabelsAfterRead(fields, config, baseline, baseline, incoming, true), {}, 'A server name from an unchanged old target does not follow a draft target change.');
  assert.deepEqual(fieldLabelsAfterRead(fields, { ...config, scope: 'another' }, baseline, baseline, incoming), {});
});

test('草稿名称按已知团队和个人秘密仅作展示遮蔽，保留原始名称与编号作为保存输入', () => {
  const fields = entry.definition.config.fields, config = instance.config;
  const labels = { scope: { value: 'default', label: 'team-secret-long personal-secret team-secret' } }, before = structuredClone(labels);
  assert.deepEqual(displayFieldLabels(fields, config, labels, ['team-secret', 'team-secret-long', 'personal-secret']), { scope: { value: 'default', label: '[已隐藏] [已隐藏] [已隐藏]' } });
  assert.deepEqual(labels, before);
  assert.deepEqual(displayFieldLabels(fields, config, labels, ['default']), {}, 'A matching secret never substitutes the actual selection identity.');
  assert.deepEqual(displayFieldLabels(fields, { ...config, scope: 'changed-id' }, labels, []), {});
});

test('输入改变、更新请求和关闭后，已取消请求即使返回也不能更新草稿', async () => {
  const scope = createDraftRequestScope(), first = scope.begin();
  const late = Promise.resolve('late');
  const second = scope.begin();
  assert.equal(await late, 'late');
  assert.equal(first.signal.aborted, true); assert.equal(first.isCurrent(), false); assert.equal(second.isCurrent(), true);
  scope.invalidate(); assert.equal(second.isCurrent(), false);
});

test('测试失败仍能独立保存团队配置，个人保存与测试使用不同接口', async t => {
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    requests.push({ url, init });
    return new Response(url.endsWith('/test') ? JSON.stringify({ status: 'failure', authenticationSource: 'team', diagnostics: ['模拟失败'] }) : '{}', { headers: { 'content-type': 'application/json' } });
  });
  const client = createConnectionSkillsClient(createApiClient({ getWorkspaceId: () => 'different', sessionAdapter: { writeHeaders: () => ({ 'x-buildr-session': 'test' }) } }), 'chosen/workspace');
  const input = draftHookInput(entry, instance, instance.config, { source: 'team', intent: 'replace', values: { username: 'team', password: 'fictional' } });
  assert.equal((await client.test(input)).status, 'failure');
  await client.update(instance.id, { name: '自制连接', environment: '', enabled: true, binding: instance.binding, config: instance.config, authentication: { intent: 'keep' }, expected: input.expected });
  await client.savePersonal(instance.id, { intent: 'remove', expected: input.expected });
  assert.deepEqual(requests.map(request => request.url), ['/api/v1/workspaces/chosen%2Fworkspace/connection-skills/test', '/api/v1/workspaces/chosen%2Fworkspace/connection-skills/instances/instance-a', '/api/v1/workspaces/chosen%2Fworkspace/connection-skills/instances/instance-a/auth']);
  assert.equal(requests[2].init.method, 'PUT');
  assert.equal(JSON.parse(requests[1].init.body).authentication.intent, 'keep');
  for (const request of requests) { assert.equal(request.url.includes('fictional'), false); assert.equal(request.init.headers.get('x-buildr-session'), 'test'); }
});

test('目录一次请求交付实例、定义及局部诊断，旧独立读取保持兼容', async () => {
  const requests = [], controller = new AbortController();
  const directory = { instances: [instance], definitions: [entry], diagnostics: [{ code: 'fixture', message: '部分来源不可用' }] };
  const client = createConnectionSkillsClient(async (url, init) => {
    requests.push({ url, init });
    if (url.endsWith('/directory')) return directory;
    return url.endsWith('/instances') ? { instances: directory.instances, diagnostics: [] } : { definitions: directory.definitions, diagnostics: [] };
  }, 'chosen/workspace');
  assert.deepEqual(await client.directory(controller.signal), directory);
  assert.deepEqual(requests.map(request => request.url), ['/api/v1/workspaces/chosen%2Fworkspace/connection-skills/directory']);
  assert.equal(requests[0].init.signal, controller.signal);
  assert.deepEqual(await client.list(), { instances: [instance], diagnostics: [] });
  assert.deepEqual(await client.definitions(), { definitions: [entry], diagnostics: [] });
  assert.deepEqual(requests.slice(1).map(request => request.url), ['/api/v1/workspaces/chosen%2Fworkspace/connection-skills/instances', '/api/v1/workspaces/chosen%2Fworkspace/connection-skills/definitions']);
});

test('目录拒绝错误结构和旧接口结果，不静默补发独立读取', async () => {
  for (const result of [null, {}, { instances: [], diagnostics: [] }, { definitions: [], diagnostics: [] }, { instances: [], definitions: [], diagnostics: null }]) {
    const requests = [];
    const client = createConnectionSkillsClient(async url => { requests.push(url); return result; }, 'workspace');
    await assert.rejects(client.directory(), /连接目录响应格式无效/);
    assert.deepEqual(requests, ['/api/v1/workspaces/workspace/connection-skills/directory']);
  }
  const cause = new Error('无法读取连接目录');
  const client = createConnectionSkillsClient(async () => { throw cause; }, 'workspace');
  await assert.rejects(client.directory(), error => error === cause);
});

test('连接页面只恢复现行目录身份，旧页面地址归一', () => {
  const current = tabForPath('ws', '/workspaces/ws/connection-skills');
  assert.deepEqual(current, { key: 'dir:connection-skills', kind: 'dir', title: '连接', path: '/workspaces/ws/connection-skills' });
  assert.deepEqual(tabForPath('ws', '/workspaces/ws/connections'), current);
});

test('保存团队区不放行陈旧个人草稿，保存个人区不放行陈旧团队草稿', () => {
  const initial = draftObservations({ ...instance, definitionRevision: entry.revision });
  const teamSaved = afterTeamSave(initial, { ...instance, teamRevision: 'team-self-saved', localRevision: 'personal-peer-edit', definitionRevision: entry.revision });
  assert.equal(teamSaved.team.teamRevision, 'team-self-saved');
  assert.equal(teamSaved.personal.localRevision, 'local-current', 'Do not adopt an unseen personal revision from a team response.');
  const personalSaved = afterPersonalSave(initial, { ...instance, teamRevision: 'team-peer-edit', localRevision: 'personal-self-saved', definitionRevision: entry.revision });
  assert.equal(personalSaved.personal.localRevision, 'personal-self-saved');
  assert.equal(personalSaved.team.teamRevision, 'team-current', 'Do not adopt an unseen team revision from a personal response.');
});

test('已知程序不可用禁用相关动作，但不增加保存前测试要求', () => {
  assert.equal(hooksAvailable(entry, { ...instance, availability: { ready: false } }, undefined, false), false);
  assert.equal(hooksAvailable(entry, { ...instance, availability: { ready: true } }, { ready: false }, false), false);
  assert.equal(hooksAvailable(entry, { ...instance, availability: { ready: true } }, { ready: true }, false), true);
  assert.doesNotThrow(() => validateFields(entry.definition.config.fields, instance.config));
});
test('次要程序缺失及不同程序检查不阻断正常槽位，未提供槽位不可运行', () => {
  const multiple = structuredClone(entry);
  multiple.definition.programs.exporter = {};
  multiple.definition.hooks.exports = { program: 'exporter', args: ['options'], effect: 'read' };
  const observed = { ...instance, availability: { ready: true }, programAvailability: { cli: { ready: true }, exporter: { ready: false, diagnostics: ['尚未安装'] } } };
  assert.equal(hooksAvailable(multiple, observed, undefined, false), true);
  assert.equal(hooksAvailable(multiple, observed, undefined, false, 'scopes'), true);
  assert.equal(hooksAvailable(multiple, observed, undefined, false, 'exports'), false);
  assert.equal(hooksAvailable(multiple, observed, { program: 'exporter', ready: false }, false, 'scopes'), true);
  assert.equal(hooksAvailable(multiple, observed, { program: 'cli', ready: false }, false, 'scopes'), false);
  assert.equal(hooksAvailable(multiple, observed, undefined, false, 'absent'), false);
  const discoverOnly = structuredClone(multiple); delete discoverOnly.definition.hooks.test;
  assert.equal(hooksAvailable(discoverOnly, observed, undefined, false), false);
  assert.equal(hooksAvailable(discoverOnly, observed, undefined, false, 'scopes'), true, 'discovery does not depend on a test slot');
});

test('空密码按声明保全，缺失值不同于显式空值，清空可选整数不提交null', () => {
  const field = { key: 'password', label: '密码', type: 'secret', required: true };
  assert.doesNotThrow(() => validateFields([field], { password: '' }));
  assert.doesNotThrow(() => validateFields([field], { password: ' ' }));
  assert.throws(() => validateFields([field], {}), /请填写密码/);
  assert.throws(() => validateFields([{ ...field, minLength: 1 }], { password: '' }), /长度/);
  assert.deepEqual(withFieldValue({ port: 12, label: '' }, 'port', null), { label: '' });
  assert.equal(websiteHref('https://fixture.example.test/?access_token=secret'), null);
  assert.equal(websiteHref('https://fixture.example.test/#/app?token=secret'), null);
  assert.equal(websiteHref('https://fixture.example.test/nacos/#/'), 'https://fixture.example.test/nacos/#/');
});

test('配置版本升级不是同一可写绑定，不静默采用新声明', () => {
  assert.notEqual(bindingKey(instance.binding), bindingKey({ ...instance.binding, configVersion: 2 }));
});

test('按真实类别与系统组织选项，同系统多实现仍保留准确绑定', () => {
  const first = structuredClone(entry); first.definition.systemId = 'company-system';
  first.definition.presentation = { categoryLabel: '公司系统', methodLabel: '标准接入', summaryFields: [] };
  const second = structuredClone(first); second.skill.assetIdentity = 'workspace:alternative'; second.skill.sourceIdentity = 'workspace:alternative-source';
  const disabled = structuredClone(first); disabled.enabled = false; disabled.definition.systemId = 'disabled-system';
  const groups = connectionSystems([first, second, disabled]);
  assert.equal(groups.length, 1); assert.equal(groups[0].entries.length, 2); assert.equal(groups[0].categoryLabel, '公司系统');
  assert.notEqual(bindingKey(bindingFor(groups[0].entries[0])), bindingKey(bindingFor(groups[0].entries[1])));
  assert.equal(categoryLabel('configuration'), '配置系统'); assert.equal(categoryLabel('company-defined-category'), 'company-defined-category');
});

test('发现仅要求声明输入，仍检查完整认证和给定字段，保存测试保持全量', () => {
  const scoped = structuredClone(entry);
  scoped.definition.config.fields[1].required = true;
  scoped.definition.config.fields.push({ key: 'optionalEndpoint', label: '发现入口', type: 'url' });
  scoped.definition.hooks = { scopes: { program: 'cli', args: ['scopes'], effect: 'read', inputs: ['config.endpoint', 'authentication.username', 'authentication.password'] }, test: { program: 'cli', args: ['test'], effect: 'read' } };
  const auth = { source: 'team', intent: 'replace', values: { username: 'team', password: '' } };
  assert.doesNotThrow(() => draftHookInput(scoped, undefined, { endpoint: instance.config.endpoint }, auth, 'scopes'));
  assert.throws(() => draftHookInput(scoped, undefined, { endpoint: instance.config.endpoint }, auth), /范围/);
  assert.throws(() => draftHookInput(scoped, undefined, { endpoint: instance.config.endpoint }, auth, 'test'), /范围/);
  assert.throws(() => draftHookInput(scoped, undefined, { endpoint: instance.config.endpoint, optionalEndpoint: 'broken' }, auth, 'scopes'), /发现入口/);
  assert.throws(() => draftHookInput(scoped, undefined, { endpoint: instance.config.endpoint }, { source: 'team', intent: 'replace', values: { username: 'team' } }, 'scopes'), /密码/);
  scoped.definition.hooks.scopes.inputs.push('config.optionalEndpoint');
  assert.throws(() => draftHookInput(scoped, undefined, { endpoint: instance.config.endpoint }, auth, 'scopes'), /发现入口/);
});

test('发现不能省略认证目标，也不能通过条件隐藏绕过显式前置输入', () => {
  const discovery = structuredClone(entry);
  discovery.definition.config.fields[0].required = false;
  discovery.definition.config.fields[0].dependsOn = { field: 'scope', equals: 'hidden-target' };
  discovery.definition.authentication.fields.push({ key: 'clientId', label: '客户端标识', type: 'string', dependsOn: { field: 'username', equals: 'hidden-client' } });
  discovery.definition.hooks = { scopes: { program: 'cli', args: ['scopes'], effect: 'read', inputs: ['authentication.clientId'] } };
  const auth = { source: 'team', intent: 'replace', values: { username: 'team', password: '' } };
  assert.throws(() => draftHookInput(discovery, undefined, {}, auth, 'scopes'), /网站地址/);
  assert.throws(() => draftHookInput(discovery, undefined, { endpoint: instance.config.endpoint }, auth, 'scopes'), /客户端标识/);
  assert.doesNotThrow(() => draftHookInput(discovery, undefined, { endpoint: instance.config.endpoint }, { ...auth, values: { ...auth.values, clientId: 'explicit' } }, 'scopes'));
});

test('主保存只保护实际个人修改，展开与恢复原状不阻止关闭', () => {
  const absent = personalDraftFor();
  assert.equal(personalDraftDirty(absent, structuredClone(absent)), false);
  assert.equal(personalDraftDirty(absent, { ...absent, enabled: true }), true);
  assert.equal(personalDraftDirty(absent, { ...absent, values: { username: 'unused' } }), false, 'Disabled personal authentication has no pending effective change.');
  const configured = personalDraftFor(instance);
  assert.equal(personalDraftDirty(configured, structuredClone(configured)), false);
  assert.equal(personalDraftDirty(configured, { ...configured, enabled: false }), true);
  assert.equal(personalDraftDirty(configured, { ...configured, intent: 'replace' }), true, 'Explicit replacement remains a draft even before entering a secret.');
  assert.equal(personalDraftDirty(configured, { ...configured, intent: 'replace', values: { username: 'person', password: '' } }), true, 'An explicit empty password is a real replacement.');
  const unavailable = personalDraftFor({ ...instance, authentication: { ...instance.authentication, personal: { present: true, configured: false, values: { username: 'old' } } } });
  assert.equal(personalDraftDirty(unavailable, structuredClone(unavailable)), false, 'An existing invalid account alone is not an unsaved edit.');
  const saved = personalDraftFor({ ...instance, authentication: { ...instance.authentication, personal: { present: true, configured: true, values: { username: 'new' } } } });
  assert.equal(personalDraftDirty(saved, structuredClone(saved)), false, 'Independent save establishes a new clean baseline.');
});

test('重读刷新保持认证的公开身份与干净基线，明确更换和移除草稿保持', () => {
  const before = personalDraftFor(instance), fresh = { ...instance, authentication: { source: 'personal', team: { configured: true, values: { username: 'new-team' } }, personal: { present: true, configured: true, values: { username: 'new-person' } } } };
  const current = authenticationDraftsAfterRead(fresh, { intent: 'keep', values: { username: 'old-team' }, edited: false }, before, structuredClone(before));
  assert.equal(current.team.values.username, 'new-team'); assert.equal(current.personal.values.username, 'new-person'); assert.equal(personalDraftDirty(current.personalBaseline, current.personal), false);
  const replacing = { enabled: true, intent: 'replace', values: { username: 'draft-person', password: '' } };
  const explicit = authenticationDraftsAfterRead(fresh, { intent: 'replace', values: { username: 'draft-team', password: '' }, edited: true }, before, replacing);
  assert.equal(explicit.team.values.username, 'draft-team'); assert.deepEqual(explicit.personal, replacing); assert.equal(personalDraftDirty(explicit.personalBaseline, explicit.personal), true);
  const removal = authenticationDraftsAfterRead(fresh, { intent: 'remove', values: {}, edited: true }, before, { ...before, enabled: false });
  assert.equal(removal.team.intent, 'remove'); assert.equal(removal.personal.enabled, false); assert.equal(removal.personal.values.username, 'new-person'); assert.equal(personalDraftDirty(removal.personalBaseline, removal.personal), true);
  assert.equal(personalDraftDirty(removal.personalBaseline, { ...removal.personal, enabled: true }), false, 'Cancelling removal returns to the fresh saved account.');
  const untouchedBlank = authenticationDraftsAfterRead(fresh, { intent: 'replace', values: {}, edited: false }, personalDraftFor(), personalDraftFor());
  assert.equal(untouchedBlank.team.intent, 'keep'); assert.equal(untouchedBlank.personal.values.username, 'new-person'); assert.equal(personalDraftDirty(untouchedBlank.personalBaseline, untouchedBlank.personal), false);
});


test('连接环境展示仅消费明确声明，账号摘要不回退内部字段', () => {
  const managed = structuredClone(entry);
  managed.definition.presentation = { environment: 'hidden', summaryFields: [] };
  managed.definition.authentication.authorization = { program: 'cli', args: ['authorize'], inputs: ['config.endpoint'], label: '登录授权', reauthorizeLabel: '重新授权', timeoutMs: 30000 };
  assert.equal(connectionEnvironmentHidden(entry), false); assert.equal(connectionEnvironmentHidden(undefined), false); assert.equal(connectionEnvironmentHidden(managed), true);
  assert.equal(authorizationAccountLabel(managed, instance), '', 'No declaration means no username or internal user ID fallback.');
  managed.definition.authentication.authorization.accountLabelField = 'username';
  assert.equal(authorizationAccountLabel(managed, instance), 'person');
  managed.definition.authentication.authorization.accountLabelField = 'password';
  assert.equal(authorizationAccountLabel(managed, { ...instance, authentication: { ...instance.authentication, personal: { ...instance.authentication.personal, values: { password: 'never-display' } } } }), '');
});

test('授权前识别非秘密配置草稿且不因身份观察变化丢弃草稿', () => {
  const saved = { ...instance, name: '连接', environment: '', enabled: true, fieldLabels: {} };
  const draft = { name: '连接', environment: '', enabled: true, config: { scope: 'default', endpoint: instance.config.endpoint }, fieldLabels: {} };
  assert.equal(connectionDraftChanged(saved, draft), false);
  assert.equal(connectionDraftChanged(saved, { ...draft, name: '新名称' }), true);
  assert.equal(connectionDraftChanged(saved, { ...draft, config: { ...draft.config, scope: 'other' } }), true);
  assert.equal(connectionDraftChanged(saved, { ...draft, fieldLabels: { scope: { value: 'default', label: '范围' } } }), true);
  assert.equal(connectionDraftChanged(undefined, draft), false, 'A new connection may save its shell as part of the explicit authorization action.');
});

test('授权方法的发现保持宿主完整认证，不要求前端接收内部账号字段', () => {
  const managed = structuredClone(entry); managed.definition.authentication.allowedSources = ['personal'];
  managed.definition.authentication.authorization = { program: 'cli', args: ['authorize'], inputs: ['config.endpoint'], label: '登录授权', reauthorizeLabel: '重新授权', timeoutMs: 30000 };
  const projected = { ...instance, authentication: { ...instance.authentication, personal: { ...instance.authentication.personal, values: {} } } };
  assert.deepEqual(draftHookInput(managed, projected, instance.config, { source: 'personal', intent: 'keep' }, 'scopes').authentication, { source: 'personal', intent: 'keep' });
  assert.throws(() => draftHookInput(managed, projected, instance.config, { source: 'personal', intent: 'replace', values: { username: 'person', password: 'manual' } }), /请先授权/);
  assert.throws(() => draftHookInput(managed, { ...projected, authentication: { ...projected.authentication, personal: { ...projected.authentication.personal, configured: false } } }, instance.config, { source: 'personal', intent: 'keep' }), /请先授权/);
});

test('授权请求只传准确实例观察并支持取消，不把内部认证交给网页', async () => {
  const requests = [], expected = { teamRevision: 'team-current', localRevision: 'local-current', definitionRevision: 'definition-current' }, controller = new AbortController();
  const client = createConnectionSkillsClient(async (url, init) => { requests.push({ url, init }); return { status: 'success', instance }; }, 'selected/workspace');
  assert.equal((await client.authorizePersonal(instance.id, { expected }, controller.signal)).status, 'success');
  assert.equal(requests[0].url, '/api/v1/workspaces/selected%2Fworkspace/connection-skills/instances/instance-a/auth/authorize');
  assert.equal(requests[0].init.method, 'POST'); assert.equal(requests[0].init.signal, controller.signal);
  assert.deepEqual(JSON.parse(requests[0].init.body), { expected });
  assert.equal(requests.length, 1);
});
