import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import YAML from 'yaml';
import { createRuntime, runtimeProvide } from '../../src/bootstrap/runtime.ts';
import { WORKSPACE_APPLICATION } from '../../src/modules/workspace/module.ts';
import { CONNECTION_SKILLS_APPLICATION } from '../../src/modules/connection-skills/module.ts';
import { createLocalWorkspaceServer } from '../../src/web/http/server.ts';
import { launchTestBrowser } from './browser-launch.ts';

const serviceRoot = path.resolve(import.meta.dirname, '../..');
const smokeRoot = process.env.BUILDR_SMOKE_ROOT!, workspaceRoot = process.env.BUILDR_SMOKE_WORKSPACE_ROOT!;
assert.ok(smokeRoot && workspaceRoot, 'Use the isolated workspace smoke runner.');
assert.equal(process.env.BUILDR_APP_DATA_DIR, path.join(smokeRoot, 'app-data'));
assert.equal(process.env.BUILDR_PRODUCT_DATA_DIR, path.join(smokeRoot, 'product-data'));
const initialized = spawnSync(process.execPath, [path.join(serviceRoot, 'bin/buildr.mjs'), 'init', '--target', workspaceRoot, '--name', 'connection-browser', '--description', 'Isolated connection browser fixture.', '--profile', 'team'], { cwd: serviceRoot, env: process.env, encoding: 'utf8' });
assert.equal(initialized.status, 0, initialized.stderr);
const skillRoot = path.join(workspaceRoot, 'skills/connections/browser-connection');
fs.mkdirSync(path.join(skillRoot, 'assets'), { recursive: true }); fs.mkdirSync(path.join(skillRoot, 'scripts'));
fs.writeFileSync(path.join(skillRoot, 'SKILL.md'), '---\nname: browser-connection\ndescription: 离线浏览器接入夹具。\n---\n\n仅用于隔离测试，不调用外部系统。\n');
const definition = {
  schemaVersion: 'buildr.connection-definition/v1', definitionId: 'browser', name: '浏览器夹具', description: '离线测试接入', category: 'configuration', systemId: 'browser-fixture', configVersion: 1,
  config: { fields: [{ key: 'endpoint', label: '网站地址', type: 'url', required: true }, { key: 'scope', label: '命名空间', type: 'select', required: true, optionsFrom: 'scopes' }, { key: 'apiMode', label: '接口版本', type: 'enum', values: ['auto', 'v1'], default: 'auto' }, { key: 'production', label: '生产环境', type: 'boolean', default: true }] },
  authentication: { fields: [{ key: 'username', label: '用户名', type: 'string', required: true }, { key: 'password', label: '密码', type: 'secret', required: true }], targetFields: ['endpoint'] },
  programs: { cli: { kind: 'bundled', runtime: 'node', entry: 'scripts/client.mjs', contextProtocol: 'buildr.connection-context/v1' }, exporter: { kind: 'installed', executable: 'buildr-browser-fixture-missing-exporter' } },
  hooks: { test: { program: 'cli', args: ['test'], effect: 'read' }, scopes: { program: 'cli', args: ['scopes'], effect: 'read', inputs: ['config.endpoint', 'authentication.username', 'authentication.password'] } },
  presentation: { summaryFields: ['endpoint', 'scope'], websiteField: 'endpoint', categoryLabel: '配置系统', methodLabel: '夹具标准接入', groups: [{ id: 'connection', title: '地址与账号', fields: ['config.endpoint', 'authentication.username', 'authentication.password', 'config.production'] }, { id: 'scope', title: '默认范围', fields: ['config.scope'] }, { id: 'advanced', title: '更多设置', fields: ['config.apiMode'], collapsed: true }] },
};
fs.writeFileSync(path.join(skillRoot, 'assets/connection.yml'), YAML.stringify(definition));
fs.writeFileSync(path.join(skillRoot, 'assets/alternative.yml'), YAML.stringify({ ...definition, definitionId: 'browser-alternative', presentation: { ...definition.presentation, methodLabel: '夹具另一接入' } }));
fs.writeFileSync(path.join(skillRoot, 'scripts/client.mjs'), `process.once('message', ({context}) => { const auth=context.connections.primary.authentication; const fail=auth.values.password==='fixture-wrong'; const result=process.argv[2]==='scopes'?{status:'success',options:[{value:'scope-a',label:'测试空间'},{value:'scope-b',label:'另一个空间'}]}:{status:fail?'failure':'success',checks:fail?[]:['登录及范围读取通过','账号：'+auth.values.username],diagnostics:fail?['模拟账号拒绝']:[],limitations:['离线夹具不证明真实接入']}; console.log(JSON.stringify(result)); process.disconnect(); process.exitCode=fail?1:0; });`);
const manifestPath = path.join(workspaceRoot, 'skills/manifest.yml'), manifest = YAML.parse(fs.readFileSync(manifestPath, 'utf8'));
manifest.skills.push({ id: 'browser-connection', path: 'connections/browser-connection', enabled: true, assetIdentity: 'workspace:browser-connection', sourceIdentity: 'workspace:browser-fixture', connectionDefinitions: ['assets/connection.yml', 'assets/alternative.yml'] });
fs.writeFileSync(manifestPath, YAML.stringify(manifest));

const runtime = createRuntime(), workspace: any = runtimeProvide(runtime, WORKSPACE_APPLICATION), connections: any = runtimeProvide(runtime, CONNECTION_SKILLS_APPLICATION);
const entry = connections.definitions(workspaceRoot).definitions.find((item: any) => item.definition.definitionId === 'browser');
assert.ok(entry, 'Fixture definition must be discoverable.');
const binding = { skillAssetIdentity: entry.skill.assetIdentity, sourceIdentity: entry.skill.sourceIdentity, definitionId: entry.definition.definitionId, configVersion: 1 };
const created = connections.save(workspaceRoot, null, { name: '浏览器连接', environment: '测试', enabled: true, binding, config: { endpoint: 'https://fixture.example.test/', scope: 'scope-a' }, authentication: { intent: 'replace', values: { username: 'fixture-team-user', password: 'fixture-team-password' } }, expected: { teamRevision: 'absent', definitionRevision: entry.revision } }).instance;
const mysqlEntry = connections.definitions(workspaceRoot).definitions.find((item: any) => item.skill.assetIdentity === 'buildr:skill:mysql-connection' && item.definition.definitionId === 'mysql');
assert.ok(mysqlEntry, 'The builtin MySQL definition must be available for the query UI fixture.');
const queryInstance = connections.save(workspaceRoot, null, { name: '离线查询界面夹具', environment: '测试', enabled: true, binding: { skillAssetIdentity: mysqlEntry.skill.assetIdentity, sourceIdentity: mysqlEntry.skill.sourceIdentity, definitionId: 'mysql', configVersion: 1 }, config: { host: 'offline-query.example.invalid', port: 3306 }, authentication: { intent: 'replace', values: { username: 'fixture-query-reader', password: 'fixture-query-password' } }, expected: { teamRevision: 'absent', definitionRevision: mysqlEntry.revision } }).instance;
assert.equal(created.programAvailability.cli.ready, true);
assert.equal(created.programAvailability.exporter.ready, false, 'A missing optional exporter stays a program-level diagnostic.');
const teamFile = path.join(workspaceRoot, created.sourcePath), teamInitial = fs.readFileSync(teamFile, 'utf8');
const host = createLocalWorkspaceServer(runtime, { targetRoot: workspaceRoot, ensureRegisteredTarget: workspace.ensureRegisteredTarget, resolveRegisteredWorkspace: workspace.resolveRegisteredWorkspace, staticRoot: process.env.BUILDR_BROWSER_WEB_DIST_ROOT || path.join(serviceRoot, 'build/connection-skills-web-dist') });
const browser = await launchTestBrowser();
let page: Awaited<ReturnType<typeof browser.newPage>> | undefined;
const screenshots = process.env.BUILDR_SCREENSHOT_DIR || path.resolve(serviceRoot, '../../../../.buildr/local/connection-skills');
fs.mkdirSync(screenshots, { recursive: true });
try {
  const { url, initialWorkspaceId } = await host.ready;
  page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const browserErrors: string[] = []; page.on('pageerror', error => browserErrors.push(error.message));
  const legacyRequests: string[] = []; page.on('request', request => { if (/\/api\/v1\/workspaces\/[^/]+\/connections(?:\/|$)/u.test(new URL(request.url()).pathname)) legacyRequests.push(request.url()); });
  const queryRequests: { path: string; body: Record<string, unknown> | null }[] = [];
  // This fixture proves the query UI contract only; no database or real query backend is contacted.
  await page.route('**/mysql-query/connections/**', async route => {
    const request = route.request(), target = new URL(request.url()), operation = target.pathname.split('/').at(-1);
    const body = request.method() === 'POST' || request.method() === 'PUT' ? request.postDataJSON() as Record<string, unknown> : null;
    queryRequests.push({ path: target.pathname, body });
    assert.ok(target.pathname.includes(`/mysql-query/connections/${queryInstance.id}/`));
    assert.equal(body?.connectionRevision ?? target.searchParams.get('revision'), queryInstance.revision, 'The UI pins every query operation to the observed instance revision.');
    let result: unknown;
    if (operation === 'databases') result = { connectionId: queryInstance.id, databases: ['orders'] };
    else if (operation === 'query-preferences') result = { enabledDatabases: ['orders'], currentDatabase: 'orders', revision: 'fixture-query-preferences' };
    else {
      assert.equal(operation, 'query', 'The UI fixture only supports database discovery, preferences and a read query.');
      result = { connectionId: queryInstance.id, database: 'orders', submittedSql: body!.sql, executedSql: body!.sql, columns: [{ name: 'id', type: 'BIGINT' }, { name: 'amount', type: 'DECIMAL' }], rows: [['9007199254740993123', '123456789012345.123456789']], rowCount: 1, rowLimit: 100, elapsedMs: 1, limitReached: false };
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(result) });
  });
  const base = `${url}/workspaces/${initialWorkspaceId}`;
  const reads = { directory: 0, instances: 0, definitions: 0, legacy: 0 };
  page.on('request', request => {
    if (request.method() !== 'GET') return;
    const pathname = new URL(request.url()).pathname;
    if (pathname === `/api/v1/workspaces/${initialWorkspaceId}/connection-skills/directory`) reads.directory++;
    if (pathname === `/api/v1/workspaces/${initialWorkspaceId}/connection-skills/instances`) reads.instances++;
    if (pathname === `/api/v1/workspaces/${initialWorkspaceId}/connection-skills/definitions`) reads.definitions++;
    if (pathname === `/api/v1/workspaces/${initialWorkspaceId}/connections`) reads.legacy++;
  });
  const assertReads = (expected: typeof reads, reason: string) => assert.deepEqual(reads, expected, reason);
  const editOriginal = () => page!.locator('#connection-skills-table').locator(`[data-row-key="${created.id}"]`).getByRole('button', { name: '编辑', exact: true }).click();
  const directoryPattern = '**/connection-skills/directory';
  await page.route(directoryPattern, async route => {
    const response = await route.fetch(), body = await response.json();
    await route.fulfill({ response, json: { ...body, diagnostics: [...body.diagnostics, { code: 'fixture-local-source', message: '目录局部诊断夹具' }] } });
  });
  await page.addInitScript(({ workspaceId, basePath }) => {
    localStorage.setItem(`buildr.web.page-tabs.${workspaceId}`, JSON.stringify([
      { path: `${basePath}/connections`, title: '连接' },
      { path: `${basePath}/connection-skills`, title: '连接（新机制）' },
    ]));
  }, { workspaceId: initialWorkspaceId, basePath: `/workspaces/${initialWorkspaceId}` });
  await page.goto(`${base}/connections`, { waitUntil: 'networkidle' });
  await page.waitForURL(`${base}/connection-skills`);
  await page.locator('#connection-skills-table').waitFor();
  assert.equal(await page.locator('[data-nav="connections"]').count(), 0, 'Retired connection navigation is removed.');
  assert.equal(await page.locator('[data-nav="connection-skills"]').getAttribute('aria-label'), '连接');
  assert.equal(await page.getByRole('link', { name: '打开已有连接', exact: true }).count(), 0);
  assert.equal(await page.locator('[data-page-tab="dir:connections"]').count(), 0, 'Restored legacy tabs never mount a retired page.');
  assert.ok(await page.locator('[data-page-tab="dir:connection-skills"]').count() > 0);
  await page.waitForFunction(workspaceId => {
    const tabs = JSON.parse(localStorage.getItem(`buildr.web.page-tabs.${workspaceId}`) || '[]');
    return tabs.length === 1 && tabs[0].key === 'dir:connection-skills' && tabs[0].title === '连接' && tabs[0].path === `/workspaces/${workspaceId}/connection-skills`;
  }, initialWorkspaceId);
  await page.locator('#connection-skills-table').locator(`[data-row-key="${queryInstance.id}"]`).getByRole('button', { name: '查询', exact: true }).click();
  await page.locator('#mysql-query-editor .cm-content').fill('SELECT id, amount FROM orders LIMIT 1;');
  await page.locator('#run-mysql-query').click();
  await page.locator('#mysql-query-results').getByText('9007199254740993123', { exact: true }).waitFor();
  await page.locator('#mysql-query-results').getByText('123456789012345.123456789', { exact: true }).waitFor();
  const submittedQueries = queryRequests.filter(request => request.path.endsWith('/query'));
  assert.equal(submittedQueries.length, 1);
  assert.deepEqual(submittedQueries[0].body, { sql: 'SELECT id, amount FROM orders LIMIT 1;', database: 'orders', connectionRevision: queryInstance.revision });
  assert.doesNotMatch(JSON.stringify(queryRequests), /fixture-query-reader|fixture-query-password/);
  await page.screenshot({ animations: 'disabled', path: path.join(screenshots, 'connection-skills-query-fixture.png') });
  await page.getByRole('button', { name: '关闭 MySQL 查询', exact: true }).click();
  await page.locator('#mysql-query-editor').waitFor({ state: 'hidden' });
  await page.unroute(directoryPattern);
  const initialReads = { ...reads };
  assertReads({ directory: 1, instances: 0, definitions: 0, legacy: 0 }, 'First display reads the combined directory once without independent reads.');
  await page.getByText('目录局部诊断夹具', { exact: true }).waitFor();
  await page.locator('#connection-skills-table').getByText('浏览器连接', { exact: true }).waitFor();
  assert.equal(await page.locator('#create-connection-skill').isEnabled(), true, 'A local source diagnostic does not hide valid instances or definitions.');
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForLoadState('networkidle');
  assertReads(initialReads, 'Window focus is not a connection-data change.');
  await page.locator('.shell-navigation').getByRole('link', { name: '服务', exact: true }).click();
  await page.waitForURL(`${base}/services`);
  await page.locator('[data-tab-key="dir:connection-skills"]:visible').click();
  await page.waitForURL(`${base}/connection-skills`);
  await page.waitForLoadState('networkidle');
  assertReads(initialReads, 'Returning to a completed retained page does not reread its data.');
  const retryPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  let retryReads = 0, releaseInitial!: () => void, initialStarted!: () => void, initialFinished!: () => void;
  const holdInitial = new Promise<void>(resolve => { releaseInitial = resolve; });
  const initialRequestStarted = new Promise<void>(resolve => { initialStarted = resolve; });
  const initialRequestFinished = new Promise<void>(resolve => { initialFinished = resolve; });
  await retryPage.route(directoryPattern, async route => {
    if (route.request().method() !== 'GET' || ++retryReads !== 1) return route.continue();
    const response = await route.fetch(), body = await response.json(); initialStarted();
    await holdInitial;
    try { await route.fulfill({ response, json: { ...body, instances: body.instances.map((instance: any) => ({ ...instance, name: '不能显示迟到列表' })) } }); } catch { /* The view correctly cancelled this request. */ }
    finally { initialFinished(); }
  });
  try {
    await retryPage.goto(`${base}/connection-skills`, { waitUntil: 'domcontentloaded' });
    await initialRequestStarted;
    await retryPage.locator('.shell-navigation').getByRole('link', { name: '服务', exact: true }).click();
    await retryPage.waitForURL(`${base}/services`);
    await retryPage.locator('[data-tab-key="dir:connection-skills"]:visible').click();
    await retryPage.waitForURL(`${base}/connection-skills`);
    await retryPage.locator('#connection-skills-table').getByText('浏览器连接', { exact: true }).waitFor();
    releaseInitial(); await initialRequestFinished;
    assert.equal(retryReads, 2, 'Returning after an interrupted first load retries that incomplete read.');
    assert.equal(await retryPage.getByText('不能显示迟到列表', { exact: true }).count(), 0, 'Cancelled first-load response never replaces the later current snapshot.');
  } finally { releaseInitial(); await retryPage.close(); }
  if (!await page.locator('#connection-skills-table').getByRole('button', { name: '编辑', exact: true }).count()) process.stderr.write(JSON.stringify({ url: page.url(), body: (await page.locator('body').innerText()).slice(0, 5000), browserErrors }) + '\n');
  await page.locator('#create-connection-skill').click();
  await page.locator('#connection-system-picker').waitFor();
  await page.locator('#connection-system-search').click();
  await page.screenshot({ animations: 'disabled', path: path.join(screenshots, 'connection-skills-picker.png') });
  await page.locator('#connection-system-search').fill('浏览器夹具');
  await page.locator('[data-connection-system]').filter({ hasText: '浏览器夹具' }).click();
  await page.locator('#connection-system-methods').waitFor();
  await page.locator('#connection-system-methods').getByRole('button').filter({ hasText: '夹具标准接入' }).click();
  assert.equal(await page.locator('#connection-skill-team-username').isVisible(), true, 'New connections directly ask for the team account.');
  assert.equal(await page.locator('#connection-skill-personal-enabled').isVisible(), false, 'Personal settings start collapsed.');
  assert.equal(await page.locator('#connection-skill-config-apiMode').isVisible(), false, 'Advanced fields start collapsed.');
  assert.equal(await page.locator('#connection-skill-config-production').isChecked(), true);
  await page.screenshot({ animations: 'disabled', path: path.join(screenshots, 'connection-skills-create.png') });
  await page.locator('#connection-skill-environment').fill('qa');
  assert.equal(await page.locator('#connection-skill-config-production').isChecked(), true, 'Environment text never infers the explicit production flag.');
  assert.equal(await page.locator('#discover-connection-skill-config-scope').isEnabled(), false);
  await page.locator('#connection-skill-config-endpoint').fill('https://fixture.example.test/');
  await page.locator('#connection-skill-team-username').fill('fixture-team-user');
  await page.locator('#connection-skill-team-password').fill('fixture-team-password');
  await page.locator('#discover-connection-skill-config-scope').click();
  await page.locator('#connection-skill-discovery-scope').filter({ hasText: '已读取 2 个可选项' }).waitFor();
  assertReads(initialReads, 'Discovering candidate options does not reload the directory or definitions.');
  assert.equal(await page.locator('#connection-skill-team-password').evaluate(element => Boolean(element.compareDocumentPosition(document.querySelector('#connection-skill-config-scope')!) & Node.DOCUMENT_POSITION_FOLLOWING)), true, 'Authentication precedes dynamic scope selection.');
  await page.locator('#connection-skill-config-scope').click();
  await page.getByTitle('测试空间', { exact: true }).click();
  await page.locator('#connection-skill-name').click();
  await page.locator('#connection-skill-name').press('ControlOrMeta+A');
  await page.locator('#connection-skill-name').press('Backspace');
  await page.locator('#connection-skill-name').press('Tab');
  assert.equal(await page.locator('#connection-skill-name').inputValue(), '');
  await page.locator('#save-connection-skill-team').click();
  await page.locator('#connection-skill-error').filter({ hasText: '请填写连接名称' }).waitFor();
  assert.equal(await page.locator('#connection-skill-editor').isVisible(), true, 'Failed main save retains the editor.');
  assert.equal(await page.locator('#connection-skill-config-endpoint').inputValue(), 'https://fixture.example.test/', 'Failed save retains entered values.');
  await page.locator('#connection-skill-name').fill('新增保存后关闭');
  await page.locator('#save-connection-skill-team').click();
  await page.locator('#connection-skill-editor').waitFor({ state: 'hidden' });
  await page.locator('#connection-skills-table').getByText('新增保存后关闭', { exact: true }).waitFor();
  const namedSelectionRow = page.locator('#connection-skills-table tr').filter({ hasText: '新增保存后关闭' });
  assert.equal(await namedSelectionRow.locator('.buildr-connection-skill-summary > span').nth(1).innerText(), '测试空间', 'Saved dynamic selection uses its chosen name in the list.');
  await namedSelectionRow.getByRole('button', { name: '编辑', exact: true }).click();
  assert.equal(await page.locator('.buildr-connection-skill-field').filter({ has: page.locator('#connection-skill-config-scope') }).locator('.ant-select-selection-item').innerText(), '测试空间', 'Reopening a saved connection retains the name without discovery.');
  await page.locator('#close-connection-skill-editor').click();
  assertReads(initialReads, 'Create response adds its row without another directory read.');
  const beforeFailedRefresh = { ...reads };
  await page.route(directoryPattern, route => route.fulfill({ status: 503, json: { error: { message: '模拟目录读取失败' } } }));
  await page.getByRole('button', { name: '刷新连接', exact: true }).click();
  await page.getByText('模拟目录读取失败', { exact: true }).waitFor();
  assert.equal(await namedSelectionRow.count(), 1, 'A directory failure preserves the last completed list.');
  assert.equal(await page.locator('#create-connection-skill').isEnabled(), true, 'A directory failure preserves the last completed definitions.');
  await page.unroute(directoryPattern);
  await page.route(directoryPattern, route => route.fulfill({ json: { instances: [], diagnostics: [] } }));
  await page.getByRole('button', { name: '刷新连接', exact: true }).click();
  await page.getByText('连接目录响应格式无效，请刷新后重试。', { exact: true }).waitFor();
  assert.equal(await namedSelectionRow.count(), 1, 'An old list response shape cannot clear a combined directory.');
  assert.equal(await page.locator('#create-connection-skill').isEnabled(), true, 'Malformed directory data cannot clear valid definitions.');
  await page.unroute(directoryPattern);
  assertReads({ ...beforeFailedRefresh, directory: beforeFailedRefresh.directory + 2 }, 'Failed or malformed directory reads do not fall back to independent requests.');
  await page.getByRole('button', { name: '刷新连接', exact: true }).click();
  await page.waitForLoadState('networkidle');
  const refreshedReads = { ...reads };
  assertReads({ ...beforeFailedRefresh, directory: beforeFailedRefresh.directory + 3 }, 'Each explicit refresh reads the combined current directory once.');
  await page.screenshot({ animations: 'disabled', path: path.join(screenshots, 'connection-skills-save-closed.png') });
  await editOriginal();
  await page.locator('#connection-skill-editor').waitFor();
  assert.equal(await page.locator('#connection-skill-team-username').isVisible(), false, 'Saved team authentication is a compact summary.');
  await page.locator('#connection-skill-personal-summary').click();
  await page.locator('#connection-skill-personal-enabled').click();
  await page.locator('#connection-skill-personal-username').fill('fixture-person-user');
  await page.locator('#connection-skill-personal-password').fill('fixture-person-password');
  await page.locator('#test-connection-skill-personal').click();
  await page.locator('#connection-skill-personal-test-result').filter({ hasText: '只读测试通过' }).waitFor();
  assertReads(refreshedReads, 'Personal candidate test does not reload the directory.');
  assert.equal(await page.locator('#connection-skill-test-result').count(), 0, 'Personal test result stays next to its own action.');
  await page.locator('#save-connection-skill-personal').click();
  await page.locator('#connection-skill-save-notice').filter({ hasText: '个人账号已保存' }).waitFor();
  assertReads(refreshedReads, 'Personal save updates the returned row without a list request.');
  assert.equal(fs.readFileSync(teamFile, 'utf8'), teamInitial, 'Personal save never rewrites team source.');
  assert.equal(connections.get(workspaceRoot, created.id).instance.authentication.source, 'personal');

  await page.locator('#connection-skill-personal-enabled').click();
  await page.locator('#close-connection-skill-editor').click();
  await editOriginal();
  await page.locator('#connection-skill-personal-summary').click();
  assert.equal(await page.locator('#connection-skill-personal-enabled').getAttribute('aria-checked'), 'true');
  assert.equal(connections.get(workspaceRoot, created.id).instance.authentication.source, 'personal', 'Unsaved switch never changes source.');
  await page.locator('#connection-skill-personal-summary').click();
  await page.locator('#connection-skill-personal-enabled').waitFor({ state: 'hidden' });
  await page.screenshot({ animations: 'disabled', path: path.join(screenshots, 'connection-skills-wide.png') });

  await page.locator('#test-connection-skill').click();
  await page.locator('#connection-skill-test-result').waitFor();
  assert.match(await page.locator('#connection-skill-test-result').innerText(), /只读测试通过/);
  assertReads(refreshedReads, 'Team candidate test only updates the editor result.');
  await page.getByText('接入详情', { exact: true }).click();
  await page.locator('#check-connection-skill-program').click();
  await page.locator('#connection-skill-program-result').waitFor();
  assertReads(refreshedReads, 'Explicit program check does not reload the list or definitions.');
  await page.getByText('接入详情', { exact: true }).click();
  assert.equal(connections.get(workspaceRoot, created.id).instance.authentication.source, 'personal', 'Team candidate test never removes personal source.');
  await page.locator('#change-connection-skill-team').click();
  await page.locator('#connection-skill-team-username').fill('fixture-team-user');
  await page.locator('#connection-skill-team-password').fill('fixture-wrong');
  await page.locator('#test-connection-skill').click();
  await page.locator('#connection-skill-test-result').filter({ hasText: '测试失败' }).waitFor();
  await page.locator('#save-connection-skill-team').click();
  await page.locator('#connection-skill-editor').waitFor({ state: 'hidden' });
  assertReads(refreshedReads, 'Updating a saved connection only replaces its row.');
  assert.equal(connections.get(workspaceRoot, created.id).instance.authentication.source, 'personal', 'Failed connection test does not block successful save or change personal authentication.');

  await editOriginal();
  await page.locator('#connection-skill-personal-summary').click();
  await page.locator('#change-connection-skill-personal').click();
  await page.locator('#connection-skill-personal-username').fill('fixture-draft-user');
  await page.locator('#connection-skill-personal-password').fill('fixture-draft-password');
  const beforePeer = connections.get(workspaceRoot, created.id).instance;
  connections.saveAuth(workspaceRoot, created.id, { intent: 'replace', values: { username: 'fixture-peer-user', password: 'fixture-peer-password' }, expected: { teamRevision: beforePeer.teamRevision, definitionRevision: beforePeer.definitionRevision, localRevision: beforePeer.localRevision } });
  await page.locator('#connection-skill-name').fill('团队区独立保存');
  await page.locator('#save-connection-skill-team').click();
  await page.locator('#connection-skill-save-notice').filter({ hasText: '个人账号修改尚未保存' }).waitFor();
  assert.equal(await page.locator('#connection-skill-editor').isVisible(), true, 'Main save preserves an unsaved personal draft.');
  assert.equal(await page.locator('#connection-skill-personal-username').inputValue(), 'fixture-draft-user');
  assert.equal(connections.get(workspaceRoot, created.id).instance.name, '团队区独立保存');
  await page.screenshot({ animations: 'disabled', path: path.join(screenshots, 'connection-skills-personal-draft-retained.png') });
  await page.locator('#save-connection-skill-personal').click();
  await page.locator('#reread-connection-skill').waitFor();
  assert.equal(connections.get(workspaceRoot, created.id).instance.authentication.personal.values.username, 'fixture-peer-user', 'Team save must not silently advance a stale personal draft baseline.');
  await page.locator('#reread-connection-skill').click();
  await page.locator('#connection-skill-save-notice').filter({ hasText: '已读取最新配置' }).waitFor();
  assert.equal(await page.locator('#connection-skill-personal-username').inputValue(), 'fixture-draft-user', 'Conflict reload retains the personal draft.');
  await page.locator('#save-connection-skill-personal').click();
  await page.locator('#connection-skill-save-notice').filter({ hasText: '个人账号已保存' }).waitFor();
  assert.equal(await page.locator('#connection-skill-editor').isVisible(), true, 'Independent personal save never closes the whole editor.');
  await page.locator('#save-connection-skill-team').click();
  await page.locator('#connection-skill-editor').waitFor({ state: 'hidden' });
  assertReads(refreshedReads, 'Detail reread and subsequent saves remain local to the selected row.');
  await editOriginal();

  const heldReadPattern = directoryPattern;
  let releaseRefresh!: () => void, refreshStarted!: () => void, refreshFinished!: () => void;
  const heldRefresh = new Promise<void>(resolve => { releaseRefresh = resolve; });
  const refreshRequestStarted = new Promise<void>(resolve => { refreshStarted = resolve; });
  const refreshRequestFinished = new Promise<void>(resolve => { refreshFinished = resolve; });
  await page.route(heldReadPattern, async route => {
    if (route.request().method() !== 'GET') return route.continue();
    const response = await route.fetch(); refreshStarted(); await heldRefresh;
    try { await route.fulfill({ response }); } catch { /* Local save cancelled the older directory request. */ }
    finally { refreshFinished(); }
  });
  try {
    await page.locator('#connection-skill-name').fill('保存响应优先');
    // Exercise overlap deterministically while the editor owns the visible overlay.
    await page.getByRole('button', { name: '刷新连接', exact: true }).evaluate((button: HTMLElement) => button.click());
    await refreshRequestStarted;
    await page.locator('#save-connection-skill-team').click();
    await page.locator('#connection-skill-editor').waitFor({ state: 'hidden' });
    await page.locator('#connection-skills-table').getByText('保存响应优先', { exact: true }).waitFor();
    releaseRefresh(); await refreshRequestFinished;
    assert.equal(await page.locator('#connection-skills-table').getByText('保存响应优先', { exact: true }).count(), 1, 'An older explicit-refresh result cannot roll back a saved row.');
    assertReads({ ...refreshedReads, directory: refreshedReads.directory + 1 }, 'Overlapping save cancels the older combined read without starting another one.');
  } finally { releaseRefresh(); await page.unroute(heldReadPattern); }
  await editOriginal();

  const beforeRefresh = connections.get(workspaceRoot, created.id).instance;
  connections.save(workspaceRoot, created.id, { name: beforeRefresh.name, environment: beforeRefresh.environment, enabled: beforeRefresh.enabled, binding: beforeRefresh.binding, config: beforeRefresh.config, authentication: { intent: 'replace', values: { username: 'fixture-refreshed-team', password: 'fixture-refreshed-team-password' } }, expected: { teamRevision: beforeRefresh.teamRevision, definitionRevision: beforeRefresh.definitionRevision } });
  const refreshedTeam = connections.get(workspaceRoot, created.id).instance;
  connections.saveAuth(workspaceRoot, created.id, { intent: 'replace', values: { username: 'fixture-refreshed-person', password: 'fixture-refreshed-person-password' }, expected: { teamRevision: refreshedTeam.teamRevision, definitionRevision: refreshedTeam.definitionRevision, localRevision: refreshedTeam.localRevision } });
  await page.locator('#save-connection-skill-team').click();
  await page.locator('#reread-connection-skill').waitFor();
  await page.locator('#reread-connection-skill').click();
  await page.locator('#connection-skill-save-notice').filter({ hasText: '已读取最新配置' }).waitFor();
  assert.match(await page.locator('#connection-skill-team-summary').innerText(), /fixture-refreshed-team/, 'Kept team identity refreshes after an external authentication change.');
  await page.locator('#connection-skill-personal-summary').click();
  assert.match(await page.locator('section[aria-label="本机个人认证"] .buildr-connection-auth-summary').innerText(), /fixture-refreshed-person/, 'Untouched personal identity refreshes too.');
  await page.locator('#test-connection-skill').click();
  await page.locator('#connection-skill-test-result').filter({ hasText: '只读测试通过' }).waitFor();
  await page.locator('#connection-skill-test-result > summary').click();
  await page.locator('#connection-skill-test-result').getByText('账号：fixture-refreshed-team', { exact: true }).waitFor();
  await page.locator('#test-connection-skill-personal').click();
  await page.locator('#connection-skill-personal-test-result').filter({ hasText: '只读测试通过' }).waitFor();
  await page.locator('#connection-skill-personal-test-result > summary').click();
  await page.locator('#connection-skill-personal-test-result').getByText('账号：fixture-refreshed-person', { exact: true }).waitFor();
  await page.locator('#save-connection-skill-team').click();
  await page.locator('#connection-skill-editor').waitFor({ state: 'hidden' });
  await editOriginal();

  const external = YAML.parse(fs.readFileSync(teamFile, 'utf8')); external.name = '另一入口修改'; fs.writeFileSync(teamFile, YAML.stringify(external));
  await page.locator('#connection-skill-name').fill('不能覆盖陈旧观察');
  await page.locator('#save-connection-skill-team').click();
  await page.locator('#reread-connection-skill').waitFor();
  assert.equal(YAML.parse(fs.readFileSync(teamFile, 'utf8')).name, '另一入口修改');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => {
    const drawer = document.querySelector('.buildr-connection-skill-drawer .ant-drawer-content-wrapper')?.getBoundingClientRect();
    const input = document.querySelector('#connection-skill-name')?.getBoundingClientRect();
    return drawer && input && drawer.x >= -1 && drawer.width <= innerWidth + 1 && input.x >= 0 && input.right <= innerWidth;
  });
  await page.locator('#connection-skill-name').focus(); await page.keyboard.press('Tab');
  assert.equal(await page.locator('#connection-skill-environment').evaluate(element => element === document.activeElement), true);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Narrow layout must not overflow.');
  await page.screenshot({ animations: 'disabled', path: path.join(screenshots, 'connection-skills-narrow.png') });
  await page.locator('#close-connection-skill-editor').click();
  fs.unlinkSync(path.join(skillRoot, 'assets/connection.yml'));
  await page.reload({ waitUntil: 'networkidle' });
  await editOriginal();
  await page.locator('#connection-skill-personal-summary').click();
  await page.locator('#connection-skill-personal-enabled').click();
  await page.locator('#save-connection-skill-personal').click();
  await page.locator('#connection-skill-save-notice').filter({ hasText: '个人账号已移除' }).waitFor();
  assert.equal(connections.get(workspaceRoot, created.id).instance.authentication.personal.present, false, 'Missing declaration never prevents explicit local authentication removal.');
  assert.equal(YAML.parse(fs.readFileSync(teamFile, 'utf8')).name, '另一入口修改');
  await page.locator('#close-connection-skill-editor').click();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.locator('#create-connection-skill').click();
  await page.locator('[data-connection-system]').filter({ hasText: 'Nacos' }).click();
  assert.equal(await page.locator('#connection-skill-config-production').isChecked(), false, 'New builtin Nacos starts with production unchecked; the custom fixture retains its own true default.');
  await page.locator('#connection-skill-config-apiBaseUrl').fill('http://admin.example.invalid:8848/nacos');
  await page.locator('#connection-skill-config-consoleUrl').fill('http://console.example.invalid:8080/');
  await page.locator('#connection-skill-team-username').fill('offline-reader');
  await page.locator('#connection-skill-team-password').fill('offline-fixture-password');
  await page.locator('#connection-skill-name').fill('独立接口与网站');
  await page.locator('#save-connection-skill-team').click();
  await page.locator('#connection-skill-editor').waitFor({ state: 'hidden' });
  const nacos = connections.list(workspaceRoot).instances.find((item: any) => item.name === '独立接口与网站');
  assert.equal(nacos.binding.configVersion, 2);
  assert.equal(nacos.config.apiBaseUrl, 'http://admin.example.invalid:8848/nacos');
  assert.equal(nacos.websiteUrl, 'http://console.example.invalid:8080/');
  const nacosSummary = page.locator('#connection-skills-table tr').filter({ hasText: '独立接口与网站' }).locator('.buildr-connection-skill-summary > span');
  assert.equal(await nacosSummary.count(), 2, 'Nacos address and default ranges occupy two logical lines.');
  assert.match(await nacosSummary.nth(1).innerText(), /public.*DEFAULT_GROUP/, 'Namespace and group share the second summary line.');
  const beforeDeleteReads = { ...reads };
  const addedRow = page.locator('#connection-skills-table tr').filter({ hasText: '新增保存后关闭' });
  await addedRow.getByRole('button', { name: /更多操作/ }).click();
  await page.getByRole('menuitem', { name: '删除实例', exact: true }).click();
  await page.locator('.ant-modal-confirm').getByRole('button', { name: /^删\s*除$/ }).click();
  await addedRow.waitFor({ state: 'hidden' });
  assertReads(beforeDeleteReads, 'Delete removes the selected row without rereading other instances.');
  await page.goto(`${base}/connections`, { waitUntil: 'networkidle' });
  await page.waitForURL(`${base}/connection-skills`);
  await page.locator('#connection-skills-table').waitFor();
  assert.equal(connections.get(workspaceRoot, created.id).instance.name, '另一入口修改');
  assert.deepEqual(legacyRequests, [], 'Connection navigation never calls a retired API.');
  assert.deepEqual(browserErrors, []);
  process.stdout.write(JSON.stringify({ schemaVersion: 'buildr.workspace-smoke-scenario/v1', status: 'passed', checks: ['system-and-explicit-method-selection', 'dependency-ordered-discovery', 'progressive-fields-and-authentication', 'explicit-production-flag', 'legacy-route-redirect', 'legacy-tabs-merge', 'single-connection-navigation', 'no-legacy-api-requests', 'mysql-query-ui-fixture', 'query-observed-revision-and-original-sql', 'query-precision-display', 'separate-save', 'unsaved-switch', 'explicit-candidate', 'failed-test-save-independent', 'independent-draft-revisions', 'revision-conflict', 'narrow-and-keyboard', 'missing-skill-personal-removal', 'main-save-closes-and-updates-row', 'failed-save-retains-draft', 'main-save-preserves-personal-draft', 'reread-authentication-identity', 'optional-program-failure-isolated', 'nacos-api-and-website-distinct', 'focus-and-retained-page-no-read', 'test-discovery-check-no-directory-read', 'explicit-refresh-only', 'local-save-delete', 'interrupted-first-read-retried', 'late-list-cannot-rollback-save', 'combined-directory-and-local-diagnostics', 'failed-or-malformed-directory-retains-snapshot'], realExternalSystem: false, queryBackend: 'intercepted-ui-fixture' }) + '\n');
} catch (error) {
  if (page) { process.stderr.write(JSON.stringify({ body: (await page.locator('body').innerText()).slice(-5000) }) + '\n'); await page.screenshot({ animations: 'disabled', path: path.join(screenshots, 'connection-skills-failure.png') }); }
  throw error;
} finally { await browser.close(); await host.shutdown(); }
