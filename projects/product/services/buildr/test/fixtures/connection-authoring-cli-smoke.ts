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
fs.writeFileSync(file, JSON.stringify({ id: 'independent-inspector', name: 'Unknown local system', binding: { skillAssetIdentity: entry.skill.assetIdentity, sourceIdentity: entry.skill.sourceIdentity, definitionId: entry.definition.definitionId, configVersion: 1 }, config: { website: 'https://example.invalid/' }, authentication: { intent: 'replace', values: { username: 'TEAM_FIXTURE', password: 'TEAM_FIXTURE_SECRET' } }, expected: { teamRevision: 'absent', definitionRevision: entry.revision } }), { mode: 0o600 });
const created = command(['connection-skill', 'create', '--file', file]).instance;
assert.ok(!JSON.stringify(created).includes('TEAM_FIXTURE_SECRET'));
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
assert.equal(fs.existsSync(path.join(root, 'skills', 'connections', 'independent-local-inspector', 'references', 'commands-and-results.md')), true);
console.log(JSON.stringify({ status: 'passed', authoringGuide: 'connection-authoring', checks: ['real skills add', 'complete source attachments', 'open category discovery', 'explicit instance binding', 'program help', 'business stdin and private context', 'local revalidation', 'team/personal whole-group selection'], externalSystems: 'not-contacted' }));
