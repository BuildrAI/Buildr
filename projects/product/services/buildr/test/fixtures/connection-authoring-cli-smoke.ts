// Real CLI acceptance of an independently authored fixture; the sole runner isolates all profiles.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const root = process.env.BUILDR_SMOKE_WORKSPACE_ROOT!, temporary = process.env.BUILDR_SMOKE_ROOT!;
assert.ok(root && temporary, 'Use the isolated workspace smoke runner.');
const cli = path.resolve('bin/buildr.mjs');
function command(args: string[], input?: string) {
  const structured = args[0] === 'connection-skill';
  const common = ['--target', root, ...(structured ? ['--json'] : [])], separator = args.indexOf('--');
  const commandArgs = separator < 0 ? [...args, ...common] : [...args.slice(0, separator), ...common, '--', ...args.slice(separator + 1)];
  const result = spawnSync(process.execPath, [cli, ...commandArgs], { input, encoding: 'utf8', env: process.env, timeout: 20_000 });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return structured ? JSON.parse(result.stdout) : result.stdout;
}
command(['init', '--name', 'authoring-forward-example', '--description', 'Independent local acceptance', '--profile', 'team']);
const fixture = path.resolve('test/fixtures/connection-authoring-example');
command(['skills', 'add', '--source', fixture]);
const catalogue = command(['connection-skill', 'definitions', 'list']);
const entry = catalogue.definitions.find((item: any) => item.definition.definitionId === 'local-inspector');
assert.ok(entry, JSON.stringify(catalogue)); assert.equal(entry.skill.id, 'independent-local-inspector');
assert.equal(entry.definition.category, 'local-inspection');
assert.equal(entry.skill.sourcePath, 'connections/independent-local-inspector');
const file = path.join(temporary, 'instance-input.json');
const binding = { skillAssetIdentity: entry.skill.assetIdentity, sourceIdentity: entry.skill.sourceIdentity, definitionId: entry.definition.definitionId, configVersion: 1 };
const values = { username: 'TEAM_FIXTURE', password: 'TEAM_FIXTURE_SECRET' };
fs.writeFileSync(file, JSON.stringify({ binding, config: { website: 'https://example.invalid/' }, authentication: { source: 'team', intent: 'replace', values }, expected: { teamRevision: 'absent', definitionRevision: entry.revision }, hook: 'scopes' }), { mode: 0o600 });
const discovered = command(['connection-skill', 'discover', '--file', file]);
assert.equal(discovered.status, 'success'); assert.deepEqual(discovered.options, [{ value: 'local-catalogue', label: '本机模拟目录' }]); assert.equal(discovered.truncated, false);
assert.ok(discovered.limitations.some((item: string) => item.includes('未实现真实外部业务')));
fs.writeFileSync(file, JSON.stringify({ id: 'independent-inspector', name: 'Unknown local system', binding, config: { website: 'https://example.invalid/', scope: discovered.options[0].value }, authentication: { intent: 'replace', values }, expected: { teamRevision: 'absent', definitionRevision: entry.revision } }), { mode: 0o600 });
const created = command(['connection-skill', 'create', '--file', file]).instance;
assert.ok(!JSON.stringify(created).includes('TEAM_FIXTURE_SECRET'));
const tested = command(['connection-skill', 'test', '--connection', created.id]); assert.equal(tested.status, 'success'); assert.deepEqual(tested.checks, ['private-context']);
const help = command(['connection-skill', 'help', '--connection', created.id]);
assert.equal(help.exitCode, 0); assert.match(help.stdout, /check-context/);
const business = '\uFEFF完整业务输入\r\n保留换行\n';
function inspect(revision: string) {
  const result = command(['connection-skill', 'run', '--connection', created.id, '--expected-revision', revision, '--program', 'cli', '--', 'check-context'], business);
  assert.equal(result.exitCode, 0, JSON.stringify(result));
  const body = JSON.parse(result.stdout);
  assert.equal(body.inputBytes, Buffer.byteLength(business)); assert.equal(body.inputSha256, crypto.createHash('sha256').update(business).digest('hex'));
  assert.equal(body.contextChecked, true); assert.equal(body.externalSystems, 'not-contacted');
  assert.ok(!JSON.stringify(result).includes('TEAM_FIXTURE_SECRET')); assert.ok(!JSON.stringify(result).includes('PERSONAL_FIXTURE_SECRET'));
  return body;
}
const first = inspect(created.revision); assert.equal(first.authenticationSource, 'team'); assert.equal(first.account, 'TEAM_FIXTURE');
const observed = command(['connection-skill', 'get', '--connection', created.id]).instance;
fs.writeFileSync(file, JSON.stringify({ values: { username: 'PERSONAL_FIXTURE', password: 'PERSONAL_FIXTURE_SECRET' }, expected: { teamRevision: observed.teamRevision, localRevision: observed.localRevision, definitionRevision: observed.definitionRevision } }), { mode: 0o600 });
const personal = command(['connection-skill', 'auth', 'set', '--connection', created.id, '--file', file]).instance;
const second = inspect(personal.revision); assert.equal(second.authenticationSource, 'personal'); assert.equal(second.account, 'PERSONAL_FIXTURE');
for (const [scenario, expectedStatus] of [['failure', 'failure'], ['unknown', 'unknown'], ['invalid-output', 'failure'], ['mixed-output', 'failure']] as const) {
  fs.writeFileSync(file, JSON.stringify({ id: personal.id, binding: personal.binding, config: { ...personal.config, scenario }, expected: { teamRevision: personal.teamRevision, localRevision: personal.localRevision, definitionRevision: personal.definitionRevision }, authentication: { source: 'personal', intent: 'keep' }, hook: 'scopes' }), { mode: 0o600 });
  for (const action of ['test', 'discover']) {
    const result = command(['connection-skill', action, '--file', file]); assert.equal(result.status, expectedStatus, JSON.stringify(result));
    assert.ok(result.diagnostics.length > 0); assert.ok(!JSON.stringify(result).includes('PERSONAL_FIXTURE_SECRET'));
    if (scenario.endsWith('output')) assert.ok(result.diagnostics.includes('程序未返回有效的槽位结果。'));
  }
}
const unchanged = command(['connection-skill', 'get', '--connection', personal.id]).instance;
assert.equal(unchanged.revision, personal.revision); assert.deepEqual(unchanged.config, personal.config);
assert.equal(fs.existsSync(path.join(root, 'skills', 'connections', 'independent-local-inspector', 'references', 'commands-and-results.md')), true);
// Assemble exactly the files distributed by the authoring guide; no Nacos or
// developer implementation imports are needed by the resulting unknown Skill.
const template = path.resolve('resources/workspace/skills/buildr/connection-authoring/templates'), source = path.join(temporary, 'template-source');
for (const [from, to] of [['SKILL.md', 'SKILL.md'], ['connection.yml', 'assets/connection.yml'], ['client.mjs', 'scripts/client.mjs'], ['commands-and-results.md', 'references/commands-and-results.md']] as const) {
  const destination = path.join(source, to); fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.copyFileSync(path.join(template, from), destination);
}
const offline = spawnSync(process.execPath, [path.join(source, 'scripts/client.mjs'), '--self-test'], { encoding: 'utf8', env: process.env, timeout: 5000 });
assert.equal(offline.status, 0, offline.stderr); const offlineBody = JSON.parse(offline.stdout); assert.equal(offlineBody.templateParsed, true); assert.equal(offlineBody.businessImplemented, false);
command(['skills', 'add', '--source', source]);
const templateEntry = command(['connection-skill', 'definitions', 'list']).definitions.find((item: any) => item.skill.id === 'company-example'); assert.ok(templateEntry);
fs.writeFileSync(file, JSON.stringify({ id: 'template-example', name: 'Template protocol only', binding: { skillAssetIdentity: templateEntry.skill.assetIdentity, sourceIdentity: templateEntry.skill.sourceIdentity, definitionId: templateEntry.definition.definitionId, configVersion: 1 }, config: { website: 'https://example.invalid/' }, authentication: { intent: 'replace', values }, expected: { teamRevision: 'absent', definitionRevision: templateEntry.revision } }), { mode: 0o600 });
const templateInstance = command(['connection-skill', 'create', '--file', file]).instance;
assert.equal(command(['connection-skill', 'test', '--connection', templateInstance.id]).status, 'success');
const templateDiscovery = command(['connection-skill', 'discover', '--connection', templateInstance.id, '--hook', 'scopes']);
assert.equal(templateDiscovery.status, 'success'); assert.deepEqual(templateDiscovery.options, [{ value: 'example-scope', label: '本机模拟范围' }]); assert.ok(templateDiscovery.limitations.some((item: string) => item.includes('模板业务未实现')));
console.log(JSON.stringify({ status: 'passed', authoringGuide: 'connection-authoring', checks: ['real skills add', 'complete source attachments', 'open category discovery', 'explicit instance binding', 'program help', 'business stdin and private context', 'local revalidation', 'team/personal whole-group selection', 'discovery before required scope selection', 'success/failure/unknown and invalid hook stdout', 'drafts leave instance unchanged', 'distributed template offline/test/discovery'], externalSystems: 'not-contacted' }));
