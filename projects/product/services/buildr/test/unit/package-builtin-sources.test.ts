import assert from 'node:assert/strict';
import test from 'node:test';
import { builtinSkillOwnsSourceFile, validateBuiltinSkillPaths } from '../../tools/verification/package-check/static-validation.ts';

const root = 'resources/workspace';
const connection = { id: 'mysql-connection', path: `${root}/skills/connections/mysql-connection`, target: 'skills/connections/mysql-connection' };
test('declared builtin directories own their complete connection and authoring assets', () => {
  const skills = [connection,
    { id: 'nacos-connection', path: `${root}/skills/connections/nacos-connection`, target: 'skills/connections/nacos-connection' },
    { id: 'connection-authoring', path: `${root}/skills/buildr/connection-authoring`, target: 'skills/buildr/connection-authoring' }];
  const includes = skills.map(skill => `${skill.path}/`);
  for (const file of [
    `${connection.path}/SKILL.md`, `${connection.path}/assets/connection.yml`,
    `${root}/skills/connections/nacos-connection/scripts/lib/workflow.mjs`,
    `${root}/skills/buildr/connection-authoring/templates/client.mjs`,
  ]) assert.equal(builtinSkillOwnsSourceFile(file, skills, root, includes), true, file);
});
test('undeclared neighbours, traversal and invalid builtin targets cannot claim published files', () => {
  for (const file of [
    `${connection.path}-private/SKILL.md`, `${root}/skills/connections/private/SKILL.md`,
    `${connection.path}/../private/secret.txt`, `${root}/AGENTS.private.md`,
    `${connection.path}/AGENTS.private.md`,
  ]) assert.equal(builtinSkillOwnsSourceFile(file, [connection], root, [`${connection.path}/`]), false, file);
  for (const includes of [[], [`${root}/skills/`], [`${connection.path}-private/`]]) {
    assert.equal(builtinSkillOwnsSourceFile(`${connection.path}/SKILL.md`, [connection], root, includes), false);
  }
  for (const skill of [
    { ...connection, target: 'skills/connections/../../private' },
    { ...connection, path: `${connection.path}/../../private` },
    { ...connection, target: '/skills/connections/mysql-connection' },
    { ...connection, path: '/tmp/private' },
    JSON.parse('{"id":"incomplete"}'),
  ]) {
    assert.ok(validateBuiltinSkillPaths(skill, root, skill.id).length);
    assert.equal(builtinSkillOwnsSourceFile(`${skill.path}/SKILL.md`, [skill], root, [`${skill.path}/`]), false);
  }
});
test('connection, Buildr and upstream OpenSpec targets retain their source boundaries', () => {
  const buildr = { id: 'demo', path: `${root}/skills/buildr/demo`, target: 'skills/buildr/demo' };
  const upstream = { id: 'openspec-apply-change', path: `${root}/skills/openspec/apply`, target: 'skills/openspec/openspec-apply-change', component: 'openspec' };
  for (const skill of [connection, buildr, upstream]) assert.deepEqual(validateBuiltinSkillPaths(skill, root, skill.id), []);
  for (const skill of [{ ...connection, target: buildr.target }, { ...buildr, target: connection.target }, { ...upstream, target: buildr.target }]) {
    assert.ok(validateBuiltinSkillPaths(skill, root, skill.id).length);
  }
});
