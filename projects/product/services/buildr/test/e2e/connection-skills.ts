import assert from 'node:assert/strict';
import { showPrimaryNavigation } from '../../../buildr-web/test/browser/primary-navigation-controls.ts';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import YAML from 'yaml';
import { createRuntime, runtimeProvide } from '../../src/bootstrap/runtime.ts';
import { WORKSPACE_APPLICATION } from '../../src/modules/workspace/module.ts';
import { CONNECTION_SKILLS_APPLICATION } from '../../src/modules/connection-skills/module.ts';
import { AGENT_SERVICE_APPLICATION } from '../../src/modules/agent-service/module.ts';
import { stopAgentProcess } from '@buildr-ai/buildr-harness';
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
  const returnToConnectionList = async () => {
    // A drawer's right-edge controls can leave the pointer over the conversation rail.
    await page!.locator('#connection-skills-search').hover();
    await page!.locator('#agent-conversation-panel').waitFor({ state: 'hidden' });
  };
  const browserErrors: string[] = []; let journeyScene = 'start'; page.on('pageerror', error => browserErrors.push(`${journeyScene}: ${error.stack || error.message}`));
  const legacyRequests: string[] = []; page.on('request', request => { if (/\/api\/v1\/workspaces\/[^/]+\/connections(?:\/|$)/u.test(new URL(request.url()).pathname)) legacyRequests.push(request.url()); });
  const queryRequests: { path: string; method: string; body: Record<string, unknown> | null }[] = [];
  const queryDatabases = ['orders', 'billing', 'analytics', 'inventory', 'reporting', 'saas_biz_common', 'saas_erp', 'saas_freshx', 'saasx_config', 'saasx_job', 'sys', 'test', 'trading_business', 'wvp', '__recycle_bin__', 'warehouse_reporting_archive_with_a_long_database_name'];
  let failNextTables = false;
  let queryGate: Promise<void> | null = null, failNextQuery = false;
  const tableReads = new Map<string, number>();
  let preferenceVersion = 0;
  let queryPreferences: { enabledDatabases: string[]; currentDatabase: string | null; revision: string } = { enabledDatabases: ['orders'], currentDatabase: 'orders', revision: 'fixture-query-preferences-0' };
  // This fixture proves the query UI contract only; no database or real query backend is contacted.
  await page.route('**/mysql-query/connections/**', async route => {
    const request = route.request(), target = new URL(request.url()), operation = target.pathname.split('/').at(-1);
    const body = request.method() === 'POST' || request.method() === 'PUT' ? request.postDataJSON() as Record<string, unknown> : null;
    queryRequests.push({ path: target.pathname, method: request.method(), body });
    assert.ok(target.pathname.includes(`/mysql-query/connections/${queryInstance.id}/`));
    assert.equal(body?.connectionRevision ?? target.searchParams.get('revision'), queryInstance.revision, 'The UI pins every query operation to the observed instance revision.');
    let result: unknown;
    if (operation === 'databases') result = { connectionId: queryInstance.id, databases: queryDatabases };
    else if (operation === 'tables') {
      const database = target.searchParams.get('database')!;
      tableReads.set(database, (tableReads.get(database) || 0) + 1);
      if (failNextTables) { failNextTables = false; await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'fixture_metadata_failure', message: '模拟表列表读取失败' } }) }); return; }
      result = { connectionId: queryInstance.id, database, tables: (database === 'billing' ? ['invoice_headers', 'invoice_lines'] : ['order_headers', 'order_lines', 'orders_with_a_very_long_name_for_layout_verification']).map(name => ({ name, type: 'BASE TABLE' })) };
    }
    else if (operation === 'query-preferences') {
      if (request.method() === 'PUT') {
        assert.equal(body!.expectedRevision, queryPreferences.revision, 'Every preference save uses the last confirmed preference revision.');
        const enabledDatabases = body!.enabledDatabases as string[];
        assert.ok(Array.isArray(enabledDatabases) && enabledDatabases.every(database => queryDatabases.includes(database)));
        assert.ok(body!.currentDatabase === null || enabledDatabases.includes(body!.currentDatabase as string));
        queryPreferences = { enabledDatabases, currentDatabase: body!.currentDatabase as string | null, revision: `fixture-query-preferences-${++preferenceVersion}` };
      }
      result = queryPreferences;
    }
    else {
      assert.equal(operation, 'query', 'The UI fixture supports database discovery, tables, preferences and a read query.');
      if (queryGate) await queryGate;
      if (failNextQuery) { failNextQuery = false; await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'fixture_query_failure', message: '模拟查询失败' } }) }); return; }
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
  journeyScene = 'legacy-redirect';
  await page.goto(`${base}/connections`);
  await page.waitForURL(`${base}/connection-skills`);
  await page.locator('#connection-skills-table').waitFor({ state: 'visible' });
  assert.equal(legacyRequests.length, 0);
  assert.equal(reads.legacy, 0);

  journeyScene = 'connection-edit-test-save';
  const row = page.locator('#connection-skills-table').locator(`[data-row-key="${created.id}"]`);
  await row.getByRole('button', { name: '编辑', exact: true }).click();
  await page.locator('#connection-skill-editor').waitFor({ state: 'visible' });
  await page.locator('#test-connection-skill').click();
  await page.getByText('本次只读测试通过', { exact: false }).waitFor({ state: 'visible' });
  await page.locator('#connection-skill-name').fill('浏览器连接（已更新）');
  await page.locator('#save-connection-skill-team').click();
  await page.locator('#connection-skill-editor').waitFor({ state: 'hidden' });
  await row.filter({ hasText: '浏览器连接（已更新）' }).waitFor({ state: 'visible' });

  journeyScene = 'mysql-query-smoke';
  await page.locator('#connection-skills-table').locator(`[data-row-key="${queryInstance.id}"]`).getByRole('button', { name: '查询', exact: true }).click();
  const sqlEditor = page.locator('#mysql-query-editor .cm-content');
  await sqlEditor.waitFor({ state: 'visible' });
  await sqlEditor.fill('SELECT id, amount FROM orders LIMIT 1;');
  await page.locator('#run-mysql-query:not([disabled])').waitFor();
  await page.locator('#run-mysql-query').click();
  await page.locator('#mysql-query-results').getByText('9007199254740993123', { exact: true }).waitFor();
  assert.equal(queryRequests.filter(request => request.path.endsWith('/query')).length, 1);

  assert.deepEqual(browserErrors, []);
  process.stdout.write(JSON.stringify({ schemaVersion: 'buildr.workspace-smoke-scenario/v1', status: 'passed', checks: ['legacy-route-redirect', 'connection-edit-test-save', 'mysql-query-ui-smoke'], realExternalSystem: false, queryBackend: 'intercepted-ui-fixture' }) + '\n');
} catch (error) {
  if (page) { process.stderr.write(JSON.stringify({ body: (await page.locator('body').innerText()).slice(-5000) }) + '\n'); await page.screenshot({ animations: 'disabled', path: path.join(screenshots, 'connection-skills-failure.png') }); }
  throw error;
} finally {
  try { await browser.close(); } finally {
    // This direct HTTP fixture owns its callback bridge and isolated daemon.
    // Closing browser pages alone cannot release the daemon's host connection.
    try { await runtimeProvide(runtime, AGENT_SERVICE_APPLICATION).close(); } finally {
      try { await stopAgentProcess({ dataRoot: path.join(smokeRoot, 'app-data'), mode: 'stop-owned' }); }
      finally { await host.shutdown(); }
    }
  }
}
