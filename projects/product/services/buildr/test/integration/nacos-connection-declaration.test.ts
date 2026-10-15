import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import YAML from 'yaml';
import { ConnectionSkillsApplication } from '../../src/modules/connection-skills/application/connection-skills-application.ts';
import { createConnectionCatalog } from '../../src/modules/connection-skills/application/catalog.ts';
import { readConnectionSkillFile } from '../../src/modules/agent-assets/application/connection-skill-source.ts';

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
  const input = { id: 'qa-example', name: 'QA example', binding: { skillAssetIdentity: entry.skill.assetIdentity, sourceIdentity: entry.skill.sourceIdentity, definitionId: 'nacos', configVersion: 1 }, config: { consoleUrl: 'https://example.invalid/nacos/' }, authentication: { intent: 'replace', values: { username: 'reader', password: '' } }, expected: { teamRevision: 'absent', definitionRevision: entry.revision } };
  assert.throws(() => app.save(workspace, null, { ...input, authentication: { ...input.authentication, values: { username: '', password: '' } } }), { code: 'connection_field_invalid', field: 'username' });
  assert.throws(() => app.save(workspace, null, { ...input, config: { ...input.config, defaultGroup: '' } }), { code: 'connection_field_invalid', field: 'defaultGroup' });
  const created = app.save(workspace, null, input).instance;
  assert.equal(created.authentication.team.configured, true);
  const file = path.join(workspace, created.sourcePath), raw = YAML.parse(fs.readFileSync(file, 'utf8'));
  raw.config.defaultGroup = ''; fs.writeFileSync(file, YAML.stringify(raw));
  let current = app.get(workspace, created.id).instance;
  await assert.rejects(app.run(workspace, { id: created.id, expectedRevision: current.revision, args: ['get'] }), { code: 'connection_field_invalid', field: 'defaultGroup' });
  raw.config.defaultGroup = 'DEFAULT_GROUP'; raw.authentication.values.username = ''; fs.writeFileSync(file, YAML.stringify(raw));
  current = app.get(workspace, created.id).instance;
  assert.equal(current.authentication.team.configured, false);
  await assert.rejects(app.run(workspace, { id: created.id, expectedRevision: current.revision, args: ['get'] }));
  assert.equal(fs.existsSync(launched), false);
});
