import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import YAML from 'yaml';
import { ConnectionSkillsApplication } from '../../src/modules/connection-skills/application/connection-skills-application.ts';
import { createConnectionCatalog } from '../../src/modules/connection-skills/application/catalog.ts';
import { readConnectionSkillFile } from '../../src/modules/agent-assets/application/connection-skill-source.ts';
import { parseConnectionDefinition, validateConfig } from '../../src/modules/connection-skills/domain/definition.ts';

test('new builtin Nacos and XXL-JOB default to non-production while saved true values remain true', () => {
  for (const [skill, config] of [['nacos-connection', { apiBaseUrl: 'https://api.example.invalid/nacos/' }], ['xxl-job-connection', { consoleUrl: 'https://jobs.example.invalid/xxl-job-admin/' }]] as const) {
    const definition = parseConnectionDefinition(fs.readFileSync(new URL(`../../resources/workspace/skills/connections/${skill}/assets/connection.yml`, import.meta.url), 'utf8'));
    assert.equal(definition.config.fields.find(field => field.key === 'production')?.default, false);
    assert.equal(validateConfig(definition.config.fields, config).production, false);
    assert.equal(validateConfig(definition.config.fields, { ...config, production: true }).production, true);
  }
});

test('builtin dual-address declarations explicitly use their API base as website fallback', () => {
  for (const skill of ['nacos-connection', 'kibana-connection']) {
    const definition = parseConnectionDefinition(fs.readFileSync(new URL(`../../resources/workspace/skills/connections/${skill}/assets/connection.yml`, import.meta.url), 'utf8'));
    assert.equal(definition.presentation?.websiteField, 'consoleUrl');
    assert.equal(definition.presentation?.websiteFallbackField, 'apiBaseUrl');
    assert.deepEqual(definition.authentication.targetFields, ['apiBaseUrl']);
  }
});

test('Nacos declared nonempty account and group reject invalid saves and execution while empty passwords remain valid', async t => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-nacos-declaration-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const workspace = path.join(root, 'workspace'), directory = path.join(workspace, 'skills/connections/nacos-connection');
  fs.cpSync(fileURLToPath(new URL('../../resources/workspace/skills/connections/nacos-connection/', import.meta.url)), directory, { recursive: true });
  // The declared program remains local and cannot reach an external system even if a guard regresses.
  const launched = path.join(root, 'program-started');
  fs.writeFileSync(path.join(directory, 'scripts/nacos-client.mjs'), `import fs from 'node:fs'; fs.writeFileSync(${JSON.stringify(launched)}, 'started'); if(process.connected)process.disconnect();`);
  const catalog = createConnectionCatalog({ assets: {
    readSkills: () => [{ id: 'nacos-connection', path: 'connections/nacos-connection', assetIdentity: 'fixture:nacos', sourceIdentity: 'fixture:local', connectionDefinitions: ['assets/connection.yml'] }],
    readSkillFile: readConnectionSkillFile,
  } });
  const app = new ConnectionSkillsApplication({ dataRoot: path.join(root, 'local'), catalog, resolveScope: () => ({ rootPath: workspace, workspaceId: 'fixture-workspace' }) });
  const entry = app.definitions(workspace).definitions[0]!;
  assert.equal(entry.definition.configVersion, 2); assert.deepEqual(entry.definition.authentication.targetFields, ['apiBaseUrl']);
  assert.notEqual(entry.definition.config.fields.find(field => field.key === 'consoleUrl')?.required, true);
  const input = { id: 'qa-example', name: 'QA example', binding: { skillAssetIdentity: entry.skill.assetIdentity, sourceIdentity: entry.skill.sourceIdentity, definitionId: 'nacos', configVersion: entry.definition.configVersion }, config: { apiBaseUrl: 'https://api.example.invalid:8848/nacos/', consoleUrl: 'https://console.example.invalid:8080/' }, authentication: { intent: 'replace', values: { username: 'reader', password: '' } }, expected: { teamRevision: 'absent', definitionRevision: entry.revision } };
  assert.throws(() => app.save(workspace, null, { ...input, authentication: { ...input.authentication, values: { username: '', password: '' } } }), { code: 'connection_field_invalid', field: 'username' });
  assert.throws(() => app.save(workspace, null, { ...input, config: { ...input.config, defaultGroup: '' } }), { code: 'connection_field_invalid', field: 'defaultGroup' });
  const created = app.save(workspace, null, input).instance;
  assert.equal(created.authentication.team.configured, true);
  assert.equal(created.config.production, false);
  assert.equal(created.websiteUrl, input.config.consoleUrl); assert.equal(created.config.apiBaseUrl, input.config.apiBaseUrl);
  const optional = app.save(workspace, null, { ...input, id: 'api-only', config: { apiBaseUrl: input.config.apiBaseUrl }, authentication: { intent: 'remove' } }).instance;
  assert.equal(optional.websiteUrl, input.config.apiBaseUrl); assert.equal(optional.config.consoleUrl, undefined);
  const file = path.join(workspace, created.sourcePath), raw = YAML.parse(fs.readFileSync(file, 'utf8'));
  raw.config.defaultGroup = ''; fs.writeFileSync(file, YAML.stringify(raw));
  let current = app.get(workspace, created.id).instance;
  await assert.rejects(app.run(workspace, { id: created.id, expectedRevision: current.revision, args: ['get'] }), { code: 'connection_field_invalid', field: 'defaultGroup' });
  raw.config.defaultGroup = 'DEFAULT_GROUP'; raw.authentication.values.username = ''; fs.writeFileSync(file, YAML.stringify(raw));
  current = app.get(workspace, created.id).instance;
  assert.equal(current.authentication.team.configured, false);
  await assert.rejects(app.run(workspace, { id: created.id, expectedRevision: current.revision, args: ['get'] }));
  raw.binding.configVersion = 1; raw.config = { consoleUrl: 'https://old-console.example.invalid:8080/' }; raw.authentication.values.username = 'reader';
  fs.writeFileSync(file, YAML.stringify(raw)); const preserved = fs.readFileSync(file, 'utf8');
  current = app.get(workspace, created.id).instance;
  assert.equal(current.availability.ready, false); assert.ok(current.availability.diagnostics.some(message => /版本/u.test(message)));
  await assert.rejects(app.run(workspace, { id: created.id, expectedRevision: current.revision, args: ['get'] }), { code: 'connection_skill_definition_unavailable' });
  assert.equal(fs.readFileSync(file, 'utf8'), preserved, '旧版本配置和认证必须保留，不能按网站地址隐式迁移');
  assert.equal(fs.existsSync(launched), false);
});

test('Nacos real host hooks preserve short-password success and reject colliding namespace identities', async t => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-nacos-host-hook-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const workspace = path.join(root, 'workspace'), directory = path.join(workspace, 'skills/connections/nacos-connection');
  fs.cpSync(fileURLToPath(new URL('../../resources/workspace/skills/connections/nacos-connection/', import.meta.url)), directory, { recursive: true });
  const catalog = createConnectionCatalog({ assets: {
    readSkills: () => [{ id: 'nacos-connection', path: 'connections/nacos-connection', assetIdentity: 'fixture:nacos-host-hook', sourceIdentity: 'fixture:local', connectionDefinitions: ['assets/connection.yml'] }],
    readSkillFile: readConnectionSkillFile,
  } });
  const app = new ConnectionSkillsApplication({ dataRoot: path.join(root, 'local'), catalog, resolveScope: () => ({ rootPath: workspace, workspaceId: 'fixture-host-hook' }) });
  const entry = app.definitions(workspace).definitions[0]!;
  let password = 's', logins = 0, writes = 0;
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url!, 'http://127.0.0.1'), route = url.pathname.replace(/^\/nacos/u, '');
    let body = ''; for await (const chunk of request) body += chunk.toString('utf8');
    const json = (value: unknown) => { response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(value)); };
    if (route === '/v3/auth/user/login') {
      assert.equal(new URLSearchParams(body).get('password'), password); logins++;
      json({ accessToken: 'fixture-host-hook-token', tokenTtl: 300 }); return;
    }
    if (request.method !== 'GET') { writes++; response.writeHead(405); response.end(); return; }
    if (route === '/v3/admin/core/namespace/list') { json({ code: 0, data: [{ namespaceId: 'public', namespaceName: 'Public namespace' }] }); return; }
    if (route === '/v3/admin/cs/config/list') { json({ code: 0, data: { pageNumber: Number(url.searchParams.get('pageNo')), totalCount: 1, pagesAvailable: 1, pageItems: [{ dataId: 'fixture.yaml', groupName: 'DEFAULT_GROUP', namespaceId: 'public', type: 'yaml' }] } }); return; }
    if (route === '/v3/admin/core/state') { json({ code: 0, data: { version: '3.1.1' } }); return; }
    response.writeHead(404); response.end();
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); });
  const port = (server.address() as { port: number }).port;
  const draft = () => ({ binding: { skillAssetIdentity: entry.skill.assetIdentity, sourceIdentity: entry.skill.sourceIdentity, definitionId: 'nacos', configVersion: entry.definition.configVersion }, config: { apiBaseUrl: `http://127.0.0.1:${port}/nacos`, apiVersion: 'v3' }, authentication: { source: 'team', intent: 'replace', values: { username: 'reader', password } }, expected: { teamRevision: 'absent', definitionRevision: entry.revision } });
  const tested = await app.hook(workspace, draft(), 'test');
  assert.equal(tested.status, 'success'); assert.equal((tested.checks as unknown[]).length, 3);
  password = 'public';
  const discovered = await app.hook(workspace, { ...draft(), hook: 'namespaces' }, 'discover');
  assert.equal(discovered.status, 'failure'); assert.equal(discovered.options, undefined);
  assert.ok((discovered.diagnostics as unknown[]).some(message => String(message).includes('编号')));
  assert.ok(!JSON.stringify(discovered).includes('[REDACTED]'), '发现失败不能交付可保存的假编号');
  assert.equal(logins, 2); assert.equal(writes, 0); assert.deepEqual(app.list(workspace).instances, []);
});
