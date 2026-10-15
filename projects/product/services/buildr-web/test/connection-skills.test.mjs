import assert from 'node:assert/strict';
import test from 'node:test';
import { createApiClient } from '../src/api/client.ts';
import { createConnectionSkillsClient } from '../src/features/connection-skills/api/connection-skills-api.ts';
import { afterPersonalSave, afterTeamSave, authenticationDraftsAfterRead, bindingFor, bindingKey, categoryLabel, connectionSystems, createDraftRequestScope, draftHookInput, draftObservations, fieldDefaults, hooksAvailable, personalDraftDirty, personalDraftFor, validateFields, websiteHref, withFieldValue } from '../src/features/connection-skills/connection-skill-form.ts';
import { tabForPath } from '../src/app/workspace-pages.ts';
import { connectionFieldLabel, connectionSummaryLines, displayFieldLabels, fieldLabelsAfterRead } from '../src/features/connection-skills/connection-skill-summary.ts';

const entry = {
  definition: { schemaVersion: 'buildr.connection-definition/v1', definitionId: 'custom', name: '自制接入', category: 'custom', configVersion: 1,
    config: { fields: [{ key: 'endpoint', label: '网站地址', type: 'url', required: true }, { key: 'scope', label: '范围', type: 'select', default: 'default', optionsFrom: 'scopes' }] },
    authentication: { fields: [{ key: 'username', label: '用户名', type: 'string', required: true }, { key: 'password', label: '密码', type: 'secret', required: true }], targetFields: ['endpoint'] },
    programs: { cli: {} }, hooks: { test: { program: 'cli', args: ['test'], effect: 'read' }, scopes: { program: 'cli', args: ['scopes'], effect: 'read' } } },
  skill: { id: 'custom-method', assetIdentity: 'workspace:custom', sourceIdentity: 'workspace:source' }, revision: 'definition-current', enabled: true, available: true,
};
const instance = { id: 'instance-a', binding: bindingFor(entry), config: { endpoint: 'https://custom.example.test/', scope: 'default' }, teamRevision: 'team-current', localRevision: 'local-current',
  authentication: { source: 'personal', team: { configured: true, values: { username: 'team' } }, personal: { present: true, configured: true, values: { username: 'person' } } } };

test('草稿明确测试团队组而不改变已保存个人来源，不展开保持的秘密', () => {
  const before = structuredClone(instance);
  const input = draftHookInput(entry, instance, instance.config, { source: 'team', intent: 'keep' });
  assert.equal(input.authentication.source, 'team');
  assert.deepEqual(input.authentication, { source: 'team', intent: 'keep' });
  assert.deepEqual(input.expected, { teamRevision: 'team-current', definitionRevision: 'definition-current', localRevision: 'local-current' });
  assert.deepEqual(instance, before);
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

test('新页面可以恢复页签，旧连接仍保留原身份', () => {
  assert.equal(tabForPath('ws', '/workspaces/ws/connection-skills').key, 'dir:connection-skills');
  assert.equal(tabForPath('ws', '/workspaces/ws/connections').key, 'dir:connections');
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
